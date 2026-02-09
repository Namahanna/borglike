/**
 * Upgrade Effects Module
 *
 * Pure functions for computing bonuses from upgrade levels.
 * Used to apply meta-progression upgrades to gameplay.
 */

import { getUpgradeById, calculateUpgradeEffect } from './data/upgrades'

// ============================================================================
// TYPES
// ============================================================================

/** Computed stat bonuses from upgrades */
export interface UpgradeBonuses {
  // Stat bonuses
  maxHpBonus: number // Flat HP bonus (from vitality)
  maxHpPercent: number // Percent HP bonus (from vitality, 1% per level)
  damagePercent: number // Damage multiplier percent (from might)
  armorBonus: number // Flat armor bonus (from resilience)
  armorPercent: number // Percent armor bonus (from resilience, 1% per level)
  dodgePercent: number // Flat evasion bonus (from reflexes, despite name)
  dodgeChancePercent: number // Dodge chance vs monsters (from reflexes, 1% per level)
  armorPenPercent: number // % of target armor ignored (from precision)
  speedBonus: number // Flat speed bonus (from swiftness)

  // Meta bonuses (multipliers)
  xpMultiplier: number // XP gain multiplier (from fast_learner)
  goldMultiplier: number // Gold gain multiplier (from gold_digger)
  essenceMultiplier: number // Essence gain multiplier (from essence_boost)
  merchantDiscount: number // Merchant price discount percent (from haggler)
  bestiaryCapPercent: number // Max bestiary knowledge bonus % (10 base + 5 per bestiary_mastery level)
  townShopTier: number // Town shop inventory tier (0=T1 only, 1=T1-T2, 2=T1-T3)

  // QoL bonuses
  turboSpeedPercent: number // Extra turbo speed (from turbo_mode)
  hasAutoRestart: boolean // Auto-restart enabled (from auto_restart)
}

/** Upgrade level state (typically from Pinia store) */
export interface UpgradeLevels {
  [upgradeId: string]: number
}

// ============================================================================
// COMPUTE BONUSES
// ============================================================================

/**
 * Compute all upgrade bonuses from current upgrade levels
 *
 * @param levels - Current upgrade level state
 * @param upgradePowerPercent - Power multiplier for upgrades (100 = normal)
 * @returns Computed bonuses ready to apply to gameplay
 */
export function computeUpgradeBonuses(
  levels: UpgradeLevels,
  upgradePowerPercent = 100
): UpgradeBonuses {
  // Scale factor for upgrade power
  const scale = upgradePowerPercent / 100

  return {
    // Stat bonuses (scaled)
    maxHpBonus: Math.floor(getEffectValue(levels, 'vitality') * scale),
    maxHpPercent: Math.floor((levels['vitality'] || 0) * 1 * scale), // 1% per vitality level
    damagePercent: Math.floor(getEffectValue(levels, 'might') * scale),
    armorBonus: Math.floor(getEffectValue(levels, 'resilience') * scale),
    armorPercent: Math.floor((levels['resilience'] || 0) * 1 * scale), // 1% per resilience level
    dodgePercent: Math.floor(getEffectValue(levels, 'reflexes') * scale),
    dodgeChancePercent: Math.floor((levels['reflexes'] || 0) * 1 * scale), // 1% per swiftness level
    armorPenPercent: Math.floor(getEffectValue(levels, 'precision') * scale),
    speedBonus: Math.floor(getEffectValue(levels, 'swiftness') * scale),

    // Meta bonuses (scaled, but multiplier base of 1 is preserved)
    xpMultiplier: 1 + (getEffectValue(levels, 'fast_learner') / 100) * scale,
    goldMultiplier: 1 + (getEffectValue(levels, 'gold_digger') / 100) * scale,
    essenceMultiplier: 1 + (getEffectValue(levels, 'essence_boost') / 100) * scale,
    merchantDiscount: Math.floor(getEffectValue(levels, 'haggler') * scale),
    bestiaryCapPercent: 10 + getEffectValue(levels, 'bestiary_mastery'), // 10% base + 5% per level (not scaled by upgradePower)
    townShopTier: getEffectValue(levels, 'town_stock'), // Discrete tier, not scaled by upgradePower

    // QoL bonuses (not scaled - turbo speed and auto-restart are convenience features)
    turboSpeedPercent: getEffectValue(levels, 'turbo_mode'),
    hasAutoRestart: (levels['auto_restart'] || 0) > 0,
  }
}

