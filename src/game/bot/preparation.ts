/**
 * Depth Preparation System
 *
 * Angband borg-inspired depth preparation mechanics:
 * - Consumable requirements by depth bracket
 * - Unique-based descent gating
 * - Bot readiness evaluation
 */

import type { Character, Item, UniqueState, MonsterTemplate } from '../types'
import { getLivingUniques } from '../types'
import { POTIONS, SCROLLS } from '../data/items'
import { monsters as MONSTERS } from '../data/monsters'
import type { BotContext, BotGoal } from './types'
import { getClassTier, type ClassTier } from './types'
import type { UpgradeBonuses } from '../upgrade-effects'
import { getUpgradeTier } from '../upgrade-effects'

// ============================================================================
// CONSUMABLE CAPS (Soft Separation)
// ============================================================================

/** Consumable type categories for inventory caps */
export type ConsumableType = 'healing' | 'escape' | 'townPortal' | 'buff' | 'mana' | 'utility'

/** Maximum consumables per type - prevents hoarding low-tier items */
export const CONSUMABLE_CAPS: Record<ConsumableType, number> = {
  healing: 12, // Matches Morgoth requirement
  escape: 4, // Phase Door, Teleport, Teleport Level
  townPortal: 2, // Critical safety item
  buff: 6, // Speed, Heroism, Berserk
  mana: 3, // Restore Mana
  utility: 4, // Cure poison, clarity, restoration, etc.
}

/** Equipment-only inventory limit (consumables are separate) */
export const EQUIPMENT_INVENTORY_LIMIT = 20

// ============================================================================
// ENCUMBRANCE SYSTEM
// ============================================================================

/** Base carrying capacity in 0.1 lbs (500 = 50 lbs) */
const BASE_CAPACITY = 500

/** Extra capacity per point of STR (50 = 5 lbs per STR) */
const STR_CAPACITY_BONUS = 50

/**
 * Calculate character's carry capacity based on strength.
 * @returns Capacity in 0.1 lbs units (e.g., 1000 = 100 lbs)
 */
export function getCarryCapacity(character: Character): number {
  return BASE_CAPACITY + character.stats.str * STR_CAPACITY_BONUS
}

/**
 * Calculate total weight of all inventory items.
 * @returns Weight in 0.1 lbs units
 */
export function getInventoryWeight(inventory: Item[]): number {
  return inventory.reduce((sum, item) => sum + (item.template.weight ?? 0), 0)
}

/**
 * Calculate encumbrance ratio (current weight / capacity).
 * @returns Ratio where 1.0 = at capacity, 1.2 = 20% over
 */
export function getEncumbranceRatio(character: Character): number {
  const capacity = getCarryCapacity(character)
  const weight = getInventoryWeight(character.inventory)
  return weight / capacity
}

/**
 * Calculate speed penalty from being overweight.
 * Each 10% over capacity = -1 speed.
 * @returns Speed penalty (0 if not overweight)
 */
export function getEncumbranceSpeedPenalty(character: Character): number {
  const ratio = getEncumbranceRatio(character)
  if (ratio <= 1.0) return 0
  return Math.floor((ratio - 1.0) * 10) // 110% = -1, 120% = -2, etc.
}

/** Encumbrance tolerance by personality (when to trigger town trip) */
export const ENCUMBRANCE_TOLERANCE: Record<string, number> = {
  greedy: 1.2, // 120% before trip (tolerates -2 speed)
  aggressive: 1.1, // 110%
  cautious: 0.9, // 90% (proactive)
  speedrunner: 0.8, // 80% (speed is everything)
}

// ============================================================================
// CONSUMABLE TYPE CLASSIFICATION
// ============================================================================

/**
 * Determine the consumable type category for an item.
 * Used for type-specific inventory caps.
 */
