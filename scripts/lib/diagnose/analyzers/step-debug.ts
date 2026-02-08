/**
 * Step Selection Debug Analyzer
 *
 * Captures detailed step selection info when oscillation is detected.
 * Helps diagnose why the bot chooses to move back and forth.
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  PostTurnContext,
  EndReason,
} from '../types'
import type { GameState, Point, Direction } from '@game/types'
import type { BotState } from '@bot/types'
import { computeFlow, getFlowCost, MAX_FLOW_COST } from '@bot/flow'
import type { FlowAvoidance } from '@bot/flow'
import { CARDINAL_DIRECTIONS } from '@bot/types'
import { getAdjacentPositions, getTile, isWalkable } from '@game/dungeon'
import { getDirectionFromDelta } from '@game/types'
import { getRecencyPenalty } from '@bot/state'
import { computeDangerGrid, getDangerThreshold, getScaledDangerThreshold } from '@bot/danger'

export interface StepDebugConfig {
  /** Only capture when oscillation detected (position revisit within N turns) */
  captureOnOscillation: boolean
  /** Turns to look back for oscillation detection */
  oscillationWindow: number
  /** Max snapshots to keep */
  maxSnapshots: number
  /** Only capture at depths >= this value (0 = all depths) */
  minDepth: number
  /** Only capture after this turn (0 = all turns) */
  afterTurn: number
}

const DEFAULT_CONFIG: StepDebugConfig = {
  captureOnOscillation: true,
  oscillationWindow: 6,
  maxSnapshots: 100,
  minDepth: 0,
  afterTurn: 27900, // Focus on late-game oscillations specifically
}

/** Candidate evaluation for a single adjacent tile */
interface CandidateEval {
  pos: Point
  direction: Direction
  flowCost: number
  currentCost: number
  progressPenalty: number
  visitPenalty: number
  cardinalBonus: number
  totalScore: number
  blocked: string | null // Why blocked, or null if valid
}

/** Snapshot of step selection state */
interface StepSnapshot {
  turn: number
  depth: number
  pos: Point
  goalType: string
  goalTarget: Point | null
  currentFlowCost: number
  candidates: CandidateEval[]
  chosenDirection: Direction | null
  recentPositions: Point[]
  avoidCount: number // Number of tiles in avoid set
  nearbyAvoid: string[] // Avoid tiles near bot position
}

export class StepDebugAnalyzer implements Analyzer {
  readonly name = 'step-debug'
  private config: StepDebugConfig
  private issues: DiagnosticIssue[] = []

  // Position history for oscillation detection
  private positionHistory: { turn: number; pos: Point }[] = []

  // Captured snapshots
  private snapshots: StepSnapshot[] = []

  // Track consecutive oscillations
  private oscillationCount = 0
  private lastOscillationTurn = -100

  constructor(config: Partial<StepDebugConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.positionHistory = []
    this.snapshots = []
    this.oscillationCount = 0
    this.lastOscillationTurn = -100
  }

  onTurn(ctx: TurnContext): void {
    const { game, botState, turn } = ctx
    const pos = game.character.position
    const goal = botState.currentGoal

    // Check for oscillation (revisit within window)
    const isOscillating = this.positionHistory.some(
      (h) =>
        h.pos.x === pos.x &&
        h.pos.y === pos.y &&
        turn - h.turn <= this.config.oscillationWindow &&
        turn - h.turn > 0
    )

    // Track oscillation streaks
    if (isOscillating) {
      if (turn - this.lastOscillationTurn <= 2) {
        this.oscillationCount++
      } else {
        this.oscillationCount = 1
      }
      this.lastOscillationTurn = turn
    }

    // Capture snapshot if oscillating or if not filtering
    const shouldCapture = !this.config.captureOnOscillation ||
                          (isOscillating && this.oscillationCount >= 2)

    // Only capture at high depths (endgame) to avoid filling up with early oscillations
    const atMinDepth = game.character.depth >= this.config.minDepth
    const afterMinTurn = turn >= this.config.afterTurn

    if (shouldCapture && atMinDepth && afterMinTurn && goal?.target && this.snapshots.length < this.config.maxSnapshots) {
      const snapshot = this.captureStepState(game, botState, turn, goal)
      if (snapshot) {
        this.snapshots.push(snapshot)
      }
    }

    // Update position history
    this.positionHistory.push({ turn, pos: { ...pos } })
    if (this.positionHistory.length > 50) {
      this.positionHistory.shift()
    }
  }

