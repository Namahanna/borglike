/**
 * Dungeon generation and utilities
 *
 * This module re-exports the new modular dungeon generation system
 * while maintaining backward compatibility with existing code.
 *
 * For level generation, uses the dungeon/ module which provides:
 * - Multiple generator types (classic, cavern, labyrinth)
 * - Depth-based scaling of parameters
 * - Door placement
 * - Vault system
 * - Connectivity validation
 */

import { FOV, Path } from 'rot-js'
import type { DungeonLevel, Point, Tile, TileType } from './types'
import { randomInt } from './rng'

// Re-export generateLevel from new module
export { generateLevel, generateLevelWithInfo } from './dungeon/index'
export type { GeneratorType, DepthProfile, RoomData, VaultPlacement } from './dungeon/index'
export { getDepthProfile, selectGenerator, VAULTS } from './dungeon/index'

// ============================================================================
// TILE UTILITIES
// ============================================================================

/**
 * Get a tile at the specified position
 */
export function getTile(level: DungeonLevel, x: number, y: number): Tile | null {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) {
    return null
  }
  const row = level.tiles[y]
  return row ? (row[x] ?? null) : null
}

/**
 * Set the type of a tile at the specified position
 */
export function setTile(level: DungeonLevel, x: number, y: number, type: TileType): void {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) {
    return
  }
  const row = level.tiles[y]
  const tile = row?.[x]
  if (tile) tile.type = type
}

/**
 * Check if a tile is walkable (can be moved onto)
 */
export function isWalkable(tile: Tile): boolean {
  return (
    tile.type === 'floor' ||
    tile.type === 'door_open' ||
    tile.type === 'stairs_up' ||
    tile.type === 'stairs_down' ||
    tile.type === 'portal' ||
    tile.type === 'dungeon_entrance' ||
    tile.type === 'healer' ||
    // Town decorative tiles (all walkable)
    tile.type === 'cobblestone' ||
    tile.type === 'town_door' ||
    tile.type === 'rubble' ||
    tile.type === 'town_fountain'
  )
}

/**
 * Check if a tile blocks light/vision
 */
export function isOpaque(tile: Tile): boolean {
  return tile.type === 'wall' || tile.type === 'door_closed'
}

// ============================================================================
// PASSABILITY BITMAP
// ============================================================================

/**
 * Build pre-computed passability bitmap for a level.
 * 1 = walkable or door (bot can open), 0 = wall/impassable.
 * Indexed by y * width + x. Immutable after generation since door_closed
 * and door_open are both passable for bot pathfinding.
 */
export function buildPassabilityBitmap(level: DungeonLevel): Uint8Array {
  const { width, height, tiles } = level
  const bitmap = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = tiles[y]
    if (!row) continue
    for (let x = 0; x < width; x++) {
      const tile = row[x]
      if (tile && (isWalkable(tile) || tile.type === 'door_closed')) {
        bitmap[y * width + x] = 1
      }
    }
  }
  return bitmap
}

/**
 * Build explored bitmap for a level.
 * 1 = explored, indexed by y * width + x. Mutable — updated as tiles are explored.
 */
export function buildExploredBitmap(level: DungeonLevel): Uint8Array {
  const { width, height, tiles } = level
  const bitmap = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = tiles[y]
    if (!row) continue
    for (let x = 0; x < width; x++) {
      const tile = row[x]
      if (tile?.explored) {
        bitmap[y * width + x] = 1
      }
    }
  }
  return bitmap
}

// ============================================================================
// POSITION UTILITIES
// ============================================================================

/**
 * Find a random walkable position on the level
 */
export function findOpenPosition(level: DungeonLevel): Point {
  const positions = findOpenPositions(level, 1)
  if (positions.length === 0 || !positions[0]) {
    throw new Error('No walkable positions found on level')
  }
  return positions[0]
}

/**
 * Find multiple random walkable positions on the level
 */
export function findOpenPositions(level: DungeonLevel, count: number): Point[] {
  const walkable: Point[] = []

  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue
    for (let x = 0; x < level.width; x++) {
      const tile = row[x]
      if (tile && isWalkable(tile)) {
        walkable.push({ x, y })
      }
    }
  }

  // Shuffle and return requested count
  shuffleArray(walkable)
  return walkable.slice(0, count)
}

/**
 * Get all 8 adjacent positions (including diagonals)
 */
