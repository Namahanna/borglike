/**
 * Goal Analyzer
 *
 * Tracks goal lifecycle and behavior:
 * - Goal type distribution
 * - Goal persistence (how long goals last)
 * - Goal switching frequency
 * - Goal completion vs abandonment
 * - Goal age when switched
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  EndReason,
} from '../types'
import type { GameState, Point } from '@game/types'
import type { BotState, GoalType } from '@bot/types'

/** Configuration for goal analysis */
export interface GoalAnalyzerConfig {
  /** Warn if goal switches more than N times per 100 turns */
  switchRateThreshold: number
  /** Warn if goal persists longer than N turns */
  stalePersistenceThreshold: number
  /** Warn if no goal for N consecutive turns */
  noGoalThreshold: number
}

const DEFAULT_CONFIG: GoalAnalyzerConfig = {
  switchRateThreshold: 50,
  stalePersistenceThreshold: 100,
  noGoalThreshold: 10,
}

/** Tracked goal lifecycle */
interface GoalLifecycle {
  type: GoalType
  target: Point | null
  startTurn: number
  endTurn: number | null
  duration: number
  completed: boolean
  reason: string | null
}

/** Goal type statistics */
interface GoalTypeStats {
  count: number
  totalDuration: number
  completed: number
  abandoned: number
}

export class GoalAnalyzer implements Analyzer {
  readonly name = 'goal'
  private config: GoalAnalyzerConfig
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

  constructor(config: Partial<GoalAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
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
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++
    const goal = ctx.botState.currentGoal

    if (!goal) {
      // No goal
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
      // Goal switched
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
      }

      this.lastGoalType = goal.type
      this.lastGoalTarget = goal.target ? { ...goal.target } : null
    }

    // Update current goal duration
    if (this.currentGoal) {
      this.currentGoal.duration++

      // Check for stale goal
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
    }

    stats.count++
    stats.totalDuration += this.currentGoal.duration
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
  }

  onEnd(game: GameState, _reason: EndReason): void {
    // Finalize any active goal
    if (this.currentGoal) {
      const wasCompleted = this.checkGoalCompleted(game, this.currentGoal)
      this.finalizeGoal(game.turn, wasCompleted, 'run end')
    }

    // Check switch rate
    const switchRate = this.totalTurns > 0 ? (this.switchCount / this.totalTurns) * 100 : 0
    if (switchRate > this.config.switchRateThreshold) {
      this.issues.push({
        severity: 'warning',
        message: `High goal switch rate: ${switchRate.toFixed(1)} per 100 turns`,
        context: { switchCount: this.switchCount, totalTurns: this.totalTurns },
      })
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
      `Switch rate: ${switchRate.toFixed(1)} per 100 turns`,
      `No-goal rate: ${noGoalRate.toFixed(1)}%`,
      `Max no-goal streak: ${this.maxNoGoalStreak}`,
      '',
      'Goal type distribution:',
    ]

    for (const [type, stats] of this.goalTypeStats) {
      const avgTypeDuration = stats.count > 0 ? stats.totalDuration / stats.count : 0
      const typeCompletionRate = stats.count > 0 ? (stats.completed / stats.count) * 100 : 0
      details.push(
        `  ${type}: ${stats.count} (${typeCompletionRate.toFixed(0)}% completed, avg ${avgTypeDuration.toFixed(1)} turns)`
      )
    }

    return {
      name: this.name,
      metrics: {
        totalGoals,
        completedGoals,
        completionRate: Math.round(completionRate * 10) / 10,
        avgDuration: Math.round(avgDuration * 10) / 10,
        switchCount: this.switchCount,
        switchRate: Math.round(switchRate * 10) / 10,
        noGoalTurns: this.noGoalTurns,
        noGoalRate: Math.round(noGoalRate * 10) / 10,
        maxNoGoalStreak: this.maxNoGoalStreak,
        ...typeDistribution,
      },
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

/** Create a goal analyzer with default config */
export function createGoalAnalyzer(config?: Partial<GoalAnalyzerConfig>): GoalAnalyzer {
  return new GoalAnalyzer(config)
}
