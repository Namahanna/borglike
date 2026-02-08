/**
 * Goals Analyzer
 *
 * Consolidated analyzer for goal behavior, merging:
 * - Goal lifecycle tracking (type distribution, persistence, completion)
 * - Goal distance analysis (short goals, thrashing detection)
 * - Goal efficiency metrics
 *
 * Maps to: bot/goals.ts
 *
 * Configurable checks allow enabling/disabling specific analysis aspects.
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  PostTurnContext,
  EndReason,
} from '../types'
import type { GameState, Point } from '@game/types'
import type { BotState, GoalType } from '@bot/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Which checks to enable */
export interface GoalsChecks {
  /** Track goal lifecycle (type distribution, persistence, completion) */
  lifecycle: boolean
  /** Track goal distances (short goals, thrashing) */
  distance: boolean
  /** Track no-goal periods */
  noGoal: boolean
}

/** Configuration for goals analysis */
export interface GoalsAnalyzerConfig {
  /** Which checks to enable */
  checks: GoalsChecks

  // Lifecycle thresholds
  /** Warn if goal switches more than N times per 100 turns */
  switchRateThreshold: number
  /** Warn if goal persists longer than N turns */
  stalePersistenceThreshold: number
  /** Warn if no goal for N consecutive turns */
  noGoalThreshold: number

  // Distance thresholds
  /** Warn if EXPLORE goals average < this distance */
  minExploreDistanceThreshold: number
  /** Warn if > this % of EXPLORE goals have distance < 3 */
  shortGoalPercentageThreshold: number
  /** Consider a goal "short" if distance < this */
  shortDistanceThreshold: number
}

const DEFAULT_CHECKS: GoalsChecks = {
  lifecycle: true,
  distance: true,
  noGoal: true,
}

const DEFAULT_CONFIG: GoalsAnalyzerConfig = {
  checks: DEFAULT_CHECKS,
  // Lifecycle
  switchRateThreshold: 50,
  stalePersistenceThreshold: 100,
  noGoalThreshold: 10,
  // Distance
  minExploreDistanceThreshold: 4,
  shortGoalPercentageThreshold: 50,
  shortDistanceThreshold: 3,
}

// ============================================================================
// TYPES
// ============================================================================

/** Tracked goal lifecycle */
interface GoalLifecycle {
  type: GoalType
  target: Point | null
  startTurn: number
  endTurn: number | null
  duration: number
  completed: boolean
  reason: string | null
  /** Distance to target when goal started */
  startDistance: number
}

/** Goal type statistics */
interface GoalTypeStats {
  count: number
  totalDuration: number
  completed: number
  abandoned: number
  totalDistance: number
  shortCount: number
}

// ============================================================================
// ANALYZER
// ============================================================================

export class GoalsAnalyzer implements Analyzer {
  readonly name = 'goals'
  private config: GoalsAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Current goal tracking
  private currentGoal: GoalLifecycle | null = null
  private lastGoalType: GoalType | null = null
  private lastGoalTarget: Point | null = null

  // Aggregate metrics
  private goals: GoalLifecycle[] = []
  private goalTypeStats: Map<GoalType, GoalTypeStats> = new Map()
  private totalTurns = 0
  private switchCount = 0
  private noGoalTurns = 0
  private consecutiveNoGoal = 0
  private maxNoGoalStreak = 0

  // Distance tracking
  private consecutiveShortGoals = 0
  private maxConsecutiveShort = 0

  constructor(config: Partial<GoalsAnalyzerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      checks: { ...DEFAULT_CHECKS, ...config.checks },
    }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.currentGoal = null
    this.lastGoalType = null
    this.lastGoalTarget = null
    this.goals = []
    this.goalTypeStats = new Map()
    this.totalTurns = 0
    this.switchCount = 0
    this.noGoalTurns = 0
    this.consecutiveNoGoal = 0
    this.maxNoGoalStreak = 0
    this.consecutiveShortGoals = 0
    this.maxConsecutiveShort = 0
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++
    const goal = ctx.botState.currentGoal

    if (!goal) {
      this.handleNoGoal(ctx)
      return
    }

    this.consecutiveNoGoal = 0

    // Check for goal change
    const targetChanged =
      !this.lastGoalTarget ||
      !goal.target ||
      this.lastGoalTarget.x !== goal.target.x ||
      this.lastGoalTarget.y !== goal.target.y

    const typeChanged = this.lastGoalType !== goal.type

    if (typeChanged || targetChanged) {
      this.handleGoalChange(ctx, goal, typeChanged)
    }