export function getConsumableType(item: Item): ConsumableType | null {
  const template = item.template

  // Not a consumable
  if (template.type !== 'potion' && template.type !== 'scroll') {
    return null
  }

  // Healing potions
  if (
    template.type === 'potion' &&
    (template.healBase !== undefined || template.healPerLevel !== undefined)
  ) {
    return 'healing'
  }

  // Mana potions
  if (template.type === 'potion' && template.restoresMana) {
    return 'mana'
  }

  // Buff potions (speed, heroism, berserk)
  if (template.type === 'potion' && template.buff) {
    const buffType = template.buff.type
    if (buffType === 'speed' || buffType === 'heroism' || buffType === 'berserk') {
      return 'buff'
    }
  }

  // Utility potions (cure effects, resistance)
  if (template.type === 'potion') {
    if (template.cures || template.curesAll || template.grantsResistance) {
      return 'utility'
    }
  }

  // Town Portal scrolls
  if (template.type === 'scroll' && template.name.includes('Town Portal')) {
    return 'townPortal'
  }

  // Escape scrolls (Phase Door, Teleportation, Teleport Level)
  if (template.type === 'scroll') {
    const name = template.name.toLowerCase()
    if (
      name.includes('phase door') ||
      name.includes('teleportation') ||
      name.includes('teleport level')
    ) {
      return 'escape'
    }
  }

  // Other scrolls count as utility
  if (template.type === 'scroll') {
    return 'utility'
  }

  return null
}

/**
 * Count consumables of a specific type in inventory.
 */
export function countConsumablesByType(inventory: Item[], type: ConsumableType): number {
  return inventory.filter((item) => getConsumableType(item) === type).length
}

/**
 * Check if inventory is at cap for a consumable type.
 */
export function isAtConsumableCap(inventory: Item[], type: ConsumableType): boolean {
  return countConsumablesByType(inventory, type) >= CONSUMABLE_CAPS[type]
}

/**
 * Get the lowest tier consumable of a specific type in inventory.
 * Returns 0 if no items of that type exist.
 */
export function getLowestTierOfType(inventory: Item[], type: ConsumableType): number {
  let lowestTier = Infinity

  for (const item of inventory) {
    if (getConsumableType(item) === type) {
      lowestTier = Math.min(lowestTier, item.template.tier)
    }
  }

  return lowestTier === Infinity ? 0 : lowestTier
}

/**
 * Count equipment items in inventory (non-consumables with a slot).
 */
export function countEquipmentInInventory(inventory: Item[]): number {
  return inventory.filter((item) => item.template.slot !== undefined).length
}

/**
 * Get minimum healing potion tier useful at a given depth.
 * Only healing potions become obsolete - other consumables retain utility.
 *
 * At depth 15+: T1 healing (60 HP) useless with 200+ HP
 * At depth 30+: T2 healing (125 HP) marginal with 350+ HP
 */
export function getMinHealingTier(depth: number): number {
  if (depth >= 30) return 3 // Only T3+ useful
  if (depth >= 15) return 2 // T2+ useful
  return 1 // All tiers useful
}

/**
 * Find outdated healing potions in inventory based on depth.
 * Returns items that should be sold.
 */
export function findOutdatedHealingPotions(inventory: Item[], depth: number): Item[] {
  const minTier = getMinHealingTier(depth)

  return inventory.filter((item) => {
    // Only healing potions
    if (item.template.type !== 'potion') return false
    const consumableType = getConsumableType(item)
    if (consumableType !== 'healing') return false

    // Below minimum tier for this depth
    return item.template.tier < minTier
  })
}

/**
 * Find the lowest tier consumable of a given type in inventory.
 * Returns the item itself (for marking to sell).
 */
export function findLowestTierConsumable(inventory: Item[], type: ConsumableType): Item | null {
  let lowestItem: Item | null = null
  let lowestTier = Infinity

  for (const item of inventory) {
    if (getConsumableType(item) === type) {
      if (item.template.tier < lowestTier) {
        lowestTier = item.template.tier
        lowestItem = item
      }
    }
  }

  return lowestItem
}

// ============================================================================
// DEPTH REQUIREMENTS
// ============================================================================

/** Requirements for safely exploring a depth bracket */
export interface DepthRequirement {
  healingPotions: number
  escapeScrolls: number
  townPortals: number
  minHpPercent: number
  /** Buff potions (speed, heroism, berserk) - required for boss fights */
  buffPotions?: number
  /** Mana potions - required for pure casters (mage, archmage, necromancer) */
  manaPotions?: number
}

/** Pure caster classes that depend on mana for survival (DD kite loop) */
export const PURE_CASTER_CLASSES = ['mage', 'archmage', 'necromancer'] as const

/** Healer classes that depend on mana for survival (heal-spam without escape spells) */
export const HEALER_CLASSES = ['priest', 'druid', 'paladin'] as const

