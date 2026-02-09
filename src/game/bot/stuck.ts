/**
 * Stuck Detection and Recovery
 *
 * Detects when the bot is making no progress and provides
 * escalating recovery actions to break out of stuck states.
 */

import type { Point, GameState, Direction, GameAction } from '../types'
import { getTile, isWalkable } from '../dungeon'
import type { BotState } from './types'
import { computeFlow } from './flow'
import { selectStep } from './movement'
import { isSamePoint, manhattanDistance, isMonsterAt } from '../types'
import { recordProgress } from './state'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Turns without progress before twitch level increases */
export const TWITCH_THRESHOLDS = {
  LEVEL_1: 5, // Start wall following quickly
  LEVEL_2: 12, // Clear history and retry
  LEVEL_3: 25, // Force descent if stairs known
  LEVEL_4: 50, // Wait briefly
  LEVEL_5: 100, // Clear goals - forget current objective
  LEVEL_6: 200, // Clear blacklist - try previously unreachable targets
}

/** Number of recent positions to check for oscillation */
const OSCILLATION_WINDOW = 8

/** Response types for stuck situations */
export type StuckResponse =
  | 'normal'
  | 'wall_follow' // Follow walls to find new areas
  | 'clear_history' // Clear position history and re-evaluate
  | 'force_combat' // Attack nearest monster
  | 'force_descent' // Head to stairs ignoring exploration
  | 'stop_fleeing' // Stop fleeing and switch to combat/explore
  | 'wait' // Brief pause
  | 'clear_goals' // Forget current objective, re-evaluate from scratch
  | 'clear_blacklist' // Clear exploration blacklist, retry unreachable targets

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect stuck level based on bot state
 *
 * @returns Twitch level 0-6 (0 = not stuck, 6 = severely stuck)
 */
export function detectStuckLevel(state: BotState, game: GameState): number {
  const turnsSinceProgress = game.turn - state.lastProgressTurn

  // Check for oscillation pattern (A-B-A-B)
  if (isOscillating(state)) {
    // Oscillation is treated as level 1 stuck immediately
    return Math.max(1, getTwitchLevel(turnsSinceProgress))
  }

  return getTwitchLevel(turnsSinceProgress)
}

/**
 * Get twitch level from turns since progress
 */
function getTwitchLevel(turnsSinceProgress: number): number {
  if (turnsSinceProgress >= TWITCH_THRESHOLDS.LEVEL_6) return 6
  if (turnsSinceProgress >= TWITCH_THRESHOLDS.LEVEL_5) return 5
  if (turnsSinceProgress >= TWITCH_THRESHOLDS.LEVEL_4) return 4
  if (turnsSinceProgress >= TWITCH_THRESHOLDS.LEVEL_3) return 3
  if (turnsSinceProgress >= TWITCH_THRESHOLDS.LEVEL_2) return 2
  if (turnsSinceProgress >= TWITCH_THRESHOLDS.LEVEL_1) return 1
  return 0
}

/**
 * Check if the bot is oscillating between positions
 * Detects A-B-A-B or A-B-C-A-B-C patterns
 */
export function isOscillating(state: BotState): boolean {
  const history = state.recentPositions
  if (history.length < 4) return false

  // Check for A-B-A-B pattern (period 2)
  const len = history.length
  if (len >= 4) {
    const a1 = history[len - 1]!
    const b1 = history[len - 2]!
    const a2 = history[len - 3]!
    const b2 = history[len - 4]!

    if (isSamePoint(a1, a2) && isSamePoint(b1, b2)) {
      return true
    }
  }

  // Check for A-B-C-A-B-C pattern (period 3)
  if (len >= 6) {
    const a1 = history[len - 1]!
    const b1 = history[len - 2]!
    const c1 = history[len - 3]!
    const a2 = history[len - 4]!
    const b2 = history[len - 5]!
    const c2 = history[len - 6]!

    if (isSamePoint(a1, a2) && isSamePoint(b1, b2) && isSamePoint(c1, c2)) {
      return true
    }
  }

  return false
}

