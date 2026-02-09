/**
 * Exploration Logic
 *
 * Handles efficient dungeon exploration with frontier detection,
 * smart target selection, and progress tracking.
 */

// Type declaration for Node.js process (used for debug logging in scripts)
declare const process: { env: Record<string, string | undefined> } | undefined

import type { GameState, Point, DungeonLevel, Direction } from '../types'
import { DIRECTION_VECTORS, chebyshevDistance, isMonsterAt } from '../types'
import type { BotState, BotGoal, BotContext } from './types'
import { seenGridHas } from './types'
import { getTile, getAdjacentPositions, countExploredTiles } from '../dungeon'

// Direction offsets for 8-way adjacency (inlined to avoid Point[] allocation)
const DX = [-1, 0, 1, -1, 1, -1, 0, 1]
const DY = [-1, -1, -1, 0, 0, 1, 1, 1]
import { isTargetBlacklisted } from './state'

// ============================================================================
// TYPES
// ============================================================================

/** A frontier tile with scoring information */
export interface FrontierTile {
  /** Position of the frontier tile */
  position: Point
  /** Number of unexplored neighbors (exploration potential) */
  unexploredNeighbors: number
  /** Distance from player position */
  distance: number
  /** Combined score (higher = better target) */
  score: number
}

/** Exploration cluster - group of nearby unexplored tiles */
export interface ExplorationCluster {
  /** Center of the cluster */
  center: Point
  /** Number of unexplored tiles in cluster */
  size: number
  /** Nearest explored walkable tile to reach cluster */
  entryPoint: Point | null
}

