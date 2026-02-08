/**
 * Stuck Analyzer
 *
 * Detects when the bot gets stuck:
 * - Repeated identical actions
 * - Long waits with no goal
 * - High twitch counter
 * - No progress over many turns
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

/** Configuration for stuck detection thresholds */
export interface StuckAnalyzerConfig {
  /** Actions repeated this many times triggers warning */
  repeatThreshold: number
  /** Wait actions without goal triggers warning */
  waitThreshold: number
  /** High twitch counter threshold */
  twitchThreshold: number
  /** Turns without position change to flag as stuck */
  noMoveThreshold: number
}

const DEFAULT_CONFIG: StuckAnalyzerConfig = {
  repeatThreshold: 20,   // Increased from 10 - normal corridor traversal can be 15+ same-direction moves
  waitThreshold: 5,
  twitchThreshold: 15,
  noMoveThreshold: 20,
}

export class StuckAnalyzer implements Analyzer {
  readonly name = 'stuck'
  private config: StuckAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Tracking state
  private lastActionStr = ''
  private sameActionCount = 0
  private maxSameAction = 0
  private totalWaits = 0
  private consecutiveWaits = 0
  private maxConsecutiveWaits = 0
  private totalTurns = 0
  private noMoveStreak = 0
  private maxNoMoveStreak = 0
  private maxTwitch = 0
  private stuckEpisodes = 0

  constructor(config: Partial<StuckAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    // Reset state
    this.issues = []
    this.lastActionStr = ''
    this.sameActionCount = 0
    this.maxSameAction = 0
    this.totalWaits = 0
    this.consecutiveWaits = 0
    this.maxConsecutiveWaits = 0
    this.totalTurns = 0
    this.noMoveStreak = 0
    this.maxNoMoveStreak = 0
    this.maxTwitch = 0
    this.stuckEpisodes = 0
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++
    const actionStr = JSON.stringify(ctx.action)

    // Track repeated actions
    if (actionStr === this.lastActionStr) {
      this.sameActionCount++
      if (this.sameActionCount === this.config.repeatThreshold) {
        this.stuckEpisodes++
        this.issues.push({
          severity: 'warning',
          message: `Repeated same action ${this.sameActionCount}x`,
          turn: ctx.turn,
          context: { action: ctx.action },
        })
      }
    } else {
      this.maxSameAction = Math.max(this.maxSameAction, this.sameActionCount)
      this.sameActionCount = 1
      this.lastActionStr = actionStr
    }

    // Track waits
    if (ctx.action.type === 'wait') {
      this.totalWaits++
      this.consecutiveWaits++

      if (this.consecutiveWaits === this.config.waitThreshold) {
        const hasGoal = ctx.botState.currentGoal !== null
        if (!hasGoal) {
          this.issues.push({
            severity: 'warning',
            message: `Waited ${this.consecutiveWaits}x with no goal`,
            turn: ctx.turn,
          })
        }
      }
    } else {
      this.maxConsecutiveWaits = Math.max(this.maxConsecutiveWaits, this.consecutiveWaits)
      this.consecutiveWaits = 0
    }

    // Track twitch counter
    this.maxTwitch = Math.max(this.maxTwitch, ctx.botState.twitchCounter)
    if (ctx.botState.twitchCounter >= this.config.twitchThreshold) {
      this.issues.push({
        severity: 'warning',
        message: `High twitch counter: ${ctx.botState.twitchCounter}`,
        turn: ctx.turn,
      })
    }
  }

  onPostTurn(ctx: PostTurnContext): void {
    // Track no-movement streaks (exclude wait and attack - those are intentional)
    if (!ctx.moved && ctx.action.type !== 'wait' && ctx.action.type !== 'attack') {
      this.noMoveStreak++
      if (this.noMoveStreak === this.config.noMoveThreshold) {
        this.stuckEpisodes++
        this.issues.push({
          severity: 'error',
          message: `No movement for ${this.noMoveStreak} turns despite non-wait actions`,
          turn: ctx.turn,
          context: { position: ctx.game.character.position },
        })
      }
    } else if (ctx.moved) {
      this.maxNoMoveStreak = Math.max(this.maxNoMoveStreak, this.noMoveStreak)
      this.noMoveStreak = 0
    }
  }

  onLevelChange(): void {
    // Reset per-level tracking
    this.noMoveStreak = 0
  }

  onEnd(_game: GameState, reason: EndReason): void {
    // Final updates
    this.maxSameAction = Math.max(this.maxSameAction, this.sameActionCount)
    this.maxConsecutiveWaits = Math.max(this.maxConsecutiveWaits, this.consecutiveWaits)
    this.maxNoMoveStreak = Math.max(this.maxNoMoveStreak, this.noMoveStreak)

    // Check if circuit breaker triggered
    if (reason === 'circuit_breaker') {
      this.issues.push({
        severity: 'error',
        message: 'Circuit breaker triggered - stuck on level too long',
      })
    }
  }

  summarize(): AnalyzerResult {
    const waitRate = this.totalTurns > 0 ? (this.totalWaits / this.totalTurns) * 100 : 0

    return {
      name: this.name,
      metrics: {
        totalWaits: this.totalWaits,
        waitRate: Math.round(waitRate * 10) / 10,
        maxConsecutiveWaits: this.maxConsecutiveWaits,
        maxRepeatedAction: this.maxSameAction,
        maxNoMoveStreak: this.maxNoMoveStreak,
        maxTwitch: this.maxTwitch,
        stuckEpisodes: this.stuckEpisodes,
      },
      issues: this.issues,
      details: [
        `Wait rate: ${waitRate.toFixed(1)}% (${this.totalWaits}/${this.totalTurns})`,
        `Max repeated action: ${this.maxSameAction}`,
        `Max no-move streak: ${this.maxNoMoveStreak}`,
        `Max twitch counter: ${this.maxTwitch}`,
        `Stuck episodes detected: ${this.stuckEpisodes}`,
      ],
    }
  }
}

/** Create a stuck analyzer with default config */
export function createStuckAnalyzer(config?: Partial<StuckAnalyzerConfig>): StuckAnalyzer {
  return new StuckAnalyzer(config)
}