/**
 * Check if position appears too frequently in recent history
 */
export function isPositionOvervisited(state: BotState, pos: Point): boolean {
  const recentWindow = state.recentPositions.slice(-OSCILLATION_WINDOW)
  const visitCount = recentWindow.filter((p) => p.x === pos.x && p.y === pos.y).length

  // If we've visited this position more than 3 times in last 8 moves, it's overvisited
  return visitCount >= 3
}

// ============================================================================
// RECOVERY
// ============================================================================

/**
 * Get the appropriate response for a stuck level
 */
export function getStuckResponse(
  stuckLevel: number,
  hasAdjacentMonster: boolean,
  hasKnownStairs: boolean,
  isFleeing: boolean = false
): StuckResponse {
  switch (stuckLevel) {
    case 0:
      return 'normal'

    case 1:
      // If stuck while fleeing, stop fleeing early - we're not getting anywhere
      if (isFleeing) {
        return 'stop_fleeing'
      }
      // Try wall following to systematically find new areas
      return 'wall_follow'

    case 2:
      // If fleeing isn't working, stop and fight/explore
      if (isFleeing) {
        return 'stop_fleeing'
      }
      // Clear history and let normal pathfinding try again
      // Or fight if there's a monster blocking
      if (hasAdjacentMonster) {
        return 'force_combat'
      }
      return 'clear_history'

    case 3:
      // Force descent if stairs are known
      if (hasKnownStairs) {
        return 'force_descent'
      }
      if (hasAdjacentMonster) {
        return 'force_combat'
      }
      return 'clear_history'

    case 4:
      // Brief pause - wait and hope something changes
      return 'wait'

    case 5:
      // Clear goals - forget what we were doing and re-evaluate
      return 'clear_goals'

    case 6:
    default:
      // Clear blacklist - try targets we previously couldn't reach
      return 'clear_blacklist'
  }
}

/**
 * Wall following direction for stuck recovery
 *
 * Uses right-hand rule: keep wall on right side
 * Returns the direction to move to follow the wall
 */
export function getWallFollowDirection(game: GameState, state: BotState): Direction | null {
  const pos = game.character.position

  // Determine current facing based on last move
  const lastPos =
    state.recentPositions.length > 0
      ? state.recentPositions[state.recentPositions.length - 1]!
      : null

  // If no last position, pick initial direction based on nearby walls
  let facing = getInitialFacing(game, pos)

  if (lastPos && (lastPos.x !== pos.x || lastPos.y !== pos.y)) {
    // We moved - facing is direction we moved
    const dx = pos.x - lastPos.x
    const dy = pos.y - lastPos.y
    facing = deltaToDirection(dx, dy) ?? facing
  }

  // Right-hand rule: try directions in order (right, forward, left, back)
  const tryOrder = getRightHandOrder(facing)

  for (const dir of tryOrder) {
    const delta = directionToDelta(dir)
    const target = { x: pos.x + delta.x, y: pos.y + delta.y }

    const tile = getTile(game.currentLevel, target.x, target.y)
    if (!tile) continue
    if (!isWalkable(tile) && tile.type !== 'door_closed') continue

    // Check if occupied by monster
    if (isMonsterAt(game.monsters, target)) continue

    return dir
  }

  return null
}

/**
 * Get initial facing direction based on nearby walls
 */
function getInitialFacing(game: GameState, pos: Point): Direction {
  // Find a wall and face away from it
  const directions: Direction[] = ['n', 's', 'e', 'w']

  for (const dir of directions) {
    const delta = directionToDelta(dir)
    const adj = { x: pos.x + delta.x, y: pos.y + delta.y }
    const tile = getTile(game.currentLevel, adj.x, adj.y)

    if (!tile || tile.type === 'wall') {
      // Wall found in this direction, face opposite
      return oppositeDirection(dir)
    }
  }

  return 'e' // Default: face east
}

