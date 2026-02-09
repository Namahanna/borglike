/**
 * Custom labyrinth generator
 *
 * Creates maze-like levels with strategic anchor rooms for reliable stair placement.
 * Unlike rot.js IceyMaze, this ensures rooms in opposite map halves.
 */

import type { Tile } from '../types'
import type { DepthProfile, RoomData } from './types'
import { random, randomInt } from '../rng'

export interface LabyrinthResult {
  tiles: Tile[][]
  rooms: RoomData[]
}

/**
 * Generate a labyrinth with anchor rooms in each quadrant
 */
export function generateLabyrinth(
  width: number,
  height: number,
  _profile: DepthProfile
): LabyrinthResult {
  // Initialize tiles as walls
  const tiles: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    tiles[y] = row
    for (let x = 0; x < width; x++) {
      row[x] = {
        type: 'wall',
        explored: false,
        visible: false,
      }
    }
  }

  // Create anchor rooms in strategic positions
  const rooms = createAnchorRooms(tiles, width, height)

  // Connect rooms with corridors
  connectRooms(tiles, rooms, width, height)

  // Fill remaining space with maze passages
  fillMazePassages(tiles, width, height)

  // Add shortcuts to reduce dead ends
  addShortcuts(tiles, width, height, 0.08)

  return { tiles, rooms }
}

/**
 * Create anchor rooms - one in each half of the map minimum,
 * plus optional center and corner rooms
 */
function createAnchorRooms(tiles: Tile[][], width: number, height: number): RoomData[] {
  const rooms: RoomData[] = []
  const midX = Math.floor(width / 2)
  const midY = Math.floor(height / 2)

  // Room sizes: 4-6 tiles (larger than old 3-5 for better navigation)
  const minSize = 4
  const maxSize = 6

  // Quadrant margins - stay away from edges
  const margin = 4
  const quadrantW = midX - margin * 2
  const quadrantH = midY - margin * 2

  // Always create rooms in opposite corners for stair placement
  // Top-left quadrant
  const room1 = createRoom(
    tiles,
    margin + randomInt(0, Math.max(0, quadrantW - maxSize)),
    margin + randomInt(0, Math.max(0, quadrantH - maxSize)),
    randomInt(minSize, maxSize),
    randomInt(minSize, maxSize),
    width,
    height
  )
  if (room1) rooms.push(room1)

  // Bottom-right quadrant
  const room2 = createRoom(
    tiles,
    midX + margin + randomInt(0, Math.max(0, quadrantW - maxSize)),
    midY + margin + randomInt(0, Math.max(0, quadrantH - maxSize)),
    randomInt(minSize, maxSize),
    randomInt(minSize, maxSize),
    width,
    height
  )
  if (room2) rooms.push(room2)

  // 70% chance: add top-right room
  if (random() < 0.7) {
    const room3 = createRoom(
      tiles,
      midX + margin + randomInt(0, Math.max(0, quadrantW - maxSize)),
      margin + randomInt(0, Math.max(0, quadrantH - maxSize)),
      randomInt(minSize, maxSize),
      randomInt(minSize, maxSize),
      width,
      height
    )
    if (room3) rooms.push(room3)
  }

  // 70% chance: add bottom-left room
  if (random() < 0.7) {
    const room4 = createRoom(
      tiles,
      margin + randomInt(0, Math.max(0, quadrantW - maxSize)),
      midY + margin + randomInt(0, Math.max(0, quadrantH - maxSize)),
      randomInt(minSize, maxSize),
      randomInt(minSize, maxSize),
      width,
      height
    )
    if (room4) rooms.push(room4)
  }

  // 50% chance: add center room
  if (random() < 0.5) {
    const centerRoom = createRoom(
      tiles,
      midX - randomInt(2, 3),
      midY - randomInt(2, 3),
      randomInt(minSize, maxSize),
      randomInt(minSize, maxSize),
      width,
      height
    )
    if (centerRoom) rooms.push(centerRoom)
  }

  return rooms
}