/** All classes that need mana pots for survival */
export const MANA_DEPENDENT_CLASSES = [...PURE_CASTER_CLASSES, ...HEALER_CLASSES] as const

/** Check if a class is a pure caster (requires mana pots for survival) */
export function isPureCaster(classId: string | undefined): boolean {
  return (
    classId !== undefined &&
    PURE_CASTER_CLASSES.includes(classId as (typeof PURE_CASTER_CLASSES)[number])
  )
}

/** Check if a class depends on mana for survival (pure casters + healers) */
export function isManaDependent(classId: string | undefined): boolean {
  return (
    classId !== undefined &&
    MANA_DEPENDENT_CLASSES.includes(classId as (typeof MANA_DEPENDENT_CLASSES)[number])
  )
}

/**
 * Consumable requirements by depth bracket.
 * Core survival items only - buffs are nice-to-have, not gates.
 * Exception: Depth 50 (Morgoth) requires buff potions for the extended boss fight.
 */
export const DEPTH_REQUIREMENTS: Record<number, DepthRequirement> = {
  1: { healingPotions: 0, escapeScrolls: 0, townPortals: 0, minHpPercent: 30 },
  5: { healingPotions: 1, escapeScrolls: 1, townPortals: 1, minHpPercent: 50 },
  10: { healingPotions: 2, escapeScrolls: 2, townPortals: 1, minHpPercent: 60 },
  15: { healingPotions: 3, escapeScrolls: 2, townPortals: 1, minHpPercent: 65 },
  20: { healingPotions: 3, escapeScrolls: 3, townPortals: 2, minHpPercent: 70, manaPotions: 1 },
  30: { healingPotions: 4, escapeScrolls: 3, townPortals: 2, minHpPercent: 75, manaPotions: 2 },
  40: { healingPotions: 5, escapeScrolls: 4, townPortals: 2, minHpPercent: 80, manaPotions: 3 },
  // Morgoth fight: 20,000 HP boss doing 150+ damage/turn requires serious preparation
  // Need enough healing for ~100+ turn fight, plus buffs to boost damage output
  // Pure casters need mana pots to sustain DD kite loop during extended fight
  50: {
    healingPotions: 12,
    escapeScrolls: 4,
    townPortals: 3,
    minHpPercent: 100,
    buffPotions: 3,
    manaPotions: 3,
  },
}

// ============================================================================
// CONSUMABLE COUNTING
// ============================================================================

/**
 * Check if a potion template is a healing potion (has healBase or healPerLevel)
 */
function isHealingPotion(template: { healBase?: number; healPerLevel?: number }): boolean {
  return template.healBase !== undefined || template.healPerLevel !== undefined
}

/**
 * Count healing potions in inventory.
 * Includes any potion with healBase or healPerLevel defined.
 */
export function countHealingPotions(inventory: Item[]): number {
  return inventory.filter(
    (item) => item.template.type === 'potion' && isHealingPotion(item.template)
  ).length
}

/**
 * Count healing potions at or above a minimum tier.
 * Used for tier-based requirements (e.g., "need at least 1 T3+ potion").
 */
export function countHealingPotionsByTier(inventory: Item[], minTier: number): number {
  return inventory.filter(
    (item) =>
      item.template.type === 'potion' &&
      isHealingPotion(item.template) &&
      item.template.tier >= minTier
  ).length
}

/**
 * Count escape scrolls in inventory.
 * Includes Phase Door, Teleportation, and Teleport Level scrolls.
 */
export function countEscapeScrolls(inventory: Item[]): number {
  return inventory.filter(
    (item) =>
      item.template.type === 'scroll' &&
      (item.template.name.includes('Phase Door') ||
        item.template.name.includes('Teleportation') ||
        item.template.name.includes('Teleport Level'))
  ).length
}

/**
 * Count Town Portal scrolls in inventory.
 */
export function countTownPortals(inventory: Item[]): number {
  return inventory.filter((item) => item.template.name === 'Scroll of Town Portal').length
}

/**
 * Count buff potions in inventory.
 * Includes Speed, Heroism, and Berserk Strength potions.
 */
export function countBuffPotions(inventory: Item[]): number {
  return inventory.filter((item) => {
    if (item.template.type !== 'potion') return false
    const buffType = item.template.buff?.type
    return buffType === 'speed' || buffType === 'heroism' || buffType === 'berserk'
  }).length
}