    // Update current goal duration and check for staleness
    if (this.currentGoal && this.config.checks.lifecycle) {
      this.currentGoal.duration++

      if (this.currentGoal.duration === this.config.stalePersistenceThreshold) {
        this.issues.push({
          severity: 'warning',
          message: `Goal ${this.currentGoal.type} persisted for ${this.config.stalePersistenceThreshold} turns`,
          turn: ctx.turn,
          context: { goalType: this.currentGoal.type, target: this.currentGoal.target },
        })
      }
    }
  }

  private handleNoGoal(ctx: TurnContext): void {
    if (!this.config.checks.noGoal) return

    this.noGoalTurns++
    this.consecutiveNoGoal++

    if (this.consecutiveNoGoal === this.config.noGoalThreshold) {
      this.issues.push({
        severity: 'warning',
        message: `No goal for ${this.config.noGoalThreshold} consecutive turns`,
        turn: ctx.turn,
      })
    }

    // Finalize current goal if we had one
    if (this.currentGoal) {
      this.finalizeGoal(ctx.turn, false, 'cleared')
    }

    this.maxNoGoalStreak = Math.max(this.maxNoGoalStreak, this.consecutiveNoGoal)
  }

  private handleGoalChange(
    ctx: TurnContext,
    goal: { type: GoalType; target: Point | null },
    typeChanged: boolean
  ): void {
    const pos = ctx.game.character.position

    // Calculate distance to new target
    let distance = 0
    if (goal.target) {
      distance = Math.max(
        Math.abs(goal.target.x - pos.x),
        Math.abs(goal.target.y - pos.y)
      )
    }

    // Finalize previous goal
    if (this.currentGoal) {
      const wasCompleted = this.checkGoalCompleted(ctx.game, this.currentGoal)
      this.finalizeGoal(ctx.turn, wasCompleted, typeChanged ? 'type changed' : 'target changed')
      this.switchCount++
    }

    // Start new goal
    this.currentGoal = {
      type: goal.type,
      target: goal.target ? { ...goal.target } : null,
      startTurn: ctx.turn,
      endTurn: null,
      duration: 0,
      completed: false,
      reason: null,
      startDistance: distance,
    }

    // Track short goals
    if (this.config.checks.distance && distance < this.config.shortDistanceThreshold) {
      this.consecutiveShortGoals++
      this.maxConsecutiveShort = Math.max(this.maxConsecutiveShort, this.consecutiveShortGoals)

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

    this.lastGoalType = goal.type
    this.lastGoalTarget = goal.target ? { ...goal.target } : null
  }

  onPostTurn(ctx: PostTurnContext): void {
    if (!this.currentGoal) return

    // Check if we reached the target
    const pos = ctx.game.character.position
    const target = this.currentGoal.target
    if (target && pos.x === target.x && pos.y === target.y) {
      this.currentGoal.completed = true
      this.finalizeGoal(ctx.turn, true, 'reached target')
      this.lastGoalTarget = null
    }
  }

  private checkGoalCompleted(game: GameState, goal: GoalLifecycle): boolean {
    if (!goal.target) return false
    const pos = game.character.position
    return pos.x === goal.target.x && pos.y === goal.target.y
  }

  private finalizeGoal(turn: number, completed: boolean, reason: string): void {
    if (!this.currentGoal) return

    this.currentGoal.endTurn = turn
    this.currentGoal.completed = completed
    this.currentGoal.reason = reason

    this.goals.push({ ...this.currentGoal })

    // Update type stats
    const stats = this.goalTypeStats.get(this.currentGoal.type) ?? {
      count: 0,
      totalDuration: 0,
      completed: 0,
      abandoned: 0,
      totalDistance: 0,
      shortCount: 0,
    }

    stats.count++
    stats.totalDuration += this.currentGoal.duration
    stats.totalDistance += this.currentGoal.startDistance

    if (this.currentGoal.startDistance < this.config.shortDistanceThreshold) {
      stats.shortCount++
    }

    if (completed) {
      stats.completed++
    } else {
      stats.abandoned++
    }

    this.goalTypeStats.set(this.currentGoal.type, stats)
    this.currentGoal = null
  }

  onLevelChange(game: GameState): void {
    // Goal likely invalid after level change
    if (this.currentGoal) {
      this.finalizeGoal(game.turn, false, 'level change')
    }
    this.lastGoalType = null
    this.lastGoalTarget = null
    // Reset consecutive short goals on level change (short goals at level start are normal)
    this.consecutiveShortGoals = 0
  }

  onEnd(game: GameState, _reason: EndReason): void {
    // Finalize any active goal
    if (this.currentGoal) {
      const wasCompleted = this.checkGoalCompleted(game, this.currentGoal)
      this.finalizeGoal(game.turn, wasCompleted, 'run end')
    }

    // Check switch rate
    if (this.config.checks.lifecycle) {
      const switchRate = this.totalTurns > 0 ? (this.switchCount / this.totalTurns) * 100 : 0
      if (switchRate > this.config.switchRateThreshold) {
        this.issues.push({
          severity: 'warning',
          message: `High goal switch rate: ${switchRate.toFixed(1)} per 100 turns`,
          context: { switchCount: this.switchCount, totalTurns: this.totalTurns },
        })
      }
    }

    // Check EXPLORE goal distances
    if (this.config.checks.distance) {
      const exploreStats = this.goalTypeStats.get('EXPLORE')
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
  }

  summarize(): AnalyzerResult {
    const totalGoals = this.goals.length
    const completedGoals = this.goals.filter((g) => g.completed).length
    const completionRate = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 100
    const switchRate = this.totalTurns > 0 ? (this.switchCount / this.totalTurns) * 100 : 0
    const noGoalRate = this.totalTurns > 0 ? (this.noGoalTurns / this.totalTurns) * 100 : 0

    // Calculate average duration
    const totalDuration = this.goals.reduce((sum, g) => sum + g.duration, 0)
    const avgDuration = totalGoals > 0 ? totalDuration / totalGoals : 0

    // Calculate average distance
    const totalDistance = this.goals.reduce((sum, g) => sum + g.startDistance, 0)
    const avgDistance = totalGoals > 0 ? totalDistance / totalGoals : 0

    // Distance distribution buckets
    const buckets = {
      adjacent: this.goals.filter((g) => g.startDistance <= 1).length,
      short: this.goals.filter((g) => g.startDistance > 1 && g.startDistance < 5).length,
      medium: this.goals.filter((g) => g.startDistance >= 5 && g.startDistance < 10).length,
      far: this.goals.filter((g) => g.startDistance >= 10).length,
    }

    // Build type distribution
    const typeDistribution: Record<string, number> = {}
    for (const [type, stats] of this.goalTypeStats) {
      typeDistribution[type] = stats.count
    }

    // Build details
    const details: string[] = [
      `Total goals: ${totalGoals}`,
      `Completion rate: ${completionRate.toFixed(1)}%`,
      `Avg goal duration: ${avgDuration.toFixed(1)} turns`,
      `Avg goal distance: ${avgDistance.toFixed(1)} tiles`,
      `Switch rate: ${switchRate.toFixed(1)} per 100 turns`,
      `No-goal rate: ${noGoalRate.toFixed(1)}%`,
      `Max no-goal streak: ${this.maxNoGoalStreak}`,
      `Max consecutive short: ${this.maxConsecutiveShort}`,
      '',
      'Distance distribution:',
      `  Adjacent (0-1): ${buckets.adjacent} (${totalGoals > 0 ? ((buckets.adjacent / totalGoals) * 100).toFixed(0) : 0}%)`,
      `  Short (2-4): ${buckets.short} (${totalGoals > 0 ? ((buckets.short / totalGoals) * 100).toFixed(0) : 0}%)`,
      `  Medium (5-9): ${buckets.medium} (${totalGoals > 0 ? ((buckets.medium / totalGoals) * 100).toFixed(0) : 0}%)`,
      `  Far (10+): ${buckets.far} (${totalGoals > 0 ? ((buckets.far / totalGoals) * 100).toFixed(0) : 0}%)`,
      '',
      'Goal type breakdown:',
    ]

    for (const [type, stats] of this.goalTypeStats) {
      const avgTypeDuration = stats.count > 0 ? stats.totalDuration / stats.count : 0
      const avgTypeDist = stats.count > 0 ? stats.totalDistance / stats.count : 0
      const typeCompletionRate = stats.count > 0 ? (stats.completed / stats.count) * 100 : 0
      const shortPct = stats.count > 0 ? (stats.shortCount / stats.count) * 100 : 0
      details.push(
        `  ${type}: ${stats.count} (${typeCompletionRate.toFixed(0)}% complete, avg ${avgTypeDuration.toFixed(1)} turns, avg ${avgTypeDist.toFixed(1)} tiles, ${shortPct.toFixed(0)}% short)`
      )
    }

    // Build metrics object
    const metrics: Record<string, number | string | boolean> = {
      totalGoals,
      completedGoals,
      completionRate: Math.round(completionRate * 10) / 10,
      avgDuration: Math.round(avgDuration * 10) / 10,
      avgDistance: Math.round(avgDistance * 10) / 10,
      switchCount: this.switchCount,
      switchRate: Math.round(switchRate * 10) / 10,
      noGoalTurns: this.noGoalTurns,
      noGoalRate: Math.round(noGoalRate * 10) / 10,
      maxNoGoalStreak: this.maxNoGoalStreak,
      maxConsecutiveShort: this.maxConsecutiveShort,
      adjacentGoals: buckets.adjacent,
      shortGoals: buckets.short,
      mediumGoals: buckets.medium,
      farGoals: buckets.far,
      ...typeDistribution,
    }

    // Add per-type metrics
    for (const [type, stats] of this.goalTypeStats) {
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

  /** Get goal lifecycle history */
  getGoalHistory(): GoalLifecycle[] {
    return this.goals
  }

  /** Get stats for a specific goal type */
  getTypeStats(type: GoalType): GoalTypeStats | null {
    return this.goalTypeStats.get(type) ?? null
  }
}

/** Create a goals analyzer with default config */
export function createGoalsAnalyzer(config?: Partial<GoalsAnalyzerConfig>): GoalsAnalyzer {
  return new GoalsAnalyzer(config)
}
