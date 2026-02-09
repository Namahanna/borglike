/**
 * Jitter Analyzer
 *
 * Detects "jitter" - when the bot is moving but confined to a small area.
 * Uses bounding box analysis on a rolling window of positions.
 *
 * Jitter is different from oscillation:
 * - Oscillation: A-B-A-B pattern (predictable back-and-forth)
 * - Jitter: Moving around randomly in a small area (no clear pattern)
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  PostTurnContext,
  EndReason,
} from '../types'
import type { GameState, Point } from '@game/types'
import type { BotState } from '@bot/types'

/** Configuration for jitter analysis */
export interface JitterAnalyzerConfig {
  /** Rolling window size for bounding box calculation */
  windowSize: number
  /** Bounding box area threshold (below = jitter) */
  areaThreshold: number
  /** Minimum moves in window before checking (avoid false positives) */
  minMovesInWindow: number
  /** Consecutive jitter turns before warning */
  jitterWarningThreshold: number
}

const DEFAULT_CONFIG: JitterAnalyzerConfig = {
  windowSize: 20,
  areaThreshold: 25,
  minMovesInWindow: 15,
  jitterWarningThreshold: 30,
}

/** A detected jitter episode */
interface JitterEpisode {
  startTurn: number
  endTurn: number
  duration: number
  avgBoundingArea: number
  center: Point
}

export class JitterAnalyzer implements Analyzer {
  readonly name = 'jitter'
  private config: JitterAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Position history
  private history: { pos: Point; turn: number }[] = []

  // Jitter tracking
  private inJitter = false
  private jitterStartTurn = 0
  private jitterAreas: number[] = []
  private currentJitterCenter: Point = { x: 0, y: 0 }

  // Aggregate metrics
  private episodes: JitterEpisode[] = []
  private totalTurns = 0
  private jitterTurns = 0
  private maxJitterDuration = 0

  constructor(config: Partial<JitterAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.history = []
    this.inJitter = false
    this.jitterStartTurn = 0
    this.jitterAreas = []
    this.currentJitterCenter = { x: 0, y: 0 }
    this.episodes = []
    this.totalTurns = 0
    this.jitterTurns = 0
    this.maxJitterDuration = 0
  }

  onPostTurn(ctx: PostTurnContext): void {
    this.totalTurns++

    if (ctx.moved) {
      this.history.push({
        pos: { ...ctx.game.character.position },
        turn: ctx.turn,
      })

      // Keep history bounded
      if (this.history.length > this.config.windowSize) {
        this.history.shift()
      }
    }

    // Check for jitter
    if (this.history.length >= this.config.minMovesInWindow) {
      const bbox = this.calculateBoundingBox()
      const area = bbox.area

      if (area < this.config.areaThreshold) {
        this.jitterTurns++

        if (!this.inJitter) {
          // Start jitter episode
          this.inJitter = true
          this.jitterStartTurn = ctx.turn
          this.jitterAreas = [area]
          this.currentJitterCenter = bbox.center
        } else {
          this.jitterAreas.push(area)
        }

        // Check for warning threshold
        const duration = ctx.turn - this.jitterStartTurn + 1
        if (duration === this.config.jitterWarningThreshold) {
          this.issues.push({
            severity: 'warning',
            message: `Jitter detected: confined to ${area} tile area for ${duration} turns`,
            turn: ctx.turn,
            context: {
              boundingArea: area,
              center: bbox.center,
              duration,
            },
          })
        }
      } else if (this.inJitter) {
        // End jitter episode
        this.finalizeJitterEpisode(ctx.turn)
      }
    }
  }

  private calculateBoundingBox(): { area: number; center: Point; width: number; height: number } {
    if (this.history.length === 0) {
      return { area: 0, center: { x: 0, y: 0 }, width: 0, height: 0 }
    }

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const h of this.history) {
      minX = Math.min(minX, h.pos.x)
      maxX = Math.max(maxX, h.pos.x)
      minY = Math.min(minY, h.pos.y)
      maxY = Math.max(maxY, h.pos.y)
    }

    const width = maxX - minX + 1
    const height = maxY - minY + 1
    const area = width * height
    const center = {
      x: Math.round((minX + maxX) / 2),
      y: Math.round((minY + maxY) / 2),
    }

    return { area, center, width, height }
  }

  private finalizeJitterEpisode(endTurn: number): void {
    const duration = endTurn - this.jitterStartTurn
    const avgArea =
      this.jitterAreas.length > 0
        ? this.jitterAreas.reduce((a, b) => a + b, 0) / this.jitterAreas.length
        : 0

    this.episodes.push({
      startTurn: this.jitterStartTurn,
      endTurn,
      duration,
      avgBoundingArea: avgArea,
      center: { ...this.currentJitterCenter },
    })

    this.maxJitterDuration = Math.max(this.maxJitterDuration, duration)

    this.inJitter = false
    this.jitterAreas = []
  }

  onLevelChange(): void {
    // Reset history on level change
    if (this.inJitter) {
      this.finalizeJitterEpisode(this.jitterStartTurn + this.jitterAreas.length)
    }
    this.history = []
    this.inJitter = false
  }

  onEnd(_game: GameState, _reason: EndReason): void {
    // Finalize any active jitter episode
    if (this.inJitter) {
      this.finalizeJitterEpisode(this.jitterStartTurn + this.jitterAreas.length)
    }
  }

  summarize(): AnalyzerResult {
    const jitterRate = this.totalTurns > 0 ? (this.jitterTurns / this.totalTurns) * 100 : 0
    const avgEpisodeDuration =
      this.episodes.length > 0
        ? this.episodes.reduce((sum, e) => sum + e.duration, 0) / this.episodes.length
        : 0

    return {
      name: this.name,
      metrics: {
        jitterTurns: this.jitterTurns,
        jitterRate: Math.round(jitterRate * 10) / 10,
        jitterEpisodes: this.episodes.length,
        maxJitterDuration: this.maxJitterDuration,
        avgEpisodeDuration: Math.round(avgEpisodeDuration * 10) / 10,
      },
      issues: this.issues,
      details: [
        `Jitter rate: ${jitterRate.toFixed(1)}% (${this.jitterTurns}/${this.totalTurns} turns)`,
        `Episodes: ${this.episodes.length}`,
        `Max duration: ${this.maxJitterDuration} turns`,
        `Avg duration: ${avgEpisodeDuration.toFixed(1)} turns`,
        '',
        'Episodes:',
        ...this.episodes.slice(0, 5).map(
          (e) =>
            `  Turn ${e.startTurn}-${e.endTurn}: ${e.duration} turns, ` +
            `area=${e.avgBoundingArea.toFixed(1)}, center=(${e.center.x},${e.center.y})`
        ),
        ...(this.episodes.length > 5 ? [`  ... (${this.episodes.length - 5} more)`] : []),
      ],
    }
  }

  /** Get all jitter episodes */
  getEpisodes(): JitterEpisode[] {
    return this.episodes
  }
}

/** Create a jitter analyzer with default config */
export function createJitterAnalyzer(config?: Partial<JitterAnalyzerConfig>): JitterAnalyzer {
  return new JitterAnalyzer(config)
}
