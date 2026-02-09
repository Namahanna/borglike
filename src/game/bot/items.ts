/**
 * Item Evaluation and Equipment Logic
 *
 * Handles item pickup decisions, equipment comparison, and value scoring.
 * Determines when to pick up items and whether to equip them.
 */

import type { Item, GroundItem, Character, EquipSlot, ItemTemplate, GameAction } from '../types'
import type { PersonalityConfig, BotContext, BotGoal, DangerMap } from './types'
import { getLocalDanger } from './danger'
import { isSamePoint } from '../types'
import {
  getConsumableType,
  isAtConsumableCap,
  countEquipmentInInventory,
  getLowestTierOfType,
  EQUIPMENT_INVENTORY_LIMIT,
} from './preparation'
import { isDangerousItemBlacklisted } from './state'
import { getDiceAverage } from '../dice'

// ============================================================================
// TYPES
// ============================================================================

/** Item evaluation result */
export interface ItemEvaluation {
  /** Overall value score (higher = more valuable) */
  score: number
  /** Is this item useful for us? */
  isUseful: boolean
  /** Reason for the evaluation */
  reason: string
  /** If equipment, the slot it would go in */
  slot: EquipSlot | null
  /** If equipment, is it an upgrade over current? */
  isUpgrade: boolean
}

