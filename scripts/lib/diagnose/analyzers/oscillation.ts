/**
 * Directional Oscillation Analyzer
 *
 * Detects directional oscillation patterns:
 * - Direction reversals (going N then S then N)
 * - Position revisits within short intervals
 * - "Ping-pong" patterns between two areas
 *
 * Key insight from debugging: The bot was switching between targets
 * in opposite directions (north then south then north), wasting turns
 * without making exploration progress.
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

/** Configuration for oscillation analysis */
export interface OscillationAnalyzerConfig {
  /** Warn if > N reversals per 100 turns */
  reversalRateThreshold: number
  /** Warn if position revisited within N turns */
  revisitWindowThreshold: number
  /** Minimum positions to track for revisit detection */
  positionHistoryLength: number
  /** Minimum oscillation pattern length to detect */
  minPatternLength: number
}

const DEFAULT_CONFIG: OscillationAnalyzerConfig = {
  reversalRateThreshold: 30,
  revisitWindowThreshold: 10,
  positionHistoryLength: 50,
  minPatternLength: 4,
}

/** Movement record */
interface MovementRecord {
  turn: number
  from: Point
  to: Point
  direction: { x: number; y: number }
  isReversal: boolean
}

/** Detected oscillation pattern */
interface OscillationPattern {
  startTurn: number
  endTurn: number
  positions: Point[]
  type: 'reversal' | 'loop' | 'pingpong'
}

export class OscillationAnalyzer implements Analyzer {
  readonly name = 'oscillation'
  private config: OscillationAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Movement tracking
  private movements: MovementRecord[] = []
  private lastDirection: { x: number; y: number } | null = null

  // Position history for revisit detection
  private positionHistory: { turn: number; pos: Point }[] = []

  // Aggregate metrics
  private totalMoves = 0
  private reversalCount = 0
  private revisitCount = 0
  private patterns: OscillationPattern[] = []

  // Consecutive reversal tracking
  private consecutiveReversals = 0
  private maxConsecutiveReversals = 0

  constructor(config: Partial<OscillationAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.movements = []
    this.lastDirection = null
    this.positionHistory = []
    this.totalMoves = 0
    this.reversalCount = 0
    this.revisitCount = 0
    this.patterns = []
    this.consecutiveReversals = 0
    this.maxConsecutiveReversals = 0
  }

  onPostTurn(ctx: PostTurnContext): void {
    if (!ctx.moved) return

    this.totalMoves++
    const from = ctx.previousPosition
    const to = ctx.game.character.position

    // Calculate direction vector
    const direction = {
      x: Math.sign(to.x - from.x),
      y: Math.sign(to.y - from.y),
    }

    // Check for reversal (180-degree turn)
    let isReversal = false
    if (this.lastDirection) {
      const dotProduct =
        direction.x * this.lastDirection.x + direction.y * this.lastDirection.y
      // Dot product < 0 means angle > 90 degrees (opposite direction)
      isReversal = dotProduct < 0
    }

    if (isReversal) {
      this.reversalCount++
      this.consecutiveReversals++
      this.maxConsecutiveReversals = Math.max(
        this.maxConsecutiveReversals,
        this.consecutiveReversals
      )

      // Warn on sustained oscillation
      if (this.consecutiveReversals === 5) {
        this.issues.push({
          severity: 'warning',
          message: `5 consecutive direction reversals starting at turn ${ctx.turn - 4}`,
          turn: ctx.turn,
          context: { from, to },
        })
      }
    } else {
      this.consecutiveReversals = 0
    }

    // Record movement
    this.movements.push({
      turn: ctx.turn,
      from: { ...from },
      to: { ...to },
      direction,
      isReversal,
    })

    this.lastDirection = direction

    // Check for position revisit
    const recentVisit = this.positionHistory.find(
      (h) =>
        h.pos.x === to.x &&
        h.pos.y === to.y &&
        ctx.turn - h.turn <= this.config.revisitWindowThreshold
    )

    if (recentVisit) {
      this.revisitCount++
      const interval = ctx.turn - recentVisit.turn

      // Record pattern if it's a quick revisit
      if (interval <= 5) {
        // Extract the positions in between
        const patternPositions = this.positionHistory
          .filter((h) => h.turn >= recentVisit.turn && h.turn <= ctx.turn)
          .map((h) => h.pos)

        if (patternPositions.length >= this.config.minPatternLength) {
          this.patterns.push({
            startTurn: recentVisit.turn,
            endTurn: ctx.turn,
            positions: patternPositions,
            type: 'pingpong',
          })
        }
      }
    }

    // Update position history
    this.positionHistory.push({ turn: ctx.turn, pos: { ...to } })
    if (this.positionHistory.length > this.config.positionHistoryLength) {
      this.positionHistory.shift()
    }
  }