/**
 * Count mana potions in inventory.
 * Includes any potion with restoresMana flag.
 */
export function countManaPotions(inventory: Item[]): number {
  return inventory.filter((item) => item.template.type === 'potion' && item.template.restoresMana)
    .length
}

// ============================================================================
// HEALING TIER REQUIREMENTS
// ============================================================================

/**
 * Healing potion tiers and their minDepth thresholds.
 * Derived from POTIONS data in items.ts using structured healBase/healPerLevel.
 */
const HEALING_POTION_TIERS = POTIONS.filter(
  (p) => p.healBase !== undefined || p.healPerLevel !== undefined
)
  .map((p) => ({ tier: p.tier, minDepth: p.minDepth ?? 0, name: p.name }))
  .sort((a, b) => a.minDepth - b.minDepth)

/**
 * Get the required healing potion tier for a depth.
 * Returns the highest tier that's available at or before this depth.
 *
 * - Depth 1-4:  T1 (Cure Light, minDepth 1)
 * - Depth 5-11: T2 (Cure Serious, minDepth 5)
 * - Depth 12-29: T3 (Cure Critical, minDepth 12)
 * - Depth 30+:  T4 (Healing, minDepth 30) - now available in town shops
 */
export function getRequiredHealingTier(depth: number): number {
  let requiredTier = 1
  for (const potion of HEALING_POTION_TIERS) {
    if (potion.minDepth <= depth) {
      requiredTier = Math.max(requiredTier, potion.tier)
    }
  }
  return requiredTier
}

// ============================================================================
// PERSONALITY SCALING
// ============================================================================

/**
 * Get preparation requirement multiplier based on personality caution.
 *
 * Caution 50 (cautious) = 1.0x requirements (baseline)
 * Caution 20 (aggressive) = 0.4x requirements (yolo)
 * Caution 80 (very cautious) = 1.6x requirements (over-prepared)
 *
 * This lets aggressive bots descend under-prepared (and die more),
 * while cautious bots will trigger town visits earlier.
 */
export function getPrepMultiplier(caution: number): number {
  return caution / 50
}

/**
 * Scale a depth requirement by personality caution.
 * Note: buffPotions, manaPotions, and minHpPercent are NOT scaled for depth 50 (Morgoth fight is non-negotiable)
 */
export function scaleRequirement(req: DepthRequirement, caution: number): DepthRequirement {
  const mult = getPrepMultiplier(caution)
  return {
    healingPotions: Math.floor(req.healingPotions * mult),
    escapeScrolls: Math.floor(req.escapeScrolls * mult),
    townPortals: Math.floor(req.townPortals * mult),
    minHpPercent: Math.floor(req.minHpPercent * mult),
    // Buff/mana potions don't scale - boss fight requirements are absolute
    buffPotions: req.buffPotions,
    manaPotions: req.manaPotions,
  }
}

// ============================================================================
// READINESS EVALUATION
// ============================================================================

/**
 * Get the depth requirement bracket for a given depth.
 * Returns the highest bracket that is <= the target depth.
 */
export function getDepthBracket(depth: number): DepthRequirement {
  const brackets = Object.keys(DEPTH_REQUIREMENTS)
    .map(Number)
    .filter((d) => d <= depth)
    .sort((a, b) => b - a)

  const bracketDepth = brackets[0] ?? 1
  return DEPTH_REQUIREMENTS[bracketDepth]!
}

/**
 * Check if the character is ready for a target depth.
 *
 * Checks vary by preparedness level:
 * - L0: No checks (face-rush mode)
 * - L1: Basic counts (healing, escape, portal counts scaled by caution)
 * - L2: L1 + tier requirements + class-specific level check
 * - L3: L2 + buff/mana requirements for Morgoth
 *
 * @param caution - Personality caution level (0-100). Default 50 for baseline.
 *                  Lower caution = lower requirements (aggressive can yolo).
 *                  Higher caution = stricter requirements (cautious over-prepares).
 * @param preparednessLevel - Bot training level (0-3). Default 3 for full checks.
 * @returns null if ready, or a string describing the missing requirement
 */
