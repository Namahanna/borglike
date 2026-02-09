/**
 * Progression Analyzer
 *
 * Consolidated analyzer for progression behavior, merging:
 * - Farming mode tracking (sessions, gold targets, completion)
 * - Sweep mode lifecycle (casters at early levels)
 * - Tether exploration (radius progression, flip patterns)
 * - Descent patterns (level transitions, depth milestones)
 *
 * Maps to: bot/progression.ts
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  EndReason,
} from '../types'
import type { GameState } from '@game/types'
import type { BotState } from '@bot/types'
import { seenGridHas } from '@bot/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Which checks to enable */
export interface ProgressionChecks {
  /** Track farming mode sessions */
  farming: boolean
  /** Track sweep mode lifecycle */
  sweep: boolean
  /** Track tether exploration patterns */
  tether: boolean
  /** Track descent/ascent patterns */
  descent: boolean
  /** Track town portal usage reasons */
  townPortal: boolean
}

/** Configuration for progression analysis */
export interface ProgressionAnalyzerConfig {
  /** Which checks to enable */
  checks: ProgressionChecks

  /** Warn if farming mode lasts longer than this many turns */
  farmingTimeoutThreshold: number
  /** Warn if sweep mode times out without completion */
  sweepTimeoutThreshold: number
  /** Target sweep completion percentage */
  sweepTargetProgress: number
}

const DEFAULT_CHECKS: ProgressionChecks = {
  farming: true,
  sweep: true,
  tether: true,
  descent: true,
  townPortal: true,
}

const DEFAULT_CONFIG: ProgressionAnalyzerConfig = {
  checks: DEFAULT_CHECKS,
  farmingTimeoutThreshold: 2000,
  sweepTimeoutThreshold: 600,
  sweepTargetProgress: 70,
}

// ============================================================================
// TYPES
// ============================================================================

/** A recorded farming session */
interface FarmingSession {
  startTurn: number
  endTurn: number | null
  blockedDepth: number
  goldTarget: number
  flipCount: number
  completed: boolean
  timeoutWarned: boolean
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

/** Descent event */
interface DescentEvent {
  turn: number
  fromDepth: number
  toDepth: number
  turnsOnPreviousLevel: number
  reason: 'normal' | 'farming' | 'sweep' | 'town_return'
}

/** Town portal usage event */
interface TownPortalUsage {
  turn: number
  depth: number
  reason: string
}

// ============================================================================
// ANALYZER
// ============================================================================

export class ProgressionAnalyzer implements Analyzer {
  readonly name = 'progression'
  private config: ProgressionAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Current state tracking
  private inFarmingMode = false
  private inSweepMode = false
  private currentFarmingSession: FarmingSession | null = null
  private currentSweepSession: SweepSession | null = null
  private lastTetherRadius = 0
  private lastTetherFlipCount = 0
  private turnsOnCurrentLevel = 0

  // Aggregates
  private farmingSessions: FarmingSession[] = []
  private sweepSessions: SweepSession[] = []
  private farmingFlips: FarmingFlip[] = []
  private descentEvents: DescentEvent[] = []
  private townPortalUsages: TownPortalUsage[] = []
  private totalFarmingTurns = 0
  private totalSweepTurns = 0
  private totalTurns = 0
  private maxDepth = 0

  // Reference to last botState for onEnd
  private lastBotState: BotState | null = null

  constructor(config: Partial<ProgressionAnalyzerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      checks: { ...DEFAULT_CHECKS, ...config.checks },
    }
  }

