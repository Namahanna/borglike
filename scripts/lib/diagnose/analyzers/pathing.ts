/**
 * Pathing Analyzer
 *
 * Analyzes pathfinding efficiency:
 * - Steps taken vs optimal path distance
 * - Unreachable target detection
 * - Goal completion rates
 * - Path deviation tracking
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
import type { BotState } from '@bot/types'
import { computeFlow, getFlowCost, MAX_FLOW_COST } from '@bot/flow'

/** Configuration for pathing analysis */
export interface PathingAnalyzerConfig {
  /** Efficiency below this % triggers warning */
  efficiencyWarningThreshold: number
  /** Report unreachable targets immediately */
  reportUnreachable: boolean
}

const DEFAULT_CONFIG: PathingAnalyzerConfig = {
  efficiencyWarningThreshold: 50,
  reportUnreachable: true,
}

interface GoalTracking {
  type: string
  target: Point
  startTurn: number
  startDistance: number
  steps: number
  completed: boolean
  unreachable: boolean
}

export class PathingAnalyzer implements Analyzer {
  readonly name = 'pathing'
  private config: PathingAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Current goal tracking
  private currentGoal: GoalTracking | null = null
  private lastGoalTarget: Point | null = null

  // Aggregate metrics
  private completedGoals: GoalTracking[] = []
  private abandonedGoals: GoalTracking[] = []
  private unreachableTargets = 0
  private totalSteps = 0
  private totalOptimalDistance = 0

  constructor(config: Partial<PathingAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.currentGoal = null
    this.lastGoalTarget = null
    this.completedGoals = []
    this.abandonedGoals = []
    this.unreachableTargets = 0
    this.totalSteps = 0
    this.totalOptimalDistance = 0
  }

  onTurn(ctx: TurnContext): void {
    const goal = ctx.botState.currentGoal
    const target = goal?.target

    // Check for goal change
    if (target) {
      const targetChanged =
        !this.lastGoalTarget ||
        this.lastGoalTarget.x !== target.x ||
        this.lastGoalTarget.y !== target.y

      if (targetChanged) {
        // Finalize previous goal
        if (this.currentGoal) {
          this.finalizeGoal(false)
        }

        // Start tracking new goal
        const pos = ctx.game.character.position
        const flow = computeFlow(ctx.game.currentLevel, target)
        const distance = getFlowCost(flow, pos)

        const isUnreachable = distance >= MAX_FLOW_COST

        this.currentGoal = {
          type: goal.type,
          target: { ...target },
          startTurn: ctx.turn,
          startDistance: isUnreachable ? -1 : distance,
          steps: 0,
          completed: false,
          unreachable: isUnreachable,
        }

        if (isUnreachable && this.config.reportUnreachable) {
          this.unreachableTargets++
          this.issues.push({
            severity: 'warning',
            message: `Unreachable target: ${goal.type} at (${target.x},${target.y})`,
            turn: ctx.turn,
            context: { goalType: goal.type, target },
          })
        }

        this.lastGoalTarget = { ...target }
      }
    } else if (this.currentGoal) {
      // Goal cleared
      this.finalizeGoal(false)
      this.lastGoalTarget = null
    }
  }

  onPostTurn(ctx: PostTurnContext): void {
    if (!this.currentGoal) return

    // Count steps toward goal
    if (ctx.moved) {
      this.currentGoal.steps++
    }

    // Check if we reached the target
    const pos = ctx.game.character.position
    const target = this.currentGoal.target
    if (pos.x === target.x && pos.y === target.y) {
      this.currentGoal.completed = true
      this.finalizeGoal(true)
      this.lastGoalTarget = null
    }
  }

  private finalizeGoal(completed: boolean): void {
    if (!this.currentGoal) return

    this.currentGoal.completed = completed

    if (completed && !this.currentGoal.unreachable && this.currentGoal.startDistance > 0) {
      this.completedGoals.push({ ...this.currentGoal })
      this.totalSteps += this.currentGoal.steps
      this.totalOptimalDistance += this.currentGoal.startDistance

      // Check efficiency
      const efficiency = (this.currentGoal.startDistance / this.currentGoal.steps) * 100
      if (efficiency < this.config.efficiencyWarningThreshold && this.currentGoal.steps > 5) {
        this.issues.push({
          severity: 'warning',
          message: `Low path efficiency: ${efficiency.toFixed(0)}% for ${this.currentGoal.type}`,
          turn: this.currentGoal.startTurn,
          context: {
            optimal: this.currentGoal.startDistance,
            actual: this.currentGoal.steps,
          },
        })
      }
    } else if (!completed && this.currentGoal.steps > 0) {
      this.abandonedGoals.push({ ...this.currentGoal })
    }

    this.currentGoal = null
  }

  onLevelChange(): void {
    // Goal likely invalid after level change
    if (this.currentGoal) {
      this.finalizeGoal(false)
      this.lastGoalTarget = null
    }
  }

  onEnd(_game: GameState, _reason: EndReason): void {
    // Finalize any active goal
    if (this.currentGoal) {
      this.finalizeGoal(false)
    }
  }

  summarize(): AnalyzerResult {
    const totalGoals = this.completedGoals.length + this.abandonedGoals.length
    const completionRate = totalGoals > 0 ? (this.completedGoals.length / totalGoals) * 100 : 100
    // Calculate per-goal efficiencies
    const efficiencies = this.completedGoals
      .filter((g) => g.steps > 0)
      .map((g) => (g.startDistance / g.steps) * 100)
    const avgGoalEfficiency =
      efficiencies.length > 0 ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length : 100

    return {
      name: this.name,
      metrics: {
        completedGoals: this.completedGoals.length,
        abandonedGoals: this.abandonedGoals.length,
        completionRate: Math.round(completionRate * 10) / 10,
        avgPathEfficiency: Math.round(avgGoalEfficiency * 10) / 10,
        unreachableTargets: this.unreachableTargets,
        totalSteps: this.totalSteps,
        totalOptimalDistance: this.totalOptimalDistance,
      },
      issues: this.issues,
      details: [
        `Goal completion rate: ${completionRate.toFixed(1)}% (${this.completedGoals.length}/${totalGoals})`,
        `Average path efficiency: ${avgGoalEfficiency.toFixed(1)}%`,
        `Unreachable targets: ${this.unreachableTargets}`,
        `Total steps: ${this.totalSteps} (optimal: ${this.totalOptimalDistance})`,
      ],
    }
  }
}

/** Create a pathing analyzer with default config */
export function createPathingAnalyzer(config?: Partial<PathingAnalyzerConfig>): PathingAnalyzer {
  return new PathingAnalyzer(config)
}
