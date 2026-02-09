/**
 * Movement and Step Selection
 *
 * Select the best step toward goal using flow costs and anti-oscillation.
 */

import type { Point, GameState, Direction } from '../types'
import { getTile, isWalkable, getAdjacentPositions } from '../dungeon'
import { getDirectionFromDelta, isAdjacent } from '../types'

// Re-export for convenience
export { isAdjacent }
import type { BotState } from './types'
import type { FlowGrid } from './flow'
import { MAX_FLOW_COST } from './flow'
import { getRecencyPenalty } from './state'

// Direction offsets for 8-way adjacency (same order as DX/DY in exploration.ts)
const DX = [-1, 0, 1, -1, 1, -1, 0, 1]
const DY = [-1, -1, -1, 0, 0, 1, 1, 1]

/** Pre-computed direction for each DX/DY index */
const DIR_FROM_INDEX: Direction[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

/** Whether each direction index is cardinal (n/s/e/w) */
const IS_CARDINAL = [false, true, false, true, true, false, true, false]

/**
 * Select the best step toward goal using flow costs
 *
 * Uses inlined DX/DY + passability bitmap instead of getAdjacentPositions + getTile.
 * Tracks best candidate inline instead of allocating StepCandidate objects + sorting.
 *
 * @param game - Current game state
 * @param botState - Bot's persistent state (for history)
 * @param flowCosts - Pre-computed flow costs from goal
 * @returns Direction to move, or 'wait' if stuck
 */
export function selectStep(game: GameState, botState: BotState, flowCosts: FlowGrid): Direction {
  const pos = game.character.position
  const { width, height } = flowCosts
  const flowData = flowCosts.data
  const currentCost = flowData[pos.y * width + pos.x]!

  // If we're at the goal (cost 0), don't move
  if (currentCost === 0) {
    return 'wait'
  }

  const level = game.currentLevel
  const passable = level.passable
  const monsters = game.monsters

  let bestDirection: Direction = 'wait'
  let bestScore = Infinity

  for (let i = 0; i < 8; i++) {
    const nx = pos.x + DX[i]!
    const ny = pos.y + DY[i]!

    // Bounds check
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue

    // Passability check (bitmap — includes walkable tiles + closed doors)
    const nIdx = ny * width + nx
    if (!passable[nIdx]) continue

    // Flow cost (unreachable = skip)
    const flowCost = flowData[nIdx]!
    if (flowCost >= MAX_FLOW_COST) continue

    // Skip if occupied by monster (inline linear scan)
    let isOccupied = false
    for (let mi = 0; mi < monsters.length; mi++) {
      const m = monsters[mi]!
      if (m.position.x === nx && m.position.y === ny) {
        isOccupied = true
        break
      }
    }
    if (isOccupied) continue

    // Progress penalty
    let progressPenalty = 0
    if (flowCost > currentCost) {
      progressPenalty = 100 // Moving away from goal
    } else if (flowCost === currentCost) {
      progressPenalty = 50 // Sideways movement
    }

    // Recency penalty (anti-oscillation)
    const visitPenalty = getRecencyPenalty(botState, { x: nx, y: ny })

    // Total score (lower is better)
    const totalScore = flowCost + progressPenalty + (IS_CARDINAL[i] ? -5 : 0) + visitPenalty

    if (totalScore < bestScore) {
      bestScore = totalScore
      bestDirection = DIR_FROM_INDEX[i]!
    }
  }

  return bestDirection
}

/**
 * Get the direction to move toward a specific adjacent target
 * Used when we know exactly where we want to go
 */
export function getDirectionTo(from: Point, to: Point): Direction | null {
  const dx = to.x - from.x
  const dy = to.y - from.y

  // Must be adjacent
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return null
  if (dx === 0 && dy === 0) return 'wait'

  return getDirectionFromDelta(dx, dy)
}

/**
 * Get all walkable adjacent positions
 */
export function getWalkableAdjacent(game: GameState, pos: Point): Point[] {
  const adjacent = getAdjacentPositions(pos)
  const walkable: Point[] = []

  for (const adj of adjacent) {
    const tile = getTile(game.currentLevel, adj.x, adj.y)
    if (tile && (isWalkable(tile) || tile.type === 'door_closed')) {
      walkable.push(adj)
    }
  }

  return walkable
}
