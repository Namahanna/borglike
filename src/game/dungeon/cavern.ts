/**
 * Cavern generator using cellular automata
 *
 * Uses rot.js Cellular to create organic cave-like formations.
 */

import { Map as RotMap } from 'rot-js'
import type { Tile } from '../types'
import type { DepthProfile, RoomData } from './types'

export interface CavernResult {
  tiles: Tile[][]
  rooms: RoomData[] // Caverns don't have distinct rooms, but we identify open areas
}

/**
 * Generate a cavern-style level using cellular automata
 */
export function generateCavern(
  width: number,
  height: number,
  _profile: DepthProfile
): CavernResult {
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

  // Configure Cellular automata
  // born: neighbor counts that create new floor
  // survive: neighbor counts that keep existing floor
  const cellular = new RotMap.Cellular(width, height, {
    born: [5, 6, 7, 8],
    survive: [4, 5, 6, 7, 8],
    topology: 8,
  })

  // Initialize with random values (~45% floor)
  cellular.randomize(0.45)

  // Run several iterations to smooth out the caves
  for (let i = 0; i < 4; i++) {
    cellular.create()
  }

  // Final pass with callback to set tiles
  cellular.create((x: number, y: number, value: number) => {
    if (value === 1) {
      // 1 = floor in Cellular
      const row = tiles[y]
      if (row) {
        const tile = row[x]
        if (tile) tile.type = 'floor'
      }
    }
  })

  // Ensure connectivity - connect all floor regions
  cellular.connect((x: number, y: number, value: number) => {
    if (value === 1) {
      const row = tiles[y]
      if (row) {
        const tile = row[x]
        if (tile) tile.type = 'floor'
      }
    }
  }, 1)

  // Identify the largest open areas as pseudo-rooms for stair placement
  const rooms = findOpenAreas(tiles, width, height)

  return { tiles, rooms }
}

/**
 * Find open areas in each quadrant for stair placement
 *
 * Instead of finding one giant connected region, we identify the best
 * floor cluster in each map quadrant. This ensures stair placement has
 * candidates spread across the map even when the cavern is fully connected.
 */
function findOpenAreas(tiles: Tile[][], width: number, height: number): RoomData[] {
  const midX = Math.floor(width / 2)
  const midY = Math.floor(height / 2)

  // Define quadrant bounds
  const quadrants = [
    { name: 'top-left', x1: 1, y1: 1, x2: midX, y2: midY },
    { name: 'top-right', x1: midX, y1: 1, x2: width - 1, y2: midY },
    { name: 'bottom-left', x1: 1, y1: midY, x2: midX, y2: height - 1 },
    { name: 'bottom-right', x1: midX, y1: midY, x2: width - 1, y2: height - 1 },
  ]

  const rooms: RoomData[] = []

  // Find best floor cluster in each quadrant
  for (const quad of quadrants) {
    const room = findBestClusterInRegion(tiles, quad.x1, quad.y1, quad.x2, quad.y2)
    if (room) {
      rooms.push(room)
    }
  }

  return rooms
}

/**
 * Find the floor tile with most floor neighbors in a region (most "open" spot)
 * Returns a small room centered on that spot
 */
function findBestClusterInRegion(
  tiles: Tile[][],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): RoomData | null {
  let bestX = 0
  let bestY = 0
  let bestScore = -1

  // Find the floor tile with the most floor neighbors (openness score)
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      if (tiles[y]?.[x]?.type !== 'floor') continue

      // Count floor neighbors in a 5x5 area
      let score = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (tiles[y + dy]?.[x + dx]?.type === 'floor') {
            score++
          }
        }
      }

      if (score > bestScore) {
        bestScore = score
        bestX = x
        bestY = y
      }
    }
  }

  // Need at least some open space (score of 9 = 3x3 area of floor minimum)
  if (bestScore < 9) {
    return null
  }

  // Create a small room around this point
  // Find actual bounds of floor around the best point
  let minX = bestX,
    maxX = bestX
  let minY = bestY,
    maxY = bestY

  // Expand bounds to find connected floor extent (limited to ~6 tiles each direction)
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const nx = bestX + dx
      const ny = bestY + dy
      if (tiles[ny]?.[nx]?.type === 'floor') {
        minX = Math.min(minX, nx)
        maxX = Math.max(maxX, nx)
        minY = Math.min(minY, ny)
        maxY = Math.max(maxY, ny)
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    center: { x: bestX, y: bestY },
  }
}
