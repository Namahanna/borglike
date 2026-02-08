/**
 * Dice Rolling Utility
 *
 * Handles dice notation parsing and rolling for monster attacks.
 * Supports standard formats: "2d6", "3d8+2", "1d10-1"
 */

import { randomInt } from './rng'

/**
 * Parse dice notation and roll
 *
 * @param notation - Dice notation string (e.g., "2d6", "3d8+2", "1d4-1")
 * @returns The rolled result
 *
 * @example
 * rollDice("2d6")    // Rolls 2 six-sided dice
 * rollDice("3d8+5")  // Rolls 3 eight-sided dice and adds 5
 * rollDice("1d4-1")  // Rolls 1 four-sided die and subtracts 1
 */
export function rollDice(notation: string): number {
  const parsed = parseDiceNotation(notation)
  if (!parsed) return 0

  const { count, sides, modifier } = parsed

  // Special case: 0d0 means no damage (e.g., paralyze gaze)
  if (count === 0 || sides === 0) {
    return Math.max(0, modifier)
  }

  let total = 0
  for (let i = 0; i < count; i++) {
    total += randomInt(1, sides)
  }

  return Math.max(0, total + modifier)
}

/**
 * Get the average value of a dice notation
 *
 * @param notation - Dice notation string
 * @returns The expected average value
 *
 * @example
 * getDiceAverage("2d6")    // 7 (each d6 averages 3.5)
 * getDiceAverage("3d8+2")  // 15.5 (3 * 4.5 + 2)
 */
export function getDiceAverage(notation: string): number {
  const parsed = parseDiceNotation(notation)
  if (!parsed) return 0

  const { count, sides, modifier } = parsed

  // Average of a single die is (1 + sides) / 2
  const avgPerDie = (1 + sides) / 2
  return count * avgPerDie + modifier
}

/**
 * Get the maximum possible roll
 *
 * @param notation - Dice notation string
 * @returns Maximum possible value
 */
export function getDiceMax(notation: string): number {
  const parsed = parseDiceNotation(notation)
  if (!parsed) return 0

  const { count, sides, modifier } = parsed
  return count * sides + modifier
}

/**
 * Get the minimum possible roll (at least 0)
 *
 * @param notation - Dice notation string
 * @returns Minimum possible value (never negative)
 */
export function getDiceMin(notation: string): number {
  const parsed = parseDiceNotation(notation)
  if (!parsed) return 0

  const { count, modifier } = parsed
  return Math.max(0, count + modifier) // Minimum is rolling all 1s
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

interface ParsedDice {
  count: number
  sides: number
  modifier: number
}

/**
 * Parse dice notation string into components
 *
 * Supports:
 * - "2d6" - 2 six-sided dice
 * - "3d8+5" - 3 eight-sided dice plus 5
 * - "1d4-1" - 1 four-sided die minus 1
 * - "0d0" - No dice (returns 0)
 */
function parseDiceNotation(notation: string): ParsedDice | null {
  // Match pattern: NdM or NdM+X or NdM-X
  const match = notation.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/)
  if (!match) return null

  const count = parseInt(match[1]!, 10)
  const sides = parseInt(match[2]!, 10)
  let modifier = 0

  if (match[3] && match[4]) {
    modifier = parseInt(match[4]!, 10)
    if (match[3] === '-') {
      modifier = -modifier
    }
  }

  return { count, sides, modifier }
}
