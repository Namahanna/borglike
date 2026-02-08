/**
 * Exploration Analyzer
 *
 * Consolidated analyzer for exploration behavior, merging:
 * - Progress tracking (stairs discovery, exploration %, level completion)
 * - Frontier analysis (reachability, flow diagnostics, door blocking)
 * - Movement patterns (oscillation, jitter, loops as symptoms)
 *
 * Maps to: bot/exploration.ts, bot/flow.ts
 *
 * Movement symptoms are included because they typically indicate
 * exploration problems - the bot is "exploring" but not making progress.
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  PostTurnContext,
  EndReason,
  MovementPattern,
} from '../types'
import type { GameState, Point } from '@game/types'
import type { BotState } from '@bot/types'
import {
  findFrontierTiles,
  getExplorationStats,
  findExplorationTarget,
  getFrontierPositions,
  getSweepFrontierPositions,
} from '@bot/exploration'
import { computeExplorationFlow, getFlowCost, isReachable, MAX_FLOW_COST } from '@bot/flow'
import type { FlowAvoidance } from '@bot/flow'
import { getTile, getAdjacentPositions, isWalkable } from '@game/dungeon'
import { computeDangerGrid, buildAvoidSet, getDangerThreshold, getScaledDangerThreshold } from '@bot/danger'

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Which checks to enable */
export interface ExplorationChecks {
  /** Track exploration progress (stairs, %, efficiency) */
  progress: boolean
  /** Analyze frontier reachability and flow */
  frontier: boolean
  /** Detect movement patterns (oscillation, jitter, loops) */
  movement: boolean
}

/** Configuration for exploration analysis */
export interface ExplorationAnalyzerConfig {
  /** Which checks to enable */
  checks: ExplorationChecks

  // Progress thresholds
  /** Warn if stairs not found after this many turns on a level */
  stairsNotFoundThreshold: number
  /** Warn if exploration below this % when descending */
  minExplorationThreshold: number
  /** Warn if exploration % doesn't increase for this many turns */
  progressStagnationThreshold: number

  // Frontier thresholds
  /** Warn after this many consecutive turns with no goal */
  noGoalThreshold: number
  /** Warn if frontier exists but no valid target for this many turns */
  unreachableFrontierThreshold: number
  /** Log detailed frontier state every N turns when stuck */
  detailedLogInterval: number

  // Movement thresholds
  /** Rolling window size for pattern detection */
  movementHistorySize: number
  /** Minimum oscillation cycles to flag */
  oscillationThreshold: number
  /** Minimum loop cycles to flag */
  loopThreshold: number
  /** Bounding box area threshold for jitter detection */
  jitterAreaThreshold: number
  /** Consecutive jitter turns before warning */
  jitterWarningThreshold: number
  /** Reversal rate threshold (% of moves that are reversals) */
  reversalRateThreshold: number
}

const DEFAULT_CHECKS: ExplorationChecks = {
  progress: true,
  frontier: true,
  movement: true,
}

const DEFAULT_CONFIG: ExplorationAnalyzerConfig = {
  checks: DEFAULT_CHECKS,
  // Progress
  stairsNotFoundThreshold: 200,
  minExplorationThreshold: 30,
  progressStagnationThreshold: 30,
  // Frontier
  noGoalThreshold: 10,
  unreachableFrontierThreshold: 20,
  detailedLogInterval: 50,
  // Movement
  movementHistorySize: 50,
  oscillationThreshold: 4,
  loopThreshold: 2,
  jitterAreaThreshold: 25,
  jitterWarningThreshold: 30,
  reversalRateThreshold: 30,
}

// ============================================================================
// TYPES
// ============================================================================

interface LevelStats {
  depth: number
  enterTurn: number
  exitTurn: number | null
  turnsOnLevel: number
  stairsFoundTurn: number | null
  explorationAtExit: number
  explorationAtStairsFound: number | null
  farmingModeAtExit: boolean
  sweepModeAtExit: boolean
}

