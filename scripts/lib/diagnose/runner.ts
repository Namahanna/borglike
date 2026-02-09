/**
 * Diagnostic Runner
 *
 * Core game loop that runs the bot and dispatches events to analyzers.
 */

import Tinypool from 'tinypool'
import { cpus } from 'os'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createGame, processTurn } from '@game/game-loop'
import { computeMaxUpgradeBonuses, computeUpgradeBonusesFromPreset, computeUpgradeBonuses } from '@game/upgrade-effects'
import { DEFAULT_BALANCE, MAX_DEPTH, type BalanceOverrides } from '@game/types'
import { runBotTick, createBotState } from '@game/bot'
import { reportProfile } from '@bot/profiler'
import { invalidateFrontierCache } from '@bot/exploration'
import { invalidateUnexploredCache } from '@bot/context'
import type { GameState } from '@game/types'
import type { BotState } from '@bot/types'
import type {
  DiagnoseConfig,
  DiagnoseResult,
  BatchConfig,
  BatchResult,
  EndReason,
  TurnContext,
  PostTurnContext,
  DiagnosticIssue,
} from './types'
import { parseCapabilities, parseCustomUpgrades, resolveBoosterBonuses } from './config-parsing'

// Re-export for public API (consumed by index.ts)
export { parseCapabilities, CAPABILITY_PRESETS } from './config-parsing'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ============================================================================
// SINGLETON THREAD POOL
// ============================================================================

const workerPath = join(__dirname, 'worker.ts')

let _pool: Tinypool | null = null
let _poolThreads = 0

/**
 * Get or create the singleton worker pool.
 * If thread count changed, destroys and recreates.
 * All batch callers share one pool within the process.
 */
export async function getOrCreatePool(threads: number): Promise<Tinypool> {
  if (_pool && _poolThreads === threads) return _pool
  if (_pool) {
    await _pool.destroy()
    _pool = null
    _poolThreads = 0
  }
  _pool = new Tinypool({
    filename: workerPath,
    minThreads: threads,
    maxThreads: threads,
    runtime: 'child_process',
    execArgv: ['--import', 'tsx/esm'],
  })
  _poolThreads = threads
  return _pool
}