export function getDepthReadiness(
  character: Character,
  inventory: Item[],
  targetDepth: number,
  caution: number = 50,
  preparednessLevel: number = 3,
  depthGateOffset: number = 0
): string | null {
  // L0: No checks at all (face-rush mode)
  if (preparednessLevel === 0) return null

  const classId = (character as { classId?: string }).classId
  const baseReq = getDepthBracket(targetDepth)
  const req = scaleRequirement(baseReq, caution)

  // Count consumables
  const healing = countHealingPotions(inventory)
  const escapes = countEscapeScrolls(inventory)
  const portals = countTownPortals(inventory)
  const hpPercent = (character.hp / character.maxHp) * 100

  // L1+: Basic counts (healing, escape, portal, HP%)
  if (preparednessLevel >= 1) {
    if (healing < req.healingPotions) {
      return `Need ${req.healingPotions} healing potions (have ${healing})`
    }
    if (escapes < req.escapeScrolls) {
      return `Need ${req.escapeScrolls} escape scrolls (have ${escapes})`
    }
    if (portals < req.townPortals) {
      return `Need ${req.townPortals} town portals (have ${portals})`
    }
    if (hpPercent < req.minHpPercent) {
      return `Need ${req.minHpPercent}% HP (have ${Math.floor(hpPercent)}%)`
    }
  }

  // L2+: Tier requirements + level check
  if (preparednessLevel >= 2) {
    // Level check: class-specific requirements
    // Warriors can go deep early, mages need to overlevel (scaled by upgrade tier)
    const minLevel = getMinLevel(targetDepth, classId, character.upgradeBonuses, depthGateOffset)
    if (character.level < minLevel) {
      return `Need level ${minLevel} for depth ${targetDepth} (have ${character.level})`
    }

    // Tier requirement: if we need potions, at least 1 must be the appropriate tier
    const requiredTier = getRequiredHealingTier(targetDepth)
    if (req.healingPotions > 0 && requiredTier > 1) {
      const highTierCount = countHealingPotionsByTier(inventory, requiredTier)
      if (highTierCount < 1) {
        const tierNames: Record<number, string> = {
          2: 'Cure Serious+',
          3: 'Cure Critical+',
          4: 'Healing',
        }
        return `Need 1+ ${tierNames[requiredTier] ?? `T${requiredTier}`} potion (have ${highTierCount})`
      }
    }
  }

  // L3: Buff/mana requirements for Morgoth
  if (preparednessLevel >= 3) {
    // Buff potion requirement (for Morgoth fight at depth 50)
    if (req.buffPotions && req.buffPotions > 0) {
      const buffs = countBuffPotions(inventory)
      if (buffs < req.buffPotions) {
        return `Need ${req.buffPotions} buff potions for boss fight (have ${buffs})`
      }
    }

    // Mana potion requirement (for mana-dependent classes - casters + healers)
    if (req.manaPotions && req.manaPotions > 0 && isManaDependent(classId)) {
      const mana = countManaPotions(inventory)
      if (mana < req.manaPotions) {
        return `Need ${req.manaPotions} mana potions (have ${mana})`
      }
    }
  }

  return null
}

/**
 * Check if character is under-prepared for current depth.
 * Uses personality caution to scale the threshold.
 *
 * This triggers town portal usage when supplies run low.
 * Aggressive bots (low caution) tolerate running on empty.
 * Cautious bots trigger town visits earlier.
 *
 * @param caution - Personality caution level (0-100). Default 50.
 */
export function isUnderPrepared(
  _character: Character,
  inventory: Item[],
  currentDepth: number,
  caution: number = 50
): string | null {
  const baseReq = getDepthBracket(currentDepth)
  // Scale requirements by caution, then take 50% as "under-prepared" threshold
  const scaledReq = scaleRequirement(baseReq, caution)

  // Count consumables
  const healing = countHealingPotions(inventory)
  const escapes = countEscapeScrolls(inventory)
  const portals = countTownPortals(inventory)

  // Under-prepared threshold: 50% of scaled requirements
  // For aggressive (caution=20): 50% of 0.4x = effectively 20% of base
  // For cautious (caution=50): 50% of 1.0x = 50% of base
  const minHealing = Math.floor(scaledReq.healingPotions * 0.5)
  const minEscapes = Math.floor(scaledReq.escapeScrolls * 0.5)
  const minPortals = Math.floor(scaledReq.townPortals * 0.5)

  if (healing < minHealing) {
    return `Low on healing potions (have ${healing}, want ${minHealing}+)`
  }
  if (escapes < minEscapes) {
    return `Low on escape scrolls (have ${escapes}, want ${minEscapes}+)`
  }
  if (portals < minPortals) {
    return `Low on town portals (have ${portals}, want ${minPortals}+)`
  }

  return null
}