  private captureStepState(
    game: GameState,
    botState: BotState,
    turn: number,
    goal: { type: string; target?: Point | null }
  ): StepSnapshot | null {
    if (!goal.target) return null

    const pos = game.character.position
    const target = goal.target

    // Compute flow to goal with danger avoidance (same as actual bot)
    // Using cautious personality defaults: aggression=30, caution=50
    const dangerGrid = computeDangerGrid(game)
    const dangerThreshold = getDangerThreshold(30, 50)
    const scaledThreshold = getScaledDangerThreshold(dangerThreshold, game.character)
    const avoidance: FlowAvoidance = { grid: dangerGrid.dangers, threshold: scaledThreshold }
    const flowCosts = computeFlow(game.currentLevel, target, avoidance)
    const currentCost = getFlowCost(flowCosts, pos)

    // Build occupied set
    const occupied = new Set<string>()
    for (const monster of game.monsters) {
      occupied.add(`${monster.position.x},${monster.position.y}`)
    }

    // Evaluate all adjacent positions
    const adjacent = getAdjacentPositions(pos)
    const candidates: CandidateEval[] = []

    for (const adj of adjacent) {
      const tile = getTile(game.currentLevel, adj.x, adj.y)
      const dx = adj.x - pos.x
      const dy = adj.y - pos.y
      const direction = getDirectionFromDelta(dx, dy)

      if (!direction) continue

      // Check why blocked
      let blocked: string | null = null
      if (!tile) {
        blocked = 'out_of_bounds'
      } else if (!isWalkable(tile) && tile.type !== 'door_closed') {
        blocked = `terrain:${tile.type}`
      } else if (occupied.has(`${adj.x},${adj.y}`)) {
        blocked = 'monster'
      }

      const flowCost = getFlowCost(flowCosts, adj)
      if (flowCost >= MAX_FLOW_COST && !blocked) {
        blocked = 'unreachable'
      }

      // Calculate scoring (mirrors movement.ts logic)
      const isCardinal = CARDINAL_DIRECTIONS.includes(direction)
      const visitPenalty = getRecencyPenalty(botState, adj)

      let progressPenalty = 0
      if (flowCost > currentCost) {
        progressPenalty = 100
      } else if (flowCost === currentCost) {
        progressPenalty = 50
      }

      const cardinalBonus = isCardinal ? -5 : 0
      const totalScore = blocked ? Infinity : flowCost + progressPenalty + cardinalBonus + visitPenalty

      candidates.push({
        pos: { ...adj },
        direction,
        flowCost,
        currentCost,
        progressPenalty,
        visitPenalty,
        cardinalBonus,
        totalScore,
        blocked,
      })
    }

    // Sort by score (ascending)
    candidates.sort((a, b) => a.totalScore - b.totalScore)

    // Find chosen direction (lowest score that's not blocked)
    const chosen = candidates.find((c) => !c.blocked)

    // Find avoid tiles near bot position (within 3 tiles)
    const nearbyAvoid: string[] = []
    let avoidCount = 0
    const dGrid = dangerGrid.dangers
    for (let ay = Math.max(0, pos.y - 3); ay <= Math.min(dGrid.data.length / dGrid.width - 1, pos.y + 3); ay++) {
      for (let ax = Math.max(0, pos.x - 3); ax <= Math.min(dGrid.width - 1, pos.x + 3); ax++) {
        if (dGrid.data[ay * dGrid.width + ax]! > scaledThreshold) {
          nearbyAvoid.push(`${ax},${ay}`)
          avoidCount++
        }
      }
    }

    return {
      turn,
      depth: game.character.depth,
      pos: { ...pos },
      goalType: goal.type,
      goalTarget: target ? { ...target } : null,
      currentFlowCost: currentCost,
      candidates,
      chosenDirection: chosen?.direction ?? null,
      recentPositions: botState.recentPositions.slice(-10).map((p) => ({ ...p })),
      avoidCount,
      nearbyAvoid,
    }
  }

  onPostTurn(_ctx: PostTurnContext): void {
    // No-op
  }

  onLevelChange(): void {
    this.positionHistory = []
    this.oscillationCount = 0
  }

  onEnd(_game: GameState, _reason: EndReason): void {
    // Generate issues for oscillation patterns
    if (this.snapshots.length > 5) {
      this.issues.push({
        severity: 'warning',
        message: `Captured ${this.snapshots.length} step oscillation snapshots`,
      })
    }
  }

  summarize(): AnalyzerResult {
    const details: string[] = [
      `Oscillation snapshots captured: ${this.snapshots.length}`,
    ]

    // Show sample snapshots
    for (const snap of this.snapshots.slice(0, 10)) {
      details.push('')
      details.push(`Turn ${snap.turn} @ (${snap.pos.x},${snap.pos.y}) depth=${snap.depth}`)
      details.push(`  Goal: ${snap.goalType} -> (${snap.goalTarget?.x},${snap.goalTarget?.y})`)
      details.push(`  Current flow cost: ${snap.currentFlowCost}`)
      details.push(`  Recent positions: ${snap.recentPositions.map((p) => `(${p.x},${p.y})`).join(' <- ')}`)
      details.push(`  Avoid tiles: ${snap.avoidCount} total, ${snap.nearbyAvoid.length} nearby: ${snap.nearbyAvoid.slice(0, 5).join(' ')}`)
      details.push(`  Candidates (sorted by score):`)

      for (const c of snap.candidates) {
        const status = c.blocked ? `BLOCKED:${c.blocked}` : `score=${c.totalScore}`
        details.push(
          `    ${c.direction.padEnd(3)} (${c.pos.x},${c.pos.y}): flow=${c.flowCost} prog=${c.progressPenalty} visit=${c.visitPenalty} card=${c.cardinalBonus} -> ${status}`
        )
      }

      details.push(`  -> Chosen: ${snap.chosenDirection ?? 'wait'}`)
    }

    if (this.snapshots.length > 10) {
      details.push(`  ... and ${this.snapshots.length - 10} more snapshots`)
    }

    return {
      name: this.name,
      metrics: {
        snapshotCount: this.snapshots.length,
      },
      issues: this.issues,
      details,
    }
  }

  /** Get all captured snapshots */
  getSnapshots(): StepSnapshot[] {
    return this.snapshots
  }
}

export function createStepDebugAnalyzer(
  config?: Partial<StepDebugConfig>
): StepDebugAnalyzer {
  return new StepDebugAnalyzer(config)
}