interface FrontierSnapshot {
  turn: number
  frontierCount: number
  frontierWithEntryPoint: number
  frontierBlockedByDoor: number
  closedDoorCount: number
  explorationProgress: number
  hasGoal: boolean
  goalType: string | null
  flowReachable: boolean
  flowCostAtBot: number
  explorationTarget: Point | null
  botPosition: Point
  avoidSetSize: number
  flowWithAvoidReachable: boolean
  flowWithAvoidCost: number
  adjacentAnalysis: string
  validCandidates: number
  sweepMode: boolean
  sweepFrontierCount: number
  farmingMode: boolean
  tetheredRadius: number
}

interface JitterEpisode {
  startTurn: number
  endTurn: number
  duration: number
  avgBoundingArea: number
  center: Point
}

// ============================================================================
// ANALYZER
// ============================================================================

export class ExplorationAnalyzer implements Analyzer {
  readonly name = 'exploration'
  private config: ExplorationAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // === Progress tracking ===
  private currentLevel: LevelStats | null = null
  private stairsFoundThisLevel = false
  private completedLevels: LevelStats[] = []
  private maxDepth = 0
  private totalLevels = 0
  private stairsFoundCount = 0
  private totalExplorationAtExit = 0
  private lastProgressTurn = 0
  private progressStagnationWarned = false
  private inFarmingMode = false
  private inSweepMode = false
  private farmingFlipsExpected = 0

  // === Frontier tracking ===
  private noGoalStreak = 0
  private maxNoGoalStreak = 0
  private unreachableFrontierStreak = 0
  private totalNoGoalTurns = 0
  private noGoalWhileFrontierExists = 0
  private doorBlockingEvents = 0
  private noGoalDuringFarming = 0
  private noGoalDuringSweep = 0
  private frontierSnapshots: FrontierSnapshot[] = []
  private lastSnapshotTurn = -1

  // === Movement tracking ===
  private positionHistory: { pos: Point; turn: number }[] = []
  private directionHistory: { dx: number; dy: number; turn: number }[] = []
  private totalMoves = 0
  private totalTurns = 0
  private reversalCount = 0
  private maxConsecutiveReversals = 0
  private consecutiveReversals = 0
  private patterns: MovementPattern[] = []
  private currentOscillation: MovementPattern | null = null
  private currentLoop: MovementPattern | null = null

  // Jitter tracking
  private inJitter = false
  private jitterStartTurn = 0
  private jitterAreas: number[] = []
  private jitterEpisodes: JitterEpisode[] = []
  private jitterTurns = 0
  private maxJitterDuration = 0