// ============================================================================
// FARMING TARGETS - Data-Driven Pricing
// ============================================================================

/** Shop price multipliers from merchants.ts */
const SHOP_MULTIPLIERS = {
  potion: 1.8, // town_alchemy priceMultiplier
  scroll: 2.2, // town_magic priceMultiplier
}

/** Buffer for HP restoration at healer */
const HEALER_BUFFER = 100

/**
 * Calculate shop buy price for an item by tier.
 * Price = (tier * 50) * shopMultiplier
 */
function getShopPrice(tier: number, type: 'potion' | 'scroll'): number {
  const baseValue = tier * 50
  return Math.floor(baseValue * SHOP_MULTIPLIERS[type])
}

/**
 * Get Phase Door scroll from data (T1 escape scroll).
 * Used for escape scroll pricing - no tier scaling per user requirement.
 */
const PHASE_DOOR = SCROLLS.find((s) => s.name.includes('Phase Door'))
const PHASE_DOOR_PRICE = PHASE_DOOR ? getShopPrice(PHASE_DOOR.tier, 'scroll') : 110

/**
 * Get Town Portal scroll from data.
 */
const TOWN_PORTAL = SCROLLS.find((s) => s.name.includes('Town Portal'))
const TOWN_PORTAL_PRICE = TOWN_PORTAL ? getShopPrice(TOWN_PORTAL.tier, 'scroll') : 220

/**
 * Calculate gold needed to buy consumables for a target depth.
 * Uses actual item data for pricing:
 * - Healing potions: 1 of required tier + rest as T1 (cheapest)
 * - Escape scrolls: All at T1 price (Phase Door) - no tier scaling
 * - Town portals: Actual T2 price from data
 *
 * @param targetDepth - The depth we want to descend to
 * @param caution - Personality caution level (scales requirements)
 * @returns Gold amount needed to buy required consumables
 */
export function getGoldTarget(targetDepth: number, caution: number): number {
  const baseReq = getDepthBracket(targetDepth)
  const req = scaleRequirement(baseReq, caution)

  // Healing potions: 1 of required tier, rest as cheap T1
  const requiredHealingTier = getRequiredHealingTier(targetDepth)
  const t1HealingPrice = getShopPrice(1, 'potion')
  const topTierHealingPrice = getShopPrice(requiredHealingTier, 'potion')

  let healingCost = 0
  if (req.healingPotions > 0) {
    // 1 of required tier + remaining as T1
    healingCost = topTierHealingPrice + (req.healingPotions - 1) * t1HealingPrice
  }

  // Escape scrolls: No tier scaling, all priced as Phase Door (T1)
  const escapeCost = req.escapeScrolls * PHASE_DOOR_PRICE

  // Town portals: Actual price from data
  // Always include at least 1 TP cost - ensures bot can restock after using a TP for the trip
  const minPortals = Math.max(1, req.townPortals)
  const portalCost = minPortals * TOWN_PORTAL_PRICE

  return healingCost + escapeCost + portalCost + HEALER_BUFFER
}

// ============================================================================
// EQUIPMENT SELL VALUE ESTIMATION
// ============================================================================

/**
 * Conservative sell multiplier - underestimate to leave room for gear purchases.
 * Town shops pay 0.35-0.40, we use 0.25 to be safe.
 */
const CONSERVATIVE_SELL_MULTIPLIER = 0.25

/**
 * Estimate the sell value of a single item.
 * Uses quadratic pricing to match shop costs: tier² * 50 + enchant² * 100
 * Conservative multiplier to underestimate and leave room for gear purchases.
 */
function estimateItemSellValue(item: Item): number {
  const template = item.template

  // Only equipment has meaningful sell value
  const sellableTypes = [
    'weapon',
    'bow',
    'armor',
    'shield',
    'helm',
    'gloves',
    'boots',
    'ring',
    'amulet',
  ]
  if (!sellableTypes.includes(template.type)) return 0

  // Quadratic tier pricing: tier² * 50
  const tier = template.tier
  let value = tier * tier * 50

  // Weapons and armor worth more
  if (template.type === 'weapon' || template.type === 'bow') {
    value *= 2
  } else if (template.type === 'armor') {
    value *= 1.5
  }

  // Quadratic enchantment value: enchant² * 100
  const enchant = item.enchantment ?? 0
  value += enchant * enchant * 100

  // Apply conservative sell multiplier
  return Math.floor(value * CONSERVATIVE_SELL_MULTIPLIER)
}