/** Destroy the singleton pool. Call at process exit or when done with all batch runs. */
export async function destroyPool(): Promise<void> {
  if (_pool) {
    await _pool.destroy()
    _pool = null
    _poolThreads = 0
  }
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<DiagnoseConfig, 'analyzers'>> = {
  seed: Date.now(),
  raceId: 'human',
  classId: 'warrior',
  personality: 'cautious',
  maxTurns: 5000,
  circuitBreakerTurns: 1000,
  verbosity: 1,
  maxUpgrades: false,
  excludeUpgrades: [],
  upgrades: 'none',
  boosters: 'none',
  randomize: false,
  balance: DEFAULT_BALANCE,
  capabilities: 'full',
}

/**
 * Compute upgrade bonuses from config options.
 * Handles legacy maxUpgrades flag, presets, and custom upgrade strings.
 */
function computeUpgradesFromConfig(cfg: typeof DEFAULT_CONFIG) {
  // Legacy --max-upgrades flag takes precedence if set
  if (cfg.maxUpgrades) {
    return computeMaxUpgradeBonuses(cfg.balance.upgradePowerPercent)
  }

  if (!cfg.upgrades || cfg.upgrades === 'none') {
    return undefined
  }

  // Try parsing as custom upgrade string first (contains '=')
  const customLevels = parseCustomUpgrades(cfg.upgrades)
  if (customLevels) {
    return computeUpgradeBonuses(customLevels, cfg.balance.upgradePowerPercent)
  }

  // Fall back to preset name
  return computeUpgradeBonusesFromPreset(cfg.upgrades, cfg.balance.upgradePowerPercent)
}

// ============================================================================
// SINGLE RUN
// ============================================================================

/**
 * Run a single diagnostic session
 */
export function runDiagnosis(config: DiagnoseConfig): DiagnoseResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const analyzers = config.analyzers ?? []

  // Parse bot capabilities
  const capabilities = parseCapabilities(cfg.capabilities)

  // Create game with upgrade and booster bonuses
  const game: GameState = createGame({
    raceId: cfg.raceId,
    classId: cfg.classId,
    seed: cfg.seed,
    upgradeBonuses: computeUpgradesFromConfig(cfg),
    boosterBonuses: resolveBoosterBonuses(cfg.boosters, cfg.classId),
    balanceOverrides: cfg.balance,
  })

  const botState: BotState = createBotState()
  let endReason: EndReason = 'max_turns'
  let turnsOnCurrentLevel = 0
  let currentDepth = game.character.depth

  // Notify analyzers of start
  for (const analyzer of analyzers) {
    analyzer.onStart?.(game, botState)
  }

  // Main loop
  while (game.isRunning && game.turn < cfg.maxTurns) {
    const turn = game.turn
    const previousPosition = { ...game.character.position }
    const previousHP = game.character.hp
    const previousDepth = game.character.depth

    // Get bot action
    const action = runBotTick(game, cfg.personality, botState, capabilities)

    // Build turn context
    const turnCtx: TurnContext = {
      game,
      botState,
      action,
      turn,
    }

    // Notify analyzers pre-turn
    for (const analyzer of analyzers) {
      analyzer.onTurn?.(turnCtx)
    }

    // Process turn
    processTurn(game, action)

    // Check for level change
    if (game.character.depth !== currentDepth) {
      const oldDepth = currentDepth
      currentDepth = game.character.depth
      turnsOnCurrentLevel = 0

      for (const analyzer of analyzers) {
        analyzer.onLevelChange?.(game, oldDepth, currentDepth)
      }
    } else {
      turnsOnCurrentLevel++
    }

    // Build post-turn context
    const moved =
      previousPosition.x !== game.character.position.x ||
      previousPosition.y !== game.character.position.y

    const postCtx: PostTurnContext = {
      ...turnCtx,
      moved,
      previousPosition,
      previousHP,
      previousDepth,
    }

    // Notify analyzers post-turn
    for (const analyzer of analyzers) {
      analyzer.onPostTurn?.(postCtx)
    }

    // Check end conditions
    if (game.character.hp <= 0) {
      endReason = 'death'
      break
    }

    if (game.isVictory) {
      endReason = 'victory'
      break
    }

    // Circuit breaker - exempt depth 50 (Morgoth hunt needs more turns)
    if (turnsOnCurrentLevel >= cfg.circuitBreakerTurns && game.character.depth < MAX_DEPTH) {
      endReason = 'circuit_breaker'
      break
    }
  }

  // Notify analyzers of end
  for (const analyzer of analyzers) {
    analyzer.onEnd?.(game, endReason)
  }

  // Report profiling if enabled (PROFILE_BOT=1)
  reportProfile()

  // Collect results
  const analyzerResults = analyzers.map((a) => a.summarize())
  const allIssues: DiagnosticIssue[] = analyzerResults.flatMap((r) => r.issues)

  return {
    seed: cfg.seed,
    config: cfg,
    endReason,
    finalState: {
      turn: game.turn,
      depth: game.character.depth,
      level: game.character.level,
      xp: game.character.xp,
      hp: game.character.hp,
      maxHp: game.character.maxHp,
      kills: game.stats.kills,
      gold: game.character.gold,
      position: { ...game.character.position },
    },
    analyzerResults,
    allIssues,
    hasErrors: allIssues.some((i) => i.severity === 'error'),
    hasWarnings: allIssues.some((i) => i.severity === 'warning'),
  }
}

// ============================================================================
// BATCH RUNS
// ============================================================================

/**
 * Run multiple diagnostic sessions and aggregate results
 */