/** Exploration statistics */
export interface ExplorationStats {
  /** Total explorable tiles (floor, doors) */
  totalExplorableTiles: number
  /** Number of explored tiles */
  exploredTiles: number
  /** Exploration progress (0-100) */
  progress: number
  /** Number of frontier tiles */
  frontierSize: number
  /** Are stairs found? */
  stairsFound: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum distance to consider for exploration targets */
const MAX_EXPLORATION_DISTANCE = 50

/** Minimum cluster size to prioritize */
const MIN_CLUSTER_SIZE = 3

/** Strong bonus for continuing toward current goal target (prevents ping-ponging) */
const CURRENT_TARGET_PERSISTENCE_BONUS = 150

/** Bonus for targets near current goal target (same region) */
const NEAR_CURRENT_TARGET_BONUS = 75

/** Distance threshold for "near" current target */
const NEAR_TARGET_DISTANCE = 8

/** Hysteresis threshold: only switch targets if new one is this much better */
const TARGET_SWITCH_THRESHOLD = 30

/** Penalty for dead-end frontiers when better options exist */
const DEAD_END_PENALTY = 50

/** Minimum unexplored neighbors for "good" frontier */
const GOOD_FRONTIER_THRESHOLD = 2

/** Distance threshold below which short-distance penalty applies */
const SHORT_DISTANCE_THRESHOLD = 5

/** Penalty multiplier for short-distance targets (applied as (threshold - dist) * multiplier) */
const SHORT_DISTANCE_PENALTY_MULTIPLIER = 12

// ============================================================================
// FRONTIER CACHING
// ============================================================================

/** Cached frontier result (positions only, scores recalculated each call) */
interface FrontierCache {
  /** Frontier tile positions and unexplored neighbor counts (stable) */
  tiles: Array<{ position: Point; unexploredNeighbors: number }>
  /** Pre-mapped Point[] for getFrontierPositions (avoids re-allocation on cache hit) */
  positions: Point[]
  exploredCount: number
  levelDepth: number
}

/** Module-level frontier cache (reset on level change or when tiles explored) */
let frontierCache: FrontierCache | null = null

/**
 * Invalidate the frontier cache (call when level changes)
 */
export function invalidateFrontierCache(): void {
  frontierCache = null
}

/**
 * Get cached explored count (avoids redundant full level scans).
 * Returns null if cache is invalid for this depth.
 */
export function getCachedExploredCount(depth: number): number | null {
  if (frontierCache && frontierCache.levelDepth === depth) {
    return frontierCache.exploredCount
  }
  return null
}

// ============================================================================
// FRONTIER DETECTION
// ============================================================================

/**
 * Find all frontier tiles with scoring
 * Frontier = unexplored tiles adjacent to explored walkable tiles
 * Caches tile positions but recalculates distances/scores each call.
 */
export function findFrontierTiles(game: GameState): FrontierTile[] {
  const level = game.currentLevel
  const pos = game.character.position

  // Count explored tiles for cache invalidation
  const exploredCount = countExploredTiles(level)

  // Check if we need to recompute the frontier positions
  let cachedTiles: Array<{ position: Point; unexploredNeighbors: number }>
  if (
    frontierCache &&
    frontierCache.exploredCount === exploredCount &&
    frontierCache.levelDepth === game.character.depth
  ) {
    // Use cached tiles
    cachedTiles = frontierCache.tiles
  } else {
    // Compute fresh frontier positions
    cachedTiles = computeFrontierPositions(game)
    frontierCache = {
      tiles: cachedTiles,
      positions: cachedTiles.map((t) => t.position),
      exploredCount,
      levelDepth: game.character.depth,
    }
  }

  // Calculate distances and scores from current position (not cached)
  const frontier: FrontierTile[] = cachedTiles.map((t) => {
    const distance = chebyshevDistance(pos, t.position)
    const score = t.unexploredNeighbors * 10 - distance
    return {
      position: t.position,
      unexploredNeighbors: t.unexploredNeighbors,
      distance,
      score,
    }
  })

  // Sort by score (descending)
  frontier.sort((a, b) => b.score - a.score)

  return frontier
}

/**
 * Get frontier positions as simple Point array (for Dijkstra exploration flow)
 * Uses the same cache as findFrontierTiles for efficiency.
 */
export function getFrontierPositions(game: GameState): Point[] {
  const level = game.currentLevel

  // Count explored tiles for cache validation (O(1) via incremental counter)
  const exploredCount = countExploredTiles(level)

  // Check cache — return pre-mapped Point[] on hit (zero allocation)
  if (
    frontierCache &&
    frontierCache.exploredCount === exploredCount &&
    frontierCache.levelDepth === game.character.depth
  ) {
    return frontierCache.positions
  }

  // Cache miss - compute, cache tiles + positions
  const tiles = computeFrontierPositions(game)
  const positions = tiles.map((t) => t.position)
  frontierCache = {
    tiles,
    positions,
    exploredCount,
    levelDepth: game.character.depth,
  }
  return positions
}

/**
 * Get sweep frontier positions as simple Point array (for Dijkstra sweep flow).
 * Returns walkable EXPLORED tiles NOT seen this visit.
 * Must match findSweepFrontierTiles behavior for consistency.
 */
export function getSweepFrontierPositions(game: GameState, botState: BotState): Point[] {
  const level = game.currentLevel
  const result: Point[] = []

  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue

    for (let x = 0; x < level.width; x++) {
      const idx = y * level.width + x

      // Skip tiles already seen this visit
      if (seenGridHas(botState.seenThisVisit, x, y)) continue

      // Only consider explored walkable tiles (bitmap lookups, no tile object needed)
      if (!level.explored[idx]) continue
      if (!level.passable[idx]) continue

      result.push({ x, y })
    }
  }

  return result
}

/**
 * Find sweep frontier tiles - walkable tiles NOT seen this visit.
 * Used for sweep exploration to re-cover previously explored levels.
 * Returns same format as findFrontierTiles for compatibility.
 */
function findSweepFrontierTiles(game: GameState, botState: BotState): FrontierTile[] {
  const level = game.currentLevel
  const pos = game.character.position
  const result: FrontierTile[] = []

  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue

    for (let x = 0; x < level.width; x++) {
      const tile = row[x]
      if (!tile) continue

      // Skip tiles already seen this visit
      if (seenGridHas(botState.seenThisVisit, x, y)) continue

      // Only consider walkable tiles
      if (!level.passable[y * level.width + x]) continue

      // Count unseen neighbors (for scoring - prefer tiles that reveal more)
      let unseenNeighbors = 0
      for (let i = 0; i < 8; i++) {
        const nx = x + DX[i]!
        const ny = y + DY[i]!
        if (!seenGridHas(botState.seenThisVisit, nx, ny)) {
          unseenNeighbors++
        }
      }

      const distance = chebyshevDistance(pos, { x, y })
      const score = unseenNeighbors * 10 - distance

      result.push({
        position: { x, y },
        unexploredNeighbors: unseenNeighbors, // Reusing field name for compatibility
        distance,
        score,
      })
    }
  }

  // Sort by score (descending)
  result.sort((a, b) => b.score - a.score)
  return result
}