/**
 * Estimate total sell value of non-equipped inventory items.
 * Excludes consumables (potions/scrolls) we might need.
 */
export function estimateInventorySellValue(inventory: Item[]): number {
  return inventory.reduce((total, item) => total + estimateItemSellValue(item), 0)
}

/**
 * Get effective gold for farming readiness checks.
 * = current gold + estimated sell value of inventory equipment
 *
 * This allows the bot to recognize it has enough "wealth" to go to town
 * and sell equipment to afford consumables.
 */
export function getEffectiveGold(character: Character): number {
  return character.gold + estimateInventorySellValue(character.inventory)
}

/**
 * Get level offset for a class tier.
 * Positive = needs to be higher level than depth.
 * Negative = can be lower level than depth.
 *
 * Formula: required level = depth + offset
 *
 * SQUISHY classes scale from +5 (no upgrades) to +0 (full upgrades)
 * based on survivability from meta-progression upgrades.
 */
function getClassLevelOffset(tier: ClassTier, upgradeBonuses?: UpgradeBonuses): number {
  switch (tier) {
    case 'TANK':
      return -4 // level >= depth - 4
    case 'MEDIUM':
      return 0 // level >= depth
    case 'SQUISHY': {
      // Scale from +5 (no upgrades) to +0 (full upgrades)
      const upgradeTier = upgradeBonuses ? getUpgradeTier(upgradeBonuses) : 0
      const offsets = [5, 4, 3, 1, 0] // none → early → mid → late → full
      return offsets[upgradeTier] ?? 5
    }
  }
}

/**
 * Get minimum character level for a depth, accounting for class and upgrades.
 *
 * Angband borg-inspired:
 * - Warriors: can handle depth 4 levels above their level
 * - Hybrids: need to match depth with level
 * - Mages: need to be 5 levels above depth (scales down with upgrades)
 *
 * @param depth - Target dungeon depth
 * @param classId - Character's class ID (defaults to medium tier)
 * @param upgradeBonuses - Meta-progression bonuses (affects SQUISHY requirement)
 */
export function getMinLevel(
  depth: number,
  classId?: string,
  upgradeBonuses?: UpgradeBonuses,
  depthGateOffset: number = 0
): number {
  const tier = classId ? getClassTier(classId) : 'MEDIUM'
  const offset = getClassLevelOffset(tier, upgradeBonuses)
  // Cap at 50 (max level) - SQUISHY classes can't reach level 55 for depth 50
  return Math.min(50, Math.max(1, depth + offset + depthGateOffset))
}

/**
 * Check if character is under-leveled for a depth.
 * Uses class-specific requirements.
 *
 * @param characterLevel - Current character level
 * @param depth - Target depth to check against
 * @param classId - Character's class ID (defaults to medium tier)
 * @param upgradeBonuses - Meta-progression bonuses (affects SQUISHY requirement)
 */
export function isUnderLeveled(
  characterLevel: number,
  depth: number,
  classId?: string,
  upgradeBonuses?: UpgradeBonuses,
  depthGateOffset: number = 0
): boolean {
  return characterLevel < getMinLevel(depth, classId, upgradeBonuses, depthGateOffset)
}

// ============================================================================
// UNIQUE DESCENT GATING
// ============================================================================

/**
 * Check if living uniques block descent to a target depth.
 *
 * Angband-style rule: If 2+ uniques exist between current and target depth,
 * descent is blocked until at least one is killed.
 *
 * @param currentDepth - The player's current depth
 * @param targetDepth - The depth the player wants to descend to
 * @param uniqueState - Tracking state for unique spawns/kills
 * @param monsterTemplates - All monster templates (to look up minDepth)
 * @returns The name of a blocking unique, or null if descent is allowed
 */