/**
 * Create a single room and carve it into the map
 */
function createRoom(
  tiles: Tile[][],
  x: number,
  y: number,
  w: number,
  h: number,
  mapWidth: number,
  mapHeight: number
): RoomData | null {
  // Clamp to valid bounds
  x = Math.max(2, Math.min(x, mapWidth - w - 2))
  y = Math.max(2, Math.min(y, mapHeight - h - 2))

  if (x < 2 || y < 2 || x + w >= mapWidth - 1 || y + h >= mapHeight - 1) {
    return null
  }

  // Carve the room
  for (let ry = y; ry < y + h; ry++) {
    for (let rx = x; rx < x + w; rx++) {
      const tile = tiles[ry]?.[rx]
      if (tile) tile.type = 'floor'
    }
  }

  return {
    x,
    y,
    width: w,
    height: h,
    center: {
      x: Math.floor(x + w / 2),
      y: Math.floor(y + h / 2),
    },
  }
}

/**
 * Connect all rooms with L-shaped corridors
 */
function connectRooms(tiles: Tile[][], rooms: RoomData[], _width: number, _height: number): void {
  if (rooms.length < 2) return

  // Connect each room to the next (creates a chain)
  for (let i = 0; i < rooms.length - 1; i++) {
    const from = rooms[i]!
    const to = rooms[i + 1]!
    carveCorridor(tiles, from.center, to.center)
  }

  // Add one extra connection between first and last for a loop
  if (rooms.length >= 3) {
    const first = rooms[0]!
    const last = rooms[rooms.length - 1]!
    carveCorridor(tiles, first.center, last.center)
  }
}

/**
 * Carve an L-shaped corridor between two points
 */
function carveCorridor(
  tiles: Tile[][],
  from: { x: number; y: number },
  to: { x: number; y: number }
): void {
  // Randomly choose horizontal-first or vertical-first
  const horizontalFirst = random() < 0.5

  if (horizontalFirst) {
    // Horizontal then vertical
    carveHorizontalLine(tiles, from.x, to.x, from.y)
    carveVerticalLine(tiles, from.y, to.y, to.x)
  } else {
    // Vertical then horizontal
    carveVerticalLine(tiles, from.y, to.y, from.x)
    carveHorizontalLine(tiles, from.x, to.x, to.y)
  }
}

function carveHorizontalLine(tiles: Tile[][], x1: number, x2: number, y: number): void {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  for (let x = minX; x <= maxX; x++) {
    const tile = tiles[y]?.[x]
    if (tile) tile.type = 'floor'
  }
}

function carveVerticalLine(tiles: Tile[][], y1: number, y2: number, x: number): void {
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  for (let y = minY; y <= maxY; y++) {
    const tile = tiles[y]?.[x]
    if (tile) tile.type = 'floor'
  }
}

/**
 * Fill empty areas with maze-like passages using recursive backtracking
 */
function fillMazePassages(tiles: Tile[][], width: number, height: number): void {
  // Work on odd coordinates only for proper maze structure
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      // If this cell is a wall and surrounded by walls, start carving
      if (tiles[y]?.[x]?.type === 'wall') {
        carveMazeFrom(tiles, x, y, width, height)
      }
    }
  }

  // Connect isolated maze sections to nearest floor
  connectIsolatedSections(tiles, width, height)
}

/**
 * Carve maze passages starting from a point using randomized DFS
 */
