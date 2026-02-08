/**
 * Exploration Analyzer
 *
 * Tracks exploration progress and efficiency:
 * - Stairs discovery timing
 * - Exploration percentage per level
 * - Level completion metrics
 * - Descent patterns
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
import { getExplorationStats } from '@bot/exploration'

/** Configuration for exploration analysis */
export interface ExplorationAnalyzerConfig {
  /** Warn if stairs not found after this many turns on a level */
  stairsNotFoundThreshold: number
  /** Warn if exploration below this % when descending */
  minExplorationThreshold: number
  /** Warn if frontier doesn't grow for this many turns */
  frontierStagnationThreshold: number
  /** Warn if exploration % doesn't increase for this many turns */
  progressStagnationThreshold: number
}

const DEFAULT_CONFIG: ExplorationAnalyzerConfig = {
  stairsNotFoundThreshold: 200,
  minExplorationThreshold: 30,
  frontierStagnationThreshold: 50,
  progressStagnationThreshold: 30,
}

interface LevelStats {
  depth: number
  enterTurn: number
  exitTurn: number | null
  turnsOnLevel: number
  stairsFoundTurn: number | null
  explorationAtExit: number
  explorationAtStairsFound: number | null
  /** Whether bot was in farming mode when leaving this level */
  farmingModeAtExit: boolean
  /** Whether bot was in sweep mode when leaving this level */
  sweepModeAtExit: boolean
}

export class ExplorationAnalyzer implements Analyzer {
  readonly name = 'exploration'
  private config: ExplorationAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Current level tracking
  private currentLevel: LevelStats | null = null
  private stairsFoundThisLevel = false

  // Aggregate metrics
  private completedLevels: LevelStats[] = []
  private maxDepth = 0
  private totalLevels = 0
  private stairsFoundCount = 0
  private totalExplorationAtExit = 0

  // Frontier tracking
  private frontierHistory: { turn: number; size: number; progress: number }[] = []
  private lastFrontierGrowthTurn = 0
  private lastProgressTurn = 0
  private maxFrontier = 0
  private frontierStagnationWarned = false
  private progressStagnationWarned = false

  // Farming state tracking
  private inFarmingMode = false
  private inSweepMode = false
  private farmingFlipsExpected = 0

