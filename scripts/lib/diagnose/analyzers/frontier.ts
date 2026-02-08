/**
 * Frontier Analyzer
 *
 * Diagnoses exploration goal failures by tracking:
 * - Frontier tile availability vs reachability
 * - Entry point finding failures
 * - Door-related blocking patterns
 * - Goal generation failures
 *
 * Helps identify why bots get stuck with "no goal" when unexplored areas exist.
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  EndReason,
} from '../types'
import type { GameState, Tile } from '@game/types'
import type { BotState } from '@bot/types'
import {
  findFrontierTiles,
  getExplorationStats,
  findExplorationTarget,
  getFrontierPositions,
  getSweepFrontierPositions,
} from '@bot/exploration'
import { computeExplorationFlow, getFlowCost, isReachable } from '@bot/flow'
import type { FlowAvoidance } from '@bot/flow'
import { getTile, getAdjacentPositions, isWalkable } from '@game/dungeon'
import { computeDangerGrid, buildAvoidSet, getDangerThreshold, getScaledDangerThreshold } from '@bot/danger'
import { buildBotContext } from '@bot/context'

// MAX_FLOW_COST from flow.ts (not exported, so we duplicate)
const MAX_FLOW_COST = 255

/** Configuration for frontier analysis */
export interface FrontierAnalyzerConfig {
  /** Warn after this many consecutive turns with no goal */
  noGoalThreshold: number
  /** Warn if frontier exists but no valid target for this many turns */
  unreachableFrontierThreshold: number
  /** Log detailed frontier state every N turns when stuck */
  detailedLogInterval: number
}

const DEFAULT_CONFIG: FrontierAnalyzerConfig = {
  noGoalThreshold: 10,
  unreachableFrontierThreshold: 20,
  detailedLogInterval: 50,
}

interface FrontierSnapshot {
  turn: number
  frontierCount: number
  frontierWithEntryPoint: number
  frontierBlockedByDoor: number
  frontierNoEntry: number
  closedDoorCount: number
  explorationProgress: number
  hasGoal: boolean
  goalType: string | null
  // Flow reachability
  flowReachable: boolean
  flowCostAtBot: number
  explorationTarget: { x: number; y: number } | null
  botPosition: { x: number; y: number }
  // Avoidance info
  avoidSetSize: number
  flowWithAvoidReachable: boolean
  flowWithAvoidCost: number
  // Step candidate analysis
  adjacentAnalysis: string // Summary of why each adjacent tile is valid/invalid
  validCandidates: number
  // Cache state (from botState)
  cachedFlowDepth: number | null
  cachedFlowExploredCount: number | null
  cachedFlowComputedAt: number | null
  currentExploredCount: number
  // Context state - critical for diagnosing stale cache issues
  contextUnexploredLength: number
  // Sweep mode state (casters use sweep exploration at early levels)
  sweepMode: boolean
  sweepFrontierCount: number
  sweepFlowReachable: boolean
  sweepFlowCost: number
  // Farming mode state
  farmingMode: boolean
  tetheredRadius: number
}

export class FrontierAnalyzer implements Analyzer {
  readonly name = 'frontier'
  private config: FrontierAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Tracking state
  private noGoalStreak = 0
  private maxNoGoalStreak = 0
  private unreachableFrontierStreak = 0
  private totalNoGoalTurns = 0
  private totalTurns = 0

  // Snapshots for detailed analysis
  private snapshots: FrontierSnapshot[] = []
  private lastSnapshotTurn = -1

  // Aggregates
  private noGoalWhileFrontierExists = 0
  private doorBlockingEvents = 0
  private noGoalDuringFarming = 0
  private noGoalDuringSweep = 0