  constructor(config: Partial<ExplorationAnalyzerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      checks: { ...DEFAULT_CHECKS, ...config.checks },
    }
  }

  onStart(game: GameState, botState: BotState): void {
    this.issues = []

    // Progress
    this.completedLevels = []
    this.maxDepth = game.character.depth
    this.totalLevels = 0
    this.stairsFoundCount = 0
    this.totalExplorationAtExit = 0
    this.stairsFoundThisLevel = false
    this.lastProgressTurn = 0
    this.progressStagnationWarned = false
    this.inFarmingMode = botState.farmingMode
    this.inSweepMode = botState.sweepMode
    this.farmingFlipsExpected = 0

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

    // Frontier
    this.noGoalStreak = 0
    this.maxNoGoalStreak = 0
    this.unreachableFrontierStreak = 0
    this.totalNoGoalTurns = 0
    this.noGoalWhileFrontierExists = 0
    this.doorBlockingEvents = 0
    this.noGoalDuringFarming = 0
    this.noGoalDuringSweep = 0
    this.frontierSnapshots = []
    this.lastSnapshotTurn = -1

    // Movement
    this.positionHistory = []
    this.directionHistory = []
    this.totalMoves = 0
    this.totalTurns = 0
    this.reversalCount = 0
    this.maxConsecutiveReversals = 0
    this.consecutiveReversals = 0
    this.patterns = []
    this.currentOscillation = null
    this.currentLoop = null

    // Jitter
    this.inJitter = false
    this.jitterStartTurn = 0
    this.jitterAreas = []
    this.jitterEpisodes = []
    this.jitterTurns = 0
    this.maxJitterDuration = 0
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++
    const { botState } = ctx

    // Track farming/sweep mode
    this.inFarmingMode = botState.farmingMode
    this.inSweepMode = botState.sweepMode

    if (this.config.checks.progress) {
      this.trackProgress(ctx)
    }

    if (this.config.checks.frontier) {
      this.trackFrontier(ctx)
    }
  }

  onPostTurn(ctx: PostTurnContext): void {
    if (this.config.checks.movement && ctx.moved) {
      this.trackMovement(ctx)
    }

    if (this.config.checks.movement) {
      this.detectJitter(ctx)
    }
  }

  // ============================================================================
  // PROGRESS TRACKING
  // ============================================================================

  private trackProgress(ctx: TurnContext): void {
    if (!this.currentLevel) return

    this.currentLevel.turnsOnLevel++
    this.maxDepth = Math.max(this.maxDepth, ctx.game.character.depth)

    const stats = getExplorationStats(ctx.game)

    // Check if stairs found
    if (stats.stairsFound && !this.stairsFoundThisLevel) {
      this.stairsFoundThisLevel = true
      this.stairsFoundCount++
      this.currentLevel.stairsFoundTurn = ctx.turn
      this.currentLevel.explorationAtStairsFound = stats.progress
    }

    // Check for progress stagnation
    if (stats.progress > (this.currentLevel.explorationAtStairsFound ?? 0)) {
      this.lastProgressTurn = ctx.turn
    }

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
        context: { progress: stats.progress, lastProgressTurn: this.lastProgressTurn },
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

  // ============================================================================
  // FRONTIER TRACKING
  // ============================================================================

  private trackFrontier(ctx: TurnContext): void {
    const { game, botState, turn } = ctx
    const hasGoal = botState.currentGoal !== null
    const goalType = botState.currentGoal?.type ?? null

    if (!hasGoal) {
      this.noGoalStreak++
      this.totalNoGoalTurns++
      this.maxNoGoalStreak = Math.max(this.maxNoGoalStreak, this.noGoalStreak)
    } else {
      this.noGoalStreak = 0
    }

    const frontierAnalysis = this.analyzeFrontier(game)
    const stats = getExplorationStats(game)

    // Detect "no goal but frontier exists" pattern
    if (!hasGoal && frontierAnalysis.total > 0) {
      this.noGoalWhileFrontierExists++

      if (botState.farmingMode) this.noGoalDuringFarming++
      if (botState.sweepMode) this.noGoalDuringSweep++

      if (frontierAnalysis.withEntryPoint === 0 && frontierAnalysis.blockedByDoor > 0) {
        this.doorBlockingEvents++
      }
    }

    // Unreachable frontier streak
    if (frontierAnalysis.total > 0 && frontierAnalysis.withEntryPoint === 0) {
      this.unreachableFrontierStreak++
    } else {
      this.unreachableFrontierStreak = 0
    }

    // Warn on no goal threshold
    if (this.noGoalStreak === this.config.noGoalThreshold) {
      this.issues.push({
        severity: 'warning',
        message: `No goal for ${this.config.noGoalThreshold} consecutive turns`,
        turn,
        context: {
          frontierTotal: frontierAnalysis.total,
          frontierReachable: frontierAnalysis.withEntryPoint,
          exploration: stats.progress,
        },
      })
    }

    // Warn on unreachable frontier
    if (this.unreachableFrontierStreak === this.config.unreachableFrontierThreshold) {
      this.issues.push({
        severity: 'warning',
        message: `Frontier exists but unreachable for ${this.config.unreachableFrontierThreshold} turns`,
        turn,
        context: {
          frontierTotal: frontierAnalysis.total,
          blockedByDoor: frontierAnalysis.blockedByDoor,
        },
      })
    }

    // Capture snapshot when stuck
    const shouldSnapshot =
      this.noGoalStreak > 0 &&
      turn - this.lastSnapshotTurn >= this.config.detailedLogInterval

    if (shouldSnapshot || (this.noGoalStreak === 1 && frontierAnalysis.total > 0)) {
      this.captureSnapshot(ctx, frontierAnalysis, hasGoal, goalType)
      this.lastSnapshotTurn = turn
    }
  }

  private analyzeFrontier(game: GameState): {
    total: number
    withEntryPoint: number
    blockedByDoor: number
    closedDoorCount: number
  } {
    const level = game.currentLevel
    const frontier = findFrontierTiles(game)

    let withEntryPoint = 0
    let blockedByDoor = 0
    let closedDoorCount = 0

    for (let y = 0; y < level.height; y++) {
      const row = level.tiles[y]
      if (!row) continue
      for (let x = 0; x < level.width; x++) {
        if (row[x]?.type === 'door_closed') closedDoorCount++
      }
    }

    for (const f of frontier) {
      const neighbors = getAdjacentPositions(f.position)
      let hasExploredWalkable = false
      let hasClosedDoorNeighbor = false

      for (const neighbor of neighbors) {
        const tile = getTile(level, neighbor.x, neighbor.y)
        if (!tile) continue
        if (tile.explored && (isWalkable(tile) || tile.type === 'door_closed')) {
          hasExploredWalkable = true
        }
        if (tile.type === 'door_closed') {
          hasClosedDoorNeighbor = true
        }
      }

      if (hasExploredWalkable) {
        withEntryPoint++
      } else if (hasClosedDoorNeighbor) {
        blockedByDoor++
      }
    }

    return { total: frontier.length, withEntryPoint, blockedByDoor, closedDoorCount }
  }

  private captureSnapshot(
    ctx: TurnContext,
    frontierAnalysis: { total: number; withEntryPoint: number; blockedByDoor: number; closedDoorCount: number },
    hasGoal: boolean,
    goalType: string | null
  ): void {
    const { game, botState, turn } = ctx
    const pos = game.character.position
    const frontierPositions = getFrontierPositions(game)

    // Compute danger and avoidance
    const dangerResult = computeDangerGrid(game)
    const dangerThreshold = getDangerThreshold(30, 50)
    const avoidSet = buildAvoidSet(dangerResult.dangers, dangerThreshold, game.character)
    const avoidance: FlowAvoidance = {
      grid: dangerResult.dangers,
      threshold: getScaledDangerThreshold(dangerThreshold, game.character),
    }

    let flowReachable = false
    let flowCostAtBot = 255
    let flowWithAvoidReachable = false
    let flowWithAvoidCost = 255

    if (frontierPositions.length > 0) {
      const flowCosts = computeExplorationFlow(game.currentLevel, frontierPositions)
      flowReachable = isReachable(flowCosts, pos)
      flowCostAtBot = getFlowCost(flowCosts, pos)

      const flowCostsWithAvoid = computeExplorationFlow(game.currentLevel, frontierPositions, avoidance)
      flowWithAvoidReachable = isReachable(flowCostsWithAvoid, pos)
      flowWithAvoidCost = getFlowCost(flowCostsWithAvoid, pos)
    }

    const explorationTarget = findExplorationTarget(game, botState)

    // Analyze adjacent tiles
    const adjacent = getAdjacentPositions(pos)
    const occupied = new Set<string>()
    for (const monster of game.monsters) {
      occupied.add(`${monster.position.x},${monster.position.y}`)
    }

    const adjAnalysis: string[] = []
    let validCandidates = 0
    // computeExplorationFlow returns an empty grid if no frontiers, so always call it
    const flowCosts = computeExplorationFlow(game.currentLevel, frontierPositions)

    for (const adj of adjacent) {
      const tile = getTile(game.currentLevel, adj.x, adj.y)
      const adjKey = `${adj.x},${adj.y}`
      const flowCost = getFlowCost(flowCosts, adj)

      if (!tile) {
        adjAnalysis.push(`(${adj.x},${adj.y}):OOB`)
      } else if (!isWalkable(tile) && tile.type !== 'door_closed') {
        adjAnalysis.push(`(${adj.x},${adj.y}):wall`)
      } else if (occupied.has(adjKey)) {
        adjAnalysis.push(`(${adj.x},${adj.y}):monster`)
      } else if (flowCost >= MAX_FLOW_COST) {
        adjAnalysis.push(`(${adj.x},${adj.y}):unreachable`)
      } else {
        adjAnalysis.push(`(${adj.x},${adj.y}):OK@${flowCost}`)
        validCandidates++
      }
    }

    // Sweep mode check - trust the bot's sweep state (now configurable per-slot)
    const sweepMode = botState.sweepMode
    const sweepFrontiers = sweepMode ? getSweepFrontierPositions(game, botState) : []

    this.frontierSnapshots.push({
      turn,
      frontierCount: frontierAnalysis.total,
      frontierWithEntryPoint: frontierAnalysis.withEntryPoint,
      frontierBlockedByDoor: frontierAnalysis.blockedByDoor,
      closedDoorCount: frontierAnalysis.closedDoorCount,
      explorationProgress: getExplorationStats(game).progress,
      hasGoal,
      goalType,
      flowReachable,
      flowCostAtBot,
      explorationTarget: explorationTarget ? { x: explorationTarget.x, y: explorationTarget.y } : null,
      botPosition: { x: pos.x, y: pos.y },
      avoidSetSize: avoidSet.size,
      flowWithAvoidReachable,
      flowWithAvoidCost,
      adjacentAnalysis: adjAnalysis.join(' '),
      validCandidates,
      sweepMode,
      sweepFrontierCount: sweepFrontiers.length,
      farmingMode: botState.farmingMode,
      tetheredRadius: botState.tetheredRadius,
    })
  }

  // ============================================================================
  // MOVEMENT TRACKING
  // ============================================================================

  private trackMovement(ctx: PostTurnContext): void {
    this.totalMoves++
    const pos = ctx.game.character.position
    const prev = ctx.previousPosition

    // Direction vector
    const dx = Math.sign(pos.x - prev.x)
    const dy = Math.sign(pos.y - prev.y)

    // Track reversal (opposite direction)
    if (this.directionHistory.length > 0) {
      const last = this.directionHistory[this.directionHistory.length - 1]!
      const dotProduct = dx * last.dx + dy * last.dy
      if (dotProduct < 0) {
        this.reversalCount++
        this.consecutiveReversals++
        this.maxConsecutiveReversals = Math.max(this.maxConsecutiveReversals, this.consecutiveReversals)

        if (this.consecutiveReversals === 5) {
          this.issues.push({
            severity: 'warning',
            message: `5 consecutive direction reversals starting at turn ${ctx.turn - 4}`,
            turn: ctx.turn,
            context: { from: prev, to: pos },
          })
        }
      } else {
        this.consecutiveReversals = 0
      }
    }

    this.directionHistory.push({ dx, dy, turn: ctx.turn })
    this.positionHistory.push({ pos: { ...pos }, turn: ctx.turn })

    // Bound history
    if (this.positionHistory.length > this.config.movementHistorySize) {
      this.positionHistory.shift()
    }
    if (this.directionHistory.length > this.config.movementHistorySize) {
      this.directionHistory.shift()
    }

    // Detect patterns
    this.detectOscillation(ctx.turn)
    this.detectLoop(ctx.turn)
  }

  private detectOscillation(turn: number): void {
    const h = this.positionHistory
    if (h.length < 4) return

    const len = h.length
    const [p1, p2, p3, p4] = [h[len - 4]!, h[len - 3]!, h[len - 2]!, h[len - 1]!]

    const isOscillating =
      p1.pos.x === p3.pos.x && p1.pos.y === p3.pos.y &&
      p2.pos.x === p4.pos.x && p2.pos.y === p4.pos.y &&
      !(p1.pos.x === p2.pos.x && p1.pos.y === p2.pos.y)

    if (isOscillating) {
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

      if (this.currentOscillation.duration === this.config.oscillationThreshold * 2) {
        this.issues.push({
          severity: 'warning',
          message: `Oscillation: ${this.config.oscillationThreshold}+ cycles between (${p1.pos.x},${p1.pos.y}) and (${p2.pos.x},${p2.pos.y})`,
          turn,
          context: { positions: [p1.pos, p2.pos], duration: this.currentOscillation.duration },
        })
      }
    } else if (this.currentOscillation) {
      if (this.currentOscillation.duration >= this.config.oscillationThreshold * 2) {
        this.patterns.push({ ...this.currentOscillation })
      }
      this.currentOscillation = null
    }
  }

  private detectLoop(turn: number): void {
    const h = this.positionHistory
    if (h.length < 6) return

    const len = h.length
    const [p1, p2, p3, p4, p5, p6] = [
      h[len - 6]!, h[len - 5]!, h[len - 4]!,
      h[len - 3]!, h[len - 2]!, h[len - 1]!,
    ]

    const isLoop =
      p1.pos.x === p4.pos.x && p1.pos.y === p4.pos.y &&
      p2.pos.x === p5.pos.x && p2.pos.y === p5.pos.y &&
      p3.pos.x === p6.pos.x && p3.pos.y === p6.pos.y &&
      !(p1.pos.x === p2.pos.x && p1.pos.y === p2.pos.y) &&
      !(p2.pos.x === p3.pos.x && p2.pos.y === p3.pos.y) &&
      !(p1.pos.x === p3.pos.x && p1.pos.y === p3.pos.y)

    if (isLoop) {
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

      if (this.currentLoop.duration === this.config.loopThreshold * 3) {
        this.issues.push({
          severity: 'warning',
          message: `Loop: ${this.config.loopThreshold}+ cycles through 3 positions`,
          turn,
          context: { positions: [p1.pos, p2.pos, p3.pos], duration: this.currentLoop.duration },
        })
      }
    } else if (this.currentLoop) {
      if (this.currentLoop.duration >= this.config.loopThreshold * 3) {
        this.patterns.push({ ...this.currentLoop })
      }
      this.currentLoop = null
    }
  }

  private detectJitter(ctx: PostTurnContext): void {
    if (!this.config.checks.movement) return

    const minMoves = 15
    if (this.positionHistory.length < minMoves) return

    const bbox = this.calculateBoundingBox()

    if (bbox.area < this.config.jitterAreaThreshold) {
      this.jitterTurns++

      if (!this.inJitter) {
        this.inJitter = true
        this.jitterStartTurn = ctx.turn
        this.jitterAreas = [bbox.area]
      } else {
        this.jitterAreas.push(bbox.area)
      }

      const duration = ctx.turn - this.jitterStartTurn + 1
      if (duration === this.config.jitterWarningThreshold) {
        this.issues.push({
          severity: 'warning',
          message: `Jitter: confined to ${bbox.area} tile area for ${duration} turns`,
          turn: ctx.turn,
          context: { boundingArea: bbox.area, center: bbox.center, duration },
        })
      }
    } else if (this.inJitter) {
      this.finalizeJitterEpisode(ctx.turn)
    }
  }

  private calculateBoundingBox(): { area: number; center: Point } {
    if (this.positionHistory.length === 0) {
      return { area: 0, center: { x: 0, y: 0 } }
    }

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity

    for (const h of this.positionHistory) {
      minX = Math.min(minX, h.pos.x)
      maxX = Math.max(maxX, h.pos.x)
      minY = Math.min(minY, h.pos.y)
      maxY = Math.max(maxY, h.pos.y)
    }

    const width = maxX - minX + 1
    const height = maxY - minY + 1
    return {
      area: width * height,
      center: { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) },
    }
  }

  private finalizeJitterEpisode(endTurn: number): void {
    const duration = endTurn - this.jitterStartTurn
    const avgArea = this.jitterAreas.length > 0
      ? this.jitterAreas.reduce((a, b) => a + b, 0) / this.jitterAreas.length
      : 0

    const bbox = this.calculateBoundingBox()
    this.jitterEpisodes.push({
      startTurn: this.jitterStartTurn,
      endTurn,
      duration,
      avgBoundingArea: avgArea,
      center: bbox.center,
    })

    this.maxJitterDuration = Math.max(this.maxJitterDuration, duration)
    this.inJitter = false
    this.jitterAreas = []
  }

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  onLevelChange(game: GameState, oldDepth: number, newDepth: number): void {
    // Finalize current level
    if (this.currentLevel && this.config.checks.progress) {
      this.currentLevel.exitTurn = game.turn
      this.currentLevel.explorationAtExit = this.currentLevel.explorationAtStairsFound ?? 0
      this.currentLevel.farmingModeAtExit = this.inFarmingMode
      this.currentLevel.sweepModeAtExit = this.inSweepMode

      if (!this.stairsFoundThisLevel) {
        if (this.inFarmingMode || this.inSweepMode) {
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

    // Reset for new level
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

    // Reset stagnation tracking
    this.lastProgressTurn = game.turn
    this.progressStagnationWarned = false

    // Reset frontier tracking
    this.noGoalStreak = 0
    this.unreachableFrontierStreak = 0

    // Reset movement tracking
    this.positionHistory = []
    this.directionHistory = []
    this.consecutiveReversals = 0
    this.currentOscillation = null
    this.currentLoop = null

    if (this.inJitter) {
      this.finalizeJitterEpisode(this.jitterStartTurn + this.jitterAreas.length)
    }
    this.inJitter = false
  }

  onEnd(game: GameState, _reason: EndReason): void {
    // Finalize current level
    if (this.currentLevel && this.config.checks.progress) {
      const stats = getExplorationStats(game)
      this.currentLevel.exitTurn = game.turn
      this.currentLevel.explorationAtExit = stats.progress
      this.currentLevel.farmingModeAtExit = this.inFarmingMode
      this.currentLevel.sweepModeAtExit = this.inSweepMode

      this.completedLevels.push({ ...this.currentLevel })
      this.totalLevels++
      this.totalExplorationAtExit += this.currentLevel.explorationAtExit
    }

    // Finalize patterns
    if (this.currentOscillation && this.currentOscillation.duration >= this.config.oscillationThreshold * 2) {
      this.patterns.push(this.currentOscillation)
    }
    if (this.currentLoop && this.currentLoop.duration >= this.config.loopThreshold * 3) {
      this.patterns.push(this.currentLoop)
    }
    if (this.inJitter) {
      this.finalizeJitterEpisode(this.jitterStartTurn + this.jitterAreas.length)
    }

    // Check reversal rate
    if (this.config.checks.movement) {
      const reversalRate = this.totalMoves > 0 ? (this.reversalCount / this.totalMoves) * 100 : 0
      if (reversalRate > this.config.reversalRateThreshold) {
        this.issues.push({
          severity: 'warning',
          message: `High direction reversal rate: ${reversalRate.toFixed(1)}%`,
          context: { reversalCount: this.reversalCount, totalMoves: this.totalMoves },
        })
      }
    }

    // Final no-goal check
    if (this.config.checks.frontier && this.noGoalStreak > this.config.noGoalThreshold * 2) {
      this.issues.push({
        severity: 'error',
        message: `Ended with ${this.noGoalStreak} consecutive no-goal turns`,
        turn: this.totalTurns,
      })
    }
  }

  summarize(): AnalyzerResult {
    const metrics: Record<string, number | string | boolean> = {}
    const details: string[] = []

    // Progress metrics
    if (this.config.checks.progress) {
      const stairsFoundRate = this.totalLevels > 0 ? (this.stairsFoundCount / this.totalLevels) * 100 : 100
      const avgExploration = this.totalLevels > 0 ? this.totalExplorationAtExit / this.totalLevels : 0

      const levelsWithStairs = this.completedLevels.filter((l) => l.stairsFoundTurn !== null)
      const avgTurnsToStairs = levelsWithStairs.length > 0
        ? levelsWithStairs.reduce((sum, l) => sum + (l.stairsFoundTurn! - l.enterTurn), 0) / levelsWithStairs.length
        : 0

      const farmingModeExits = this.completedLevels.filter((l) => l.farmingModeAtExit).length
      const sweepModeExits = this.completedLevels.filter((l) => l.sweepModeAtExit).length

      Object.assign(metrics, {
        maxDepth: this.maxDepth,
        totalLevels: this.totalLevels,
        stairsFoundCount: this.stairsFoundCount,
        stairsFoundRate: Math.round(stairsFoundRate * 10) / 10,
        avgExplorationAtExit: Math.round(avgExploration * 10) / 10,
        avgTurnsToStairs: Math.round(avgTurnsToStairs),
        farmingFlipsExpected: this.farmingFlipsExpected,
        farmingModeExits,
        sweepModeExits,
      })

      details.push(
        '=== Progress ===',
        `Max depth: ${this.maxDepth}`,
        `Stairs found: ${stairsFoundRate.toFixed(1)}% (${this.stairsFoundCount}/${this.totalLevels})`,
        `Avg exploration at exit: ${avgExploration.toFixed(1)}%`,
        `Avg turns to find stairs: ${avgTurnsToStairs.toFixed(0)}`,
      )

      if (this.farmingFlipsExpected > 0 || farmingModeExits > 0) {
        details.push(`Farming patterns: ${this.farmingFlipsExpected} flips, ${farmingModeExits} farming exits`)
      }
    }

    // Frontier metrics
    if (this.config.checks.frontier) {
      const noGoalRate = this.totalTurns > 0 ? (this.totalNoGoalTurns / this.totalTurns) * 100 : 0
      const realNoGoalIssues = this.noGoalWhileFrontierExists - this.noGoalDuringFarming - this.noGoalDuringSweep

      Object.assign(metrics, {
        noGoalTurns: this.totalNoGoalTurns,
        noGoalRate: Math.round(noGoalRate * 10) / 10,
        maxNoGoalStreak: this.maxNoGoalStreak,
        noGoalWhileFrontierExists: this.noGoalWhileFrontierExists,
        realNoGoalIssues: Math.max(0, realNoGoalIssues),
        doorBlockingEvents: this.doorBlockingEvents,
        snapshotCount: this.frontierSnapshots.length,
      })

      details.push(
        '',
        '=== Frontier ===',
        `No-goal turns: ${this.totalNoGoalTurns}/${this.totalTurns} (${noGoalRate.toFixed(1)}%)`,
        `Max no-goal streak: ${this.maxNoGoalStreak}`,
        `No-goal while frontier exists: ${this.noGoalWhileFrontierExists}`,
        `Door blocking events: ${this.doorBlockingEvents}`,
      )

      if (this.frontierSnapshots.length > 0) {
        details.push('', 'Frontier snapshots (first 3):')
        for (const snap of this.frontierSnapshots.slice(0, 3)) {
          const flowInfo = snap.flowReachable ? `flowOK cost=${snap.flowCostAtBot}` : `BLOCKED cost=${snap.flowCostAtBot}`
          details.push(`  Turn ${snap.turn}: frontier=${snap.frontierCount} ${flowInfo} candidates=${snap.validCandidates}`)
        }
      }
    }

    // Movement metrics
    if (this.config.checks.movement) {
      const reversalRate = this.totalMoves > 0 ? (this.reversalCount / this.totalMoves) * 100 : 0
      const moveRate = this.totalTurns > 0 ? (this.totalMoves / this.totalTurns) * 100 : 0
      const jitterRate = this.totalTurns > 0 ? (this.jitterTurns / this.totalTurns) * 100 : 0

      Object.assign(metrics, {
        totalMoves: this.totalMoves,
        moveRate: Math.round(moveRate * 10) / 10,
        reversalCount: this.reversalCount,
        reversalRate: Math.round(reversalRate * 10) / 10,
        maxConsecutiveReversals: this.maxConsecutiveReversals,
        patternsDetected: this.patterns.length,
        jitterTurns: this.jitterTurns,
        jitterRate: Math.round(jitterRate * 10) / 10,
        jitterEpisodes: this.jitterEpisodes.length,
        maxJitterDuration: this.maxJitterDuration,
      })

      details.push(
        '',
        '=== Movement ===',
        `Move rate: ${moveRate.toFixed(1)}% (${this.totalMoves}/${this.totalTurns})`,
        `Reversal rate: ${reversalRate.toFixed(1)}% (max consecutive: ${this.maxConsecutiveReversals})`,
        `Patterns detected: ${this.patterns.length}`,
        `Jitter: ${this.jitterEpisodes.length} episodes, max ${this.maxJitterDuration} turns`,
      )
    }

    return {
      name: this.name,
      metrics,
      issues: this.issues,
      details,
    }
  }

  /** Get frontier snapshots for detailed analysis */
  getSnapshots(): FrontierSnapshot[] {
    return this.frontierSnapshots
  }

  /** Get movement patterns */
  getPatterns(): MovementPattern[] {
    return this.patterns
  }

  /** Get jitter episodes */
  getJitterEpisodes(): JitterEpisode[] {
    return this.jitterEpisodes
  }
}

/** Create an exploration analyzer with default config */
export function createExplorationAnalyzer(
  config?: Partial<ExplorationAnalyzerConfig>
): ExplorationAnalyzer {
  return new ExplorationAnalyzer(config)
}
