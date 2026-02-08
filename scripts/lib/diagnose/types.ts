/**
 * Diagnostic Toolkit Types
 *
 * Shared type definitions for the bot diagnostic framework.
 */

import type { GameState, GameAction, Point, BotPersonality, BalanceOverrides } from '@game/types'
import type { BotState } from '@bot/types'

// ============================================================================
// ANALYZER INTERFACE
// ============================================================================

/** Result from an analyzer's summarize() method */
export interface AnalyzerResult {
  name: string
  metrics: Record<string, number | string | boolean>
  issues: DiagnosticIssue[]
  details?: string[]
}

/** A detected issue */
export interface DiagnosticIssue {
  severity: 'warning' | 'error'
  message: string
  turn?: number
  context?: Record<string, unknown>
}

/** Core analyzer interface - implement to create custom analyzers */
export interface Analyzer {
  readonly name: string

  /** Called before first turn */
  onStart?(game: GameState, botState: BotState): void

  /** Called each turn with pre-action state */
  onTurn?(ctx: TurnContext): void

  /** Called after action is processed */
  onPostTurn?(ctx: PostTurnContext): void

  /** Called when depth changes */
  onLevelChange?(game: GameState, oldDepth: number, newDepth: number): void

  /** Called when run ends */
  onEnd?(game: GameState, reason: EndReason): void

  /** Generate summary - called at end or on demand */
  summarize(): AnalyzerResult
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/** Context passed to onTurn */
export interface TurnContext {
  game: GameState
  botState: BotState
  action: GameAction
  turn: number
}

/** Context passed to onPostTurn */
export interface PostTurnContext extends TurnContext {
  moved: boolean
  previousPosition: Point
  previousHP: number
  previousDepth: number
}

/** Why the run ended */
export type EndReason = 'death' | 'victory' | 'max_turns' | 'circuit_breaker' | 'manual'

// ============================================================================
// RUNNER CONFIGURATION
// ============================================================================

/** Configuration for a diagnostic run */
export interface DiagnoseConfig {
  /** Random seed (defaults to Date.now()) */
  seed?: number
  /** Race ID */
  raceId?: string
  /** Class ID */
  classId?: string
  /** Bot personality */
  personality?: BotPersonality
  /** Maximum turns before stopping */
  maxTurns?: number
  /** Circuit breaker: max turns on same level */
  circuitBreakerTurns?: number
  /** Analyzers to run */
  analyzers?: Analyzer[]
  /** Verbosity: 0=silent, 1=summary, 2=issues, 3=all turns */
  verbosity?: 0 | 1 | 2 | 3
  /** Use max upgrade bonuses (legacy, prefer --upgrades=full) */
  maxUpgrades?: boolean
  /** Upgrade IDs to exclude when maxUpgrades is true (for isolation testing) */
  excludeUpgrades?: string[]
  /** Upgrade preset: 'none', 'early', 'mid', 'late', 'full' */
  upgrades?: string
  /** Booster preset: 'none', 'class' (uses class default), or comma-separated IDs */
  boosters?: string
  /** Randomize race/class/personality per run (batch mode) */
  randomize?: boolean
  /** Balance overrides for A/B testing */
  balance?: Partial<BalanceOverrides>
  /** Bot capabilities spec: 'none', 'full', or comma-separated upgrade IDs */
  capabilities?: string
}

/** Result from a diagnostic run */
export interface DiagnoseResult {
  seed: number
  config: Required<Omit<DiagnoseConfig, 'analyzers'>>
  endReason: EndReason
  finalState: {
    turn: number
    depth: number
    level: number
    xp: number
    hp: number
    maxHp: number
    kills: number
    gold: number
    position: Point
  }
  analyzerResults: AnalyzerResult[]
  allIssues: DiagnosticIssue[]
  /** Quick check: any errors detected? */
  hasErrors: boolean
  /** Quick check: any warnings detected? */
  hasWarnings: boolean
}

// ============================================================================
// BATCH CONFIGURATION
// ============================================================================

/** Configuration for batch runs */
export interface BatchConfig extends Omit<DiagnoseConfig, 'seed'> {
  /** Number of runs */
  runs: number
  /** Starting seed (increments by 1 for each run) */
  startSeed?: number
  /** Only report runs with issues */
  onlyProblems?: boolean
}

/** Aggregated result from batch runs */
/** Per-run summary for batch output (lightweight — no full analyzer data) */
export interface RunSummary {
  seed: number
  depth: number
  killedBy: string
  endReason: EndReason
  turns: number
  kills: number
}

export interface BatchResult {
  config: BatchConfig
  totalRuns: number
  successfulRuns: number
  /** Per-run summaries for structured queries (e.g. find Morgoth-death seeds) */
  runs: RunSummary[]
  problemRuns: DiagnoseResult[]
  aggregateMetrics: Record<string, { min: number; max: number; avg: number }>
  aggregateIssues: { message: string; count: number }[]
  /** Death causes aggregated by monster name */
  deathCauses: { monster: string; count: number }[]
  /** Number of runs that ended in victory */
  victoryCount: number
  /** Number of runs where Morgoth was killed */
  morgothKillCount: number
  /** Number of runs that hit circuit breaker */
  circuitBreakerCount: number
}

// ============================================================================
// MOVEMENT TRACKING
// ============================================================================

/** Position with turn number for history tracking */
export interface TimestampedPosition extends Point {
  turn: number
}

/** Detected movement pattern */
export interface MovementPattern {
  type: 'oscillation' | 'loop' | 'stuck'
  positions: Point[]
  startTurn: number
  duration: number
}