/**
 * Get the computed effect value for a specific upgrade
 */
function getEffectValue(levels: UpgradeLevels, upgradeId: string): number {
  const level = levels[upgradeId] || 0
  if (level <= 0) return 0

  const upgrade = getUpgradeById(upgradeId)
  if (!upgrade) return 0

  return calculateUpgradeEffect(upgrade, level)
}

// ============================================================================
// UPGRADE PRESETS
// ============================================================================

/**
 * Predefined upgrade level configurations for testing progression.
 * Maps preset name to upgrade level configuration.
 */
export const UPGRADE_PRESETS: Record<string, UpgradeLevels> = {
  none: {},
  early: {
    vitality: 2,
    might: 2,
    resilience: 1,
  },
  mid: {
    vitality: 5,
    might: 5,
    resilience: 5,
    reflexes: 4,
    precision: 2,
    swiftness: 2,
    town_stock: 1,
  },
  late: {
    vitality: 8,
    might: 8,
    resilience: 7,
    reflexes: 6,
    precision: 4,
    swiftness: 4,
    town_stock: 2,
  },
  // 'full' is handled specially via computeMaxUpgradeBonuses()
}

/**
 * Compute upgrade bonuses from a preset name
 *
 * @param preset - Preset name: 'none', 'early', 'mid', 'late', 'full'
 * @param upgradePowerPercent - Power multiplier (100 = normal)
 */
export function computeUpgradeBonusesFromPreset(
  preset: string,
  upgradePowerPercent = 100
): UpgradeBonuses {
  const normalized = preset.toLowerCase().trim()

  if (normalized === 'full') {
    return computeMaxUpgradeBonuses(upgradePowerPercent)
  }

  const levels = UPGRADE_PRESETS[normalized]
  if (levels) {
    return computeUpgradeBonuses(levels, upgradePowerPercent)
  }

  // Unknown preset - return default (no upgrades)
  return DEFAULT_BONUSES
}

// ============================================================================
// DEFAULT BONUSES
// ============================================================================

/**
 * Default bonuses when no upgrades are purchased
 */
export const DEFAULT_BONUSES: UpgradeBonuses = {
  maxHpBonus: 0,
  maxHpPercent: 0,
  damagePercent: 0,
  armorBonus: 0,
  armorPercent: 0,
  dodgePercent: 0,
  dodgeChancePercent: 0,
  armorPenPercent: 0,
  speedBonus: 0,
  xpMultiplier: 1,
  goldMultiplier: 1,
  essenceMultiplier: 1,
  merchantDiscount: 0,
  bestiaryCapPercent: 10,
  townShopTier: 0,
  turboSpeedPercent: 0,
  hasAutoRestart: false,
}

/**
 * Compute bonuses with all upgrades at max level
 *
 * @param upgradePowerPercent - Power multiplier for upgrades (100 = normal)
 */
export function computeMaxUpgradeBonuses(upgradePowerPercent = 100): UpgradeBonuses {
  const maxLevels: UpgradeLevels = {}
  for (const upgrade of allUpgrades) {
    maxLevels[upgrade.id] = upgrade.maxLevel
  }
  return computeUpgradeBonuses(maxLevels, upgradePowerPercent)
}

// Import for computeMaxUpgradeBonuses
import { upgrades as allUpgrades } from './data/upgrades'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Apply damage multiplier to a base damage value
 */