/** Equipment comparison result */
export interface EquipmentComparison {
  /** Should we equip the new item? */
  shouldEquip: boolean
  /** Score difference (positive = new is better) */
  scoreDiff: number
  /** Reason for decision */
  reason: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base values by item tier */
const TIER_BASE_VALUE: Record<number, number> = {
  1: 10,
  2: 25,
  3: 50,
  4: 100,
}

/** Slot importance for scoring (higher = more important slot) */
const SLOT_IMPORTANCE: Record<EquipSlot, number> = {
  weapon: 100,
  armor: 80,
  shield: 60,
  helm: 40,
  gloves: 30,
  boots: 30,
  ring1: 50,
  ring2: 50,
  amulet: 50,
  light: 20,
  bow: 40,
}

/**
 * Class weapon affinity - multipliers for weapon/staff scoring
 * Determines how much each class values weapons vs staves
 */
const WEAPON_CLASS_AFFINITY: Record<
  string,
  { staff: number; weapon: number; edgedPenalty?: number }
> = {
  // Pure casters - love staves, hate melee weapons
  mage: { staff: 3.0, weapon: 0.3 },
  archmage: { staff: 3.5, weapon: 0.2 },
  necromancer: { staff: 3.0, weapon: 0.3 },

  // Pure melee - hate staves, love weapons
  warrior: { staff: 0.3, weapon: 1.2 },
  berserker: { staff: 0.2, weapon: 1.5 },
  blackguard: { staff: 0.3, weapon: 1.2 },

  // Holy melee - prefer blunt weapons, can use staves, cannot use edged (Angband theme)
  priest: { staff: 1.2, weapon: 1.0, edgedPenalty: 0.1 },
  druid: { staff: 1.0, weapon: 1.0, edgedPenalty: 0.1 },

  // Hybrids - moderate preferences
  paladin: { staff: 0.5, weapon: 1.0 },
  ranger: { staff: 0.5, weapon: 1.0 },

  // Skill classes
  rogue: { staff: 0.4, weapon: 1.0 },
}

// ============================================================================
// ITEM EVALUATION
// ============================================================================

/**
 * Evaluate an item's overall value
 */
export function evaluateItem(item: Item, character: Character): ItemEvaluation {
  const template = item.template

  // Gold items have simple value
  if (item.goldValue !== undefined) {
    return {
      score: item.goldValue,
      isUseful: true,
      reason: 'Gold',
      slot: null,
      isUpgrade: false,
    }
  }

  // Consumables
  if (template.type === 'potion' || template.type === 'scroll') {
    return evaluateConsumable(item, character)
  }

  // Equipment
  if (template.slot) {
    return evaluateEquipment(item, character)
  }

  // Unknown item type
  return {
    score: TIER_BASE_VALUE[template.tier] ?? 10,
    isUseful: false,
    reason: 'Unknown item type',
    slot: null,
    isUpgrade: false,
  }
}

/**
 * Evaluate a consumable item (potion/scroll)
 */
function evaluateConsumable(item: Item, character: Character): ItemEvaluation {
  const template = item.template
  const baseValue = TIER_BASE_VALUE[template.tier] ?? 10
  let score = baseValue
  const isUseful = true
  let reason = template.type === 'potion' ? 'Potion' : 'Scroll'

  // Healing potions are very valuable when HP is low (use structured data)
  if (template.healBase !== undefined || template.healPerLevel !== undefined) {
    const hpRatio = character.hp / character.maxHp
    if (hpRatio < 0.5) {
      score *= 2
      reason = 'Healing (HP low)'
    } else {
      reason = 'Healing'
    }
  }

  // Speed potions are always valuable (use structured data)
  if (template.buff?.type === 'speed') {
    score *= 1.5
    reason = 'Speed buff'
  }

  // Teleport scrolls are valuable for escape (still use name - scrolls not refactored)
  if (
    template.name.toLowerCase().includes('teleport') ||
    template.name.toLowerCase().includes('phase')
  ) {
    score *= 1.3
    reason = 'Escape option'
  }

  return {
    score,
    isUseful,
    reason,
    slot: null,
    isUpgrade: false,
  }
}

/**
 * Evaluate an equipment item
 */
function evaluateEquipment(item: Item, character: Character): ItemEvaluation {
  const template = item.template

  // Only rangers equip bows — other classes waste turns shooting instead of casting
  if (template.type === 'bow' && character.classId !== 'ranger') {
    return {
      score: 0,
      isUseful: false,
      reason: 'Non-ranger ignores bow',
      slot: null,
      isUpgrade: false,
    }
  }

  const slot = getEquipSlot(template)

  if (!slot) {
    return {
      score: 0,
      isUseful: false,
      reason: 'No valid slot',
      slot: null,
      isUpgrade: false,
    }
  }

  // Calculate equipment score with class preferences
  const itemScore = calculateEquipmentScore(item, character.classId)
  const currentItem = getEquippedItem(character, slot)
  const currentScore = currentItem ? calculateEquipmentScore(currentItem, character.classId) : 0
  const isUpgrade = itemScore > currentScore

  // Base value from tier
  let score = TIER_BASE_VALUE[template.tier] ?? 10

  // Add slot importance
  score += SLOT_IMPORTANCE[slot] ?? 0

  // Big bonus if it's an upgrade
  if (isUpgrade) {
    score += (itemScore - currentScore) * 2
  }

  // Artifact bonus
  if (item.artifact) {
    score += 50
  }

  const reason = isUpgrade
    ? `Upgrade for ${slot} (+${Math.floor(itemScore - currentScore)})`
    : currentItem
      ? `${slot} (current is better)`
      : `${slot} (new slot)`

  return {
    score,
    isUseful: true,
    reason,
    slot,
    isUpgrade,
  }
}

// ============================================================================
// PICKUP DECISIONS
// ============================================================================

/**
 * Decide whether to pick up an item.
 *
 * Uses soft separation: consumables have type-specific caps,
 * equipment shares a separate 20-slot limit.
 */
export function shouldPickup(
  item: GroundItem,
  character: Character,
  config: PersonalityConfig
): boolean {
  // Always pick up gold
  if (item.goldValue !== undefined) {
    return true
  }

  const evaluation = evaluateItem(item, character)

  // Consumables: check type-specific cap
  if (item.template.type === 'potion' || item.template.type === 'scroll') {
    const type = getConsumableType(item as Item)
    if (!type) {
      // Unknown consumable - use greed threshold
      const greedThreshold = Math.max(5, 15 - config.greed / 10)
      return evaluation.score >= greedThreshold
    }

    // Under cap: always pickup
    if (!isAtConsumableCap(character.inventory, type)) {
      return true
    }

    // At cap: only pickup if this is a tier upgrade
    const lowestTier = getLowestTierOfType(character.inventory, type)
    if (item.template.tier > lowestTier) {
      // Higher tier than existing - worth picking up for upgrade
      return true
    }

    // At cap with no upgrade - skip
    return false
  }

  // Equipment: check equipment inventory limit
  if (item.template.slot) {
    const slot = getEquipSlot(item.template)
    if (slot) {
      const currentItem = getEquippedItem(character, slot)

      // Always pick up for empty slot
      if (!currentItem) {
        return true
      }

      // Always pick up upgrades (will equip immediately)
      if (evaluation.isUpgrade) {
        return true
      }

      // Check equipment inventory limit for non-upgrades
      const equipmentCount = countEquipmentInInventory(character.inventory)
      if (equipmentCount >= EQUIPMENT_INVENTORY_LIMIT) {
        return false
      }

      // Have room - use greed threshold
      const greedThreshold = Math.max(5, 15 - config.greed / 10)
      return evaluation.score >= greedThreshold * 2
    }
  }

  // Unknown item type - use greed threshold
  const greedThreshold = Math.max(5, 15 - config.greed / 10)
  return evaluation.score >= greedThreshold * 2
}

// ============================================================================
// EQUIPMENT COMPARISON
// ============================================================================

/**
 * Compare two equipment items for the same slot
 * @param classId - Optional class ID for class-specific weapon preferences
 */
export function compareEquipment(
  newItem: Item,
  currentItem: Item | null,
  classId?: string
): EquipmentComparison {
  const newScore = calculateEquipmentScore(newItem, classId)
  const currentScore = currentItem ? calculateEquipmentScore(currentItem, classId) : 0
  const scoreDiff = newScore - currentScore

  if (!currentItem) {
    return {
      shouldEquip: true,
      scoreDiff: newScore,
      reason: 'Empty slot',
    }
  }

  if (scoreDiff > 0) {
    return {
      shouldEquip: true,
      scoreDiff,
      reason: `Better by ${Math.floor(scoreDiff)} points`,
    }
  }

  return {
    shouldEquip: false,
    scoreDiff,
    reason: `Current is better by ${Math.floor(-scoreDiff)} points`,
  }
}

/**
 * Decide whether to equip an item from inventory
 */
export function shouldEquip(item: Item, character: Character): boolean {
  if (item.template.type === 'bow' && character.classId !== 'ranger') return false
  const slot = getEquipSlot(item.template)
  if (!slot) return false

  const currentItem = getEquippedItem(character, slot)
  const comparison = compareEquipment(item, currentItem, character.classId)

  return comparison.shouldEquip
}

/**
 * Calculate a score for equipment based on its stats
 * @param item - The item to score
 * @param classId - Optional class ID for class-specific weapon preferences
 */
export function calculateEquipmentScore(item: Item, classId?: string): number {
  const template = item.template
  let score = 0

  // Weapon/Staff: damage is primary
  if ((template.type === 'weapon' || template.type === 'staff') && template.damage) {
    const avgDamage = getDiceAverage(template.damage)
    score += avgDamage * 10
  }

  // Bow: damage * multiplier is the key metric, plus hitBonus
  if (template.type === 'bow' && template.damage) {
    const avgDamage = getDiceAverage(template.damage)
    const multiplier = template.multiplier ?? 1
    score += avgDamage * multiplier * 10
    if (template.hitBonus) {
      score += template.hitBonus * 5
    }
  }

  // Spell power bonus (staves) - casters value this highly
  if (template.spellPower) {
    score += template.spellPower * 2
  }

  // Armor/protection
  if (template.protection !== undefined) {
    score += template.protection * 3
  }

  // Enchantment bonus
  score += item.enchantment * 5

  // Tier bonus
  score += (template.tier - 1) * 10

  // Artifact bonus
  if (item.artifact) {
    score += 30
  }

  // Effect bonus (simple heuristic)
  if (template.effect) {
    score += 15
  }

  // Light radius bonus (lantern > torch)
  if (template.lightRadius) {
    score += template.lightRadius * 10
  }

  // Template bonuses (rings/amulets with structured bonuses)
  if (template.bonuses) {
    // Stat bonuses
    score += (template.bonuses.STR ?? 0) * 8
    score += (template.bonuses.DEX ?? 0) * 8
    score += (template.bonuses.CON ?? 0) * 8
    score += (template.bonuses.INT ?? 0) * 5
    score += (template.bonuses.WIS ?? 0) * 5
    // Combat bonuses
    score += (template.bonuses.toHit ?? 0) * 2
    score += (template.bonuses.toDam ?? 0) * 3
    // Speed is very valuable
    score += (template.bonuses.SPEED ?? 0) * 10
  }

  // Template abilities (rings/amulets with structured abilities)
  if (template.abilities) {
    for (const ability of template.abilities) {
      // Resistances
      if (ability.startsWith('Resist ')) score += 20
      // Free Action is valuable against paralysis
      if (ability === 'Free Action') score += 25
      // Sustain abilities
      if (ability.startsWith('Sustain ')) score += 10
      // Regeneration
      if (ability === 'Regeneration') score += 15
      // Telepathy is very valuable
      if (ability === 'Telepathy') score += 30
    }
  }

  // Apply class affinity for weapons/staves
  if (classId && (template.type === 'weapon' || template.type === 'staff')) {
    const affinity = WEAPON_CLASS_AFFINITY[classId]
    if (affinity) {
      // Get base multiplier for this weapon type
      let mult = template.type === 'staff' ? affinity.staff : affinity.weapon

      // Apply edged weapon penalty for priests/druids
      if (template.type === 'weapon' && template.isEdged && affinity.edgedPenalty !== undefined) {
        mult = affinity.edgedPenalty
      }

      score = Math.floor(score * mult)
    }
  }

  return score
}

// ============================================================================
// INVENTORY MANAGEMENT
// ============================================================================

/**
 * Find best equipment to equip from inventory
 * Returns items that should be equipped
 */
export function findEquipmentUpgrades(character: Character): Item[] {
  const upgrades: Item[] = []

  for (const item of character.inventory) {
    if (!item.template.slot) continue

    if (shouldEquip(item, character)) {
      upgrades.push(item)
    }
  }

  return upgrades
}

/**
 * Get prioritized list of items to pick up from visible items
 */
export function prioritizeItems(
  items: GroundItem[],
  character: Character,
  config: PersonalityConfig
): GroundItem[] {
  // Evaluate all items
  const evaluated = items.map((item) => ({
    item,
    evaluation: evaluateItem(item, character),
    shouldPickup: shouldPickup(item, character, config),
  }))

  // Filter to only items we want
  const wanted = evaluated.filter((e) => e.shouldPickup)

  // Sort by score (highest first)
  wanted.sort((a, b) => b.evaluation.score - a.evaluation.score)

  return wanted.map((e) => e.item)
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map ItemTemplate slot to EquipSlot
 */
function getEquipSlot(template: ItemTemplate): EquipSlot | null {
  switch (template.slot) {
    case 'weapon':
      return 'weapon'
    case 'body':
      return 'armor'
    case 'shield':
      return 'shield'
    case 'helm':
      return 'helm'
    case 'gloves':
      return 'gloves'
    case 'boots':
      return 'boots'
    case 'ring':
      return 'ring1' // Default to first ring slot
    case 'amulet':
      return 'amulet'
    case 'light':
      return 'light'
    case 'bow':
      return 'bow'
    default:
      return null
  }
}

/**
 * Get the best ring slot for a new ring
 * Prefers empty slot, then weaker ring
 */
export function getBestRingSlot(character: Character, newRing: Item): EquipSlot {
  const ring1 = character.equipment.ring1
  const ring2 = character.equipment.ring2

  // Prefer empty slot
  if (!ring1) return 'ring1'
  if (!ring2) return 'ring2'

  // Compare scores and replace weaker one
  const classId = character.classId
  const score1 = calculateEquipmentScore(ring1, classId)
  const score2 = calculateEquipmentScore(ring2, classId)
  const newScore = calculateEquipmentScore(newRing, classId)

  // Only replace if new is better than one of them
  if (newScore > score1 && score1 <= score2) return 'ring1'
  if (newScore > score2) return 'ring2'

  // Neither should be replaced
  return 'ring1' // Default, comparison will reject
}

/**
 * Get equipped item for a slot
 */
function getEquippedItem(character: Character, slot: EquipSlot): Item | null {
  return character.equipment[slot] ?? null
}

/**
 * Check if an item is a consumable
 */
export function isConsumable(item: Item): boolean {
  return item.template.type === 'potion' || item.template.type === 'scroll'
}

/**
 * Check if an item is equipment
 */
export function isEquipment(item: Item): boolean {
  return item.template.slot !== undefined
}

/**
 * Get display name for an item
 */
export function getItemDisplayName(item: Item): string {
  let name = item.template.name

  if (item.enchantment !== 0) {
    const sign = item.enchantment > 0 ? '+' : ''
    name = `${name} (${sign}${item.enchantment})`
  }

  if (item.artifact) {
    name = item.artifact.name
  }

  return name
}

/**
 * Find a healing potion in inventory
 * Optionally specify minimum tier (1-4) for stronger potions
 */
export function findHealingPotion(character: Character, minTier: number = 1): Item | null {
  // VAMPIRE RESTRICTION: Cannot drink healing potions
  if (character.raceId === 'vampire') return null

  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'potion') return false
      if (item.template.tier < minTier) return false
      // Use structured data - any potion with healing
      return item.template.healBase !== undefined || item.template.healPerLevel !== undefined
    }) ?? null
  )
}

