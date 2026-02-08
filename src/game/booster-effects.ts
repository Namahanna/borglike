/**
 * Booster Effects Module
 *
 * Pure functions for computing bonuses from active boosters.
 * Used to apply per-run booster bonuses to gameplay.
 */

import { getBoosterById } from './data/boosters'

// ============================================================================
// TYPES
// ============================================================================

/** Computed stat bonuses from boosters */
export interface BoosterBonuses {
  // Stat bonuses (added to base stats during character creation)
  strBonus: number
  dexBonus: number
  conBonus: number
  intBonus: number
  wisBonus: number

  // Equipment enchantment bonuses
  startingWeaponBonus: number
  startingArmorBonus: number

  // Multipliers (applied multiplicatively with upgrade multipliers)
  xpMultiplier: number
  goldMultiplier: number
  essenceMultiplier: number

  // Special effects
  hasSecondWind: boolean
  secondWindPercent: number
  adrenalineRushPercent: number // +damage% when below 50% HP
}

// ============================================================================
// DEFAULT BONUSES
// ============================================================================

/** Default bonuses when no boosters are active */
export const DEFAULT_BOOSTER_BONUSES: BoosterBonuses = {
  strBonus: 0,
  dexBonus: 0,
  conBonus: 0,
  intBonus: 0,
  wisBonus: 0,
  startingWeaponBonus: 0,
  startingArmorBonus: 0,
  xpMultiplier: 1,
  goldMultiplier: 1,
  essenceMultiplier: 1,
  hasSecondWind: false,
  secondWindPercent: 0,
  adrenalineRushPercent: 0,
}

// ============================================================================
// COMPUTE BONUSES
// ============================================================================

/**
 * Compute all booster bonuses from active booster IDs
 *
 * @param activeBoosterIds - Array of active booster IDs for this run (max 2)
 * @returns Computed bonuses ready to apply to gameplay
 */
export function computeBoosterBonuses(activeBoosterIds: string[]): BoosterBonuses {
  // Start with defaults
  const bonuses: BoosterBonuses = { ...DEFAULT_BOOSTER_BONUSES }

  for (const id of activeBoosterIds) {
    const booster = getBoosterById(id)
    if (!booster) continue

    const effect = booster.effect

    switch (effect.type) {
      case 'stat_bonus':
        applyStatBonus(bonuses, effect.stat, effect.value)
        break

      case 'equipment_bonus':
        applyEquipmentBonus(bonuses, effect.slot, effect.value)
        break

      case 'multiplier':
        applyMultiplier(bonuses, effect.stat, effect.percent)
        break

      case 'special':
        applySpecialEffect(bonuses, effect.effect, effect.value)
        break
    }
  }

  return bonuses
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Apply a stat bonus
 */
function applyStatBonus(
  bonuses: BoosterBonuses,
  stat: 'str' | 'dex' | 'con' | 'int' | 'wis',
  value: number
): void {
  switch (stat) {
    case 'str':
      bonuses.strBonus += value
      break
    case 'dex':
      bonuses.dexBonus += value
      break
    case 'con':
      bonuses.conBonus += value
      break
    case 'int':
      bonuses.intBonus += value
      break
    case 'wis':
      bonuses.wisBonus += value
      break
  }
}

/**
 * Apply an equipment bonus
 */
function applyEquipmentBonus(
  bonuses: BoosterBonuses,
  slot: 'weapon' | 'armor' | 'both',
  value: number
): void {
  switch (slot) {
    case 'weapon':
      bonuses.startingWeaponBonus = Math.max(bonuses.startingWeaponBonus, value)
      break
    case 'armor':
      bonuses.startingArmorBonus = Math.max(bonuses.startingArmorBonus, value)
      break
    case 'both':
      bonuses.startingWeaponBonus = Math.max(bonuses.startingWeaponBonus, value)
      bonuses.startingArmorBonus = Math.max(bonuses.startingArmorBonus, value)
      break
  }
}

/**
 * Apply a multiplier bonus
 */
function applyMultiplier(
  bonuses: BoosterBonuses,
  stat: 'xp' | 'gold' | 'essence',
  percent: number
): void {
  switch (stat) {
    case 'xp':
      bonuses.xpMultiplier *= 1 + percent / 100
      break
    case 'gold':
      bonuses.goldMultiplier *= 1 + percent / 100
      break
    case 'essence':
      bonuses.essenceMultiplier *= 1 + percent / 100
      break
  }
}

/**
 * Apply a special effect
 */
function applySpecialEffect(bonuses: BoosterBonuses, effect: string, value?: number): void {
  switch (effect) {
    case 'second_wind':
      bonuses.hasSecondWind = true
      bonuses.secondWindPercent = value ?? 20
      break
    case 'adrenaline_rush':
      bonuses.adrenalineRushPercent = value ?? 25
      break
    case 'cheat_stats': {
      const bonus = value ?? 10
      bonuses.strBonus += bonus
      bonuses.dexBonus += bonus
      bonuses.conBonus += bonus
      bonuses.intBonus += bonus
      bonuses.wisBonus += bonus
      break
    }
  }
}

// ============================================================================
// CLASS BOOSTER PRESETS
// ============================================================================

/**
 * Recommended booster loadouts per class.
 * Each class gets their primary stat (superior) + CON (superior).
 * Maps class ID to array of booster IDs.
 */
export const CLASS_BOOSTER_PRESETS: Record<string, [string, string]> = {
  // STR classes
  warrior: ['str_superior', 'con_superior'],
  berserker: ['str_superior', 'con_superior'],
  blackguard: ['str_superior', 'con_superior'],

  // INT classes
  mage: ['int_superior', 'con_superior'],
  archmage: ['int_superior', 'con_superior'],
  necromancer: ['int_superior', 'con_superior'],
  // WIS classes
  priest: ['wis_superior', 'con_superior'],
  paladin: ['wis_superior', 'con_superior'],
  druid: ['wis_superior', 'con_superior'],

  // DEX classes
  rogue: ['dex_superior', 'con_superior'],
  ranger: ['dex_superior', 'con_superior'],
}

/**
 * Get the recommended booster loadout for a class.
 *
 * @param classId - Class ID
 * @returns Array of 2 booster IDs, or empty array if no preset
 */
export function getClassBoosterPreset(classId: string): string[] {
  return CLASS_BOOSTER_PRESETS[classId] ?? []
}

/**
 * Compute booster bonuses using class-based preset.
 *
 * @param classId - Class ID to get preset for
 * @returns Computed booster bonuses
 */
export function computeClassBoosterBonuses(classId: string): BoosterBonuses {
  const preset = getClassBoosterPreset(classId)
  return computeBoosterBonuses(preset)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a booster loadout is valid (max 2 boosters)
 */
export function isValidLoadout(boosterIds: (string | null)[]): boolean {
  const active = boosterIds.filter((id) => id !== null)
  return active.length <= 2
}

/**
 * Get a description of what a booster does
 */
export function getBoosterEffectDescription(boosterId: string): string {
  const booster = getBoosterById(boosterId)
  if (!booster) return 'Unknown booster'
  return booster.description
}
