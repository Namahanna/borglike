/**
 * Farming Analyzer
 *
 * Tracks farming/sweep/tether progression patterns:
 * - Farming mode entry/exit and duration
 * - Sweep mode lifecycle (casters at level < 10)
 * - Tethered exploration radius progression
 * - Level flip patterns during farming
 *
 * Provides context for other analyzers to distinguish expected farming
 * behavior from real stuck patterns.
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  PostTurnContext,
  EndReason,
} from '../types'
import type { GameState } from '@game/types'
import type { BotState } from '@bot/types'
import { seenGridHas } from '@bot/types'

/** Configuration for farming analysis */
export interface FarmingAnalyzerConfig {
  /** Warn if farming mode lasts longer than this many turns */
  farmingTimeoutThreshold: number
  /** Warn if sweep mode times out without completion */
  sweepTimeoutThreshold: number
}

const DEFAULT_CONFIG: FarmingAnalyzerConfig = {
  farmingTimeoutThreshold: 2000,
  sweepTimeoutThreshold: 600,
}

/** A recorded farming session */
interface FarmingSession {
  startTurn: number
  endTurn: number | null
  blockedDepth: number
  goldTarget: number
  flipCount: number
  completed: boolean
}

/** A recorded sweep session */
interface SweepSession {
  startTurn: number
  endTurn: number | null
  depth: number
  startProgress: number
  endProgress: number | null
  completed: boolean
  timedOut: boolean
}

/** A recorded level flip during farming */
interface FarmingFlip {
  turn: number
  fromDepth: number
  toDepth: number
  reason: 'tether_complete' | 'sweep_complete' | 'ascend_to_farm' | 'return_to_farm' | 'unknown'
  tetherRadius: number | null
}

export class FarmingAnalyzer implements Analyzer {
  readonly name = 'farming'
  private config: FarmingAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Current state tracking
  private inFarmingMode = false
  private inSweepMode = false
  private currentFarmingSession: FarmingSession | null = null
  private currentSweepSession: SweepSession | null = null
  private lastTetherRadius = 0
  private lastTetherFlipCount = 0
  private lastSeenThisVisitSize = 0

  // Aggregates
  private farmingSessions: FarmingSession[] = []
  private sweepSessions: SweepSession[] = []
  private farmingFlips: FarmingFlip[] = []
  private totalFarmingTurns = 0
  private totalSweepTurns = 0
  private totalTurns = 0

  // Reference to last botState for onEnd
  private lastBotState: BotState | null = null

