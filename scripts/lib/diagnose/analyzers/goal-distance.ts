/**
 * Goal Distance Analyzer
 *
 * Tracks goal target distances to detect:
 * - Goals set to adjacent tiles (thrashing)
 * - Goals switching before meaningful progress
 * - Healthy vs unhealthy goal distance patterns
 *
 * Key insight from debugging: When corridor-following mode was engaged,
 * exploration goals were set to adjacent tiles (distance 1-2), causing
 * immediate goal completion and oscillation. Healthy exploration goals
 * should target tiles 5+ away.
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  EndReason,
} from '../types'
import type { GameState } from '@game/types'
import type { BotState, GoalType } from '@bot/types'

/** Configuration for goal distance analysis */
export interface GoalDistanceAnalyzerConfig {
  /** Warn if EXPLORE goals average < this distance */
  minExploreDistanceThreshold: number
  /** Warn if > this % of EXPLORE goals have distance < 3 */
  shortGoalPercentageThreshold: number
  /** Consider a goal "short" if distance < this */
  shortDistanceThreshold: number
}

const DEFAULT_CONFIG: GoalDistanceAnalyzerConfig = {
  minExploreDistanceThreshold: 4,
  shortGoalPercentageThreshold: 50,
  shortDistanceThreshold: 3,
}

/** Goal distance record */
interface GoalDistanceRecord {
  turn: number
  type: GoalType
  distance: number
  targetX: number
  targetY: number
}

/** Per-type statistics */
interface TypeDistanceStats {
  count: number
  totalDistance: number
  shortCount: number
  distances: number[]
}

export class GoalDistanceAnalyzer implements Analyzer {
  readonly name = 'goal-distance'
  private config: GoalDistanceAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Current tracking
  private lastGoalTarget: { x: number; y: number } | null = null
  private lastGoalType: GoalType | null = null

  // Aggregate data
  private records: GoalDistanceRecord[] = []
  private typeStats: Map<GoalType, TypeDistanceStats> = new Map()
  private consecutiveShortGoals = 0
  private maxConsecutiveShort = 0

  constructor(config: Partial<GoalDistanceAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.lastGoalTarget = null
    this.lastGoalType = null
    this.records = []
    this.typeStats = new Map()
    this.consecutiveShortGoals = 0
    this.maxConsecutiveShort = 0
  }

  onTurn(ctx: TurnContext): void {
    const goal = ctx.botState.currentGoal
    if (!goal || !goal.target) {
      this.lastGoalTarget = null
      this.lastGoalType = null
      return
    }

    // Check if goal changed
    const targetChanged =
      !this.lastGoalTarget ||
      this.lastGoalTarget.x !== goal.target.x ||
      this.lastGoalTarget.y !== goal.target.y

    const typeChanged = this.lastGoalType !== goal.type

    if (targetChanged || typeChanged) {
      // New goal - calculate distance
      const pos = ctx.game.character.position
      const distance = Math.max(
        Math.abs(goal.target.x - pos.x),
        Math.abs(goal.target.y - pos.y)
      )

      // Record it
      this.records.push({
        turn: ctx.turn,
        type: goal.type,
        distance,
        targetX: goal.target.x,
        targetY: goal.target.y,
      })

      // Update type stats
      const stats = this.typeStats.get(goal.type) ?? {
        count: 0,
        totalDistance: 0,
        shortCount: 0,
        distances: [],
      }
      stats.count++
      stats.totalDistance += distance
      stats.distances.push(distance)
      if (distance < this.config.shortDistanceThreshold) {
        stats.shortCount++
      }
      this.typeStats.set(goal.type, stats)

      // Track consecutive short goals
      if (distance < this.config.shortDistanceThreshold) {
        this.consecutiveShortGoals++
        this.maxConsecutiveShort = Math.max(
          this.maxConsecutiveShort,
          this.consecutiveShortGoals
        )

        // Warn on streak of short goals
        if (this.consecutiveShortGoals === 10) {
          this.issues.push({
            severity: 'warning',
            message: `10 consecutive short-distance goals (< ${this.config.shortDistanceThreshold} tiles)`,
            turn: ctx.turn,
            context: { goalType: goal.type, distance },
          })
        }
      } else {
        this.consecutiveShortGoals = 0
      }

      this.lastGoalTarget = { x: goal.target.x, y: goal.target.y }
      this.lastGoalType = goal.type
    }
  }

  onLevelChange(): void {
    // Reset consecutive tracking on level change - short goals at level start are normal
    this.consecutiveShortGoals = 0
    this.lastGoalTarget = null
    this.lastGoalType = null
  }

