/**
 * Seedable RNG wrapper for Borglike
 *
 * Uses rot.js RNG (Alea algorithm) for reproducible random number generation.
 * Seeded at game creation for deterministic runs - same seed produces identical outcomes.
 *
 * Note: rot.js Map generators also use this RNG singleton, so dungeons are automatically seeded.
 */

import { RNG } from 'rot-js'

/**
 * Seed the RNG with a specific value
 * Call this once at game creation to enable reproducible runs
 */
export function seedRNG(seed: number): void {
  RNG.setSeed(seed)
}

/**
 * Get the current RNG seed
 */
export function getSeed(): number {
  return RNG.getSeed()
}

/**
 * Get a random float in [0, 1)
 * Replacement for Math.random()
 */
export function random(): number {
  return RNG.getUniform()
}

/**
 * Get a random integer in [min, max] (inclusive)
 * Replacement for Math.floor(Math.random() * (max - min + 1)) + min
 */
export function randomInt(min: number, max: number): number {
  return RNG.getUniformInt(min, max)
}

/**
 * Get a random item from an array
 * Returns undefined if array is empty
 */
export function randomItem<T>(array: readonly T[]): T | undefined {
  return RNG.getItem([...array]) ?? undefined
}

/**
 * Shuffle an array (returns new array, does not mutate original)
 */
export function shuffle<T>(array: readonly T[]): T[] {
  return RNG.shuffle([...array])
}

/**
 * Roll weighted selection - pick from array with weighted probabilities
 * @param items Array of { item, weight } objects
 * @returns The selected item, or undefined if array is empty
 */
export function weightedPick<T>(items: readonly { item: T; weight: number }[]): T | undefined {
  if (items.length === 0) return undefined
  return (RNG.getWeightedValue(
    Object.fromEntries(items.map((i, idx) => [idx, i.weight]))
  ) as unknown as number | undefined) !== undefined
    ? items[
        RNG.getWeightedValue(
          Object.fromEntries(items.map((i, idx) => [idx, i.weight]))
        ) as unknown as number
      ]?.item
    : undefined
}

/**
 * Roll a probability check
 * @param probability Value from 0 to 1 (e.g., 0.3 for 30% chance)
 * @returns true if roll succeeds
 */
export function chance(probability: number): boolean {
  return random() < probability
}