  onLevelChange(): void {
    // Reset tracking state on level change - patterns don't span levels
    this.movements = []
    this.lastDirection = null
    this.positionHistory = []
    this.consecutiveReversals = 0
  }

  onEnd(_game: GameState, _reason: EndReason): void {
    // Check reversal rate
    const reversalRate =
      this.totalMoves > 0 ? (this.reversalCount / this.totalMoves) * 100 : 0

    if (reversalRate > this.config.reversalRateThreshold) {
      this.issues.push({
        severity: 'warning',
        message: `High direction reversal rate: ${reversalRate.toFixed(1)}% (threshold: ${this.config.reversalRateThreshold}%)`,
        context: {
          reversalCount: this.reversalCount,
          totalMoves: this.totalMoves,
        },
      })
    }

    // Check revisit rate
    const revisitRate =
      this.totalMoves > 0 ? (this.revisitCount / this.totalMoves) * 100 : 0

    if (revisitRate > 20) {
      this.issues.push({
        severity: 'warning',
        message: `High position revisit rate: ${revisitRate.toFixed(1)}%`,
        context: {
          revisitCount: this.revisitCount,
          totalMoves: this.totalMoves,
        },
      })
    }

    // Detect reversal patterns
    this.detectReversalPatterns()
  }

  private detectReversalPatterns(): void {
    // Find sustained reversal sequences
    let patternStart: number | null = null
    let patternReversals = 0

    for (let i = 0; i < this.movements.length; i++) {
      const move = this.movements[i]!
      if (move.isReversal) {
        if (patternStart === null) {
          patternStart = i > 0 ? i - 1 : 0
        }
        patternReversals++
      } else if (patternStart !== null) {
        // Pattern ended
        if (patternReversals >= 3) {
          const positions = this.movements
            .slice(patternStart, i)
            .map((m) => m.to)
          this.patterns.push({
            startTurn: this.movements[patternStart]!.turn,
            endTurn: move.turn,
            positions,
            type: 'reversal',
          })
        }
        patternStart = null
        patternReversals = 0
      }
    }
  }

  summarize(): AnalyzerResult {
    const reversalRate =
      this.totalMoves > 0 ? (this.reversalCount / this.totalMoves) * 100 : 0
    const revisitRate =
      this.totalMoves > 0 ? (this.revisitCount / this.totalMoves) * 100 : 0

    // Categorize patterns
    const reversalPatterns = this.patterns.filter((p) => p.type === 'reversal')
    const pingpongPatterns = this.patterns.filter((p) => p.type === 'pingpong')

    const details: string[] = [
      `Total moves: ${this.totalMoves}`,
      `Direction reversals: ${this.reversalCount} (${reversalRate.toFixed(1)}%)`,
      `Position revisits: ${this.revisitCount} (${revisitRate.toFixed(1)}%)`,
      `Max consecutive reversals: ${this.maxConsecutiveReversals}`,
      `Detected patterns: ${this.patterns.length}`,
      `  Reversal patterns: ${reversalPatterns.length}`,
      `  Ping-pong patterns: ${pingpongPatterns.length}`,
    ]

    // Show sample patterns
    if (this.patterns.length > 0) {
      details.push('', 'Sample patterns (first 3):')
      for (const pattern of this.patterns.slice(0, 3)) {
        const posStr = pattern.positions
          .slice(0, 4)
          .map((p) => `(${p.x},${p.y})`)
          .join(' -> ')
        details.push(
          `  Turn ${pattern.startTurn}-${pattern.endTurn}: ${pattern.type} - ${posStr}${pattern.positions.length > 4 ? '...' : ''}`
        )
      }
    }

    return {
      name: this.name,
      metrics: {
        totalMoves: this.totalMoves,
        reversalCount: this.reversalCount,
        reversalRate: Math.round(reversalRate * 10) / 10,
        revisitCount: this.revisitCount,
        revisitRate: Math.round(revisitRate * 10) / 10,
        maxConsecutiveReversals: this.maxConsecutiveReversals,
        patternCount: this.patterns.length,
      },
      issues: this.issues,
      details,
    }
  }

  /** Get detected oscillation patterns */
  getPatterns(): OscillationPattern[] {
    return this.patterns
  }

  /** Get all movement records */
  getMovements(): MovementRecord[] {
    return this.movements
  }
}

/** Create an oscillation analyzer with default config */
export function createOscillationAnalyzer(
  config?: Partial<OscillationAnalyzerConfig>
): OscillationAnalyzer {
  return new OscillationAnalyzer(config)
}
