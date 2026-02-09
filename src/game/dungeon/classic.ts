/**
 * Classic room-and-corridor dungeon generator
 *
 * Uses rot.js Digger algorithm with depth-scaled parameters.
 */

import { Map as RotMap } from 'rot-js'
import type { Tile } from '../types'
import type { DepthProfile, RoomData } from './types'

export interface ClassicResult {
  tiles: Tile[][]
  rooms: RoomData[]
}

/**
 * Generate a classic dungeon with rooms connected by corridors
 */
export function generateClassic(
  width: number,
  height: number,
  profile: DepthProfile
): ClassicResult {
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

  // Configure Digger with profile parameters
  const digger = new RotMap.Digger(width, height, {
    roomWidth: [profile.roomSize[0], profile.roomSize[1]],
    roomHeight: [profile.roomSize[0], Math.max(3, profile.roomSize[1] - 2)],
    corridorLength: [profile.corridorLength[0], profile.corridorLength[1]],
    dugPercentage: profile.dugPercentage,
  })

  // Carve out rooms and corridors
  digger.create((x: number, y: number, value: number) => {
    if (value === 0) {
      const row = tiles[y]
      if (row) {
        const tile = row[x]
        if (tile) tile.type = 'floor'
      }
    }
  })

  // Extract room data from digger
  const rooms: RoomData[] = []
  const diggerRooms = digger.getRooms()

  for (const room of diggerRooms) {
    const left = room.getLeft()
    const top = room.getTop()
    const right = room.getRight()
    const bottom = room.getBottom()

    rooms.push({
      x: left,
      y: top,
      width: right - left + 1,
      height: bottom - top + 1,
      center: {
        x: Math.floor((left + right) / 2),
        y: Math.floor((top + bottom) / 2),
      },
    })
  }

  return { tiles, rooms }
}