  constructor(config: Partial<FrontierAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.noGoalStreak = 0
    this.maxNoGoalStreak = 0
    this.unreachableFrontierStreak = 0
    this.totalNoGoalTurns = 0
    this.totalTurns = 0
    this.snapshots = []
    this.lastSnapshotTurn = -1
    this.noGoalWhileFrontierExists = 0
    this.doorBlockingEvents = 0
    this.noGoalDuringFarming = 0
    this.noGoalDuringSweep = 0
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++
    const { game, botState } = ctx

    // Check goal state
    const hasGoal = botState.currentGoal !== null
    const goalType = botState.currentGoal?.type ?? null

    if (!hasGoal) {
      this.noGoalStreak++
      this.totalNoGoalTurns++
      this.maxNoGoalStreak = Math.max(this.maxNoGoalStreak, this.noGoalStreak)
    } else {
      this.noGoalStreak = 0
    }

    // Analyze frontier state
    const frontierAnalysis = this.analyzeFrontier(game)
    const stats = getExplorationStats(game)

    // Detect "no goal but frontier exists" pattern
    if (!hasGoal && frontierAnalysis.total > 0) {
      this.noGoalWhileFrontierExists++

      // Track farming-related no-goal separately
      if (botState.farmingMode) {
        this.noGoalDuringFarming++
      }
      if (botState.sweepMode) {
        this.noGoalDuringSweep++
      }

      if (frontierAnalysis.withEntryPoint === 0 && frontierAnalysis.blockedByDoor > 0) {
        this.doorBlockingEvents++
      }
    }

    // Check for unreachable frontier streak
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
        turn: ctx.turn,
        context: {
          frontierTotal: frontierAnalysis.total,
          frontierReachable: frontierAnalysis.withEntryPoint,
          frontierBlockedByDoor: frontierAnalysis.blockedByDoor,
          closedDoors: frontierAnalysis.closedDoorCount,
          exploration: stats.progress,
        },
      })
    }

    // Warn on unreachable frontier
    if (this.unreachableFrontierStreak === this.config.unreachableFrontierThreshold) {
      this.issues.push({
        severity: 'warning',
        message: `Frontier exists but unreachable for ${this.config.unreachableFrontierThreshold} turns`,
        turn: ctx.turn,
        context: {
          frontierTotal: frontierAnalysis.total,
          blockedByDoor: frontierAnalysis.blockedByDoor,
          noEntryPoint: frontierAnalysis.noEntryPoint,
          closedDoors: frontierAnalysis.closedDoorCount,
        },
      })
    }

    // Capture detailed snapshot when stuck
    const shouldSnapshot =
      this.noGoalStreak > 0 &&
      ctx.turn - this.lastSnapshotTurn >= this.config.detailedLogInterval

    if (shouldSnapshot || (this.noGoalStreak === 1 && frontierAnalysis.total > 0)) {
      // Check flow reachability
      const pos = game.character.position
      const frontierPositions = getFrontierPositions(game)
      let flowReachable = false
      let flowCostAtBot = 255
      let flowWithAvoidReachable = false
      let flowWithAvoidCost = 255

      // Compute danger grid and avoidance (like the game does)
      // Use cautious personality values (aggression=30, caution=50) since that's what mage uses
      const dangerResult = computeDangerGrid(game)
      const dangerThreshold = getDangerThreshold(30, 50) // Cautious: aggression=30, caution=50 → threshold=85
      const avoidSet = buildAvoidSet(dangerResult.dangers, dangerThreshold, game.character)
      const avoidance: FlowAvoidance = {
        grid: dangerResult.dangers,
        threshold: getScaledDangerThreshold(dangerThreshold, game.character),
      }

      if (frontierPositions.length > 0) {
        // Flow WITHOUT avoidance
        const flowCosts = computeExplorationFlow(game.currentLevel, frontierPositions)
        flowReachable = isReachable(flowCosts, pos)
        flowCostAtBot = getFlowCost(flowCosts, pos)

        // Flow WITH avoidance
        const flowCostsWithAvoid = computeExplorationFlow(game.currentLevel, frontierPositions, avoidance)
        flowWithAvoidReachable = isReachable(flowCostsWithAvoid, pos)
        flowWithAvoidCost = getFlowCost(flowCostsWithAvoid, pos)
      }

      // Get what findExplorationTarget would return
      const explorationTarget = findExplorationTarget(game, botState)

      // Analyze adjacent tiles like selectStep would
      const adjacent = getAdjacentPositions(pos)
      const occupied = new Set<string>()
      for (const monster of game.monsters) {
        occupied.add(`${monster.position.x},${monster.position.y}`)
      }

      const adjAnalysis: string[] = []
      let validCandidates = 0
      const flowCosts = frontierPositions.length > 0
        ? computeExplorationFlow(game.currentLevel, frontierPositions)
        : null

      for (const adj of adjacent) {
        const tile = getTile(game.currentLevel, adj.x, adj.y)
        const adjKey = `${adj.x},${adj.y}`
        const flowCost = flowCosts ? getFlowCost(flowCosts, adj) : MAX_FLOW_COST

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

      // Count explored tiles like the game does
      let currentExploredCount = 0
      for (let y = 0; y < game.currentLevel.height; y++) {
        const row = game.currentLevel.tiles[y]
        if (!row) continue
        for (let x = 0; x < game.currentLevel.width; x++) {
          if (row[x]?.explored) currentExploredCount++
        }
      }

      // Get cache state from botState
      const cache = botState.cachedExplorationFlow

      // Get context.unexploredTiles.length (critical for diagnosing stale cache)
      // Use 'cautious' personality (same as most tests)
      const context = buildBotContext(game, 'cautious', botState)
      const contextUnexploredLength = context.unexploredTiles.length

      // Check sweep mode - trust the bot's sweep state (now configurable per-slot)
      const sweepMode = botState.sweepMode

      // Get sweep frontiers (explored tiles not seen this visit)
      const sweepFrontiers = sweepMode ? getSweepFrontierPositions(game, botState) : []
      let sweepFlowReachable = false
      let sweepFlowCost = 255

      if (sweepFrontiers.length > 0) {
        const sweepFlowCosts = computeExplorationFlow(game.currentLevel, sweepFrontiers, avoidance)
        sweepFlowReachable = isReachable(sweepFlowCosts, pos)
        sweepFlowCost = getFlowCost(sweepFlowCosts, pos)
      }

      this.snapshots.push({
        turn: ctx.turn,
        frontierCount: frontierAnalysis.total,
        frontierWithEntryPoint: frontierAnalysis.withEntryPoint,
        frontierBlockedByDoor: frontierAnalysis.blockedByDoor,
        frontierNoEntry: frontierAnalysis.noEntryPoint,
        closedDoorCount: frontierAnalysis.closedDoorCount,
        explorationProgress: stats.progress,
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
        cachedFlowDepth: cache?.depth ?? null,
        cachedFlowExploredCount: cache?.exploredCount ?? null,
        cachedFlowComputedAt: cache?.computedAt ?? null,
        currentExploredCount,
        contextUnexploredLength,
        sweepMode,
        sweepFrontierCount: sweepFrontiers.length,
        sweepFlowReachable,
        sweepFlowCost,
        farmingMode: botState.farmingMode,
        tetheredRadius: botState.tetheredRadius,
      })
      this.lastSnapshotTurn = ctx.turn
    }
  }

  onLevelChange(_game: GameState, _oldDepth: number, _newDepth: number): void {
    // Reset per-level tracking
    this.noGoalStreak = 0
    this.unreachableFrontierStreak = 0
  }

  onEnd(_game: GameState, _reason: EndReason): void {
    // Final issue if ended with long no-goal streak
    if (this.noGoalStreak > this.config.noGoalThreshold * 2) {
      this.issues.push({
        severity: 'error',
        message: `Ended with ${this.noGoalStreak} consecutive no-goal turns`,
        turn: this.totalTurns,
      })
    }
  }

  summarize(): AnalyzerResult {
    const noGoalRate =
      this.totalTurns > 0 ? (this.totalNoGoalTurns / this.totalTurns) * 100 : 0

    // Calculate how many no-goal events are farming-related vs real issues
    const realNoGoalIssues = this.noGoalWhileFrontierExists - this.noGoalDuringFarming - this.noGoalDuringSweep
    const hasSignificantFarmingNoGoal = this.noGoalDuringFarming > 0 || this.noGoalDuringSweep > 0

    const details: string[] = [
      `No-goal turns: ${this.totalNoGoalTurns}/${this.totalTurns} (${noGoalRate.toFixed(1)}%)`,
      `Max no-goal streak: ${this.maxNoGoalStreak}`,
      `No-goal while frontier exists: ${this.noGoalWhileFrontierExists}`,
      `Door blocking events: ${this.doorBlockingEvents}`,
    ]

    // Add farming context if relevant
    if (hasSignificantFarmingNoGoal) {
      details.push('')
      details.push('No-goal breakdown:')
      details.push(`  During farming mode: ${this.noGoalDuringFarming}`)
      details.push(`  During sweep mode: ${this.noGoalDuringSweep}`)
      details.push(`  Real issues (non-farming): ${Math.max(0, realNoGoalIssues)}`)
    }

    // Add snapshot summary if we captured any
    if (this.snapshots.length > 0) {
      details.push('', 'Frontier snapshots when stuck:')
      for (const snap of this.snapshots.slice(0, 5)) {
        const flowInfo = snap.flowReachable
          ? `flowOK cost=${snap.flowCostAtBot}`
          : `FLOW_BLOCKED cost=${snap.flowCostAtBot}`
        const avoidInfo = snap.avoidSetSize > 0
          ? `avoid=${snap.avoidSetSize} ${snap.flowWithAvoidReachable ? 'reachable' : 'BLOCKED'}`
          : 'avoid=0'
        const targetInfo = snap.explorationTarget
          ? `target=(${snap.explorationTarget.x},${snap.explorationTarget.y})`
          : 'target=NULL'
        const stepInfo = `candidates=${snap.validCandidates}/8`
        details.push(
          `  Turn ${snap.turn} @ (${snap.botPosition.x},${snap.botPosition.y}): frontier=${snap.frontierCount} ${flowInfo} ${avoidInfo} ${stepInfo} ${targetInfo}`
        )
        // Show adjacent analysis on separate line for clarity
        details.push(`    Adjacent: ${snap.adjacentAnalysis}`)
        // Show cache state and context.unexploredTiles state
        const cacheInfo = snap.cachedFlowComputedAt !== null
          ? `cache: turn=${snap.cachedFlowComputedAt} explored=${snap.cachedFlowExploredCount} (current=${snap.currentExploredCount})`
          : 'cache: none'
        // contextUnexploredLength=0 means getExploreGoal returns null early!
        const unexploredInfo = snap.contextUnexploredLength === 0
          ? 'CONTEXT_UNEXPLORED=0 (BUG: stale cache!)'
          : `contextUnexplored=${snap.contextUnexploredLength}`
        details.push(`    ${cacheInfo} | ${unexploredInfo}`)
        // Show sweep mode info (critical for casters at early levels!)
        if (snap.sweepMode) {
          const sweepInfo = snap.sweepFlowReachable
            ? `sweepFrontiers=${snap.sweepFrontierCount} sweepFlowOK cost=${snap.sweepFlowCost}`
            : `sweepFrontiers=${snap.sweepFrontierCount} SWEEP_FLOW_BLOCKED cost=${snap.sweepFlowCost}`
          details.push(`    SWEEP_MODE: ${sweepInfo}`)
        }
        // Show farming mode info
        if (snap.farmingMode) {
          details.push(`    FARMING_MODE: tetheredRadius=${snap.tetheredRadius}`)
        }
      }
      if (this.snapshots.length > 5) {
        details.push(`  ... and ${this.snapshots.length - 5} more snapshots`)
      }
    }

    return {
      name: this.name,
      metrics: {
        noGoalTurns: this.totalNoGoalTurns,
        noGoalRate: Math.round(noGoalRate * 10) / 10,
        maxNoGoalStreak: this.maxNoGoalStreak,
        noGoalWhileFrontierExists: this.noGoalWhileFrontierExists,
        noGoalDuringFarming: this.noGoalDuringFarming,
        noGoalDuringSweep: this.noGoalDuringSweep,
        realNoGoalIssues: Math.max(0, realNoGoalIssues),
        doorBlockingEvents: this.doorBlockingEvents,
        snapshotCount: this.snapshots.length,
      },
      issues: this.issues,
      details,
    }
  }

  /** Get all captured snapshots for detailed analysis */
  getSnapshots(): FrontierSnapshot[] {
    return this.snapshots
  }

  /**
   * Analyze frontier tiles and categorize why they may be unreachable
   */
  private analyzeFrontier(game: GameState): {
    total: number
    withEntryPoint: number
    blockedByDoor: number
    noEntryPoint: number
    closedDoorCount: number
  } {
    const level = game.currentLevel
    const frontier = findFrontierTiles(game)

    let withEntryPoint = 0
    let blockedByDoor = 0
    let noEntryPoint = 0

    // Count closed doors on the level
    let closedDoorCount = 0
    for (let y = 0; y < level.height; y++) {
      const row = level.tiles[y]
      if (!row) continue
      for (let x = 0; x < level.width; x++) {
        const tile = row[x]
        if (tile?.type === 'door_closed') {
          closedDoorCount++
        }
      }
    }

    // Analyze each frontier tile
    for (const f of frontier) {
      const neighbors = getAdjacentPositions(f.position)
      let hasExploredWalkable = false
      let hasClosedDoorNeighbor = false

      for (const neighbor of neighbors) {
        const tile = getTile(level, neighbor.x, neighbor.y)
        if (!tile) continue

        if (tile.explored && this.isWalkableOrDoor(tile)) {
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
      } else {
        noEntryPoint++
      }
    }

    return {
      total: frontier.length,
      withEntryPoint,
      blockedByDoor,
      noEntryPoint,
      closedDoorCount,
    }
  }

  private isWalkableOrDoor(tile: Tile): boolean {
    return isWalkable(tile) || tile.type === 'door_closed'
  }
}

/** Create a frontier analyzer with default config */
export function createFrontierAnalyzer(
  config?: Partial<FrontierAnalyzerConfig>
): FrontierAnalyzer {
  return new FrontierAnalyzer(config)
}
