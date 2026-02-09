/**
 * Dungeon connectivity validation
 *
 * Ensures all walkable areas are reachable from each other.
 */

import type { Tile, Point } from '../types'

/**
 * Check if all floor tiles are connected (reachable from each other)
 */
export function validateConnectivity(tiles: Tile[][], width: number, height: number): boolean {
  // Find first floor tile
  let startPoint: Point | null = null

  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y]?.[x]
      if (tile && isPassable(tile.type)) {
        startPoint = { x, y }
        break outer
      }
    }
  }

  if (!startPoint) return false

  // Flood fill from start
  const visited = new Set<string>()
  const queue: Point[] = [startPoint]

  while (queue.length > 0) {
    const pos = queue.shift()!
    const key = `${pos.x},${pos.y}`

    if (visited.has(key)) continue

    const tile = tiles[pos.y]?.[pos.x]
    if (!tile || !isPassable(tile.type)) continue

    visited.add(key)

    // Add neighbors
    queue.push({ x: pos.x - 1, y: pos.y })
    queue.push({ x: pos.x + 1, y: pos.y })
    queue.push({ x: pos.x, y: pos.y - 1 })
    queue.push({ x: pos.x, y: pos.y + 1 })
  }

  // Count all passable tiles
  let totalPassable = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y]?.[x]
      if (tile && isPassable(tile.type)) {
        totalPassable++
      }
    }
  }

  return visited.size === totalPassable
}

/**
 * Ensure connectivity by carving corridors between disconnected regions
 */
export function ensureConnectivity(tiles: Tile[][], width: number, height: number): void {
  // Find all disconnected regions
  const regions = findRegions(tiles, width, height)

  if (regions.length <= 1) return

  // Connect each region to the next
  for (let i = 0; i < regions.length - 1; i++) {
    const regionA = regions[i]!
    const regionB = regions[i + 1]!

    // Find closest points between regions
    let bestDist = Infinity
    let bestA: Point | null = null
    let bestB: Point | null = null

    for (const a of regionA) {
      for (const b of regionB) {
        const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
        if (dist < bestDist) {
          bestDist = dist
          bestA = a
          bestB = b
        }
      }
    }

    if (bestA && bestB) {
      carveCorridor(tiles, bestA, bestB, width, height)
    }
  }
}

/**
 * Find all disconnected floor regions
 */
function findRegions(tiles: Tile[][], width: number, height: number): Point[][] {
  const visited = new Set<string>()
  const regions: Point[][] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`
      const tile = tiles[y]?.[x]

      if (tile && isPassable(tile.type) && !visited.has(key)) {
        // Flood fill this region
        const region: Point[] = []
        const queue: Point[] = [{ x, y }]

        while (queue.length > 0) {
          const pos = queue.shift()!
          const posKey = `${pos.x},${pos.y}`

          if (visited.has(posKey)) continue

          const posTile = tiles[pos.y]?.[pos.x]
          if (!posTile || !isPassable(posTile.type)) continue

          visited.add(posKey)
          region.push(pos)

          queue.push({ x: pos.x - 1, y: pos.y })
          queue.push({ x: pos.x + 1, y: pos.y })
          queue.push({ x: pos.x, y: pos.y - 1 })
          queue.push({ x: pos.x, y: pos.y + 1 })
        }

        if (region.length > 0) {
          regions.push(region)
        }
      }
    }
  }

  return regions
}

/**
 * Carve a corridor between two points
 */
function carveCorridor(
  tiles: Tile[][],
  from: Point,
  to: Point,
  width: number,
  height: number
): void {
  let x = from.x
  let y = from.y

  // Simple L-shaped corridor
  // First go horizontally
  while (x !== to.x) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const tile = tiles[y]?.[x]
      if (tile && tile.type === 'wall') {
        tile.type = 'floor'
      }
    }
    x += x < to.x ? 1 : -1
  }

  // Then go vertically
  while (y !== to.y) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const tile = tiles[y]?.[x]
      if (tile && tile.type === 'wall') {
        tile.type = 'floor'
      }
    }
    y += y < to.y ? 1 : -1
  }

  // Mark the final tile
  const finalTile = tiles[to.y]?.[to.x]
  if (finalTile && finalTile.type === 'wall') {
    finalTile.type = 'floor'
  }
}

function isPassable(type: string): boolean {
  return (
    type === 'floor' ||
    type === 'door_open' ||
    type === 'door_closed' ||
    type === 'stairs_up' ||
    type === 'stairs_down'
  )
}