export function runBatchDiagnosis(config: BatchConfig): BatchResult {
  const startSeed = config.startSeed ?? Date.now()
  const results: DiagnoseResult[] = []
  const problemRuns: DiagnoseResult[] = []
  const runSummaries: BatchResult['runs'] = []

  // Aggregate metrics across runs
  const metricSums: Record<string, number[]> = {}
  const issueCounter = new Map<string, number>()
  const deathCauses = new Map<string, number>()
  let victoryCount = 0
  let morgothKillCount = 0
  let circuitBreakerCount = 0

  for (let i = 0; i < config.runs; i++) {
    const seed = startSeed + i
    const result = runDiagnosis({
      ...config,
      seed,
    })

    results.push(result)

    if (result.hasErrors || result.hasWarnings) {
      problemRuns.push(result)
    }

    // Track end reasons
    if (result.endReason === 'victory') {
      victoryCount++
    } else if (result.endReason === 'circuit_breaker') {
      circuitBreakerCount++
    }

    // Aggregate metrics from each analyzer
    let killedBy = 'unknown'
    for (const ar of result.analyzerResults) {
      for (const [key, value] of Object.entries(ar.metrics)) {
        if (typeof value === 'number') {
          const fullKey = `${ar.name}.${key}`
          if (!metricSums[fullKey]) {
            metricSums[fullKey] = []
          }
          metricSums[fullKey].push(value)
          // Track morgoth kills specifically
          if (key === 'morgothKills' && value > 0) {
            morgothKillCount++
          }
        } else if (key === 'killedBy' && typeof value === 'string') {
          if (result.endReason === 'death') {
            const count = deathCauses.get(value) ?? 0
            deathCauses.set(value, count + 1)
          }
          killedBy = value
        }
      }
    }

    // Count issues
    for (const issue of result.allIssues) {
      const count = issueCounter.get(issue.message) ?? 0
      issueCounter.set(issue.message, count + 1)
    }

    // Build per-run summary
    runSummaries.push({
      seed: result.seed,
      depth: result.finalState.depth,
      killedBy,
      endReason: result.endReason,
      turns: result.finalState.turn,
      kills: result.finalState.kills,
    })
  }

  // Compute aggregate metrics
  const aggregateMetrics: Record<string, { min: number; max: number; avg: number }> = {}
  for (const [key, values] of Object.entries(metricSums)) {
    if (values.length > 0) {
      aggregateMetrics[key] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
      }
    }
  }

  // Sort issues by frequency
  const aggregateIssues = Array.from(issueCounter.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)

  // Sort death causes by frequency
  const sortedDeathCauses = Array.from(deathCauses.entries())
    .map(([monster, count]) => ({ monster, count }))
    .sort((a, b) => b.count - a.count)

  return {
    config,
    totalRuns: config.runs,
    successfulRuns: results.length - problemRuns.length,
    runs: runSummaries,
    problemRuns,
    aggregateMetrics,
    aggregateIssues,
    deathCauses: sortedDeathCauses,
    victoryCount,
    morgothKillCount,
    circuitBreakerCount,
  }
}

// ============================================================================
// PARALLEL BATCH RUNS
// ============================================================================

/** Extended batch config with thread count */
export interface ParallelBatchConfig extends BatchConfig {
  /** Number of worker threads (default: 8, max: CPU count) */
  threads?: number
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void
}

export interface WorkerInput {
  seed: number
  config: {
    raceId?: string
    classId?: string
    personality?: string
    maxTurns?: number
    circuitBreakerTurns?: number
    maxUpgrades?: boolean
    excludeUpgrades?: string[]
    randomize?: boolean
    balance?: Partial<BalanceOverrides>
    capabilities?: string
    upgrades?: string
    boosters?: string
  }
}

/**
 * Run multiple diagnostic sessions in parallel using worker threads
 */
/**
 * Aggregate an array of DiagnoseResults into a BatchResult.
 * Pure function — no pool or I/O, just number crunching.
 */
export function aggregateBatchResults(
  results: DiagnoseResult[],
  config: BatchConfig,
): BatchResult {
  const problemRuns: DiagnoseResult[] = []
  const runSummaries: BatchResult['runs'] = []
  const metricSums: Record<string, number[]> = {}
  const issueCounter = new Map<string, number>()
  const deathCauses = new Map<string, number>()
  let victoryCount = 0
  let morgothKillCount = 0
  let circuitBreakerCount = 0

  for (const result of results) {
    if (result.hasErrors || result.hasWarnings) {
      problemRuns.push(result)
    }

    if (result.endReason === 'victory') victoryCount++
    else if (result.endReason === 'circuit_breaker') circuitBreakerCount++

    for (const ar of result.analyzerResults) {
      for (const [key, value] of Object.entries(ar.metrics)) {
        if (typeof value === 'number') {
          const fullKey = `${ar.name}.${key}`
          if (!metricSums[fullKey]) metricSums[fullKey] = []
          metricSums[fullKey].push(value)
          if (key === 'morgothKills' && value > 0) morgothKillCount++
        } else if (key === 'killedBy' && typeof value === 'string' && result.endReason === 'death') {
          deathCauses.set(value, (deathCauses.get(value) ?? 0) + 1)
        }
      }
    }

    for (const issue of result.allIssues) {
      issueCounter.set(issue.message, (issueCounter.get(issue.message) ?? 0) + 1)
    }

    const killedByMetric = result.analyzerResults
      .find(ar => ar.name === 'worker-metrics')?.metrics?.killedBy
    runSummaries.push({
      seed: result.seed,
      depth: result.finalState.depth,
      killedBy: typeof killedByMetric === 'string' ? killedByMetric : 'unknown',
      endReason: result.endReason,
      turns: result.finalState.turn,
      kills: result.finalState.kills,
    })
  }

  const aggregateMetrics: Record<string, { min: number; max: number; avg: number }> = {}
  for (const [key, values] of Object.entries(metricSums)) {
    if (values.length > 0) {
      aggregateMetrics[key] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
      }
    }
  }

  runSummaries.sort((a, b) => a.seed - b.seed)

  return {
    config,
    totalRuns: config.runs,
    successfulRuns: results.length - problemRuns.length,
    runs: runSummaries,
    problemRuns,
    aggregateMetrics,
    aggregateIssues: Array.from(issueCounter.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count),
    deathCauses: Array.from(deathCauses.entries())
      .map(([monster, count]) => ({ monster, count }))
      .sort((a, b) => b.count - a.count),
    victoryCount,
    morgothKillCount,
    circuitBreakerCount,
  }
}

