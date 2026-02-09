/**
 * Depth-based generation profiles
 *
 * Controls how dungeon generation scales with depth.
 * Uses smooth interpolation for gradual scaling.
 */

import type { DepthProfile, GeneratorType } from './types'
import { random } from '../rng'

/**
 * Interpolate a value within a range based on depth
 * Useful for gradual scaling within a tier
 */
export function interpolateByDepth(
  depth: number,
  minDepth: number,
  maxDepth: number,
  minValue: number,
  maxValue: number
): number {
  const t = Math.max(0, Math.min(1, (depth - minDepth) / (maxDepth - minDepth)))
  return minValue + t * (maxValue - minValue)
}

/**
 * Get the generation profile for a given depth
 * Uses smooth interpolation across the full depth range (1-50)
 */
export function getDepthProfile(depth: number): DepthProfile {
  return {
    generatorWeights: {
      classic: interpolateByDepth(depth, 1, 50, 0.92, 0.45),
      cavern: interpolateByDepth(depth, 1, 50, 0.06, 0.35),
      labyrinth: interpolateByDepth(depth, 1, 50, 0.02, 0.2),
    },
    roomCount: [
      Math.round(interpolateByDepth(depth, 1, 50, 4, 7)),
      Math.round(interpolateByDepth(depth, 1, 50, 8, 14)),
    ],
    roomSize: [
      Math.round(interpolateByDepth(depth, 1, 50, 3, 5)),
      Math.round(interpolateByDepth(depth, 1, 50, 7, 13)),
    ],
    corridorLength: [
      Math.round(interpolateByDepth(depth, 1, 50, 2, 4)),
      Math.round(interpolateByDepth(depth, 1, 50, 6, 12)),
    ],
    dugPercentage: interpolateByDepth(depth, 1, 50, 0.25, 0.38),
    doorChance: interpolateByDepth(depth, 1, 50, 0.1, 0.5),
    vaultChance: interpolateByDepth(depth, 1, 50, 0, 0.28),
  }
}

/**
 * Select a generator type based on depth profile weights
 */
export function selectGenerator(depth: number): GeneratorType {
  const profile = getDepthProfile(depth)
  const roll = random()

  let cumulative = 0
  cumulative += profile.generatorWeights.classic
  if (roll < cumulative) return 'classic'

  cumulative += profile.generatorWeights.cavern
  if (roll < cumulative) return 'cavern'

  return 'labyrinth'
}
