/**
 * Dungeon generation module
 *
 * Provides depth-scaled dungeon generation with multiple generator types,
 * door placement, and vault system.
 */

import type { DungeonLevel, Tile, Point } from '../types'
import { MAX_DEPTH } from '../types'
import { randomInt } from '../rng'
import type { GeneratorType, RoomData, VaultPlacement } from './types'
import { getDepthProfile, selectGenerator } from './profiles'
import { generateClassic } from './classic'
import { generateCavern } from './cavern'
import { generateLabyrinth } from './labyrinth'
import { findDoorCandidates, placeDoors } from './doors'
import { validateConnectivity, ensureConnectivity } from './validation'
import { tryPlaceVault } from './vaults'
import { generateTownLevel } from '../town'
import { buildPassabilityBitmap, buildExploredBitmap } from '../dungeon'

// Re-export types
export type { GeneratorType, RoomData, VaultPlacement } from './types'
export type { DepthProfile } from './types'
export { getDepthProfile, selectGenerator } from './profiles'
export { VAULTS } from './vaults'

const DEFAULT_WIDTH = 80
const DEFAULT_HEIGHT = 40

export interface GenerationResult {
  level: DungeonLevel
  generatorType: GeneratorType
  rooms: RoomData[]
  vault: VaultPlacement | null
  doorsPlaced: number
}

/**
 * Generate a dungeon level at the specified depth
 *
 * Uses depth-based profiles to select generator type and parameters.
 * Applies post-processing: doors, vaults, connectivity validation, stairs.
 * Depth 0 generates the town level (safe zone).
 */
export function generateLevel(
  depth: number,
  width: number = DEFAULT_WIDTH,
  height: number = DEFAULT_HEIGHT
): DungeonLevel {
  // Special case: depth 0 is the town
  if (depth === 0) {
    return generateTownLevel()
  }

  const result = generateLevelWithInfo(depth, width, height)
  // Attach metadata to level for feature initialization and bot AI
  result.level.vault = result.vault
  result.level.generatorType = result.generatorType
  return result.level
}

/**
 * Generate a dungeon level with full generation info
 * Useful for debugging or when you need metadata about the generation
 */
export function generateLevelWithInfo(
  depth: number,
  width: number = DEFAULT_WIDTH,
  height: number = DEFAULT_HEIGHT
): GenerationResult {
  const profile = getDepthProfile(depth)
  const generatorType = selectGenerator(depth)

  // Generate base tiles using selected generator
  let tiles: Tile[][]
  let rooms: RoomData[]

  switch (generatorType) {
    case 'cavern': {
      const result = generateCavern(width, height, profile)
      tiles = result.tiles
      rooms = result.rooms
      break
    }
    case 'labyrinth': {
      const result = generateLabyrinth(width, height, profile)
      tiles = result.tiles
      rooms = result.rooms
      break
    }
    case 'classic':
    default: {
      const result = generateClassic(width, height, profile)
      tiles = result.tiles
      rooms = result.rooms
      break
    }
  }

  // Try to place a vault (depth-dependent chance)
  const vault = tryPlaceVault(tiles, rooms, width, height, depth, profile.vaultChance)

  // Place doors at room entrances (not mid-corridor)
  // Labyrinths have few/no doors - the maze itself is the obstacle
  const effectiveDoorChance =
    generatorType === 'labyrinth'
      ? profile.doorChance * 0.15 // Greatly reduced for labyrinths
      : profile.doorChance
  const doorCandidates = findDoorCandidates(tiles, width, height, rooms)
  const placedDoors = placeDoors(tiles, doorCandidates, effectiveDoorChance)

  // Place stairs (prefer room centers in different map quadrants)
  // Exclude vault area from stair placement
  const { stairsUp, stairsDown } = placeStairs(tiles, rooms, width, height, depth, vault)

  // Ensure connectivity AFTER stairs placement so stairs are included in connectivity check
  // This prevents stairs from being placed in disconnected regions
  if (!validateConnectivity(tiles, width, height)) {
    ensureConnectivity(tiles, width, height)
  }

  const level: DungeonLevel = {
    depth,
    width,
    height,
    tiles,
    stairsUp,
    stairsDown,
    exploredCount: 0,
    passableCount: 0,
    exploredPassableCount: 0,
    passable: new Uint8Array(0),
    explored: new Uint8Array(0),
    generatorType,
  }
  level.passable = buildPassabilityBitmap(level)
  level.passableCount = level.passable.reduce((sum, v) => sum + v, 0)
  level.explored = buildExploredBitmap(level)

  return {
    level,
    generatorType,
    rooms,
    vault,
    doorsPlaced: placedDoors.length,
  }
}

/**
 * Place stairs up and down on the level
 *
 * Prefers placing stairs in room centers in different map halves (left/right).
 * This ensures stairs are in accessible open areas rather than random corridors,
 * and encourages level traversal by spacing them apart.
 * Excludes vault areas from stair placement.
 */