  constructor(config: Partial<FarmingAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, botState: BotState): void {
    this.issues = []
    this.farmingSessions = []
    this.sweepSessions = []
    this.farmingFlips = []
    this.totalFarmingTurns = 0
    this.totalSweepTurns = 0
    this.totalTurns = 0

    this.inFarmingMode = botState.farmingMode
    this.inSweepMode = botState.sweepMode
    this.currentFarmingSession = null
    this.currentSweepSession = null
    this.lastTetherRadius = botState.tetheredRadius
    this.lastTetherFlipCount = botState.tetheredFlipCount
    this.lastSeenThisVisitSize = botState.seenThisVisit.count
    this.lastBotState = botState
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++
    const { game, botState, turn } = ctx

    // Track farming mode transitions
    if (botState.farmingMode && !this.inFarmingMode) {
      // Entered farming mode
      this.inFarmingMode = true
      this.currentFarmingSession = {
        startTurn: turn,
        endTurn: null,
        blockedDepth: botState.farmBlockedDepth,
        goldTarget: botState.farmGoldTarget,
        flipCount: 0,
        completed: false,
      }
    } else if (!botState.farmingMode && this.inFarmingMode) {
      // Exited farming mode
      this.inFarmingMode = false
      if (this.currentFarmingSession) {
        this.currentFarmingSession.endTurn = turn
        this.currentFarmingSession.completed = true
        this.farmingSessions.push(this.currentFarmingSession)
        this.currentFarmingSession = null
      }
    }

    // Track sweep mode transitions
    if (botState.sweepMode && !this.inSweepMode) {
      // Entered sweep mode
      this.inSweepMode = true
      const progress = this.getSweepProgress(game, botState)
      this.currentSweepSession = {
        startTurn: turn,
        endTurn: null,
        depth: game.character.depth,
        startProgress: progress,
        endProgress: null,
        completed: false,
        timedOut: false,
      }
    } else if (!botState.sweepMode && this.inSweepMode) {
      // Exited sweep mode
      this.inSweepMode = false
      if (this.currentSweepSession) {
        const progress = this.getSweepProgress(game, botState)
        this.currentSweepSession.endTurn = turn
        this.currentSweepSession.endProgress = progress
        this.currentSweepSession.completed = progress >= 70
        this.currentSweepSession.timedOut =
          turn - this.currentSweepSession.startTurn > 500 && !this.currentSweepSession.completed
        this.sweepSessions.push(this.currentSweepSession)
        this.currentSweepSession = null
      }
    }

    // Track tether progression
    if (botState.tetheredFlipCount > this.lastTetherFlipCount) {
      // Tether flip occurred
      if (this.currentFarmingSession) {
        this.currentFarmingSession.flipCount++
      }
    }
    this.lastTetherRadius = botState.tetheredRadius
    this.lastTetherFlipCount = botState.tetheredFlipCount

    // Track seenThisVisit clearing (indicates level revisit)
    if (botState.seenThisVisit.count < this.lastSeenThisVisitSize && this.lastSeenThisVisitSize > 10) {
      // seenThisVisit was cleared (level change resets it)
      // This is expected during farming flips
    }
    this.lastSeenThisVisitSize = botState.seenThisVisit.count

    // Accumulate time in modes
    if (this.inFarmingMode) this.totalFarmingTurns++
    if (this.inSweepMode) this.totalSweepTurns++

    // Check for farming timeout
    if (
      this.currentFarmingSession &&
      turn - this.currentFarmingSession.startTurn > this.config.farmingTimeoutThreshold
    ) {
      // Only warn once per session
      const alreadyWarned = this.issues.some(
        (i) => i.message.includes('Farming mode') && i.turn === this.currentFarmingSession?.startTurn
      )
      if (!alreadyWarned) {
        this.issues.push({
          severity: 'warning',
          message: `Farming mode exceeded ${this.config.farmingTimeoutThreshold} turns`,
          turn,
          context: {
            blockedDepth: this.currentFarmingSession.blockedDepth,
            goldTarget: this.currentFarmingSession.goldTarget,
            flipCount: this.currentFarmingSession.flipCount,
          },
        })
      }
    }
  }

  onPostTurn(_ctx: PostTurnContext): void {
    // Nothing needed post-turn
  }

  onLevelChange(game: GameState, oldDepth: number, newDepth: number): void {
    const turn = game.turn

    // Record farming flip
    if (this.inFarmingMode || this.inSweepMode) {
      let reason: FarmingFlip['reason'] = 'unknown'

      if (newDepth < oldDepth) {
        // Ascending
        reason = this.inSweepMode ? 'sweep_complete' : 'ascend_to_farm'
      } else {
        // Descending
        reason = this.lastTetherRadius > 0 ? 'tether_complete' : 'return_to_farm'
      }

      this.farmingFlips.push({
        turn,
        fromDepth: oldDepth,
        toDepth: newDepth,
        reason,
        tetherRadius: this.lastTetherRadius > 0 ? this.lastTetherRadius : null,
      })
    }
  }

  onEnd(game: GameState, _reason: EndReason): void {
    // Finalize any open sessions
    if (this.currentFarmingSession) {
      this.currentFarmingSession.endTurn = game.turn
      this.farmingSessions.push(this.currentFarmingSession)
    }
    if (this.currentSweepSession && this.lastBotState) {
      const progress = this.getSweepProgress(game, this.lastBotState)
      this.currentSweepSession.endTurn = game.turn
      this.currentSweepSession.endProgress = progress
      this.sweepSessions.push(this.currentSweepSession)
    }
  }