export function getUniqueBlocker(
  currentDepth: number,
  targetDepth: number,
  uniqueState: UniqueState,
  monsterTemplates: MonsterTemplate[]
): string | null {
  const livingUniques = getLivingUniques(uniqueState)

  // Find uniques whose minDepth is between current and target (inclusive of target)
  // These are uniques the player "should" encounter before going deeper
  const blockingUniques = livingUniques.filter((name) => {
    const template = monsterTemplates.find((m) => m.name === name)
    if (!template) return false
    // Unique is "blocking" if its natural depth is at or above current,
    // but the player encountered it and let it live
    return template.minDepth >= currentDepth && template.minDepth <= targetDepth
  })

  // 2+ living uniques in range blocks descent
  if (blockingUniques.length >= 2) {
    return blockingUniques[0]!
  }

  return null
}

/**
 * Find uniques that are alive and native to depths <= targetDepth.
 * Used for hunting priority decisions.
 */
export function getRelevantLivingUniques(
  targetDepth: number,
  uniqueState: UniqueState,
  monsterTemplates: MonsterTemplate[]
): string[] {
  const livingUniques = getLivingUniques(uniqueState)

  return livingUniques.filter((name) => {
    const template = monsterTemplates.find((m) => m.name === name)
    return template && template.minDepth <= targetDepth
  })
}

// ============================================================================
// HUNT UNIQUE GOAL
// ============================================================================

/** Exploration threshold to trigger unique hunt flip (80% of level seen this visit) */
const UNIQUE_HUNT_FLIP_THRESHOLD = 0.8

/**
 * Get HUNT_UNIQUE goal - hunt unique monsters blocking descent.
 *
 * If 2+ living uniques block descent to next depth:
 * 1. If unique visible → HUNT_UNIQUE (engage it)
 * 2. If level not sufficiently explored (seenThisVisit) → null (let EXPLORE find it)
 * 3. If level 80%+ seen this visit, unique not found → ASCEND_TO_FARM (flip level to respawn)
 *
 * Uses seenThisVisit (resets on level change) instead of tile.explored (persists)
 * to prevent infinite flip loops.
 */
export function getHuntUniqueGoal(context: BotContext): BotGoal | null {
  const { game, visibleMonsters, botState } = context
  const character = game.character
  const nextDepth = character.depth + 1

  // Skip in town
  if (character.depth === 0) return null

  // Check for unique blocker (Morgoth hunt is handled separately in getMorgothHuntGoal)
  const uniqueBlocker = getUniqueBlocker(character.depth, nextDepth, game.uniqueState, MONSTERS)

  if (!uniqueBlocker) {
    // No blocker - clear hunt state if active
    if (botState.huntingUniqueBlocker) {
      botState.huntingUniqueBlocker = null
      botState.uniqueHuntFlipDepth = null
    }
    return null
  }

  // Check if the blocking unique is visible on current level
  const uniqueMonster = visibleMonsters.find(
    (m) => m.template.name === uniqueBlocker && m.template.flags?.includes('UNIQUE') && m.hp > 0
  )

  if (uniqueMonster) {
    // Found it! Engage.
    return {
      type: 'HUNT_UNIQUE',
      target: uniqueMonster.position,
      targetId: uniqueMonster.id,
      reason: `Hunting ${uniqueBlocker} to unlock descent`,
      startTurn: game.turn,
    }
  }

  // Unique exists but not visible - check seenThisVisit coverage
  // Using seenThisVisit (resets on level change) instead of tile.explored (persists)
  // prevents infinite flip loops where bot immediately re-flips after returning
  const level = game.currentLevel
  let totalFloor = 0
  for (const row of level.tiles) {
    for (const tile of row) {
      if (tile.type !== 'wall') {
        totalFloor++
      }
    }
  }
  const seenRate = totalFloor > 0 ? botState.seenThisVisit.count / totalFloor : 0

  if (seenRate < UNIQUE_HUNT_FLIP_THRESHOLD) {
    // Not enough of level seen this visit - let EXPLORE goal find the unique
    return null
  }

  // Level 80%+ seen this visit, unique not found - trigger level flip
  // This forces respawn of monsters, giving another chance to find the unique
  botState.huntingUniqueBlocker = uniqueBlocker
  botState.uniqueHuntFlipDepth = character.depth

  // Find stairs up
  const stairsUp = botState.knownStairsUp ?? game.currentLevel.stairsUp
  if (!stairsUp) {
    // No stairs up available - give up on flip (shouldn't happen in dungeon)
    return null
  }

  return {
    type: 'ASCEND_TO_FARM',
    target: stairsUp,
    targetId: null,
    reason: `Level flip to find ${uniqueBlocker}`,
    startTurn: game.turn,
  }
}