/**
 * Get directions to try in right-hand rule order
 */
function getRightHandOrder(facing: Direction): Direction[] {
  const cardinals: Direction[] = ['n', 'e', 's', 'w']
  const idx = cardinals.indexOf(facing as 'n' | 'e' | 's' | 'w')

  if (idx === -1) {
    // Diagonal facing - simplify to nearest cardinal
    if (facing === 'ne' || facing === 'se') return getRightHandOrder('e')
    if (facing === 'nw' || facing === 'sw') return getRightHandOrder('w')
    return ['e', 's', 'w', 'n']
  }

  // Right, Forward, Left, Back
  return [
    cardinals[(idx + 1) % 4]!, // Right
    cardinals[idx]!, // Forward
    cardinals[(idx + 3) % 4]!, // Left
    cardinals[(idx + 2) % 4]!, // Back
  ]
}

function oppositeDirection(dir: Direction): Direction {
  const opposites: Record<Direction, Direction> = {
    n: 's',
    s: 'n',
    e: 'w',
    w: 'e',
    ne: 'sw',
    nw: 'se',
    se: 'nw',
    sw: 'ne',
    wait: 'wait',
  }
  return opposites[dir]
}

function directionToDelta(dir: Direction): Point {
  const deltas: Record<Direction, Point> = {
    n: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    e: { x: 1, y: 0 },
    w: { x: -1, y: 0 },
    ne: { x: 1, y: -1 },
    nw: { x: -1, y: -1 },
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 },
    wait: { x: 0, y: 0 },
  }
  return deltas[dir]
}

function deltaToDirection(dx: number, dy: number): Direction | null {
  if (dx === 0 && dy === -1) return 'n'
  if (dx === 0 && dy === 1) return 's'
  if (dx === 1 && dy === 0) return 'e'
  if (dx === -1 && dy === 0) return 'w'
  if (dx === 1 && dy === -1) return 'ne'
  if (dx === -1 && dy === -1) return 'nw'
  if (dx === 1 && dy === 1) return 'se'
  if (dx === -1 && dy === 1) return 'sw'
  return null
}

/**
 * Clear position history to allow revisiting tiles
 */
export function clearPositionHistory(state: BotState): void {
  state.recentPositions = []
}

// ============================================================================
// RECOVERY STRATEGY HANDLERS
// ============================================================================

/**
 * Reset bot state (common cleanup for stuck recovery)
 */
export function resetBotState(botState: BotState, turn: number): void {
  clearPositionHistory(botState)
  botState.cachedFlow = null
  botState.currentGoal = null
  botState.goalTarget = null
  botState.lastProgressTurn = turn
}

/**
 * Handle wall_follow strategy - follow walls to find new areas
 */
export function handleWallFollowStrategy(game: GameState, botState: BotState): GameAction | null {
  const wallDir = getWallFollowDirection(game, botState)
  if (wallDir) {
    // Record position for history
    const pos = game.character.position
    if (botState.recentPositions.length >= 25) {
      botState.recentPositions.shift()
    }
    botState.recentPositions.push({ ...pos })
    recordProgress(botState, game.turn) // Wall-following is progress
    return { type: 'move', direction: wallDir }
  }
  return null
}

/**
 * Handle clear_history strategy - clear history and re-evaluate
 */
export function handleClearHistoryStrategy(botState: BotState, turn: number): void {
  resetBotState(botState, turn)
}

/**
 * Handle force_descent strategy - head to stairs ignoring exploration
 */
export function handleForceDescentStrategy(game: GameState, botState: BotState): GameAction | null {
  if (!botState.knownStairsDown) return null

  const pos = game.character.position

  // If already on stairs, descend
  if (isSamePoint(pos, botState.knownStairsDown)) {
    botState.lastProgressTurn = game.turn
    return { type: 'descend' }
  }

  // Path to stairs
  const stairsFlow = computeFlow(game.currentLevel, botState.knownStairsDown)
  const stairsDir = selectStep(game, botState, stairsFlow)
  if (stairsDir !== 'wait') {
    // Record position for history
    if (botState.recentPositions.length >= 25) {
      botState.recentPositions.shift()
    }
    botState.recentPositions.push({ ...pos })
    return { type: 'move', direction: stairsDir }
  }

  return null
}