function carveMazeFrom(
  tiles: Tile[][],
  startX: number,
  startY: number,
  width: number,
  height: number
): void {
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
  const directions = [
    { dx: 0, dy: -2 }, // North
    { dx: 2, dy: 0 }, // East
    { dx: 0, dy: 2 }, // South
    { dx: -2, dy: 0 }, // West
  ]

  // Carve starting cell
  const startTile = tiles[startY]?.[startX]
  if (startTile) startTile.type = 'floor'

  while (stack.length > 0) {
    const current = stack[stack.length - 1]!

    // Shuffle directions
    const shuffled = [...directions].sort(() => random() - 0.5)

    let carved = false
    for (const { dx, dy } of shuffled) {
      const nx = current.x + dx
      const ny = current.y + dy

      // Check bounds
      if (nx < 1 || nx >= width - 1 || ny < 1 || ny >= height - 1) continue

      // Check if target is uncarved wall
      if (tiles[ny]?.[nx]?.type !== 'wall') continue

      // Carve the passage (both the wall between and the target cell)
      const wallX = current.x + dx / 2
      const wallY = current.y + dy / 2
      const wallTile = tiles[wallY]?.[wallX]
      const targetTile = tiles[ny]?.[nx]

      if (wallTile) wallTile.type = 'floor'
      if (targetTile) targetTile.type = 'floor'

      stack.push({ x: nx, y: ny })
      carved = true
      break
    }

    if (!carved) {
      stack.pop()
    }
  }
}

/**
 * Connect any isolated floor sections to the main dungeon
 */
function connectIsolatedSections(tiles: Tile[][], width: number, height: number): void {
  // Find all floor tiles and group them by connectivity
  const visited = new Set<string>()
  const regions: Array<Array<{ x: number; y: number }>> = []

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const key = `${x},${y}`
      if (tiles[y]?.[x]?.type === 'floor' && !visited.has(key)) {
        const region = floodFill(tiles, x, y, width, height, visited)
        regions.push(region)
      }
    }
  }

  // If multiple regions, connect them
  if (regions.length > 1) {
    // Sort by size, largest first
    regions.sort((a, b) => b.length - a.length)
    const mainRegion = regions[0]!

    for (let i = 1; i < regions.length; i++) {
      const isolatedRegion = regions[i]!
      // Find closest points between regions
      let minDist = Infinity
      let bestFrom: { x: number; y: number } | null = null
      let bestTo: { x: number; y: number } | null = null

      for (const from of isolatedRegion) {
        for (const to of mainRegion) {
          const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y)
          if (dist < minDist) {
            minDist = dist
            bestFrom = from
            bestTo = to
          }
        }
      }

      if (bestFrom && bestTo) {
        carveCorridor(tiles, bestFrom, bestTo)
      }
    }
  }
}

/**
 * Flood fill to find connected floor regions
 */
function floodFill(
  tiles: Tile[][],
  startX: number,
  startY: number,
  width: number,
  height: number,
  visited: Set<string>
): Array<{ x: number; y: number }> {
  const region: Array<{ x: number; y: number }> = []
  const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]

  while (queue.length > 0) {
    const { x, y } = queue.shift()!
    const key = `${x},${y}`

    if (visited.has(key)) continue
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    if (tiles[y]?.[x]?.type !== 'floor') continue

    visited.add(key)
    region.push({ x, y })

    queue.push({ x: x - 1, y })
    queue.push({ x: x + 1, y })
    queue.push({ x, y: y - 1 })
    queue.push({ x, y: y + 1 })
  }

  return region
}

/**
 * Add shortcuts by removing some walls between parallel passages
 */
function addShortcuts(tiles: Tile[][], width: number, height: number, chance: number): void {
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const tile = tiles[y]?.[x]
      if (tile?.type !== 'wall') continue

      // Check if this wall separates two floor areas
      const north = tiles[y - 1]?.[x]?.type === 'floor'
      const south = tiles[y + 1]?.[x]?.type === 'floor'
      const east = tiles[y]?.[x + 1]?.type === 'floor'
      const west = tiles[y]?.[x - 1]?.type === 'floor'

      // If wall separates two floor areas, maybe remove it
      if ((north && south) || (east && west)) {
        if (random() < chance) {
          tile.type = 'floor'
        }
      }
    }
  }
}