/**
 * Find a mana potion in inventory
 */
export function findManaPotion(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'potion') return false
      return item.template.restoresMana === true
    }) ?? null
  )
}

/**
 * Find an escape scroll (teleport/phase door) in inventory
 */
export function findEscapeScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('teleport') || name.includes('phase')
    }) ?? null
  )
}

/**
 * Find a phase door scroll (short-range teleport, up to 10 squares)
 * Requires safety check before use
 */
export function findPhaseDoorScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('phase door')
    }) ?? null
  )
}

/**
 * Find a full teleport scroll (random location on level)
 * Always "safe" since destination is random/far
 */
export function findFullTeleportScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      // Match "teleportation" but not "phase door" or "teleport level"
      return name.includes('teleportation')
    }) ?? null
  )
}

/**
 * Check if action is a teleport consumable (phase door or teleport scroll).
 * Used to trigger exploration state reset after teleport.
 */
export function isTeleportAction(character: Character, action: GameAction): boolean {
  if (action.type !== 'use') return false
  const item = character.inventory.find((i) => i.id === action.itemId)
  if (!item) return false
  const name = item.template.name.toLowerCase()
  return name.includes('phase door') || name.includes('teleport')
}

/**
 * Find a speed potion in inventory
 */
export function findSpeedPotion(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'potion') return false
      return item.template.buff?.type === 'speed'
    }) ?? null
  )
}