export function getAdjacentPositions(pos: Point): Point[] {
  return [
    { x: pos.x - 1, y: pos.y - 1 }, // NW
    { x: pos.x, y: pos.y - 1 }, // N
    { x: pos.x + 1, y: pos.y - 1 }, // NE
    { x: pos.x - 1, y: pos.y }, // W
    { x: pos.x + 1, y: pos.y }, // E
    { x: pos.x - 1, y: pos.y + 1 }, // SW
    { x: pos.x, y: pos.y + 1 }, // S
    { x: pos.x + 1, y: pos.y + 1 }, // SE
  ]
}

/**
 * Calculate Euclidean distance between two points
 */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate Manhattan distance between two points
 */
export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
}

/** Count explored tiles on a level (returns incrementally maintained counter) */
export function countExploredTiles(level: DungeonLevel): number {
  return level.exploredCount
}

// ============================================================================
// FIELD OF VIEW
// ============================================================================

/**
 * Compute field of view from a position
 *
 * Uses rot.js PreciseShadowcasting algorithm.
 * Updates tile.visible and tile.explored flags.
 */
export function computeFOV(level: DungeonLevel, origin: Point, radius: number): Set<string> {
  const visible = new Set<string>()

  // Reset visibility for all tiles
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue
    for (let x = 0; x < level.width; x++) {
      const tile = row[x]
      if (tile) tile.visible = false
    }
  }

  // Create FOV calculator
  const fov = new FOV.PreciseShadowcasting((x: number, y: number) => {
    const tile = getTile(level, x, y)
    return tile !== null && !isOpaque(tile)
  })

  // Compute visible tiles
  fov.compute(
    origin.x,
    origin.y,
    radius,
    (x: number, y: number, _r: number, visibility: number) => {
      if (visibility > 0) {
        const tile = getTile(level, x, y)
        if (tile) {
          tile.visible = true
          if (!tile.explored) {
            tile.explored = true
            const idx = y * level.width + x
            level.explored[idx] = 1
            level.exploredCount++
            if (level.passable[idx]) level.exploredPassableCount++
          }
          visible.add(`${x},${y}`)
        }
      }
    }
  )

  return visible
}

/**
 * Set all tiles in a level as visible and explored
 *
 * Used for town level where everything should always be visible.
 */
export function setAllTilesVisible(level: DungeonLevel): void {
  let explored = 0
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue
    for (let x = 0; x < level.width; x++) {
      const tile = row[x]
      if (tile) {
        tile.visible = true
        tile.explored = true
        explored++
      }
    }
  }
  level.exploredCount = explored
  level.explored.fill(1)
  level.exploredPassableCount = level.passableCount
}

// ============================================================================
// PATHFINDING
// ============================================================================

/**
 * Find a path between two points using A* algorithm
 */
export function findPath(level: DungeonLevel, from: Point, to: Point): Point[] {
  const path: Point[] = []

  // Check if start and end are valid
  const startTile = getTile(level, from.x, from.y)
  const endTile = getTile(level, to.x, to.y)

  if (!startTile || !endTile) {
    return []
  }

  if (!isWalkable(startTile) || !isWalkable(endTile)) {
    return []
  }

  // Passability callback
  const passableCallback = (x: number, y: number): boolean => {
    const tile = getTile(level, x, y)
    return tile !== null && isWalkable(tile)
  }

  // Create A* pathfinder (topology 8 = 8-directional movement)
  const astar = new Path.AStar(to.x, to.y, passableCallback, { topology: 8 })

  // Compute path
  astar.compute(from.x, from.y, (x: number, y: number) => {
    path.push({ x, y })
  })

  return path
}

/**
 * Find a path that can pass through closed doors
 * Used by bot AI since it can open doors by bumping into them
 */
export function findPathThroughDoors(level: DungeonLevel, from: Point, to: Point): Point[] {
  const path: Point[] = []

  const startTile = getTile(level, from.x, from.y)
  const endTile = getTile(level, to.x, to.y)

  if (!startTile || !endTile) {
    return []
  }

  // Allow starting from walkable tiles, allow ending at doors or walkable
  const startOk = isWalkable(startTile)
  const endOk = isWalkable(endTile) || endTile.type === 'door_closed'

  if (!startOk || !endOk) {
    return []
  }

  // Passability callback that includes closed doors
  const passableCallback = (x: number, y: number): boolean => {
    const tile = getTile(level, x, y)
    if (!tile) return false
    return isWalkable(tile) || tile.type === 'door_closed'
  }

  const astar = new Path.AStar(to.x, to.y, passableCallback, { topology: 8 })

  astar.compute(from.x, from.y, (x: number, y: number) => {
    path.push({ x, y })
  })

  return path
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fisher-Yates shuffle (in-place)
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    const temp = array[i]!
    array[i] = array[j]!
    array[j] = temp
  }
}
