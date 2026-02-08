/**
 * Key Normalization for Modifier System
 *
 * Handles translation between different naming conventions used across the codebase:
 * - Artifacts use UPPERCASE: STR, DEX, SPEED
 * - Templates use camelCase: toHit, toDam, toAC
 * - Internal system uses consistent lowercase: str, dex, speed
 */

import type { ModifiableStatTarget, StatModifier, ModifierSource } from './types'

// ============================================================================
// KEY MAPPINGS
// ============================================================================

/**
 * Map of bonus key names to their normalized stat targets.
 * Handles all the different naming conventions in the codebase.
 */
const BONUS_KEY_MAP: Record<string, ModifiableStatTarget> = {
  // Core stats - uppercase (artifacts)
  STR: 'str',
  DEX: 'dex',
  CON: 'con',
  INT: 'int',
  WIS: 'wis',

  // Core stats - lowercase
  str: 'str',
  dex: 'dex',
  con: 'con',
  int: 'int',
  wis: 'wis',

  // Combat bonuses - camelCase (templates)
  toHit: 'accuracy',
  toDam: 'meleeDamage',
  toAC: 'armor',

  // Speed - uppercase (artifacts/templates)
  SPEED: 'speed',
  speed: 'speed',
}

// ============================================================================
// PARSE FUNCTIONS
// ============================================================================

/**
 * Parse a bonus record (from artifact.bonuses or template.bonuses) into modifiers.
 *
 * Handles mixed naming conventions:
 * - { STR: 2, DEX: 1 } -> flat str +2, flat dex +1
 * - { toHit: 5, toDam: 3 } -> flat accuracy +5, flat meleeDamage +3
 * - { SPEED: 10 } -> flat speed +10
 *
 * @param bonuses - The raw bonus record from item data
 * @param source - Where these bonuses come from (equipment, racial, etc)
 * @param description - Optional description for debugging
 * @returns Array of normalized StatModifier objects
 */
export function parseBonusRecord(
  bonuses: Record<string, number> | undefined,
  source: ModifierSource,
  description?: string
): StatModifier[] {
  if (!bonuses) return []

  const modifiers: StatModifier[] = []

  for (const [key, value] of Object.entries(bonuses)) {
    if (value === 0) continue

    const target = BONUS_KEY_MAP[key]
    if (!target) continue // Skip unknown keys

    modifiers.push({
      source,
      target,
      type: 'flat',
      value,
      description: description ? `${description}: ${key}` : key,
    })
  }

  return modifiers
}

/**
 * Create a flat modifier for a single stat
 */
export function flatModifier(
  source: ModifierSource,
  target: ModifiableStatTarget,
  value: number,
  description?: string
): StatModifier {
  return { source, target, type: 'flat', value, description }
}

/**
 * Create a percent modifier for a single stat
 */
export function percentModifier(
  source: ModifierSource,
  target: ModifiableStatTarget,
  value: number,
  description?: string
): StatModifier {
  return { source, target, type: 'percent', value, description }
}

/**
 * Create a multiplier modifier for a single stat
 */
export function multiplierModifier(
  source: ModifierSource,
  target: ModifiableStatTarget,
  value: number,
  description?: string
): StatModifier {
  return { source, target, type: 'multiplier', value, description }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the normalized stat name for a bonus key
 * Returns undefined if the key isn't recognized
 */
export function normalizeStatKey(key: string): ModifiableStatTarget | undefined {
  return BONUS_KEY_MAP[key]
}

/**
 * Create multiple flat modifiers from a simple object
 *
 * @example
 * flatModifiers('racial', { accuracy: 10, evasion: 5 }, 'Keen Senses')
 * // Returns two flat modifiers
 */
export function flatModifiers(
  source: ModifierSource,
  stats: Partial<Record<ModifiableStatTarget, number>>,
  description?: string
): StatModifier[] {
  const modifiers: StatModifier[] = []

  for (const [target, value] of Object.entries(stats)) {
    if (value === undefined || value === 0) continue

    modifiers.push({
      source,
      target: target as ModifiableStatTarget,
      type: 'flat',
      value,
      description,
    })
  }

  return modifiers
}

/**
 * Create multiple percent modifiers from a simple object
 */
export function percentModifiers(
  source: ModifierSource,
  stats: Partial<Record<ModifiableStatTarget, number>>,
  description?: string
): StatModifier[] {
  const modifiers: StatModifier[] = []

  for (const [target, value] of Object.entries(stats)) {
    if (value === undefined || value === 0) continue

    modifiers.push({
      source,
      target: target as ModifiableStatTarget,
      type: 'percent',
      value,
      description,
    })
  }

  return modifiers
}