/**
 * Find a buff potion (heroism or berserk) in inventory
 */
export function findBuffPotion(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'potion') return false
      const buffType = item.template.buff?.type
      return buffType === 'heroism' || buffType === 'berserk'
    }) ?? null
  )
}

/**
 * Find a resistance potion matching a damage type
 */
export function findResistancePotion(character: Character, damageType?: string): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'potion') return false
      const grantsResist = item.template.grantsResistance

      // If specific type requested, match it
      if (damageType) {
        const type = damageType.toUpperCase()
        return grantsResist === type
      }

      // Any resistance potion
      return grantsResist !== undefined
    }) ?? null
  )
}

/**
 * Find a neutralize poison potion (cures poison but doesn't grant resistance)
 */
export function findNeutralizePoison(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'potion') return false
      // Cures poisoned but doesn't grant resistance (Neutralize Poison vs Resist Poison)
      return (
        item.template.cures?.includes('poisoned') && item.template.grantsResistance !== 'POISON'
      )
    }) ?? null
  )
}

/**
 * Find a blessing scroll
 */
export function findBlessingScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('blessing')
    }) ?? null
  )
}

/**
 * Find a protection from evil scroll
 */
export function findProtectionScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('protection from evil')
    }) ?? null
  )
}

/**
 * Find a mapping scroll (magic mapping)
 */
