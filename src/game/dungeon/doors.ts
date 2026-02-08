/**
 * Door placement system
 *
 * Identifies valid door positions at room entrances and places doors based on depth profile.
 * Doors should only appear at room-corridor junctions, not in the middle of corridors.
 */

import type { Tile, Point } from '../types'
import type { RoomData } from './types'
import { random, randomInt } from '../rng'

/**
 * Find positions where doors can be validly placed
 *
 * A valid door position is a floor tile that:
 * - Has exactly 2 opposite walls (N/S or E/W)
 * - Has floor on the other 2 opposite sides
 * - Is adjacent to a room boundary (not mid-corridor)
 */
export function findDoorCandidates(
  tiles: Tile[][],
  width: number,
  height: number,
  rooms: RoomData[] = []
): Point[] {
  const candidates: Point[] = []

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tile = tiles[y]?.[x]
      if (!tile || tile.type !== 'floor') continue

      // Get adjacent tiles
      const north = tiles[y - 1]?.[x]
      const south = tiles[y + 1]?.[x]
      const east = tiles[y]?.[x + 1]
      const west = tiles[y]?.[x - 1]

      if (!north || !south || !east || !west) continue

      // Check for horizontal corridor (walls N/S, floor E/W)
      const isHorizontalCorridor =
        isWallType(north.type) &&
        isWallType(south.type) &&
        isFloorType(east.type) &&
        isFloorType(west.type)

      // Check for vertical corridor (walls E/W, floor N/S)
      const isVerticalCorridor =
        isFloorType(north.type) &&
        isFloorType(south.type) &&
        isWallType(east.type) &&
        isWallType(west.type)

      if (!isHorizontalCorridor && !isVerticalCorridor) continue

      // Must be adjacent to a room boundary OR have a room-like space on one side
      if (rooms.length > 0) {
        // Use room data: only accept if adjacent to room boundary
        if (!isAdjacentToRoom(x, y, rooms)) continue
      } else {
        // Fallback: check if one side opens into a larger space (2+ tiles wide)
        // This helps filter out mid-corridor positions when no room data exists
        if (!hasRoomLikeSpace(tiles, x, y, isHorizontalCorridor)) continue
      }

      candidates.push({ x, y })
    }
  }

  return candidates
}

/**
 * Check if a position is adjacent to a room boundary
 * A door should be just outside or at the edge of a room
 */
function isAdjacentToRoom(x: number, y: number, rooms: RoomData[]): boolean {
  for (const room of rooms) {
    // Room boundaries (the walls around the room)
    const left = room.x - 1
    const right = room.x + room.width
    const top = room.y - 1
    const bottom = room.y + room.height

    // Check if position is on the room boundary (just outside the room)
    const onLeftEdge = x === left && y >= room.y && y < room.y + room.height
    const onRightEdge = x === right && y >= room.y && y < room.y + room.height
    const onTopEdge = y === top && x >= room.x && x < room.x + room.width
    const onBottomEdge = y === bottom && x >= room.x && x < room.x + room.width

    if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
      return true
    }
  }
  return false
}

/**
 * Check if position has a room-like space on one side (fallback when no room data)
 * A room-like space is at least 2 tiles wide perpendicular to the corridor direction
 */
function hasRoomLikeSpace(tiles: Tile[][], x: number, y: number, isHorizontal: boolean): boolean {
  if (isHorizontal) {
    // Horizontal corridor (walls N/S): check if E or W side opens into wider space
    const eastOpen = hasWiderSpace(tiles, x + 1, y, 'horizontal')
    const westOpen = hasWiderSpace(tiles, x - 1, y, 'horizontal')
    return eastOpen || westOpen
  } else {
    // Vertical corridor (walls E/W): check if N or S side opens into wider space
    const northOpen = hasWiderSpace(tiles, x, y - 1, 'vertical')
    const southOpen = hasWiderSpace(tiles, x, y + 1, 'vertical')
    return northOpen || southOpen
  }
}

/**
 * Check if a position has floor tiles extending perpendicular to corridor
 * This indicates it opens into a room rather than continuing as a corridor
 */
function hasWiderSpace(
  tiles: Tile[][],
  x: number,
  y: number,
  corridorDir: 'horizontal' | 'vertical'
): boolean {
  const tile = tiles[y]?.[x]
  if (!tile || !isFloorType(tile.type)) return false

  if (corridorDir === 'horizontal') {
    // For horizontal corridor, check if this position has floor N or S (perpendicular)
    const north = tiles[y - 1]?.[x]
    const south = tiles[y + 1]?.[x]
    const northOpen = north !== undefined && isFloorType(north.type)
    const southOpen = south !== undefined && isFloorType(south.type)
    return northOpen || southOpen
  } else {
    // For vertical corridor, check if this position has floor E or W (perpendicular)
    const east = tiles[y]?.[x + 1]
    const west = tiles[y]?.[x - 1]
    const eastOpen = east !== undefined && isFloorType(east.type)
    const westOpen = west !== undefined && isFloorType(west.type)
    return eastOpen || westOpen
  }
}

/**
 * Place doors at candidate positions based on chance
 */
export function placeDoors(tiles: Tile[][], candidates: Point[], doorChance: number): Point[] {
  const placedDoors: Point[] = []

  // Shuffle candidates for random distribution
  const shuffled = [...candidates]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }

  // Track placed doors to avoid clustering
  const doorPositions = new Set<string>()

  for (const pos of shuffled) {
    // Skip if too close to another door (within 3 tiles)
    let tooClose = false
    for (const placed of placedDoors) {
      const dist = Math.abs(pos.x - placed.x) + Math.abs(pos.y - placed.y)
      if (dist < 4) {
        tooClose = true
        break
      }
    }

    if (tooClose) continue

    if (random() < doorChance) {
      const tile = tiles[pos.y]?.[pos.x]
      if (tile) {
        tile.type = 'door_closed'
        placedDoors.push(pos)
        doorPositions.add(`${pos.x},${pos.y}`)
      }
    }
  }

  return placedDoors
}

function isWallType(type: string): boolean {
  return type === 'wall'
}

function isFloorType(type: string): boolean {
  return type === 'floor' || type === 'door_open' || type === 'door_closed'
}