/**
 * Compute frontier positions (internal, for caching)
 */
function computeFrontierPositions(
  game: GameState
): Array<{ position: Point; unexploredNeighbors: number }> {
  const level = game.currentLevel
  const result: Array<{ position: Point; unexploredNeighbors: number }> = []

  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue

    for (let x = 0; x < level.width; x++) {
      const idx = y * level.width + x

      // Skip explored tiles (bitmap lookup, no tile object access needed)
      if (level.explored[idx]) continue

      const tile = row[x]
      if (!tile) continue

      // Only consider passable tiles or stairs as frontier
      if (!level.passable[idx] && tile.type !== 'stairs_down' && tile.type !== 'stairs_up') {
        continue
      }

      // Check if adjacent to explored walkable (all bitmap lookups)
      let hasExploredWalkable = false
      let unexploredCount = 0

      for (let i = 0; i < 8; i++) {
        const nx = x + DX[i]!
        const ny = y + DY[i]!
        if (nx < 0 || nx >= level.width || ny < 0 || ny >= level.height) continue
        const nIdx = ny * level.width + nx

        if (level.explored[nIdx] && level.passable[nIdx]) {
          hasExploredWalkable = true
        }
        if (!level.explored[nIdx]) {
          unexploredCount++
        }
      }

      if (hasExploredWalkable) {
        result.push({ position: { x, y }, unexploredNeighbors: unexploredCount })
      }
    }
  }

  return result
}

/**
 * Find the best exploration target
 * Returns an EXPLORED walkable tile adjacent to unexplored areas.
 * This ensures pathfinding can always reach the target.
 *
 * When sweepMode is true, targets tiles not seen this visit instead of
 * unexplored tiles. Used by casters to re-sweep previously explored levels.
 */
