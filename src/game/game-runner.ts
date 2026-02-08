/**
 * Game Runner for Borglike
 *
 * Provides high-level functions to run games with bot AI.
 * Supports both synchronous (batch) and step-by-step execution.
 */

import type { GameState, GameEvent, GameEventListener, RunConfig, BotPersonality } from './types'
import { MAX_DEPTH } from './types'
import { createGame, processTurn } from './game-loop'
import { runBotTick, buildBotContext, getBotStatus, createBotState, type BotState } from './bot'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Turns on same level before forcing death (circuit breaker for stuck bots) */
const STALE_LEVEL_THRESHOLD = 2000

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for running a game */
export interface RunnerConfig extends RunConfig {
  /** Maximum turns before stopping (0 = unlimited) */
  maxTurns?: number
  /** Callback for events */
  onEvent?: GameEventListener
  /** Callback after each turn */
  onTurn?: (game: GameState, events: GameEvent[]) => void
  /** Callback on game end */
  onEnd?: (game: GameState, reason: 'death' | 'victory' | 'maxTurns') => void
  /** Delay between turns in ms (for visual display) */
  turnDelay?: number
}

/** Result of a completed game run */
export interface RunResult {
  game: GameState
  reason: 'death' | 'victory' | 'maxTurns'
  turnsPlayed: number
  maxDepth: number
  kills: number
  essence: number // Calculated from run stats
}

// ============================================================================
// GAME RUNNER
// ============================================================================

/**
 * Create and configure a new game runner
 */
export function createGameRunner(config: RunnerConfig) {
  const personality = config.botPersonality ?? 'cautious'
  const maxTurns = config.maxTurns ?? 0
  const onEvent = config.onEvent
  const onTurn = config.onTurn
  const onEnd = config.onEnd
  // Bot capabilities from slot config (face-rush mode if not provided)
  const capabilities = config.botCapabilities
  const toggles = config.botToggles
  // Per-slot level ranges, custom personality, and depth gate offset
  const sweepLevelRange = config.sweepLevelRange
  const surfLevelRange = config.surfLevelRange
  const botPersonalityConfig = config.botPersonalityConfig
  const depthGateOffset = config.depthGateOffset

  const game = createGame(config)
  const botState = createBotState() // Persistent bot state for this run
  let isRunning = true

  /**
   * Run a single turn with the bot
   */
  function step(): GameEvent[] {
    if (!isRunning || !game.isRunning) {
      return []
    }

    // Get bot decision with persistent state
    const action = runBotTick(
      game,
      personality,
      botState,
      capabilities,
      toggles,
      sweepLevelRange,
      surfLevelRange,
      botPersonalityConfig,
      depthGateOffset
    )

    // Process the turn
    const events = processTurn(game, action)

    // Circuit breaker: force death if stuck on same level too long
    if (botState.turnsOnLevel > STALE_LEVEL_THRESHOLD && game.character.depth < MAX_DEPTH) {
      game.messages.push({ turn: game.turn, text: 'The Dumb Bot kills you!', type: 'danger' })
      game.character.hp = 0
      game.character.isDead = true
      game.isRunning = false
    }

    // Emit events
    if (onEvent) {
      for (const event of events) {
        onEvent(event)
      }
    }

    // Call turn callback
    if (onTurn) {
      onTurn(game, events)
    }

    // Check for end conditions
    if (!game.isRunning) {
      isRunning = false
      if (onEnd) {
        const reason = game.isVictory ? 'victory' : 'death'
        onEnd(game, reason)
      }
    } else if (maxTurns > 0 && game.turn >= maxTurns) {
      isRunning = false
      game.isRunning = false
      if (onEnd) {
        onEnd(game, 'maxTurns')
      }
    }

    return events
  }

  /**
   * Run the game to completion (synchronous)
   */
  function runToCompletion(): RunResult {
    while (isRunning && game.isRunning) {
      step()

      // Safety check for infinite loops
      if (maxTurns > 0 && game.turn >= maxTurns) {
        break
      }
    }

    return getResult()
  }

  /**
   * Run the game to completion with delays (async)
   */
  async function runWithDelay(delayMs: number): Promise<RunResult> {
    while (isRunning && game.isRunning) {
      step()

      if (delayMs > 0) {
        await sleep(delayMs)
      }

      // Safety check
      if (maxTurns > 0 && game.turn >= maxTurns) {
        break
      }
    }

    return getResult()
  }

  /**
   * Get the current game state
   */
  function getState(): GameState {
    return game
  }

  /**
   * Get the final result
   */
  function getResult(): RunResult {
    let reason: 'death' | 'victory' | 'maxTurns' = 'death'
    if (game.isVictory) {
      reason = 'victory'
    } else if (maxTurns > 0 && game.turn >= maxTurns) {
      reason = 'maxTurns'
    }

    return {
      game,
      reason,
      turnsPlayed: game.stats.turnsPlayed,
      maxDepth: game.stats.deepestDepth,
      kills: game.stats.kills,
      essence: calculateEssence(game),
    }
  }

  /**
   * Check if the game is still running
   */
  function isActive(): boolean {
    return isRunning && game.isRunning
  }

  /**
   * Stop the game
   */
  function stop(): void {
    isRunning = false
    game.isRunning = false
  }

  /**
   * Get bot status string for debugging
   */
  function getStatus(): string {
    const context = buildBotContext(game, personality)
    return getBotStatus(context)
  }

  /**
   * Get the current bot state (for debugging/inspection)
   */
  function getBotState(): BotState {
    return botState
  }

  return {
    step,
    runToCompletion,
    runWithDelay,
    getState,
    getResult,
    isActive,
    stop,
    getStatus,
    getBotState,
  }
}

