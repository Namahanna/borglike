/**
 * Unified Stat Modifier System for Borglike
 *
 * Main API for calculating effective stats with all modifiers applied.
 *
 * Usage:
 * ```typescript
 * import { getEffectiveStats } from '@game/modifiers'
 *
 * const effective = getEffectiveStats(character)
 * console.log(effective.accuracy) // Fully computed with all bonuses
 * ```
 */

import type { Character, CombatStats, Stats } from '../types'
import type {
  EffectiveStats,
  EffectiveStatsOptions,
  StatModifier,
  ModifiableStatTarget,
} from './types'
import { getRaceById } from '../data/races'
import { getClassById, calculateHitdie } from '../data'
import { getFormById } from '../data/forms'
import { collectAllModifiers } from './collectors'
import type { CollectOptions } from './collectors'
import { applyAllModifiers } from './apply'

// Re-export types for external use
export type {
  ModifiableStatTarget,
  ModifierType,
  ModifierSource,
  StatModifier,
  EffectiveStats,
  EffectiveStatsOptions,
} from './types'

export { createModifierCollection } from './types'
export { flatModifier, percentModifier, multiplierModifier, parseBonusRecord } from './normalize'
export {
  collectAllModifiers,
  collectEquipmentModifiers,
  collectRacialModifiers,
} from './collectors'
export { applyModifiersToStat } from './apply'

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Get fully computed effective stats for a character
 *
 * This is the main entry point for the modifier system. It:
 * 1. Collects all modifiers from equipment, racials, upgrades, forms, and status effects
 * 2. Applies them in the correct order (flat → percent → multiplier)
 * 3. Returns the final computed stats
 *
 * @param character - The character to compute stats for
 * @param options - Options for what modifiers to include
 * @returns Fully computed effective stats
 *
 * @example
 * const effective = getEffectiveStats(character)
 * // Use effective.accuracy instead of character.combat.accuracy
 * // for most up-to-date value including status effects
 */
export function getEffectiveStats(
  character: Character,
  options: EffectiveStatsOptions = {}
): EffectiveStats {
  const { includeStatusEffects = true, includeFormModifiers = true } = options

  // Get race and class data
  const race = getRaceById(character.raceId)
  const gameClass = getClassById(character.classId)

  if (!race || !gameClass) {
    throw new Error(`Invalid character race (${character.raceId}) or class (${character.classId})`)
  }

  // Get active form if any
  const activeForm = character.activeFormId ? getFormById(character.activeFormId) : null

  // Calculate hitdie
  const hitdie = calculateHitdie(race.hitdie, gameClass.hitdie)

  // Collect all modifiers
  const collectOptions: CollectOptions = {
    includeStatusEffects,
    includeFormModifiers,
  }
  const modifiers = collectAllModifiers(character, race, activeForm ?? null, collectOptions)

  // Apply all modifiers and return effective stats
  return applyAllModifiers(character, modifiers, hitdie, gameClass.usesMagic)
}

/**
 * Get effective stats without status effects
 *
 * Useful for displaying "base" combat stats in the UI that don't fluctuate
 * every turn as buffs/debuffs tick.
 */
export function getBaseEffectiveStats(character: Character): EffectiveStats {
  return getEffectiveStats(character, { includeStatusEffects: false })
}

/**
 * Convert EffectiveStats to CombatStats format
 *
 * Used when updating character.combat from the new system.
 */
export function toCombatStats(effective: EffectiveStats): CombatStats {
  return {
    maxHp: effective.maxHp,
    maxMp: effective.maxMp,
    armor: effective.armor,
    accuracy: effective.accuracy,
    evasion: effective.evasion,
    meleeDamage: effective.meleeDamage,
    rangedDamage: effective.rangedDamage,
    rangedAccuracy: effective.rangedAccuracy,
    speed: effective.speed,
  }
}

/**
 * Convert EffectiveStats to Stats format (core stats only)
 *
 * Used when updating character.stats from the new system.
 */
export function toStats(effective: EffectiveStats): Stats {
  return {
    str: effective.str,
    int: effective.int,
    wis: effective.wis,
    dex: effective.dex,
    con: effective.con,
  }
}

// ============================================================================
// RECALCULATE HELPERS
// ============================================================================

/**
 * Recalculate and update a character's stats and combat stats in place
 *
 * This is a drop-in replacement for the old recalculateCombatStats function.
 * It uses the unified modifier system to compute all stats.
 *
 * @param character - The character to update (mutated in place)
 */
export function recalculateAllStats(character: Character): void {
  // Get effective stats with all modifiers including status effects
  // Status effects are baked into character.combat so combat code can use them directly
  const effective = getEffectiveStats(character, { includeStatusEffects: true })

  // Update combat stats
  character.combat = toCombatStats(effective)

  // Update current stats (with equipment bonuses, form bonuses)
  character.stats = toStats(effective)

  // Update max HP/MP on character root (legacy compatibility)
  character.maxHp = effective.maxHp
  character.maxMp = effective.maxMp

  // Cap current HP/MP at new maximums
  if (character.hp > character.maxHp) character.hp = character.maxHp
  if (character.mp > character.maxMp) character.mp = character.maxMp
}

// ============================================================================
// DEBUGGING
// ============================================================================

/**
 * Get all modifiers for a character (useful for debugging/tooltips)
 *
 * @param character - The character to get modifiers for
 * @returns Array of all active modifiers
 */
export function getAllModifiers(character: Character): StatModifier[] {
  const race = getRaceById(character.raceId)
  const gameClass = getClassById(character.classId)

  if (!race || !gameClass) return []

  const activeForm = character.activeFormId ? getFormById(character.activeFormId) : null

  return collectAllModifiers(character, race, activeForm ?? null)
}

/**
 * Get modifiers for a specific stat (useful for tooltips)
 *
 * @param character - The character to get modifiers for
 * @param target - The stat to get modifiers for
 * @returns Array of modifiers affecting that stat
 */
export function getModifiersForStat(
  character: Character,
  target: ModifiableStatTarget
): StatModifier[] {
  return getAllModifiers(character).filter((m) => m.target === target)
}