export function findExplorationTarget(
  game: GameState,
  botState: BotState,
  sweepMode: boolean = false
): Point | null {
  const level = game.currentLevel
  const pos = game.character.position

  // Get frontier tiles - either unexplored (normal) or unseen-this-visit (sweep)
  const frontier = sweepMode ? findSweepFrontierTiles(game, botState) : findFrontierTiles(game)

  if (frontier.length === 0) {
    return null
  }

  // Find the best entry point (explored tile adjacent to frontier)
  let bestTarget: Point | null = null
  let bestScore = -Infinity
  let currentTargetScore = -Infinity

  // Get current goal target for persistence
  const currentGoalTarget = botState.goalTarget

  // NOTE: We skip reachability pre-check here for performance.
  // Unreachable targets are handled by tick.ts flow computation.
  // This saves a full BFS per exploration evaluation (~40% of selectGoal time).

  // Check if good alternatives exist (for dead-end penalty logic)
  // Only penalize dead ends when there are better options available
  const hasGoodAlternatives = frontier.some((f) => f.unexploredNeighbors >= GOOD_FRONTIER_THRESHOLD)

  for (const f of frontier) {
    // In sweep mode, the frontier tile IS the target (already walkable)
    // In normal mode, find the explored entry point adjacent to the unexplored frontier
    let target: Point
    if (sweepMode) {
      target = f.position
    } else {
      const entryPoint = findNearestWalkableExplored(level, f.position)
      if (!entryPoint) continue
      target = entryPoint
    }

    // Skip blacklisted targets
    if (isTargetBlacklisted(botState, target, game.turn)) {
      continue
    }

    // Distance to the target
    const distance = chebyshevDistance(pos, target)
    if (distance > MAX_EXPLORATION_DISTANCE) continue

    // If we're at the target, skip to avoid getting stuck
    if (distance === 0) continue

    // Visit penalty: avoid areas near recent positions
    const visitPenalty = getRecentVisitPenalty(botState, target)

    // PERSISTENCE BONUS: Strong preference for current target or nearby tiles
    let persistenceBonus = 0
    if (currentGoalTarget) {
      // Is this the same tile as our current target?
      if (target.x === currentGoalTarget.x && target.y === currentGoalTarget.y) {
        persistenceBonus = CURRENT_TARGET_PERSISTENCE_BONUS
      } else {
        // Is this near our current target? (same region)
        const distToCurrentTarget = chebyshevDistance(target, currentGoalTarget)
        if (distToCurrentTarget <= NEAR_TARGET_DISTANCE) {
          persistenceBonus = NEAR_CURRENT_TARGET_BONUS - distToCurrentTarget * 5
        }
      }
    }

    // Directional consistency bonus
    let directionalBonus = 0
    if (currentGoalTarget && persistenceBonus === 0) {
      const currentDir = { x: currentGoalTarget.x - pos.x, y: currentGoalTarget.y - pos.y }
      const targetDir = { x: target.x - pos.x, y: target.y - pos.y }
      const dotProduct = currentDir.x * targetDir.x + currentDir.y * targetDir.y
      if (dotProduct > 0) {
        directionalBonus = Math.min(30, Math.floor(dotProduct / 2))
      } else if (dotProduct < 0) {
        directionalBonus = Math.max(-50, Math.floor(dotProduct / 2))
      }
    }

    // Dead-end penalty: penalize terminal frontiers in corridors when better options exist
    // Skip dead-end penalty in sweep mode (we want to cover everything)
    let deadEndPenalty = 0
    if (
      !sweepMode &&
      hasGoodAlternatives &&
      isLikelyDeadEnd(level, f.position, target, f.unexploredNeighbors)
    ) {
      deadEndPenalty = DEAD_END_PENALTY
    }

    // Short-distance penalty: discourage very close targets to reduce goal thrashing
    // Penalties: dist 1 = -48, dist 2 = -36, dist 3 = -24, dist 4 = -12
    const shortDistancePenalty =
      distance < SHORT_DISTANCE_THRESHOLD
        ? (SHORT_DISTANCE_THRESHOLD - distance) * SHORT_DISTANCE_PENALTY_MULTIPLIER
        : 0

    // Score: frontier potential + persistence + direction - distance - penalties
    const finalScore =
      f.unexploredNeighbors * 15 +
      persistenceBonus +
      directionalBonus -
      distance -
      visitPenalty -
      deadEndPenalty -
      shortDistancePenalty

    // Track current target's score for hysteresis
    if (currentGoalTarget && target.x === currentGoalTarget.x && target.y === currentGoalTarget.y) {
      currentTargetScore = finalScore - persistenceBonus // Raw score without persistence
    }

    if (finalScore > bestScore) {
      bestScore = finalScore
      bestTarget = target
    }
  }

  // Apply hysteresis: only switch if new target is significantly better
  if (bestTarget && currentGoalTarget && currentTargetScore > -Infinity) {
    const rawBestScore =
      bestScore -
      (bestTarget.x === currentGoalTarget.x && bestTarget.y === currentGoalTarget.y
        ? CURRENT_TARGET_PERSISTENCE_BONUS
        : 0)
    // If current target is still reasonable, stick with it
    if (rawBestScore < currentTargetScore + TARGET_SWITCH_THRESHOLD) {
      // Check if current target is still valid (not blacklisted, reachable)
      if (!isTargetBlacklisted(botState, currentGoalTarget, game.turn)) {
        const currentDist = chebyshevDistance(pos, currentGoalTarget)
        if (currentDist <= MAX_EXPLORATION_DISTANCE && currentDist > 0) {
          bestTarget = currentGoalTarget
        }
      }
    }
  }

  // Debug logging
  if (typeof process !== 'undefined' && process.env.DEBUG_EXPLORATION) {
    console.log(
      `[EXPLORE] pos=(${pos.x},${pos.y}) frontier=${frontier.length} bestTarget=${bestTarget ? `(${bestTarget.x},${bestTarget.y})` : 'null'}`
    )
  }

  return bestTarget
}

/**
 * Find nearest explored walkable tile to a position
 */
function findNearestWalkableExplored(level: DungeonLevel, pos: Point): Point | null {
  for (let i = 0; i < 8; i++) {
    const nx = pos.x + DX[i]!
    const ny = pos.y + DY[i]!
    if (nx < 0 || nx >= level.width || ny < 0 || ny >= level.height) continue
    const nIdx = ny * level.width + nx
    if (level.passable[nIdx] && level.explored[nIdx]) {
      return { x: nx, y: ny }
    }
  }

  // If no direct neighbor, return null and let caller handle
  return null
}

/**
 * Get penalty for recently visited positions
 */