/**
 * Run multiple diagnostic sessions in parallel using worker threads
 */
export async function runBatchDiagnosisParallel(config: ParallelBatchConfig): Promise<BatchResult> {
  const startSeed = config.startSeed ?? Date.now()
  const threadCount = Math.min(config.threads ?? 8, cpus().length)

  const results: DiagnoseResult[] = []
  const pool = await getOrCreatePool(threadCount)

  let completed = 0
  const total = config.runs

  const workItems: WorkerInput[] = []
  const baseConfig = {
    raceId: config.raceId,
    classId: config.classId,
    personality: config.personality,
    maxTurns: config.maxTurns,
    circuitBreakerTurns: config.circuitBreakerTurns,
    maxUpgrades: config.maxUpgrades,
    excludeUpgrades: config.excludeUpgrades,
    randomize: config.randomize,
    balance: config.balance,
    capabilities: config.capabilities,
    upgrades: config.upgrades,
    boosters: config.boosters,
  }
  for (let i = 0; i < config.runs; i++) {
    workItems.push({ seed: startSeed + i, config: baseConfig })
  }

  const promises = workItems.map(async (item) => {
    const result: DiagnoseResult = await pool.run(item)
    results.push(result)
    completed++
    config.onProgress?.(completed, total)
  })

  await Promise.all(promises)
  return aggregateBatchResults(results, config)
}

// ============================================================================
// DEEP DIVE (single seed, verbose output)
// ============================================================================

/** Turn log entry for deep dive mode */
export interface TurnLogEntry {
  turn: number
  position: { x: number; y: number }
  hp: number
  mp: number
  maxMp: number
  depth: number
  goal: string | null
  action: string
  moved: boolean
  flags: string[]
}

/**
 * Run a deep diagnostic on a single seed with full turn logging
 */