  onStart(game: GameState, botState: BotState): void {
    this.issues = []
    this.farmingSessions = []
    this.sweepSessions = []
    this.farmingFlips = []
    this.descentEvents = []
    this.townPortalUsages = []
    this.totalFarmingTurns = 0
    this.totalSweepTurns = 0
    this.totalTurns = 0
    this.maxDepth = game.character.depth
    this.turnsOnCurrentLevel = 0

    this.inFarmingMode = botState.farmingMode
    this.inSweepMode = botState.sweepMode
    this.currentFarmingSession = null
    this.currentSweepSession = null
    this.lastTetherRadius = botState.tetheredRadius
    this.lastTetherFlipCount = botState.tetheredFlipCount
    this.lastBotState = botState
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++
    this.turnsOnCurrentLevel++
    const { game, botState, turn } = ctx

    this.lastBotState = botState
    this.maxDepth = Math.max(this.maxDepth, game.character.depth)

    if (this.config.checks.farming) {
      this.trackFarming(ctx)
    }

    if (this.config.checks.sweep) {
      this.trackSweep(ctx)
    }

    if (this.config.checks.tether) {
      this.trackTether(ctx)
    }

    if (this.config.checks.townPortal) {
      this.trackTownPortal(ctx)
    }

    // Accumulate time in modes
    if (this.inFarmingMode) this.totalFarmingTurns++
    if (this.inSweepMode) this.totalSweepTurns++

    // Check for farming timeout
    if (
      this.config.checks.farming &&
      this.currentFarmingSession &&
      !this.currentFarmingSession.timeoutWarned &&
      turn - this.currentFarmingSession.startTurn > this.config.farmingTimeoutThreshold
    ) {
      this.currentFarmingSession.timeoutWarned = true
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

  private trackFarming(ctx: TurnContext): void {
    const { botState, turn } = ctx

    // Farming mode transitions
    if (botState.farmingMode && !this.inFarmingMode) {
      this.inFarmingMode = true
      this.currentFarmingSession = {
        startTurn: turn,
        endTurn: null,
        blockedDepth: botState.farmBlockedDepth,
        goldTarget: botState.farmGoldTarget,
        flipCount: 0,
        completed: false,
        timeoutWarned: false,
      }
    } else if (!botState.farmingMode && this.inFarmingMode) {
      this.inFarmingMode = false
      if (this.currentFarmingSession) {
        this.currentFarmingSession.endTurn = turn
        this.currentFarmingSession.completed = true
        this.farmingSessions.push(this.currentFarmingSession)
        this.currentFarmingSession = null
      }
    }
  }

  private trackSweep(ctx: TurnContext): void {
    const { game, botState, turn } = ctx

    // Sweep mode transitions
    if (botState.sweepMode && !this.inSweepMode) {
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
      this.inSweepMode = false
      if (this.currentSweepSession) {
        const progress = this.getSweepProgress(game, botState)
        this.currentSweepSession.endTurn = turn
        this.currentSweepSession.endProgress = progress
        this.currentSweepSession.completed = progress >= this.config.sweepTargetProgress
        this.currentSweepSession.timedOut =
          turn - this.currentSweepSession.startTurn > 500 && !this.currentSweepSession.completed
        this.sweepSessions.push(this.currentSweepSession)
        this.currentSweepSession = null
      }
    }
  }

  private trackTether(ctx: TurnContext): void {
    const { botState } = ctx

    // Track tether flip count changes
    if (botState.tetheredFlipCount > this.lastTetherFlipCount) {
      if (this.currentFarmingSession) {
        this.currentFarmingSession.flipCount++
      }
    }
    this.lastTetherRadius = botState.tetheredRadius
    this.lastTetherFlipCount = botState.tetheredFlipCount
  }

  private trackTownPortal(ctx: TurnContext): void {
    const { game, botState, action, turn } = ctx

    // Check if action is using a Town Portal scroll
    if (action.type === 'use' && action.itemId) {
      const item = game.character.inventory.find((i) => i.id === action.itemId)
      if (item?.template.name === 'Scroll of Town Portal') {
        // Check multiple sources for reason:
        // 1. lastTownPortalReason (set by survival-consumables path)
        // 2. currentGoal.reason (set by TOWN_TRIP goal path)
        let reason = botState.lastTownPortalReason
        if (!reason && botState.currentGoal?.type === 'TOWN_TRIP') {
          reason = botState.currentGoal.reason
        }
        this.townPortalUsages.push({
          turn,
          depth: game.character.depth,
          reason: reason ?? 'unknown',
        })
        // Clear the reason after recording
        botState.lastTownPortalReason = null
      }
    }
  }

  onLevelChange(game: GameState, oldDepth: number, newDepth: number): void {
    const turn = game.turn

    // Record descent/ascent event
    if (this.config.checks.descent) {
      let reason: DescentEvent['reason'] = 'normal'
      if (this.inFarmingMode) reason = 'farming'
      else if (this.inSweepMode) reason = 'sweep'
      else if (oldDepth === 0 && newDepth > 0) reason = 'town_return'

      this.descentEvents.push({
        turn,
        fromDepth: oldDepth,
        toDepth: newDepth,
        turnsOnPreviousLevel: this.turnsOnCurrentLevel,
        reason,
      })
    }

    // Record farming flip
    if ((this.inFarmingMode || this.inSweepMode) && this.config.checks.tether) {
      let reason: FarmingFlip['reason'] = 'unknown'

      if (newDepth < oldDepth) {
        reason = this.inSweepMode ? 'sweep_complete' : 'ascend_to_farm'
      } else {
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

    this.turnsOnCurrentLevel = 0
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

  summarize(): AnalyzerResult {
    const metrics: Record<string, number | string | boolean> = {}
    const details: string[] = []

    // Overall metrics
    metrics.maxDepth = this.maxDepth
    metrics.totalTurns = this.totalTurns

    details.push(`Max depth: ${this.maxDepth}`)

    // Farming metrics
    if (this.config.checks.farming) {
      const farmingRate = this.totalTurns > 0 ? (this.totalFarmingTurns / this.totalTurns) * 100 : 0
      const completedFarmingSessions = this.farmingSessions.filter((s) => s.completed).length

      Object.assign(metrics, {
        farmingTurns: this.totalFarmingTurns,
        farmingRate: Math.round(farmingRate * 10) / 10,
        farmingSessions: this.farmingSessions.length,
        completedFarmingSessions,
      })

      details.push(
        '',
        '=== Farming ===',
        `Farming mode: ${this.totalFarmingTurns} turns (${farmingRate.toFixed(1)}%)`,
        `Sessions: ${this.farmingSessions.length} (${completedFarmingSessions} completed)`,
      )

      // Show farming session details
      if (this.farmingSessions.length > 0) {
        details.push('Sessions:')
        for (const session of this.farmingSessions.slice(0, 3)) {
          const duration = (session.endTurn ?? this.totalTurns) - session.startTurn
          details.push(
            `  Turn ${session.startTurn}: depth=${session.blockedDepth} gold=${session.goldTarget} ` +
            `flips=${session.flipCount} ${duration} turns ${session.completed ? '(completed)' : ''}`
          )
        }
        if (this.farmingSessions.length > 3) {
          details.push(`  ... (${this.farmingSessions.length - 3} more)`)
        }
      }
    }

    // Sweep metrics
    if (this.config.checks.sweep) {
      const sweepRate = this.totalTurns > 0 ? (this.totalSweepTurns / this.totalTurns) * 100 : 0
      const completedSweepSessions = this.sweepSessions.filter((s) => s.completed).length
      const timedOutSweepSessions = this.sweepSessions.filter((s) => s.timedOut).length

      Object.assign(metrics, {
        sweepTurns: this.totalSweepTurns,
        sweepRate: Math.round(sweepRate * 10) / 10,
        sweepSessions: this.sweepSessions.length,
        completedSweepSessions,
        timedOutSweepSessions,
      })

      details.push(
        '',
        '=== Sweep ===',
        `Sweep mode: ${this.totalSweepTurns} turns (${sweepRate.toFixed(1)}%)`,
        `Sessions: ${this.sweepSessions.length} (${completedSweepSessions} completed, ${timedOutSweepSessions} timed out)`,
      )
    }

    // Tether metrics
    if (this.config.checks.tether) {
      const avgFlipsPerSession = this.farmingSessions.length > 0
        ? this.farmingSessions.reduce((sum, s) => sum + s.flipCount, 0) / this.farmingSessions.length
        : 0

      Object.assign(metrics, {
        farmingFlips: this.farmingFlips.length,
        avgFlipsPerSession: Math.round(avgFlipsPerSession * 10) / 10,
      })

      if (this.farmingFlips.length > 0) {
        details.push(
          '',
          '=== Tether Flips ===',
          `Total flips: ${this.farmingFlips.length} (avg ${avgFlipsPerSession.toFixed(1)} per session)`,
        )

        // Flip breakdown by reason
        const flipsByReason = new Map<string, number>()
        for (const flip of this.farmingFlips) {
          flipsByReason.set(flip.reason, (flipsByReason.get(flip.reason) ?? 0) + 1)
        }
        for (const [reason, count] of flipsByReason) {
          details.push(`  ${reason}: ${count}`)
        }
      }
    }

    // Descent metrics
    if (this.config.checks.descent) {
      const descents = this.descentEvents.filter((e) => e.toDepth > e.fromDepth).length
      const ascents = this.descentEvents.filter((e) => e.toDepth < e.fromDepth).length

      Object.assign(metrics, {
        descentEvents: descents,
        ascentEvents: ascents,
        totalLevelChanges: this.descentEvents.length,
      })

      details.push(
        '',
        '=== Level Changes ===',
        `Descents: ${descents}`,
        `Ascents: ${ascents}`,
      )

      // Show descent patterns
      if (this.descentEvents.length > 0) {
        const byReason = new Map<string, number>()
        for (const event of this.descentEvents) {
          byReason.set(event.reason, (byReason.get(event.reason) ?? 0) + 1)
        }
        details.push('By reason:')
        for (const [reason, count] of byReason) {
          details.push(`  ${reason}: ${count}`)
        }
      }
    }

    // Town portal metrics
    if (this.config.checks.townPortal) {
      Object.assign(metrics, {
        townPortalUsages: this.townPortalUsages.length,
      })

      if (this.townPortalUsages.length > 0) {
        details.push(
          '',
          '=== Town Portal Usage ===',
          `Total uses: ${this.townPortalUsages.length}`,
        )

        // Breakdown by reason
        const byReason = new Map<string, number>()
        for (const usage of this.townPortalUsages) {
          byReason.set(usage.reason, (byReason.get(usage.reason) ?? 0) + 1)
        }
        details.push('By reason:')
        for (const [reason, count] of byReason) {
          metrics[`townPortal_${reason.replace(/[^a-zA-Z0-9]/g, '_')}`] = count
          details.push(`  ${reason}: ${count}`)
        }

        // Show individual usages (first 5)
        details.push('Recent uses:')
        for (const usage of this.townPortalUsages.slice(0, 5)) {
          details.push(`  Turn ${usage.turn}: depth=${usage.depth} reason="${usage.reason}"`)
        }
        if (this.townPortalUsages.length > 5) {
          details.push(`  ... (${this.townPortalUsages.length - 5} more)`)
        }
      }
    }

    return {
      name: this.name,
      metrics,
      issues: this.issues,
      details,
    }
  }

  /** Check if currently in farming mode */
  isInFarmingMode(): boolean {
    return this.inFarmingMode
  }

  /** Check if currently in sweep mode */
  isInSweepMode(): boolean {
    return this.inSweepMode
  }

  /** Get current tether radius */
  getCurrentTetherRadius(): number {
    return this.lastTetherRadius
  }

  /** Get farming flips for analysis */
  getFarmingFlips(): FarmingFlip[] {
    return this.farmingFlips
  }

  /** Get descent events for analysis */
  getDescentEvents(): DescentEvent[] {
    return this.descentEvents
  }
}

/** Create a progression analyzer with default config */
export function createProgressionAnalyzer(
  config?: Partial<ProgressionAnalyzerConfig>
): ProgressionAnalyzer {
  return new ProgressionAnalyzer(config)
}