function getRecentVisitPenalty(botState: BotState, pos: Point): number {
  let penalty = 0
  const recent = botState.recentPositions

  for (let i = 0; i < recent.length; i++) {
    const p = recent[i]
    if (!p) continue
    if (p.x === pos.x && p.y === pos.y) {
      // More recent = higher penalty
      penalty += 20 - i
    }
    // Also penalize nearby positions
    const dist = chebyshevDistance(p, pos)
    if (dist <= 2) {
      penalty += ((5 - dist) * (recent.length - i)) / recent.length
    }
  }

  return penalty
}

// ============================================================================
// EXPLORATION PROGRESS
// ============================================================================

/**
 * Calculate detailed exploration statistics.
 * Uses pre-computed level counters + cached frontier (no full-level scans).
 */
export function getExplorationStats(game: GameState): ExplorationStats {
  const level = game.currentLevel
  const progress = getExplorationProgress(game)
  const frontiers = getFrontierPositions(game)

  const stairsFound = level.stairsDown
    ? (getTile(level, level.stairsDown.x, level.stairsDown.y)?.explored ?? false)
    : false

  return {
    totalExplorableTiles: level.passableCount,
    exploredTiles: level.exploredPassableCount,
    progress,
    frontierSize: frontiers.length,
    stairsFound,
  }
}

/**
 * Get exploration progress as percentage (0-100).
 * O(1) — uses incrementally maintained counters on DungeonLevel.
 */
export function getExplorationProgress(game: GameState): number {
  const level = game.currentLevel
  return level.passableCount > 0
    ? Math.floor((level.exploredPassableCount / level.passableCount) * 100)
    : 100
}

/**
 * Check if exploration goal is met based on personality
 */
export function shouldStopExploring(
  game: GameState,
  botState: BotState,
  explorationThreshold: number,
  patienceThreshold: number
): boolean {
  const stats = getExplorationStats(game)

  // Stop if: explored enough
  if (stats.progress >= explorationThreshold) {
    return true
  }

  // Stop if: patience exceeded
  if (botState.turnsOnLevel >= patienceThreshold) {
    return true
  }

  // Stop if: no more frontier and stairs found
  if (stats.frontierSize === 0 && stats.stairsFound) {
    return true
  }

  return false
}

// ============================================================================
// CLUSTER DETECTION
// ============================================================================

/**
 * Find clusters of unexplored tiles
 * Useful for prioritizing exploration of larger unknown areas
 */
export function findExplorationClusters(game: GameState): ExplorationCluster[] {
  const level = game.currentLevel
  const visited = new Set<string>()
  const clusters: ExplorationCluster[] = []

  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue

    for (let x = 0; x < level.width; x++) {
      const key = `${x},${y}`
      if (visited.has(key)) continue

      const tile = row[x]
      if (!tile || tile.explored) continue

      // Found an unexplored tile - flood fill to find cluster
      const cluster = floodFillCluster(level, { x, y }, visited)
      if (cluster.size >= MIN_CLUSTER_SIZE) {
        clusters.push(cluster)
      }
    }
  }

  // Sort by size (largest first)
  clusters.sort((a, b) => b.size - a.size)

  return clusters
}

/**
 * Flood fill to find connected unexplored tiles
 */
