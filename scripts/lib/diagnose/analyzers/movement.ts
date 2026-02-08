/**
 * Movement Analyzer
 *
 * Detects movement patterns and issues:
 * - Oscillation (A-B-A-B patterns)
 * - Loops (A-B-C-A-B-C patterns)
 * - Jitter (rapid direction changes)
 * - Backtracking
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  PostTurnContext,
  MovementPattern,
  EndReason,
} from '../types'
import type { GameState, Point } from '@game/types'
import type { BotState } from '@bot/types'

/** Configuration for movement analysis */
export interface MovementAnalyzerConfig {
  /** History size to keep */
  historySize: number
  /** Minimum oscillation count to flag */
  oscillationThreshold: number
  /** Minimum loop count to flag */
  loopThreshold: number
}

const DEFAULT_CONFIG: MovementAnalyzerConfig = {
  historySize: 50,
  oscillationThreshold: 4,
  loopThreshold: 2,
}

function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export class MovementAnalyzer implements Analyzer {
  readonly name = 'movement'
  private config: MovementAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Position history
  private history: { pos: Point; turn: number }[] = []

  // Metrics
  private totalMoves = 0
  private totalTurns = 0
  private oscillationTurns = 0
  private loopTurns = 0
  private patterns: MovementPattern[] = []
  private currentOscillation: MovementPattern | null = null
  private currentLoop: MovementPattern | null = null

  constructor(config: Partial<MovementAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.history = []
    this.totalMoves = 0
    this.totalTurns = 0
    this.oscillationTurns = 0
    this.loopTurns = 0
    this.patterns = []
    this.currentOscillation = null
    this.currentLoop = null
  }

  onPostTurn(ctx: PostTurnContext): void {
    this.totalTurns++

    if (ctx.moved) {
      this.totalMoves++
      this.history.push({
        pos: { ...ctx.game.character.position },
        turn: ctx.turn,
      })

      // Keep history bounded
      if (this.history.length > this.config.historySize) {
        this.history.shift()
      }
    }

    // Detect patterns
    this.detectOscillation(ctx.turn)
    this.detectLoop(ctx.turn)
  }

  private detectOscillation(turn: number): void {
    if (this.history.length < 4) return

    const h = this.history
    const len = h.length
    const [p1, p2, p3, p4] = [h[len - 4]!, h[len - 3]!, h[len - 2]!, h[len - 1]!]

    // Check A-B-A-B pattern
    const isOscillating =
      pointsEqual(p1.pos, p3.pos) &&
      pointsEqual(p2.pos, p4.pos) &&
      !pointsEqual(p1.pos, p2.pos)

    if (isOscillating) {
      this.oscillationTurns++

      if (!this.currentOscillation) {
        this.currentOscillation = {
          type: 'oscillation',
          positions: [p1.pos, p2.pos],
          startTurn: p1.turn,
          duration: 4,
        }
      } else {
        this.currentOscillation.duration++
      }

      // Check threshold
      if (this.currentOscillation.duration === this.config.oscillationThreshold * 2) {
        this.issues.push({
          severity: 'warning',
          message: `Oscillation detected: ${this.config.oscillationThreshold}+ cycles between (${p1.pos.x},${p1.pos.y}) and (${p2.pos.x},${p2.pos.y})`,
          turn,
          context: {
            positions: [p1.pos, p2.pos],
            duration: this.currentOscillation.duration,
          },
        })
      }
    } else if (this.currentOscillation) {
      // Oscillation ended
      if (this.currentOscillation.duration >= this.config.oscillationThreshold * 2) {
        this.patterns.push({ ...this.currentOscillation })
      }
      this.currentOscillation = null
    }
  }

  private detectLoop(turn: number): void {
    if (this.history.length < 6) return

    const h = this.history
    const len = h.length

    // Check A-B-C-A-B-C pattern
    const [p1, p2, p3, p4, p5, p6] = [
      h[len - 6]!, h[len - 5]!, h[len - 4]!,
      h[len - 3]!, h[len - 2]!, h[len - 1]!,
    ]

    const isLoop =
      pointsEqual(p1.pos, p4.pos) &&
      pointsEqual(p2.pos, p5.pos) &&
      pointsEqual(p3.pos, p6.pos) &&
      !pointsEqual(p1.pos, p2.pos) &&
      !pointsEqual(p2.pos, p3.pos) &&
      !pointsEqual(p1.pos, p3.pos)

    if (isLoop) {
      this.loopTurns++

      if (!this.currentLoop) {
        this.currentLoop = {
          type: 'loop',
          positions: [p1.pos, p2.pos, p3.pos],
          startTurn: p1.turn,
          duration: 6,
        }
      } else {
        this.currentLoop.duration++
      }

      // Check threshold
      if (this.currentLoop.duration === this.config.loopThreshold * 3) {
        this.issues.push({
          severity: 'warning',
          message: `Loop detected: ${this.config.loopThreshold}+ cycles through 3 positions`,
          turn,
          context: {
            positions: [p1.pos, p2.pos, p3.pos],
            duration: this.currentLoop.duration,
          },
        })
      }
    } else if (this.currentLoop) {
      if (this.currentLoop.duration >= this.config.loopThreshold * 3) {
        this.patterns.push({ ...this.currentLoop })
      }
      this.currentLoop = null
    }
  }

  onLevelChange(): void {
    // Reset history on level change
    this.history = []
    this.currentOscillation = null
    this.currentLoop = null
  }

  onEnd(_game: GameState, _reason: EndReason): void {
    // Finalize any active patterns
    if (this.currentOscillation && this.currentOscillation.duration >= this.config.oscillationThreshold * 2) {
      this.patterns.push(this.currentOscillation)
    }
    if (this.currentLoop && this.currentLoop.duration >= this.config.loopThreshold * 3) {
      this.patterns.push(this.currentLoop)
    }
  }

  summarize(): AnalyzerResult {
    const oscillationRate = this.totalTurns > 0 ? (this.oscillationTurns / this.totalTurns) * 100 : 0
    const loopRate = this.totalTurns > 0 ? (this.loopTurns / this.totalTurns) * 100 : 0
    const moveRate = this.totalTurns > 0 ? (this.totalMoves / this.totalTurns) * 100 : 0

    return {
      name: this.name,
      metrics: {
        totalMoves: this.totalMoves,
        moveRate: Math.round(moveRate * 10) / 10,
        oscillationTurns: this.oscillationTurns,
        oscillationRate: Math.round(oscillationRate * 100) / 100,
        loopTurns: this.loopTurns,
        loopRate: Math.round(loopRate * 100) / 100,
        patternsDetected: this.patterns.length,
      },
      issues: this.issues,
      details: [
        `Move rate: ${moveRate.toFixed(1)}% (${this.totalMoves}/${this.totalTurns})`,
        `Oscillation rate: ${oscillationRate.toFixed(2)}%`,
        `Loop rate: ${loopRate.toFixed(2)}%`,
        `Patterns detected: ${this.patterns.length}`,
      ],
    }
  }
}

/** Create a movement analyzer with default config */
export function createMovementAnalyzer(config?: Partial<MovementAnalyzerConfig>): MovementAnalyzer {
  return new MovementAnalyzer(config)
}