  constructor(config: Partial<ExplorationAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(game: GameState, botState: BotState): void {
    this.issues = []
    this.completedLevels = []
    this.maxDepth = game.character.depth
    this.totalLevels = 0
    this.stairsFoundCount = 0
    this.totalExplorationAtExit = 0
    this.stairsFoundThisLevel = false

    // Frontier tracking
    this.frontierHistory = []
    this.lastFrontierGrowthTurn = 0
    this.lastProgressTurn = 0
    this.maxFrontier = 0
    this.frontierStagnationWarned = false
    this.progressStagnationWarned = false

    // Farming state tracking
    this.inFarmingMode = botState.farmingMode
    this.inSweepMode = botState.sweepMode
    this.farmingFlipsExpected = 0

    // Initialize first level
    this.currentLevel = {
      depth: game.character.depth,
      enterTurn: 0,
      exitTurn: null,
      turnsOnLevel: 0,
      stairsFoundTurn: null,
      explorationAtExit: 0,
      explorationAtStairsFound: null,
      farmingModeAtExit: false,
      sweepModeAtExit: false,
    }
  }

  onTurn(ctx: TurnContext): void {
    if (!this.currentLevel) return

    this.currentLevel.turnsOnLevel++
    this.maxDepth = Math.max(this.maxDepth, ctx.game.character.depth)

    // Track farming/sweep mode state
    this.inFarmingMode = ctx.botState.farmingMode
    this.inSweepMode = ctx.botState.sweepMode

    // Check if stairs found
    const stats = getExplorationStats(ctx.game)
    if (stats.stairsFound && !this.stairsFoundThisLevel) {
      this.stairsFoundThisLevel = true
      this.stairsFoundCount++
      this.currentLevel.stairsFoundTurn = ctx.turn
      this.currentLevel.explorationAtStairsFound = stats.progress
    }

    // Track frontier history
    const prevFrontier = this.frontierHistory[this.frontierHistory.length - 1]
    this.frontierHistory.push({
      turn: ctx.turn,
      size: stats.frontierSize,
      progress: stats.progress,
    })

    // Update max frontier
    if (stats.frontierSize > this.maxFrontier) {
      this.maxFrontier = stats.frontierSize
      this.lastFrontierGrowthTurn = ctx.turn
    }

    // Check for frontier growth
    if (prevFrontier && stats.frontierSize > prevFrontier.size) {
      this.lastFrontierGrowthTurn = ctx.turn
    }

    // Check for progress (exploration % increase)
    if (prevFrontier && stats.progress > prevFrontier.progress) {
      this.lastProgressTurn = ctx.turn
    }

    // Warn on frontier stagnation
    if (
      !this.frontierStagnationWarned &&
      ctx.turn - this.lastFrontierGrowthTurn > this.config.frontierStagnationThreshold &&
      stats.progress < 50
    ) {
      this.frontierStagnationWarned = true
      this.issues.push({
        severity: 'warning',
        message: `Frontier not growing for ${this.config.frontierStagnationThreshold} turns (size: ${stats.frontierSize}, progress: ${stats.progress}%)`,
        turn: ctx.turn,
        context: {
          frontierSize: stats.frontierSize,
          progress: stats.progress,
          lastGrowthTurn: this.lastFrontierGrowthTurn,
        },
      })
    }

    // Warn on exploration progress stagnation
    if (
      !this.progressStagnationWarned &&
      ctx.turn - this.lastProgressTurn > this.config.progressStagnationThreshold &&
      stats.progress < 50
    ) {
      this.progressStagnationWarned = true
      this.issues.push({
        severity: 'warning',
        message: `Exploration stagnant at ${stats.progress}% for ${this.config.progressStagnationThreshold} turns`,
        turn: ctx.turn,
        context: {
          progress: stats.progress,
          lastProgressTurn: this.lastProgressTurn,
        },
      })
    }

    // Check for stairs not found warning
    if (
      !this.stairsFoundThisLevel &&
      this.currentLevel.turnsOnLevel === this.config.stairsNotFoundThreshold
    ) {
      this.issues.push({
        severity: 'warning',
        message: `Stairs not found after ${this.config.stairsNotFoundThreshold} turns on depth ${this.currentLevel.depth}`,
        turn: ctx.turn,
        context: { depth: this.currentLevel.depth, exploration: stats.progress },
      })
    }
  }

  onLevelChange(game: GameState, oldDepth: number, newDepth: number): void {
    // Finalize current level
    if (this.currentLevel) {
      // Note: getExplorationStats would return stats for new level, not old level
      // This is a limitation - we use what we tracked during onTurn
      this.currentLevel.exitTurn = game.turn
      this.currentLevel.explorationAtExit = this.currentLevel.explorationAtStairsFound ?? 0
      this.currentLevel.farmingModeAtExit = this.inFarmingMode
      this.currentLevel.sweepModeAtExit = this.inSweepMode

      // Check for low exploration warning
      // Downgrade to info message if in farming/sweep mode (expected behavior during flip farming)
      if (!this.stairsFoundThisLevel) {
        if (this.inFarmingMode || this.inSweepMode) {
          // Expected during farming - track but don't warn
          this.farmingFlipsExpected++
        } else {
          this.issues.push({
            severity: 'warning',
            message: `Left depth ${oldDepth} without finding stairs`,
            turn: game.turn,
          })
        }
      }

      this.completedLevels.push({ ...this.currentLevel })
      this.totalLevels++
      this.totalExplorationAtExit += this.currentLevel.explorationAtExit
    }

    // Start new level tracking
    this.stairsFoundThisLevel = false
    this.currentLevel = {
      depth: newDepth,
      enterTurn: game.turn,
      exitTurn: null,
      turnsOnLevel: 0,
      stairsFoundTurn: null,
      explorationAtExit: 0,
      explorationAtStairsFound: null,
      farmingModeAtExit: false,
      sweepModeAtExit: false,
    }

    // Reset stagnation tracking for new level
    this.lastFrontierGrowthTurn = game.turn
    this.lastProgressTurn = game.turn
    this.frontierStagnationWarned = false
    this.progressStagnationWarned = false
    this.maxFrontier = 0
  }

  onEnd(game: GameState, _reason: EndReason): void {
    // Finalize current level
    if (this.currentLevel) {
      const stats = getExplorationStats(game)
      this.currentLevel.exitTurn = game.turn
      this.currentLevel.explorationAtExit = stats.progress
      this.currentLevel.farmingModeAtExit = this.inFarmingMode
      this.currentLevel.sweepModeAtExit = this.inSweepMode

      this.completedLevels.push({ ...this.currentLevel })
      this.totalLevels++
      this.totalExplorationAtExit += this.currentLevel.explorationAtExit
    }
  }

  summarize(): AnalyzerResult {
    const stairsFoundRate =
      this.totalLevels > 0 ? (this.stairsFoundCount / this.totalLevels) * 100 : 100
    const avgExploration =
      this.totalLevels > 0 ? this.totalExplorationAtExit / this.totalLevels : 0

    // Calculate average turns to find stairs
    const levelsWithStairs = this.completedLevels.filter((l) => l.stairsFoundTurn !== null)
    const avgTurnsToStairs =
      levelsWithStairs.length > 0
        ? levelsWithStairs.reduce(
            (sum, l) => sum + (l.stairsFoundTurn! - l.enterTurn),
            0
          ) / levelsWithStairs.length
        : 0

    // Calculate exploration efficiency (% per turn)
    const totalTurns = this.frontierHistory.length
    const finalProgress = this.frontierHistory[this.frontierHistory.length - 1]?.progress ?? 0
    const explorationPerTurn = totalTurns > 0 ? finalProgress / totalTurns : 0

    // Count farming-related level exits
    const farmingModeExits = this.completedLevels.filter((l) => l.farmingModeAtExit).length
    const sweepModeExits = this.completedLevels.filter((l) => l.sweepModeAtExit).length

    const details = [
      `Max depth reached: ${this.maxDepth}`,
      `Stairs found: ${stairsFoundRate.toFixed(1)}% (${this.stairsFoundCount}/${this.totalLevels})`,
      `Avg exploration at exit: ${avgExploration.toFixed(1)}%`,
      `Avg turns to find stairs: ${avgTurnsToStairs.toFixed(0)}`,
      `Max frontier size: ${this.maxFrontier}`,
      `Exploration rate: ${explorationPerTurn.toFixed(2)}% per turn`,
    ]

    // Add farming context if relevant
    if (this.farmingFlipsExpected > 0 || farmingModeExits > 0 || sweepModeExits > 0) {
      details.push('')
      details.push('Farming patterns:')
      details.push(`  Expected farming flips: ${this.farmingFlipsExpected}`)
      details.push(`  Farming mode exits: ${farmingModeExits}`)
      details.push(`  Sweep mode exits: ${sweepModeExits}`)
    }

    return {
      name: this.name,
      metrics: {
        maxDepth: this.maxDepth,
        totalLevels: this.totalLevels,
        stairsFoundCount: this.stairsFoundCount,
        stairsFoundRate: Math.round(stairsFoundRate * 10) / 10,
        avgExplorationAtExit: Math.round(avgExploration * 10) / 10,
        avgTurnsToStairs: Math.round(avgTurnsToStairs),
        maxFrontier: this.maxFrontier,
        explorationPerTurn: Math.round(explorationPerTurn * 100) / 100,
        farmingFlipsExpected: this.farmingFlipsExpected,
        farmingModeExits,
        sweepModeExits,
      },
      issues: this.issues,
      details,
    }
  }

  /** Get frontier history for analysis */
  getFrontierHistory(): { turn: number; size: number; progress: number }[] {
    return this.frontierHistory
  }
}

/** Create an exploration analyzer with default config */
export function createExplorationAnalyzer(
  config?: Partial<ExplorationAnalyzerConfig>
): ExplorationAnalyzer {
  return new ExplorationAnalyzer(config)
}