function floodFillCluster(
  level: DungeonLevel,
  start: Point,
  globalVisited: Set<string>
): ExplorationCluster {
  const queue: Point[] = [start]
  const clusterTiles: Point[] = []
  let sumX = 0
  let sumY = 0
  let entryPoint: Point | null = null

  while (queue.length > 0) {
    const pos = queue.shift()!
    const key = `${pos.x},${pos.y}`

    if (globalVisited.has(key)) continue
    globalVisited.add(key)

    const tile = getTile(level, pos.x, pos.y)
    if (!tile || tile.explored) {
      // Check if this is a potential entry point
      if (tile?.explored && level.passable[pos.y * level.width + pos.x]) {
        if (!entryPoint) {
          entryPoint = pos
        }
      }
      continue
    }

    clusterTiles.push(pos)
    sumX += pos.x
    sumY += pos.y

    // Add neighbors within cluster radius
    const neighbors = getAdjacentPositions(pos)
    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`
      if (!globalVisited.has(neighborKey)) {
        queue.push(neighbor)
      }
    }
  }

  // Find entry point if not found during fill
  if (!entryPoint && clusterTiles.length > 0) {
    for (const clusterTile of clusterTiles) {
      entryPoint = findNearestWalkableExplored(level, clusterTile)
      if (entryPoint) break
    }
  }

  const center =
    clusterTiles.length > 0
      ? { x: Math.floor(sumX / clusterTiles.length), y: Math.floor(sumY / clusterTiles.length) }
      : start

  return {
    center,
    size: clusterTiles.length,
    entryPoint,
  }
}

/**
 * Find the best cluster to explore
 */
export function findBestCluster(game: GameState, botState: BotState): ExplorationCluster | null {
  const clusters = findExplorationClusters(game)
  const pos = game.character.position

  if (clusters.length === 0) return null

  // Score clusters by size and distance
  let best: ExplorationCluster | null = null
  let bestScore = -Infinity

  for (const cluster of clusters) {
    if (!cluster.entryPoint) continue

    const distance = chebyshevDistance(pos, cluster.entryPoint)
    const visitPenalty = getRecentVisitPenalty(botState, cluster.entryPoint)
    // Prefer larger clusters, penalize distance and recent visits
    const score = cluster.size * 5 - distance - visitPenalty

    if (score > bestScore) {
      bestScore = score
      best = cluster
    }
  }

  return best
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a frontier is likely a dead end.
 * Dead ends have low exploration potential (1 unexplored neighbor)
 * and are accessed through narrow corridors.
 */
function isLikelyDeadEnd(
  level: DungeonLevel,
  _frontierPos: Point,
  entryPoint: Point,
  unexploredNeighbors: number
): boolean {
  // Terminal frontiers (only 1 unexplored neighbor) are dead-end candidates
  if (unexploredNeighbors > 1) return false

  // Check if entry point is in a narrow passage (corridor)
  // Count walkable neighbors of entry point
  let walkableCount = 0
  for (let i = 0; i < 8; i++) {
    const nx = entryPoint.x + DX[i]!
    const ny = entryPoint.y + DY[i]!
    if (
      nx >= 0 &&
      nx < level.width &&
      ny >= 0 &&
      ny < level.height &&
      level.passable[ny * level.width + nx]
    ) {
      walkableCount++
    }
  }

  // Narrow passage = 2-3 walkable neighbors (corridor or L-bend)
  // Wide area = 4+ neighbors (room, intersection)
  return walkableCount <= 3
}

// ============================================================================
// LABYRINTH / CORRIDOR EXPLORATION
// ============================================================================

/** Labyrinth exploration uses lower threshold since dead ends add little value */
const LABYRINTH_EXPLORATION_MODIFIER = 0.75

/**
 * Check if the current level is a labyrinth
 */
export function isLabyrinthLevel(game: GameState): boolean {
  return game.currentLevel.generatorType === 'labyrinth'
}

/**
 * Get adjusted exploration threshold for labyrinths
 * Labyrinths have many dead-end corridors that aren't worth fully exploring
 */
export function getLabyrinthExplorationThreshold(baseThreshold: number): number {
  return Math.floor(baseThreshold * LABYRINTH_EXPLORATION_MODIFIER)
}

/**
 * Check if a position is in a narrow corridor (1-2 walkable neighbors in line)
 * Corridors have walls on 2+ opposite sides
 */
export function isInCorridor(game: GameState, pos: Point): boolean {
  const level = game.currentLevel

  // Count walkable neighbors in each direction pair
  const n = isWalkableTile(level, pos.x, pos.y - 1)
  const s = isWalkableTile(level, pos.x, pos.y + 1)
  const e = isWalkableTile(level, pos.x + 1, pos.y)
  const w = isWalkableTile(level, pos.x - 1, pos.y)

  // Corridor = open in one axis, blocked in other
  const nsOpen = n || s
  const ewOpen = e || w
  const nsBlocked = !n && !s
  const ewBlocked = !e && !w

  // Classic corridor: open N-S, blocked E-W (or vice versa)
  if ((nsOpen && ewBlocked) || (ewOpen && nsBlocked)) {
    return true
  }

  // Also detect L-bends: exactly 2 adjacent walkable tiles that aren't opposite
  const walkableCount = [n, s, e, w].filter(Boolean).length
  if (walkableCount === 2) {
    // Check if the two walkable tiles are NOT opposite each other
    const isOpposite = (n && s) || (e && w)
    if (!isOpposite) {
      return true // L-bend or corner
    }
  }

  return false
}

/**
 * Check if a tile at position is walkable
 */
function isWalkableTile(level: DungeonLevel, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false
  return !!level.passable[y * level.width + x]
}

/**
 * Find the best direction to continue corridor exploration
 * Prefers continuing in the same direction, then turning
 * Only returns targets with unexplored potential to avoid oscillation
 */
export function findCorridorContinuation(game: GameState, botState: BotState): Point | null {
  const pos = game.character.position
  const level = game.currentLevel
  const facing = botState.corridorFacing

  // Get all walkable neighbors with exploration potential
  const candidates: {
    pos: Point
    dir: Direction
    unexplored: number
    isContinuation: boolean
    isRecent: boolean
  }[] = []

  const cardinalDirs: Direction[] = ['n', 's', 'e', 'w']

  for (const dir of cardinalDirs) {
    const delta = DIRECTION_VECTORS[dir]
    const target = { x: pos.x + delta.x, y: pos.y + delta.y }

    if (!isWalkableTile(level, target.x, target.y)) continue

    // Check if occupied by monster
    if (isMonsterAt(game.monsters, target)) continue

    // Count unexplored neighbors of target (exploration potential)
    let unexploredCount = 0
    for (let i = 0; i < 8; i++) {
      const ax = target.x + DX[i]!
      const ay = target.y + DY[i]!
      if (ax < 0 || ax >= level.width || ay < 0 || ay >= level.height) continue
      if (!level.passable[ay * level.width + ax]) continue
      const adjTile = getTile(level, ax, ay)
      if (adjTile && !adjTile.explored) {
        unexploredCount++
      }
    }

    // Check if recently visited (last 5 positions) to avoid oscillation
    const isRecent = botState.recentPositions
      .slice(-5)
      .some((p) => p.x === target.x && p.y === target.y)

    // Prefer continuing in same direction
    const isContinuation = dir === facing

    candidates.push({
      pos: target,
      dir,
      unexplored: unexploredCount,
      isContinuation,
      isRecent,
    })
  }

  if (candidates.length === 0) return null

  // Filter to only candidates with exploration potential OR not recently visited
  // This prevents oscillation while still allowing forward movement
  const validCandidates = candidates.filter((c) => c.unexplored > 0 || !c.isRecent)

  // If no valid candidates, corridor exploration is exhausted
  if (validCandidates.length === 0) return null

  // Sort: prefer unexplored potential, then continuation, then not-recent
  validCandidates.sort((a, b) => {
    // First: prefer tiles with unexplored potential
    if (a.unexplored > 0 && b.unexplored === 0) return -1
    if (a.unexplored === 0 && b.unexplored > 0) return 1

    // Second: prefer continuation direction
    if (a.isContinuation && !b.isContinuation) return -1
    if (!a.isContinuation && b.isContinuation) return 1

    // Third: prefer not recently visited
    if (!a.isRecent && b.isRecent) return -1
    if (a.isRecent && !b.isRecent) return 1

    // Finally: by unexplored count
    return b.unexplored - a.unexplored
  })

  const best = validCandidates[0]
  if (!best) return null

  // Update facing direction
  botState.corridorFacing = best.dir

  return best.pos
}

/**
 * Find exploration target with labyrinth-aware logic
 * In labyrinths, prefer corridor-following over frontier optimization,
 * but exit corridor mode if there's a significantly better target elsewhere.
 */
export function findLabyrinthExplorationTarget(game: GameState, botState: BotState): Point | null {
  const pos = game.character.position

  // First, get the best frontier-based target for comparison
  const frontierTarget = findExplorationTarget(game, botState)
  const frontierDist = frontierTarget ? chebyshevDistance(pos, frontierTarget) : Infinity

  // If already in corridor-following mode, check if we should continue
  if (botState.corridorFollowingMode) {
    const continuation = findCorridorContinuation(game, botState)
    if (continuation) {
      // If there's a good frontier target that's not too far (within 8 tiles),
      // and we've been corridor-following for a while (implied by distance to target),
      // consider switching to frontier-based exploration
      if (frontierTarget && frontierDist <= 8 && frontierDist > 2) {
        // Exit corridor mode and pursue the better target
        botState.corridorFollowingMode = false
        botState.corridorFacing = null
        return frontierTarget
      }
      return continuation
    }
    // Corridor ended - exit corridor mode and fall through to normal exploration
    botState.corridorFollowingMode = false
    botState.corridorFacing = null
  }

  // Check if we should enter corridor-following mode
  const inCorridor = isInCorridor(game, pos)
  if (inCorridor) {
    // Only enter corridor mode if the frontier target is far away (> 8 tiles)
    // or doesn't exist. This prevents getting stuck in dead-end corridors
    // when there's a good target relatively nearby.
    const shouldEnterCorridorMode = !frontierTarget || frontierDist > 8

    if (shouldEnterCorridorMode) {
      const continuation = findCorridorContinuation(game, botState)
      if (continuation) {
        botState.corridorFollowingMode = true
        return continuation
      }
    }
  }

  // Use frontier-based exploration if available
  if (frontierTarget) {
    return frontierTarget
  }

  // Fall back to weighted exploration (prefers nearby targets)
  return findExplorationTargetWithDistanceWeight(game, botState, 2.0)
}

/**
 * Find exploration target with configurable distance weight
 * Higher distanceWeight penalizes far targets more (good for labyrinths)
 */
function findExplorationTargetWithDistanceWeight(
  game: GameState,
  botState: BotState,
  distanceWeight: number
): Point | null {
  const level = game.currentLevel
  const pos = game.character.position

  const frontier = findFrontierTiles(game)
  if (frontier.length === 0) return null

  let bestTarget: Point | null = null
  let bestScore = -Infinity

  for (const f of frontier) {
    const entryPoint = findNearestWalkableExplored(level, f.position)
    if (!entryPoint) continue

    const distanceToEntry = chebyshevDistance(pos, entryPoint)
    if (distanceToEntry > MAX_EXPLORATION_DISTANCE) continue

    const visitPenalty = getRecentVisitPenalty(botState, entryPoint)

    // Apply distance weight - higher weight = prefer closer targets
    const finalScore = f.score - distanceToEntry * distanceWeight - visitPenalty

    if (finalScore > bestScore) {
      bestScore = finalScore
      bestTarget = entryPoint
    }
  }

  return bestTarget
}

/**
 * Reset corridor-following state (call when goal changes or combat starts)
 */
export function resetCorridorFollowing(botState: BotState): void {
  botState.corridorFollowingMode = false
  botState.corridorFacing = null
}

// ============================================================================
// DEBUGGING
// ============================================================================

/**
 * Get exploration debug info
 */
export function getExplorationDebugInfo(game: GameState, botState: BotState): string {
  const stats = getExplorationStats(game)
  const target = findExplorationTarget(game, botState)
  const clusters = findExplorationClusters(game)

  const lines = [
    `Exploration: ${stats.progress}% (${stats.exploredTiles}/${stats.totalExplorableTiles})`,
    `Frontier: ${stats.frontierSize} tiles`,
    `Clusters: ${clusters.length} (largest: ${clusters[0]?.size ?? 0})`,
    `Stairs: ${stats.stairsFound ? 'FOUND' : 'not found'}`,
    `Target: ${target ? `(${target.x},${target.y})` : 'none'}`,
  ]

  return lines.join(' | ')
}

// ============================================================================
// GOAL CREATION (exploration domain)
// ============================================================================

/**
 * Get EXPLORE goal - find unexplored areas.
 * Uses labyrinth-aware exploration for maze levels.
 *
 * Note: Sweep exploration for casters is handled by getProgressionGoal in
 * progression.ts. This function only handles normal frontier-based exploration.
 */
export function getExploreGoal(context: BotContext): BotGoal | null {
  const { game, unexploredTiles, botState } = context

  if (unexploredTiles.length === 0) return null

  let target

  if (isLabyrinthLevel(game)) {
    target = findLabyrinthExplorationTarget(game, botState)
  } else {
    // Standard exploration for other level types
    // Reset corridor-following if we were in a labyrinth before
    resetCorridorFollowing(botState)
    target = findExplorationTarget(game, botState)
  }

  if (!target) return null

  return {
    type: 'EXPLORE',
    target,
    targetId: null,
    reason: isLabyrinthLevel(game) ? 'Exploring labyrinth' : 'Exploring dungeon',
    startTurn: game.turn,
  }
}