  summarize(): AnalyzerResult {
    const farmingRate =
      this.totalTurns > 0 ? (this.totalFarmingTurns / this.totalTurns) * 100 : 0
    const sweepRate = this.totalTurns > 0 ? (this.totalSweepTurns / this.totalTurns) * 100 : 0

    const completedFarmingSessions = this.farmingSessions.filter((s) => s.completed).length
    const completedSweepSessions = this.sweepSessions.filter((s) => s.completed).length
    const timedOutSweepSessions = this.sweepSessions.filter((s) => s.timedOut).length

    const avgFlipsPerSession =
      this.farmingSessions.length > 0
        ? this.farmingSessions.reduce((sum, s) => sum + s.flipCount, 0) / this.farmingSessions.length
        : 0

    const details: string[] = [
      `Farming mode: ${this.totalFarmingTurns} turns (${farmingRate.toFixed(1)}%)`,
      `Sweep mode: ${this.totalSweepTurns} turns (${sweepRate.toFixed(1)}%)`,
      `Farming sessions: ${this.farmingSessions.length} (${completedFarmingSessions} completed)`,
      `Sweep sessions: ${this.sweepSessions.length} (${completedSweepSessions} completed, ${timedOutSweepSessions} timed out)`,
      `Farming flips: ${this.farmingFlips.length} (avg ${avgFlipsPerSession.toFixed(1)} per session)`,
    ]

    // Add flip breakdown
    if (this.farmingFlips.length > 0) {
      const flipsByReason = new Map<string, number>()
      for (const flip of this.farmingFlips) {
        flipsByReason.set(flip.reason, (flipsByReason.get(flip.reason) ?? 0) + 1)
      }
      details.push('')
      details.push('Flip reasons:')
      for (const [reason, count] of flipsByReason) {
        details.push(`  ${reason}: ${count}`)
      }
    }

    return {
      name: this.name,
      metrics: {
        farmingTurns: this.totalFarmingTurns,
        farmingRate: Math.round(farmingRate * 10) / 10,
        sweepTurns: this.totalSweepTurns,
        sweepRate: Math.round(sweepRate * 10) / 10,
        farmingSessions: this.farmingSessions.length,
        completedFarmingSessions,
        sweepSessions: this.sweepSessions.length,
        completedSweepSessions,
        timedOutSweepSessions,
        farmingFlips: this.farmingFlips.length,
        avgFlipsPerSession: Math.round(avgFlipsPerSession * 10) / 10,
      },
      issues: this.issues,
      details,
    }
  }

  /** Check if currently in farming mode (for other analyzers) */
  isInFarmingMode(): boolean {
    return this.inFarmingMode
  }

  /** Check if currently in sweep mode (for other analyzers) */
  isInSweepMode(): boolean {
    return this.inSweepMode
  }

  /** Get current tether radius (for other analyzers) */
  getCurrentTetherRadius(): number {
    return this.lastTetherRadius
  }

  /** Get farming flips for analysis */
  getFarmingFlips(): FarmingFlip[] {
    return this.farmingFlips
  }

  /** Calculate sweep progress (% of floor tiles seen this visit) */
  private getSweepProgress(game: GameState, botState: BotState): number {
    const level = game.currentLevel
    let totalFloor = 0
    let seenFloor = 0

    for (let y = 0; y < level.height; y++) {
      const row = level.tiles[y]
      if (!row) continue

      for (let x = 0; x < level.width; x++) {
        const tile = row[x]
        if (!tile) continue

        if (tile.type === 'floor' || tile.type === 'door_open' || tile.type === 'door_closed') {
          totalFloor++
          if (seenGridHas(botState.seenThisVisit, x, y)) {
            seenFloor++
          }
        }
      }
    }

    return totalFloor > 0 ? Math.floor((seenFloor / totalFloor) * 100) : 100
  }
}

/** Create a farming analyzer with default config */
export function createFarmingAnalyzer(
  config?: Partial<FarmingAnalyzerConfig>
): FarmingAnalyzer {
  return new FarmingAnalyzer(config)
}