  onEnd(_game: GameState, _reason: EndReason): void {
    // Check EXPLORE goal distances
    const exploreStats = this.typeStats.get('EXPLORE')
    if (exploreStats && exploreStats.count > 0) {
      const avgDistance = exploreStats.totalDistance / exploreStats.count
      const shortPercentage = (exploreStats.shortCount / exploreStats.count) * 100

      if (avgDistance < this.config.minExploreDistanceThreshold) {
        this.issues.push({
          severity: 'error',
          message: `EXPLORE goals averaging ${avgDistance.toFixed(1)} tiles (threshold: ${this.config.minExploreDistanceThreshold})`,
          context: {
            avgDistance,
            count: exploreStats.count,
            shortCount: exploreStats.shortCount,
          },
        })
      }

      if (shortPercentage > this.config.shortGoalPercentageThreshold) {
        this.issues.push({
          severity: 'warning',
          message: `${shortPercentage.toFixed(0)}% of EXPLORE goals were short-distance (threshold: ${this.config.shortGoalPercentageThreshold}%)`,
          context: {
            shortPercentage,
            shortCount: exploreStats.shortCount,
            totalCount: exploreStats.count,
          },
        })
      }
    }
  }

  summarize(): AnalyzerResult {
    const totalGoals = this.records.length
    const allDistances = this.records.map((r) => r.distance)
    const avgDistance =
      totalGoals > 0
        ? allDistances.reduce((a, b) => a + b, 0) / totalGoals
        : 0

    // Distance distribution buckets
    const buckets = {
      adjacent: this.records.filter((r) => r.distance <= 1).length,
      short: this.records.filter((r) => r.distance > 1 && r.distance < 5).length,
      medium: this.records.filter((r) => r.distance >= 5 && r.distance < 10).length,
      far: this.records.filter((r) => r.distance >= 10).length,
    }

    // Per-type breakdown
    const details: string[] = [
      `Total goals tracked: ${totalGoals}`,
      `Overall avg distance: ${avgDistance.toFixed(1)} tiles`,
      `Max consecutive short: ${this.maxConsecutiveShort}`,
      '',
      'Distance distribution:',
      `  Adjacent (0-1): ${buckets.adjacent} (${totalGoals > 0 ? ((buckets.adjacent / totalGoals) * 100).toFixed(0) : 0}%)`,
      `  Short (2-4): ${buckets.short} (${totalGoals > 0 ? ((buckets.short / totalGoals) * 100).toFixed(0) : 0}%)`,
      `  Medium (5-9): ${buckets.medium} (${totalGoals > 0 ? ((buckets.medium / totalGoals) * 100).toFixed(0) : 0}%)`,
      `  Far (10+): ${buckets.far} (${totalGoals > 0 ? ((buckets.far / totalGoals) * 100).toFixed(0) : 0}%)`,
      '',
      'Per-type averages:',
    ]

    for (const [type, stats] of this.typeStats) {
      const avg = stats.count > 0 ? stats.totalDistance / stats.count : 0
      const shortPct = stats.count > 0 ? (stats.shortCount / stats.count) * 100 : 0
      details.push(
        `  ${type}: ${stats.count} goals, avg ${avg.toFixed(1)} tiles, ${shortPct.toFixed(0)}% short`
      )
    }

    // Build metrics object with type-specific averages
    const metrics: Record<string, number | string | boolean> = {
      totalGoals,
      avgDistance: Math.round(avgDistance * 10) / 10,
      maxConsecutiveShort: this.maxConsecutiveShort,
      adjacentGoals: buckets.adjacent,
      shortGoals: buckets.short,
      mediumGoals: buckets.medium,
      farGoals: buckets.far,
    }

    // Add per-type metrics
    for (const [type, stats] of this.typeStats) {
      const avg = stats.count > 0 ? stats.totalDistance / stats.count : 0
      metrics[`${type}_avgDistance`] = Math.round(avg * 10) / 10
      metrics[`${type}_count`] = stats.count
    }

    return {
      name: this.name,
      metrics,
      issues: this.issues,
      details,
    }
  }

  /** Get all goal distance records */
  getRecords(): GoalDistanceRecord[] {
    return this.records
  }

  /** Get stats for a specific goal type */
  getTypeStats(type: GoalType): TypeDistanceStats | null {
    return this.typeStats.get(type) ?? null
  }
}

/** Create a goal distance analyzer with default config */
export function createGoalDistanceAnalyzer(
  config?: Partial<GoalDistanceAnalyzerConfig>
): GoalDistanceAnalyzer {
  return new GoalDistanceAnalyzer(config)
}