export function runDeepDiagnosis(
  config: DiagnoseConfig
): DiagnoseResult & { turnLog: TurnLogEntry[]; spellUsage: Record<string, { casts: number; damage: number; mana: number }> } {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const analyzers = config.analyzers ?? []
  const turnLog: TurnLogEntry[] = []

  // Parse bot capabilities
  const capabilities = parseCapabilities(cfg.capabilities)

  // CRITICAL: Invalidate module-level caches before each run
  // These caches persist across runs and can cause "no goal" bugs when stale
  invalidateFrontierCache()
  invalidateUnexploredCache()

  // Create game with upgrade and booster bonuses
  const game: GameState = createGame({
    raceId: cfg.raceId,
    classId: cfg.classId,
    seed: cfg.seed,
    upgradeBonuses: computeUpgradesFromConfig(cfg),
    boosterBonuses: resolveBoosterBonuses(cfg.boosters, cfg.classId),
    balanceOverrides: cfg.balance,
  })

  const botState: BotState = createBotState()
  let endReason: EndReason = 'max_turns'
  let turnsOnCurrentLevel = 0
  let currentDepth = game.character.depth

  // Track repeated actions for stuck detection
  let lastActionStr = ''
  let sameActionCount = 0

  // Notify analyzers of start
  for (const analyzer of analyzers) {
    analyzer.onStart?.(game, botState)
  }

  // Main loop
  while (game.isRunning && game.turn < cfg.maxTurns) {
    const turn = game.turn
    const previousPosition = { ...game.character.position }
    const previousHP = game.character.hp
    const previousDepth = game.character.depth

    // Get bot action
    const action = runBotTick(game, cfg.personality, botState, capabilities)

    // Build action string BEFORE processTurn (items/monsters may be consumed/killed)
    let actionType: string
    switch (action.type) {
      case 'move':
        actionType = `move:${action.direction}`
        break
      case 'use': {
        const useItem = game.character.inventory.find(i => i.id === (action as any).itemId)
        actionType = useItem ? `use:${useItem.template.name}` : `use:${(action as any).itemId}`
        break
      }
      case 'attack':
      case 'ranged_attack': {
        const target = game.monsters.find(m => m.id === (action as any).targetId)
        actionType = target ? `${action.type}:${target.template.name}` : action.type
        break
      }
      case 'cast': {
        const castTarget = (action as any).targetId
          ? game.monsters.find(m => m.id === (action as any).targetId)
          : null
        actionType = castTarget
          ? `cast:${(action as any).spellId}@${castTarget.template.name}`
          : `cast:${(action as any).spellId}`
        break
      }
      default:
        actionType = action.type
    }

    // Build turn context
    const turnCtx: TurnContext = {
      game,
      botState,
      action,
      turn,
    }

    // Notify analyzers pre-turn
    for (const analyzer of analyzers) {
      analyzer.onTurn?.(turnCtx)
    }

    // Process turn
    processTurn(game, action)

    // Check for level change
    if (game.character.depth !== currentDepth) {
      const oldDepth = currentDepth
      currentDepth = game.character.depth
      turnsOnCurrentLevel = 0

      for (const analyzer of analyzers) {
        analyzer.onLevelChange?.(game, oldDepth, currentDepth)
      }
    } else {
      turnsOnCurrentLevel++
    }

    // Build post-turn context
    const moved =
      previousPosition.x !== game.character.position.x ||
      previousPosition.y !== game.character.position.y

    const postCtx: PostTurnContext = {
      ...turnCtx,
      moved,
      previousPosition,
      previousHP,
      previousDepth,
    }

    // Notify analyzers post-turn
    for (const analyzer of analyzers) {
      analyzer.onPostTurn?.(postCtx)
    }

    // Track repeated actions
    const actionStr = JSON.stringify(action)
    if (actionStr === lastActionStr) {
      sameActionCount++
    } else {
      sameActionCount = 1
      lastActionStr = actionStr
    }

    // Build flags
    const flags: string[] = []
    if (moved) flags.push('MOVED')
    if (previousDepth !== game.character.depth) flags.push('DESCENDED')
    if (previousHP > game.character.hp) flags.push('DAMAGE')
    if (sameActionCount >= 10) flags.push(`STUCK:${sameActionCount}`)  // Raised from 5 - corridors often have 10+ same-direction moves

    const goal = botState.currentGoal
    const goalStr = goal ? `${goal.type}@(${goal.target?.x},${goal.target?.y})` : null

    turnLog.push({
      turn,
      position: { ...game.character.position },
      hp: game.character.hp,
      mp: game.character.mp,
      maxMp: game.character.maxMp,
      depth: game.character.depth,
      goal: goalStr,
      action: actionType,
      moved,
      flags,
    })

    // Check end conditions
    if (game.character.hp <= 0) {
      endReason = 'death'
      break
    }

    if (game.isVictory) {
      endReason = 'victory'
      break
    }

    // Circuit breaker - exempt depth 50 (Morgoth hunt needs more turns)
    if (turnsOnCurrentLevel >= cfg.circuitBreakerTurns && game.character.depth < MAX_DEPTH) {
      endReason = 'circuit_breaker'
      break
    }
  }

  // Notify analyzers of end
  for (const analyzer of analyzers) {
    analyzer.onEnd?.(game, endReason)
  }

  // Report profiling if enabled (PROFILE_BOT=1)
  reportProfile()

  // Collect results
  const analyzerResults = analyzers.map((a) => a.summarize())
  const allIssues: DiagnosticIssue[] = analyzerResults.flatMap((r) => r.issues)

  return {
    seed: cfg.seed,
    config: cfg,
    endReason,
    finalState: {
      turn: game.turn,
      depth: game.character.depth,
      level: game.character.level,
      xp: game.character.xp,
      hp: game.character.hp,
      maxHp: game.character.maxHp,
      kills: game.stats.kills,
      gold: game.character.gold,
      position: { ...game.character.position },
    },
    analyzerResults,
    allIssues,
    hasErrors: allIssues.some((i) => i.severity === 'error'),
    hasWarnings: allIssues.some((i) => i.severity === 'warning'),
    turnLog,
    spellUsage: game.stats.spellUsage,
  }
}