export function findMappingScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('magic mapping')
    }) ?? null
  )
}

/**
 * Find a Detect Stairs scroll in inventory
 */
export function findDetectStairsScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('detect stairs')
    }) ?? null
  )
}

/**
 * Find a Teleport Level scroll in inventory
 */
export function findTeleportLevelScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('teleport level')
    }) ?? null
  )
}

/**
 * Find a Town Portal scroll in inventory
 */
export function findTownPortalScroll(character: Character): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      return name.includes('town portal')
    }) ?? null
  )
}

/**
 * Find an enchant scroll (weapon or armour)
 */
export function findEnchantScroll(character: Character, type?: 'weapon' | 'armor'): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'scroll') return false
      const name = item.template.name.toLowerCase()
      if (type === 'weapon') return name.includes('enchant weapon')
      if (type === 'armor') return name.includes('enchant armour') || name.includes('enchant armor')
      return name.includes('enchant')
    }) ?? null
  )
}

/**
 * Check if character has active status effect of given type
 */
export function hasStatusEffect(character: Character, type: string): boolean {
  return character.statusEffects.some((e) => e.type === type)
}

/**
 * Check if character has active temp resistance of given type
 */
export function hasTempResistance(character: Character, type: string): boolean {
  return character.tempResistances.some((r) => r.type === type)
}