function placeStairs(
  tiles: Tile[][],
  rooms: RoomData[],
  width: number,
  height: number,
  depth: number,
  vault: VaultPlacement | null
): { stairsUp: Point | null; stairsDown: Point | null } {
  let stairsUp: Point | null = null
  let stairsDown: Point | null = null

  const needsUp = depth >= 1 // Depth 1 needs stairs to town
  const needsDown = depth < MAX_DEPTH

  // Filter out rooms that overlap with vault
  const validRooms = vault ? rooms.filter((room) => !roomOverlapsVault(room, vault)) : rooms

  // Try room-based placement first (preferred)
  if (validRooms.length >= 2) {
    // Sort rooms by x position to find left/right halves
    const sortedByX = [...validRooms].sort((a, b) => a.center.x - b.center.x)
    const leftRoom = sortedByX[0]!
    const rightRoom = sortedByX[sortedByX.length - 1]!

    // Place up stairs in left room, down stairs in right room
    // This creates a natural west-to-east flow through the dungeon
    if (needsUp && leftRoom) {
      stairsUp = placeStairInRoom(tiles, leftRoom, 'stairs_up')
    }
    if (needsDown && rightRoom) {
      stairsDown = placeStairInRoom(tiles, rightRoom, 'stairs_down')
    }
  } else if (validRooms.length === 1) {
    // Single room: place both stairs in it (different positions)
    const room = validRooms[0]!
    if (needsUp) {
      stairsUp = placeStairInRoom(tiles, room, 'stairs_up')
    }
    if (needsDown) {
      stairsDown = placeStairInRoom(tiles, room, 'stairs_down')
    }
  }

  // Fallback to random floor placement if room-based failed
  if ((needsUp && !stairsUp) || (needsDown && !stairsDown)) {
    const floorPositions = collectFloorPositions(tiles, width, height, vault)
    shuffleArray(floorPositions)

    if (needsUp && !stairsUp && floorPositions.length > 0) {
      const pos = floorPositions.pop()!
      stairsUp = pos
      const tile = tiles[pos.y]?.[pos.x]
      if (tile) tile.type = 'stairs_up'
    }

    if (needsDown && !stairsDown && floorPositions.length > 0) {
      const pos = floorPositions.pop()!
      stairsDown = pos
      const tile = tiles[pos.y]?.[pos.x]
      if (tile) tile.type = 'stairs_down'
    }
  }

  return { stairsUp, stairsDown }
}

/**
 * Check if a room overlaps with the vault area
 */
function roomOverlapsVault(room: RoomData, vault: VaultPlacement): boolean {
  const vaultRight = vault.position.x + vault.vault.width
  const vaultBottom = vault.position.y + vault.vault.height
  const roomRight = room.x + room.width
  const roomBottom = room.y + room.height

  return !(
    room.x >= vaultRight ||
    roomRight <= vault.position.x ||
    room.y >= vaultBottom ||
    roomBottom <= vault.position.y
  )
}

/**
 * Place a stair in a room, preferring the center but falling back to any floor tile
 */
function placeStairInRoom(
  tiles: Tile[][],
  room: RoomData,
  stairType: 'stairs_up' | 'stairs_down'
): Point | null {
  // Try room center first
  const centerTile = tiles[room.center.y]?.[room.center.x]
  if (centerTile && centerTile.type === 'floor') {
    centerTile.type = stairType
    return room.center
  }

  // Center occupied/invalid - find any floor tile in the room
  for (let dy = 0; dy < room.height; dy++) {
    for (let dx = 0; dx < room.width; dx++) {
      const x = room.x + dx
      const y = room.y + dy
      const tile = tiles[y]?.[x]
      if (tile && tile.type === 'floor') {
        tile.type = stairType
        return { x, y }
      }
    }
  }

  return null
}

/**
 * Collect all floor positions for fallback stair placement
 * Excludes vault area if provided
 */
function collectFloorPositions(
  tiles: Tile[][],
  width: number,
  height: number,
  vault: VaultPlacement | null
): Point[] {
  const positions: Point[] = []
  for (let y = 0; y < height; y++) {
    const row = tiles[y]
    if (!row) continue
    for (let x = 0; x < width; x++) {
      // Skip vault area
      if (vault && isInVault(x, y, vault)) continue

      const tile = row[x]
      if (tile && tile.type === 'floor') {
        positions.push({ x, y })
      }
    }
  }
  return positions
}

/**
 * Check if a position is inside the vault area
 */
function isInVault(x: number, y: number, vault: VaultPlacement): boolean {
  return (
    x >= vault.position.x &&
    x < vault.position.x + vault.vault.width &&
    y >= vault.position.y &&
    y < vault.position.y + vault.vault.height
  )
}

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