export function applyDamageBonus(baseDamage: number, bonuses: UpgradeBonuses): number {
  return Math.floor(baseDamage * (1 + bonuses.damagePercent / 100))
}

/**
 * Apply XP multiplier to earned XP
 */
export function applyXPBonus(baseXP: number, bonuses: UpgradeBonuses): number {
  return Math.floor(baseXP * bonuses.xpMultiplier)
}

/**
 * Apply gold multiplier to found gold
 */
export function applyGoldBonus(baseGold: number, bonuses: UpgradeBonuses): number {
  return Math.floor(baseGold * bonuses.goldMultiplier)
}

/**
 * Determine upgrade tier (0-4) based on total upgrade power.
 * Uses maxHpBonus as proxy since it directly reflects survivability.
 * Vitality: 15 + 10*(level-1), max level 10 → 15-105 HP range
 */
export function getUpgradeTier(bonuses: UpgradeBonuses): number {
  // maxHpBonus from vitality: none=0, early(2)=25, mid(5)=55, late(8)=85, full(10)=105
  const hp = bonuses.maxHpBonus
  if (hp >= 90) return 4 // full (vitality 9-10)
  if (hp >= 70) return 3 // late (vitality 7-8)
  if (hp >= 40) return 2 // mid (vitality 4-6)
  if (hp >= 15) return 1 // early (vitality 1-3)
  return 0 // none
}

// ============================================================================
// BOOSTER INTEGRATION
// ============================================================================

import type { BoosterBonuses } from './booster-effects'
import { DEFAULT_BOOSTER_BONUSES } from './booster-effects'

/** Combined bonuses from both upgrades and boosters */
export interface CombinedBonuses extends UpgradeBonuses {
  // Booster-specific bonuses
  strBonus: number
  dexBonus: number
  conBonus: number
  intBonus: number
  wisBonus: number
  startingWeaponBonus: number
  startingArmorBonus: number
  hasSecondWind: boolean
  secondWindPercent: number
  adrenalineRushPercent: number
}

/**
 * Merge upgrade bonuses with booster bonuses
 *
 * - Stat bonuses from boosters are passed through for character creation
 * - Equipment bonuses are passed through for starting gear
 * - Multipliers stack multiplicatively
 * - Special effects are combined
 *
 * @param upgradeBonuses - Bonuses from meta-progression upgrades
 * @param boosterBonuses - Bonuses from active per-run boosters
 * @returns Combined bonuses ready for game systems
 */
export function mergeWithBoosterBonuses(
  upgradeBonuses: UpgradeBonuses,
  boosterBonuses: BoosterBonuses = DEFAULT_BOOSTER_BONUSES
): CombinedBonuses {
  return {
    // Pass through all upgrade bonuses
    ...upgradeBonuses,

    // Multipliers stack multiplicatively
    xpMultiplier: upgradeBonuses.xpMultiplier * boosterBonuses.xpMultiplier,
    goldMultiplier: upgradeBonuses.goldMultiplier * boosterBonuses.goldMultiplier,
    essenceMultiplier: upgradeBonuses.essenceMultiplier * boosterBonuses.essenceMultiplier,

    // Booster-specific stat bonuses (passed through to character creation)
    strBonus: boosterBonuses.strBonus,
    dexBonus: boosterBonuses.dexBonus,
    conBonus: boosterBonuses.conBonus,
    intBonus: boosterBonuses.intBonus,
    wisBonus: boosterBonuses.wisBonus,

    // Equipment bonuses
    startingWeaponBonus: boosterBonuses.startingWeaponBonus,
    startingArmorBonus: boosterBonuses.startingArmorBonus,

    // Special effects
    hasSecondWind: boosterBonuses.hasSecondWind,
    secondWindPercent: boosterBonuses.secondWindPercent,
    adrenalineRushPercent: boosterBonuses.adrenalineRushPercent,
  }
}
