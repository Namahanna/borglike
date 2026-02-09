/**
 * Character System for Borglike
 *
 * Handles character creation, stat calculations, leveling, and equipment management.
 * All functions are pure where possible and properly typed.
 */

import type {
  Character,
  Stats,
  CombatStats,
  Item,
  EquipSlot,
  Resistances,
  ResistanceType,
} from './types'
import type { Race } from './data/races'
import { getRaceById, getClassById, calculateHitdie } from './data/index'
import { xpForLevel } from '../core/formulas'
import type { UpgradeBonuses } from './upgrade-effects'
import { DEFAULT_BONUSES } from './upgrade-effects'
import type { BoosterBonuses } from './booster-effects'
import { DEFAULT_BOOSTER_BONUSES } from './booster-effects'
import { getSpellIdsForLevel, getNewSpellsAtLevel } from './data/class-spells'
import { addStatusEffect, hasStatusEffect, hasEquipmentAbility } from './status-effects'
import { getEffectiveStats, toStats, toCombatStats, recalculateAllStats } from './modifiers'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base stat value before race/class modifiers */
const BASE_STAT = 10

/** Map ItemTemplate slot names to EquipSlot names */
const SLOT_MAP: Record<string, EquipSlot> = {
  weapon: 'weapon',
  bow: 'bow',
  body: 'armor',
  shield: 'shield',
  helm: 'helm',
  gloves: 'gloves',
  boots: 'boots',
  ring: 'ring1', // Default to ring1, handle ring2 in equip logic
  amulet: 'amulet',
  light: 'light',
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID for entities
 */
function generateId(): string {
  return `chr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Calculate CON modifier for HP calculations
 * Formula: (CON - 10) / 2, minimum -2
 */
function getConModifier(con: number): number {
  return Math.max(-2, Math.floor((con - 10) / 2))
}

/**
 * Map an ItemTemplate slot to an EquipSlot
 */
function mapSlot(templateSlot: string | undefined): EquipSlot | null {
  if (!templateSlot) return null
  return SLOT_MAP[templateSlot] || null
}

// ============================================================================
// CHARACTER CREATION
// ============================================================================

/**
 * Create a new character with the given race and class
 *
 * @param config - Character configuration
 * @param config.raceId - ID of the race to use
 * @param config.classId - ID of the class to use
 * @param config.name - Optional character name (defaults to race-class combo)
 * @param config.upgradeBonuses - Optional meta-progression bonuses from upgrades
 * @returns A fully initialized Character
 * @throws Error if race or class ID is invalid
 *
 * @example
 * const char = createCharacter({ raceId: 'human', classId: 'warrior', name: 'Borin' })
 * // char.stats = { str: 13, int: 8, wis: 8, dex: 12, con: 12 }
 */
export function createCharacter(config: {
  raceId: string
  classId: string
  name?: string
  upgradeBonuses?: UpgradeBonuses
  boosterBonuses?: BoosterBonuses
  baseHpFraction?: number
}): Character {
  const race = getRaceById(config.raceId)
  const gameClass = getClassById(config.classId)
  const bonuses = config.upgradeBonuses ?? DEFAULT_BONUSES
  const boosterBonuses = config.boosterBonuses ?? DEFAULT_BOOSTER_BONUSES
  const baseHpFraction = config.baseHpFraction ?? 0.7

  if (!race) {
    throw new Error(`Invalid race ID: ${config.raceId}`)
  }
  if (!gameClass) {
    throw new Error(`Invalid class ID: ${config.classId}`)
  }

  // Calculate base stats: BASE_STAT + race modifiers + class modifiers + booster bonuses
  const baseStats: Stats = {
    str: BASE_STAT + race.stats.str + gameClass.stats.str + boosterBonuses.strBonus,
    int: BASE_STAT + race.stats.int + gameClass.stats.int + boosterBonuses.intBonus,
    wis: BASE_STAT + race.stats.wis + gameClass.stats.wis + boosterBonuses.wisBonus,
    dex: BASE_STAT + race.stats.dex + gameClass.stats.dex + boosterBonuses.dexBonus,
    con: BASE_STAT + race.stats.con + gameClass.stats.con + boosterBonuses.conBonus,
  }

  // Stats start the same as baseStats (will differ with equipment)
  const stats = { ...baseStats }

  // Calculate hitdie (minimum 1)
  const hitdie = calculateHitdie(race.hitdie, gameClass.hitdie)

  // Initial HP/MP/combat are base values only — upgrade bonuses are applied
  // by recalculateCombatStats() after construction via the modifier system.
  const conBonus = 1 + stats.con / 20
  const maxHp = Math.floor(hitdie * conBonus * baseHpFraction)
  const maxMp = gameClass.usesMagic ? Math.floor((stats.int + stats.wis) / 4) : 0

  const combat: CombatStats = {
    maxHp,
    maxMp,
    armor: Math.floor(stats.dex / 4),
    accuracy: 50 + stats.dex + 1, // level 1
    evasion: Math.floor(stats.dex / 2),
    meleeDamage: Math.floor(stats.str / 3),
    rangedDamage: Math.floor(stats.dex / 3), // DEX-based, no bow yet
    rangedAccuracy: 50 + stats.dex + 1, // level 1
    speed: 100,
  }

  // Calculate initial resistances from race
  const resistances = calculateResistancesFromRace(race)

  // Initialize empty status effects
  const statusEffects: Character['statusEffects'] = []
  const tempResistances: Character['tempResistances'] = []

  const character: Character = {
    // Identity
    id: generateId(),
    name: config.name || `${race.name} ${gameClass.name}`,
    raceId: config.raceId,
    classId: config.classId,

    // Stats
    baseStats,
    stats,

    // Resources
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,

    // Progression
    level: 1,
    xp: 0,
    xpToNextLevel: xpForLevel(2),

    // Combat
    combat,

    // Resistances
    resistances,

    // Status effects
    statusEffects,
    tempResistances,

    // Inventory
    equipment: {},
    inventory: [],
    gold: 0,

    // Position (will be placed by dungeon)
    position: { x: 0, y: 0 },
    depth: 1,

    // State
    isDead: false,

    // Store upgrade bonuses and HP fraction for recalculation
    upgradeBonuses: bonuses,
    baseHpFraction,

    // Spells - initialize with starting spells for class
    knownSpells: getSpellIdsForLevel(config.classId, 1),
    spellCooldowns: {},

    // SHAPESHIFTING: No active form at start
    activeFormId: null,

    // ACTIVATIONS: Cooldown tracking for artifact/racial abilities
    activationCooldowns: {},
    racialAbilityLastUse: 0,
  }

  // Apply upgrade bonuses, racial modifiers, etc. via the modifier system
  recalculateCombatStats(character)
  // Start at full HP/MP after modifier-adjusted maximums
  character.hp = character.maxHp
  character.mp = character.maxMp

  return character
}

/**
 * Calculate resistances from a race's abilities
 * Helper function for character creation (before Character object exists)
 */
function calculateResistancesFromRace(race: Race): Resistances {
  const resistances: Resistances = {}

  for (const ability of race.abilities) {
    switch (ability.id) {
      case 'resist_poison':
        resistances.POISON = 100 // Immune
        break
      case 'resist_light':
        resistances.LIGHT = (resistances.LIGHT ?? 0) + 50
        break
      case 'resist_dark':
        resistances.DARK = (resistances.DARK ?? 0) + 50
        break
      case 'hold_life':
        resistances.DRAIN = 75 // High resistance
        break
      case 'elem_resist':
        // Elemental affinity (Draconian)
        resistances.FIRE = (resistances.FIRE ?? 0) + 50
        resistances.COLD = (resistances.COLD ?? 0) + 50
        resistances.ACID = (resistances.ACID ?? 0) + 50
        break
      case 'light_vuln':
        // Vampire light vulnerability
        resistances.LIGHT = -100
        break
      case 'construct':
        // Golem immunity to poison (and other effects handled elsewhere)
        resistances.POISON = 100
        break
    }
  }

  return resistances
}

// ============================================================================
// STAT CALCULATIONS
// ============================================================================

/**
 * Calculate effective stats with equipment bonuses
 *
 * Uses the unified modifier system to compute stats from all sources:
 * equipment, racial abilities, upgrades, forms, and status effects.
 *
 * @param character - The character to calculate stats for
 * @returns Computed Stats including all equipment modifiers
 */
export function calculateStats(character: Character): Stats {
  const effective = getEffectiveStats(character, { includeStatusEffects: true })
  return toStats(effective)
}

/**
 * Calculate resistances from race and equipment
 *
 * @param character - The character to calculate resistances for
 * @returns Computed Resistances from race and equipment
 */
export function calculateResistances(character: Character): Resistances {
  const race = getRaceById(character.raceId)
  if (!race) return {}

  // Start with racial resistances
  const resistances = calculateResistancesFromRace(race)

  // Sum resistances from equipped artifacts and template abilities
  for (const item of Object.values(character.equipment)) {
    // Artifact abilities
    if (item?.artifact?.abilities) {
      for (const ability of item.artifact.abilities) {
        const parsed = parseResistanceAbility(ability)
        if (parsed) {
          resistances[parsed.type] = (resistances[parsed.type] ?? 0) + parsed.value
        }
      }
    }
    // Template abilities (rings/amulets)
    if (item?.template.abilities) {
      for (const ability of item.template.abilities) {
        const parsed = parseResistanceAbility(ability)
        if (parsed) {
          resistances[parsed.type] = (resistances[parsed.type] ?? 0) + parsed.value
        }
      }
    }
  }

  // Equipment Hold Life grants DRAIN resistance (same as racial hold_life)
  if (hasEquipmentAbility(character, 'Hold Life')) {
    resistances.DRAIN = Math.max(resistances.DRAIN ?? 0, 75)
  }

  return resistances
}

/**
 * Parse an artifact ability string for resistance
 * Returns the resistance type and value, or null if not a resistance ability
 *
 * Examples:
 *   "Resist Fire" -> { type: 'FIRE', value: 50 }
 *   "Resist Cold x3" -> { type: 'COLD', value: 75 }
 *   "Slay Evil" -> null
 */
function parseResistanceAbility(ability: string): { type: ResistanceType; value: number } | null {
  if (!ability.startsWith('Resist ')) return null

  const content = ability.replace('Resist ', '')

  // Check for multiplier (x3 = 75% resist, x2 = 66%, default = 50%)
  let multiplier = 1
  let element = content
  if (content.includes(' x')) {
    const parts = content.split(' x')
    element = parts[0] ?? content
    multiplier = parseInt(parts[1] ?? '1', 10)
  }

  // Map element name to ResistanceType
  const elementMap: Record<string, ResistanceType> = {
    Fire: 'FIRE',
    Cold: 'COLD',
    Acid: 'ACID',
    Lightning: 'LIGHTNING',
    Poison: 'POISON',
    Light: 'LIGHT',
    Dark: 'DARK',
    // Unrecognized elements are skipped
  }

  const type = elementMap[element]
  if (!type) return null

  // Calculate resistance value based on multiplier
  // x1 (default) = 50%, x2 = 66%, x3 = 75%
  const value = multiplier === 3 ? 75 : multiplier === 2 ? 66 : 50

  return { type, value }
}

/**
 * Calculate derived combat stats from character stats and equipment
 *
 * Uses the unified modifier system to compute combat stats from all sources:
 * equipment, racial abilities, upgrades, forms, and status effects.
 *
 * @param character - The character to calculate combat stats for
 * @returns Computed CombatStats
 */
export function calculateCombatStats(character: Character): CombatStats {
  const effective = getEffectiveStats(character, { includeStatusEffects: true })
  return toCombatStats(effective)
}

/**
 * Recalculate and update a character's combat stats in place
 *
 * Uses the unified modifier system. Called after equipment changes,
 * form changes, level ups, or other stat modifications.
 *
 * @param character - The character to update (mutated in place)
 */
export function recalculateCombatStats(character: Character): void {
  recalculateAllStats(character)
}

// ============================================================================
// LEVELING
// ============================================================================

/**
 * Award XP to a character and handle level ups
 *
 * @param character - The character to award XP to (mutated in place)
 * @param amount - Amount of XP to award
 * @returns Object indicating if level up occurred and the new level
 */
export function gainXP(
  character: Character,
  amount: number,
  levelupHpPercent = 100
): { leveledUp: boolean; newLevel?: number } {
  if (amount <= 0 || character.isDead) {
    return { leveledUp: false }
  }

  character.xp += amount
  let leveledUp = false
  let newLevel: number | undefined

  // Check for level ups (can gain multiple levels at once)
  while (character.xp >= character.xpToNextLevel && character.level < 50) {
    character.level++
    leveledUp = true
    newLevel = character.level

    // Update XP threshold for next level
    character.xpToNextLevel = xpForLevel(character.level + 1)

    // Recalculate stats on level up
    applyLevelUp(character, levelupHpPercent)
  }

  return { leveledUp, newLevel }
}

/**
 * Apply level up bonuses to a character
 *
 * @param character - The character that leveled up (mutated in place)
 * @param levelupHpPercent - HP gain multiplier (100 = normal)
 */
function applyLevelUp(character: Character, levelupHpPercent = 100): void {
  const gameClass = getClassById(character.classId)
  if (!gameClass) return

  // Stat gains: +1 to primary stat every 5 levels
  if (character.level % 5 === 0) {
    character.baseStats[gameClass.primaryStat]++
  }

  // Calculate HP gain BEFORE recalc (use current CON, not temporarily-debuffed CON)
  const race = getRaceById(character.raceId)
  let hpGain = 1
  if (race) {
    const hitdie = calculateHitdie(race.hitdie, gameClass.hitdie)
    const conMod = getConModifier(character.baseStats.con)
    hpGain = Math.max(1, Math.floor(((hitdie + conMod) * levelupHpPercent) / 100))
  }

  // Recalculate all stats (includes status effects, equipment, upgrades)
  recalculateCombatStats(character)

  // Heal the HP gained (additive, capped at new maxHp)
  character.hp = Math.min(character.hp + hpGain, character.maxHp)

  // Learn new spells at this level
  const newSpells = getNewSpellsAtLevel(character.classId, character.level)
  for (const spell of newSpells) {
    if (!character.knownSpells.includes(spell.id)) {
      character.knownSpells.push(spell.id)
    }
  }

  // BRAVERY_30: Warriors gain permanent fear immunity at level 30
  if (character.classId === 'warrior' && character.level >= 30) {
    if (!hasStatusEffect(character, 'immunity_fear')) {
      addStatusEffect(character, { type: 'immunity_fear', turnsRemaining: 999999, value: 100 })
    }
  }
}

// ============================================================================
// EQUIPMENT MANAGEMENT
// ============================================================================

/**
 * Equip an item to the appropriate slot
 *
 * @param character - The character to equip the item on (mutated in place)
 * @param item - The item to equip
 * @returns Object with success status and any unequipped item
 */
export function equipItem(
  character: Character,
  item: Item
): { success: boolean; unequipped?: Item } {
  const template = item.template

  // Check if item is equippable (has a slot in template)
  if (!template.slot) {
    return { success: false }
  }

  // Map the template slot to our EquipSlot type
  let slot = mapSlot(template.slot)
  if (!slot) {
    return { success: false }
  }

  // Handle ring slots (ring1 or ring2)
  // ItemTemplate uses 'ring' which maps to 'ring1' by default
  if (slot === 'ring1') {
    // Try ring1 first, then ring2
    if (!character.equipment.ring1) {
      slot = 'ring1'
    } else if (!character.equipment.ring2) {
      slot = 'ring2'
    } else {
      // Both slots full, replace ring1
      slot = 'ring1'
    }
  }

  // Unequip current item in slot if any
  const currentItem = character.equipment[slot]
  let unequipped: Item | undefined

  if (currentItem) {
    unequipped = currentItem
    // Add unequipped item to inventory
    character.inventory.push(currentItem)
  }

  // Remove item from inventory if it was there
  const inventoryIndex = character.inventory.findIndex((i) => i.id === item.id)
  if (inventoryIndex >= 0) {
    character.inventory.splice(inventoryIndex, 1)
  }

  // Equip the new item
  character.equipment[slot] = item

  // Recalculate stats, combat (including status effects), and resistances
  recalculateCombatStats(character)
  character.resistances = calculateResistances(character)

  return { success: true, unequipped }
}

/**
 * Unequip an item from a slot
 *
 * @param character - The character to unequip from (mutated in place)
 * @param slot - The equipment slot to unequip
 * @returns The unequipped item, or null if slot was empty
 */
export function unequipItem(character: Character, slot: EquipSlot): Item | null {
  const item = character.equipment[slot]

  if (!item) {
    return null
  }

  // Remove from equipment
  delete character.equipment[slot]

  // Add to inventory
  character.inventory.push(item)

  // Recalculate stats, combat (including status effects), and resistances
  recalculateCombatStats(character)
  character.resistances = calculateResistances(character)

  return item
}

/**
 * Get the item equipped in a specific slot
 *
 * @param character - The character to check
 * @param slot - The equipment slot to check
 * @returns The equipped item, or null if slot is empty
 */
export function getEquippedItem(character: Character, slot: EquipSlot): Item | null {
  return character.equipment[slot] ?? null
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Calculate number of attacks per melee action
 *
 * Angband-inspired scaling with class differentiation:
 * - Base: 1 attack
 * - Class bonus: melee classes start with more attacks
 * - +1 per 3 STR above 12 (STR matters more)
 * - +1 per 3 levels (faster scaling)
 * - Capped by class maxAttacks
 *
 * @param character - The character to calculate attacks for
 * @returns Number of attacks per melee action (1 to class max)
 */
export function calculateAttackCount(character: Character): number {
  const gameClass = getClassById(character.classId)
  if (!gameClass) return 1

  // Class base bonus: melee classes start with more attacks
  // Warrior/Berserker: +1, others: 0
  const classBonus = gameClass.maxAttacks >= 6 ? 1 : 0

  // STR bonus: +1 attack per 3 STR above 12
  const strBonus = Math.max(0, Math.floor((character.stats.str - 12) / 3))

  // Level bonus: +1 attack per 3 levels
  const levelBonus = Math.floor(character.level / 3)

  // Equipment BLOWS bonus (e.g. Sting +2)
  let blowsBonus = 0
  for (const item of Object.values(character.equipment)) {
    if (!item) continue
    blowsBonus += item.artifact?.bonuses?.BLOWS ?? 0
    blowsBonus += item.template.bonuses?.BLOWS ?? 0
  }

  // Total attacks: base 1 + bonuses, capped at class max
  const totalAttacks = 1 + classBonus + strBonus + levelBonus + blowsBonus

  return Math.min(totalAttacks, gameClass.maxAttacks)
}

/**
 * Calculate number of ranged attacks (shots) per action
 *
 * FAST_SHOT mechanic (Ranger): +1 shot per 3 levels
 * Other classes: 1 shot always
 *
 * @param character - The character to calculate shots for
 * @returns Number of shots per ranged action
 */
export function calculateRangedAttackCount(character: Character): number {
  const gameClass = getClassById(character.classId)
  if (!gameClass) return 1

  // FAST_SHOT: Rangers get +1 shot per 3 levels, capped at 5
  if (character.classId === 'ranger') {
    const levelBonus = Math.floor(character.level / 3)
    return Math.min(1 + levelBonus, 5)
  }

  // Other classes: 1 shot
  return 1
}

/**
 * Check if a character can level up with their current XP
 */
export function canLevelUp(character: Character): boolean {
  return character.xp >= character.xpToNextLevel && character.level < 50
}

/**
 * Get the character's current title based on level and class
 */
export function getCharacterTitle(character: Character): string {
  const gameClass = getClassById(character.classId)
  if (!gameClass) return 'Adventurer'

  const titleIndex = Math.min(Math.floor((character.level - 1) / 5), gameClass.titles.length - 1)
  return gameClass.titles[titleIndex] || 'Adventurer'
}

/**
 * Calculate percentage of XP progress to next level
 */
export function getXPProgress(character: Character): number {
  const currentLevelXP = xpForLevel(character.level)
  const xpIntoLevel = character.xp - currentLevelXP
  const xpNeeded = character.xpToNextLevel - currentLevelXP

  if (xpNeeded <= 0) return 100
  return Math.floor((xpIntoLevel / xpNeeded) * 100)
}