// ============================================================================
// ESSENCE CALCULATION
// ============================================================================

/**
 * Calculate essence earned from a run
 *
 * Formula based on:
 * - Depth reached (primary factor)
 * - Monsters killed
 * - Character level
 * - Victory bonus
 */
export function calculateEssence(game: GameState): number {
  const stats = game.stats
  const char = game.character

  // Base essence from depth (exponential scaling)
  const depthEssence = Math.floor(Math.pow(stats.deepestDepth, 1.5))

  // Bonus from kills (linear)
  const killEssence = Math.floor(stats.kills * 0.5)

  // Bonus from character level
  const levelEssence = Math.floor(char.level * 2)

  // Victory multiplier
  const victoryMultiplier = game.isVictory ? 10 : 1

  const total = (depthEssence + killEssence + levelEssence) * victoryMultiplier

  return Math.floor(total)
}

// ============================================================================
// BATCH RUNNING
// ============================================================================

/**
 * Run multiple games and collect statistics
 */
export async function runBatchGames(
  config: Omit<RunnerConfig, 'onEvent' | 'onTurn' | 'onEnd'>,
  count: number,
  onProgress?: (completed: number, total: number, result: RunResult) => void
): Promise<BatchResult> {
  const results: RunResult[] = []

  for (let i = 0; i < count; i++) {
    const runner = createGameRunner({
      ...config,
      seed: config.seed ? config.seed + i : undefined,
    })

    const result = runner.runToCompletion()
    results.push(result)

    if (onProgress) {
      onProgress(i + 1, count, result)
    }
  }

  return aggregateResults(results)
}

/** Aggregated results from batch runs */
export interface BatchResult {
  runs: number
  victories: number
  deaths: number
  maxTurnsReached: number
  averageDepth: number
  maxDepth: number
  averageTurns: number
  averageKills: number
  totalEssence: number
  averageEssence: number
}

/**
 * Aggregate multiple run results into statistics
 */
function aggregateResults(results: RunResult[]): BatchResult {
  const runs = results.length
  let victories = 0
  let deaths = 0
  let maxTurnsReached = 0
  let totalDepth = 0
  let maxDepth = 0
  let totalTurns = 0
  let totalKills = 0
  let totalEssence = 0

  for (const r of results) {
    if (r.reason === 'victory') victories++
    else if (r.reason === 'death') deaths++
    else maxTurnsReached++

    totalDepth += r.maxDepth
    if (r.maxDepth > maxDepth) maxDepth = r.maxDepth
    totalTurns += r.turnsPlayed
    totalKills += r.kills
    totalEssence += r.essence
  }

  return {
    runs,
    victories,
    deaths,
    maxTurnsReached,
    averageDepth: runs > 0 ? totalDepth / runs : 0,
    maxDepth,
    averageTurns: runs > 0 ? totalTurns / runs : 0,
    averageKills: runs > 0 ? totalKills / runs : 0,
    totalEssence,
    averageEssence: runs > 0 ? totalEssence / runs : 0,
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Sleep for a number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Quick test run - runs a game and returns the result
 */
export function quickRun(
  raceId: string = 'human',
  classId: string = 'warrior',
  personality: BotPersonality = 'cautious',
  maxTurns: number = 10000
): RunResult {
  const runner = createGameRunner({
    raceId,
    classId,
    botPersonality: personality,
    maxTurns,
  })

  return runner.runToCompletion()
}