// ============================================================================
// CURE POTION FINDERS
// ============================================================================

/**
 * Find a potion that cures a specific status (using structured data)
 */
function findPotionCuring(character: Character, status: string): Item | null {
  return (
    character.inventory.find((item) => {
      if (item.template.type !== 'potion') return false
      // Check curesAll or specific cure
      return item.template.curesAll || item.template.cures?.includes(status as never)
    }) ?? null
  )
}

/**
 * Find a Free Action potion (cures paralysis and slow)
 */
export function findFreeActionPotion(character: Character): Item | null {
  return findPotionCuring(character, 'paralyzed')
}

/**
 * Find a Clarity potion (cures confusion and blind)
 */
export function findClarityPotion(character: Character): Item | null {
  return findPotionCuring(character, 'confused')
}

/**
 * Find a Restoration potion (cures drain)
 */
export function findRestorationPotion(character: Character): Item | null {
  return findPotionCuring(character, 'drained')
}

/**
 * Find any potion that can cure a specific status effect
 * Uses structured cures data instead of hardcoded tier logic
 */
export function findCureFor(character: Character, status: string): Item | null {
  // For poisoned, also check resistance potions
  if (status === 'poisoned') {
    return findPotionCuring(character, 'poisoned') ?? findResistancePotion(character, 'poison')
  }

  // For fear/terrified, buff potions work
  if (status === 'terrified') {
    return findPotionCuring(character, 'terrified') ?? findBuffPotion(character)
  }

  // General case: find any potion that cures this status
  return findPotionCuring(character, status)
}

// ============================================================================
// ITEM QUERIES (for goal selection)
// ============================================================================

/**
 * Find best item within distance using smart evaluation
 * Pure query function for goal selection - returns best pickup target or null.
 */
export function findBestItem(context: BotContext, maxDistance: number): GroundItem | null {
  const { game, visibleItems, config, botState } = context
  const pos = game.character.position
  const character = game.character

  let best: GroundItem | null = null
  let bestScore = -Infinity

  for (const item of visibleItems) {
    // Skip items blacklisted due to danger (caused flee oscillation)
    if (isDangerousItemBlacklisted(botState, item.id, game.turn)) continue

    const dx = Math.abs(item.position.x - pos.x)
    const dy = Math.abs(item.position.y - pos.y)
    const distance = dx + dy

    if (distance > maxDistance) continue

    // Check if we should pick up this item
    if (!shouldPickup(item, character, config)) continue

    // Evaluate item value
    const evaluation = evaluateItem(item, character)

    // Score = value - distance penalty
    // Upgrades get big bonus to encourage pickup
    let score = evaluation.score
    if (evaluation.isUpgrade) {
      score += 50
    }
    score -= distance * 3 // Distance penalty

    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  return best
}

/**
 * Policy: Should we pick up items right now?
 * Returns false if danger is too high.
 */
export function shouldPickupNow(
  dangers: DangerMap,
  pos: { x: number; y: number },
  dangerThreshold: number
): boolean {
  const localDanger = getLocalDanger(dangers, pos)
  return localDanger <= dangerThreshold
}

/**
 * Get TAKE goal - pick up items.
 * Returns a take goal for items at current position or nearby valuable items.
 */
export function getTakeGoal(
  context: BotContext,
  dangers: DangerMap,
  dangerThreshold: number
): BotGoal | null {
  const { game, config } = context
  const pos = game.character.position

  // Check for item at current position first
  const itemHere = game.items.find((item) => isSamePoint(item.position, pos))
  if (itemHere) {
    return {
      type: 'TAKE',
      target: pos,
      targetId: itemHere.id,
      reason: 'Item at position',
      startTurn: game.turn,
    }
  }

  // Check if safe enough to detour for items
  if (!shouldPickupNow(dangers, pos, dangerThreshold)) return null

  // Find best item within greed radius
  const maxDetour = Math.floor(config.greed / 10) + 3
  const nearestItem = findBestItem(context, maxDetour)
  if (!nearestItem) return null

  return {
    type: 'TAKE',
    target: nearestItem.position,
    targetId: nearestItem.id,
    reason: 'Collecting item',
    startTurn: game.turn,
  }
}