/**
 * Handle stop_fleeing strategy - stop fleeing and switch to combat/explore
 */
export function handleStopFleeingStrategy(
  game: GameState,
  botState: BotState,
  findAdjacentMonster: (g: GameState) => { id: string; position: Point } | null
): GameAction | null {
  // Set flee cooldown
  botState.fleeCooldownUntil = game.turn + 20

  // If there's an adjacent monster, attack it
  const adjacentTarget = findAdjacentMonster(game)
  if (adjacentTarget) {
    botState.lastProgressTurn = game.turn
    return { type: 'attack', targetId: adjacentTarget.id }
  }

  // Find nearest monster and set as kill goal
  const pos = game.character.position
  const nearestMonster = game.monsters
    .filter((m) => m.hp > 0)
    .map((m) => ({ m, dist: manhattanDistance(pos, m.position) }))
    .sort((a, b) => a.dist - b.dist)[0]?.m

  if (nearestMonster) {
    resetBotState(botState, game.turn)
    botState.currentGoal = {
      type: 'KILL',
      target: nearestMonster.position,
      targetId: nearestMonster.id,
      reason: 'Forced combat (stuck fleeing)',
      startTurn: game.turn,
    }
    botState.goalTarget = nearestMonster.position
  } else {
    // No monsters - just reset and explore
    resetBotState(botState, game.turn)
  }

  return null
}

/**
 * Handle clear_goals strategy - forget current objective and re-evaluate
 * At ~100 turns stuck, clear goals to allow fresh evaluation
 */
export function handleClearGoalsStrategy(botState: BotState, turn: number): void {
  // Clear current goal but preserve blacklist and stairs knowledge
  botState.currentGoal = null
  botState.goalTarget = null
  botState.cachedFlow = null
  clearPositionHistory(botState)
  // Partial progress reset - give it some room to try new approaches
  botState.lastProgressTurn = turn - TWITCH_THRESHOLDS.LEVEL_4 // Back to level 4 threshold
}

/**
 * Handle clear_blacklist strategy - clear exploration blacklist
 * At ~200 turns stuck, forget unreachable targets and retry them
 */
export function handleClearBlacklistStrategy(botState: BotState, turn: number): void {
  // Clear everything - full reset
  botState.blacklistedTargets.clear()
  botState.currentGoal = null
  botState.goalTarget = null
  botState.cachedFlow = null
  botState.cachedSafetyFlow = null
  clearPositionHistory(botState)
  // Reset progress to level 5 threshold - give substantial room to retry
  botState.lastProgressTurn = turn - TWITCH_THRESHOLDS.LEVEL_5
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if bot has been on same position for too long
 */
export function isStationaryTooLong(state: BotState, threshold: number = 5): boolean {
  const history = state.recentPositions
  if (history.length < threshold) return false

  const current = history[history.length - 1]
  if (!current) return false

  // Check if last N positions are all the same
  for (let i = history.length - threshold; i < history.length; i++) {
    const pos = history[i]
    if (!pos || pos.x !== current.x || pos.y !== current.y) {
      return false
    }
  }

  return true
}

/**
 * Get debug info about stuck state
 */
export function getStuckDebugInfo(state: BotState, game: GameState): string {
  const stuckLevel = detectStuckLevel(state, game)
  const oscillating = isOscillating(state)
  const turnsSinceProgress = game.turn - state.lastProgressTurn

  return `Stuck L${stuckLevel} | Progress: ${turnsSinceProgress}t ago | Osc: ${oscillating} | Twitch: ${state.twitchCounter}`
}
