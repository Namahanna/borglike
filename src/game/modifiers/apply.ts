/**
 * Modifier Application Engine for Borglike
 *
 * Applies collected modifiers to base stats in the correct order:
 * 1. Within each stat: flat → percent → multiplier
 * 2. Within each type: base → booster → equipment → upgrade → racial → form → status
 */

import type { StatModifier, ModifiableStatTarget, ModifierSource, EffectiveStats } from './types'
import { getDiceAverage } from '../dice'

// ============================================================================
// APPLICATION ORDER
// ============================================================================

/** Order in which modifier sources are applied within each type */
const SOURCE_ORDER: ModifierSource[] = [
  'base',
  'booster',
  'equipment',
  'upgrade',
  'racial',
  'form',
  'status',
]

/**
 * Sort modifiers by source order (within the same type)
 */
function sortBySource(a: StatModifier, b: StatModifier): number {
  return SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source)
}

// ============================================================================
// STAT APPLICATION
// ============================================================================

/**
 * Apply all modifiers for a single stat
 *
 * Order of application:
 * 1. All flat modifiers (in source order)
 * 2. All percent modifiers (in source order) - add percentages then apply
 * 3. All multipliers (in source order) - multiply sequentially
 *
 * Percent modifiers are ADDITIVE with each other before applying:
 * - +30% damage (might) + +20% damage (form) = +50% total, so 1.5x
 *
 * This avoids the multiplicative stacking that made damage too high.
 *
 * @param baseValue - The starting value before modifiers
 * @param modifiers - All modifiers for this stat
 * @returns The final computed value
 */
export function applyModifiersToStat(baseValue: number, modifiers: StatModifier[]): number {
  if (modifiers.length === 0) return baseValue

  // Separate modifiers by type
  const flat = modifiers.filter((m) => m.type === 'flat').sort(sortBySource)
  const percent = modifiers.filter((m) => m.type === 'percent').sort(sortBySource)
  const multiplier = modifiers.filter((m) => m.type === 'multiplier').sort(sortBySource)

  let value = baseValue

  // 1. Apply all flat modifiers
  for (const mod of flat) {
    value += mod.value
  }

  // 2. Apply all percent modifiers (additive, then apply once)
  // Sum all percentages: +30% + +20% - 10% = +40%
  if (percent.length > 0) {
    let totalPercent = 0
    for (const mod of percent) {
      totalPercent += mod.value
    }
    // Apply: value * (1 + totalPercent/100)
    value = Math.floor(value * (1 + totalPercent / 100))
  }

  // 3. Apply all multipliers (sequential multiplication)
  for (const mod of multiplier) {
    value = Math.floor(value * mod.value)
  }

  return value
}

// ============================================================================
// BASE VALUE CALCULATIONS
// ============================================================================

/**
 * Base stats before modifiers (race + class + base 10 + booster)
 * These are already computed and stored on character.baseStats
 */
export interface BaseStatValues {
  str: number
  dex: number
  con: number
  int: number
  wis: number
}

/**
 * Base combat stat values (computed from base stats + level)
 */
export interface BaseCombatValues {
  maxHp: number
  maxMp: number
  armor: number
  accuracy: number
  evasion: number
  meleeDamage: number
  rangedDamage: number
  rangedAccuracy: number
  speed: number
}

/**
 * Calculate base combat values from stats and level
 *
 * These are the starting points before modifiers:
 * - maxHp: hitdie * level * (1 + CON/20)
 * - maxMp: (INT + WIS) * level / 4 (if magic user)
 * - armor: DEX/4
 * - accuracy: 50 + DEX + level
 * - evasion: DEX/2
 * - meleeDamage: STR/3
 * - rangedDamage: DEX/3
 * - rangedAccuracy: 50 + DEX + level
 * - speed: 100
 */
export function calculateBaseCombatValues(
  stats: BaseStatValues,
  level: number,
  hitdie: number,
  usesMagic: boolean,
  baseHpFraction = 0.7
): BaseCombatValues {
  // HP formula: hitdie * level * (1 + CON/20) * baseHpFraction
  const conMultiplier = 1 + stats.con / 20
  const maxHp = Math.floor(hitdie * level * conMultiplier * baseHpFraction)

  // MP formula: (INT + WIS) * level / 4 (if magic user)
  const maxMp = usesMagic ? Math.floor(((stats.int + stats.wis) * level) / 4) : 0

  return {
    maxHp,
    maxMp,
    armor: Math.floor(stats.dex / 4),
    accuracy: 50 + stats.dex + level,
    evasion: Math.floor(stats.dex / 2),
    meleeDamage: Math.floor(stats.str / 3),
    rangedDamage: Math.floor(stats.dex / 3),
    rangedAccuracy: 50 + stats.dex + level,
    speed: 100,
  }
}

// ============================================================================
// EQUIPMENT CONTRIBUTION
// ============================================================================

import type { Character } from '../types'

/** Equipment slots that provide armor */
const ARMOR_SLOTS = ['armor', 'shield', 'helm', 'gloves', 'boots'] as const

/**
 * Calculate equipment-based armor (protection values, not stat bonuses)
 * This is separate from the modifier system as it's base equipment stats.
 */
export function calculateEquipmentArmor(character: Character): number {
  let armor = 0

  for (const slotName of ARMOR_SLOTS) {
    const item = character.equipment[slotName]
    if (!item) continue

    // Base item protection
    if (item.template.protection) {
      armor += item.template.protection + item.enchantment
    }

    // Artifact protection
    if (item.artifact?.protection) {
      armor += item.artifact.protection
    }
  }

  return armor
}

/**
 * Calculate equipment-based melee damage (weapon damage, not stat bonuses)
 */
export function calculateEquipmentMeleeDamage(character: Character): number {
  const weapon = character.equipment.weapon
  if (!weapon) return 0

  let damage = 0

  // Parse dice notation for base weapon damage
  damage += getDiceAverage(weapon.template.damage ?? '') + weapon.enchantment

  // Artifact damage
  if (weapon.artifact?.damage) {
    damage += getDiceAverage(weapon.artifact.damage)
  }

  return damage
}

/**
 * Calculate equipment-based ranged damage (bow damage, not stat bonuses)
 */
export function calculateEquipmentRangedDamage(character: Character): number {
  const bow = character.equipment.bow
  if (!bow) return 0

  let damage = 0

  // Launcher multiplier
  const launcherMult = bow.template.multiplier ?? 1

  // Parse dice notation for bow damage, apply multiplier
  damage += getDiceAverage(bow.template.damage ?? '') * launcherMult + bow.enchantment

  // Artifact bow damage
  if (bow.artifact?.damage) {
    damage += getDiceAverage(bow.artifact.damage) * launcherMult
  }

  return damage
}

/**
 * Get bow hit bonus from template
 */
export function getBowHitBonus(character: Character): number {
  const bow = character.equipment.bow
  if (!bow) return 0
  return bow.template.hitBonus ?? 0
}

// ============================================================================
// ENCUMBRANCE
// ============================================================================

import { getEncumbranceSpeedPenalty } from '../bot/preparation'

// ============================================================================
// FULL APPLICATION
// ============================================================================

/**
 * Apply all modifiers to compute effective stats
 *
 * This is the main calculation function that:
 * 1. Starts with base stats (already includes race/class/booster)
 * 2. Applies modifiers to core stats first (equipment stat bonuses, form stat mods, drained)
 * 3. Recalculates derived values using modified core stats
 * 4. Applies modifiers to combat stats
 *
 * @param character - The character
 * @param modifiers - All collected modifiers
 * @param hitdie - Combined race+class hitdie
 * @param usesMagic - Whether class uses magic
 * @returns Fully computed EffectiveStats
 */
export function applyAllModifiers(
  character: Character,
  modifiers: StatModifier[],
  hitdie: number,
  usesMagic: boolean
): EffectiveStats {
  // Group modifiers by target
  const byTarget = new Map<ModifiableStatTarget, StatModifier[]>()
  for (const mod of modifiers) {
    const existing = byTarget.get(mod.target) ?? []
    existing.push(mod)
    byTarget.set(mod.target, existing)
  }

  // Helper to get modifiers for a stat
  const getMods = (target: ModifiableStatTarget) => byTarget.get(target) ?? []

  // -----------------------------------------------------------------------
  // STEP 1: Apply modifiers to core stats (from baseStats)
  // -----------------------------------------------------------------------
  const str = applyModifiersToStat(character.baseStats.str, getMods('str'))
  const dex = applyModifiersToStat(character.baseStats.dex, getMods('dex'))
  const con = applyModifiersToStat(character.baseStats.con, getMods('con'))
  const int = applyModifiersToStat(character.baseStats.int, getMods('int'))
  const wis = applyModifiersToStat(character.baseStats.wis, getMods('wis'))

  // -----------------------------------------------------------------------
  // STEP 2: Calculate base combat values using MODIFIED core stats
  // -----------------------------------------------------------------------
  const baseCombat = calculateBaseCombatValues(
    { str, dex, con, int, wis },
    character.level,
    hitdie,
    usesMagic,
    character.baseHpFraction
  )

  // -----------------------------------------------------------------------
  // STEP 3: Add equipment contributions (armor, weapon damage)
  // These are base values, not modifiers
  // -----------------------------------------------------------------------
  const equipArmor = calculateEquipmentArmor(character)
  const equipMeleeDamage = calculateEquipmentMeleeDamage(character)
  const equipRangedDamage = calculateEquipmentRangedDamage(character)
  const bowHitBonus = getBowHitBonus(character)

  // -----------------------------------------------------------------------
  // STEP 4: Apply modifiers to combat stats
  // -----------------------------------------------------------------------
  const maxHp = applyModifiersToStat(baseCombat.maxHp, getMods('maxHp'))
  const maxMp = applyModifiersToStat(baseCombat.maxMp, getMods('maxMp'))

  // Armor: base (DEX/4) + equipment + modifiers
  const armorBase = baseCombat.armor + equipArmor
  const armor = applyModifiersToStat(armorBase, getMods('armor'))

  // Accuracy: base + modifiers
  const accuracy = applyModifiersToStat(baseCombat.accuracy, getMods('accuracy'))

  // Evasion: base + modifiers
  const evasion = applyModifiersToStat(baseCombat.evasion, getMods('evasion'))

  // Melee damage: base (STR/3) + equipment + modifiers
  const meleeDamageBase = baseCombat.meleeDamage + equipMeleeDamage
  const meleeDamage = applyModifiersToStat(meleeDamageBase, getMods('meleeDamage'))

  // Ranged damage: base (DEX/3) + equipment + modifiers
  const rangedDamageBase = baseCombat.rangedDamage + equipRangedDamage
  const rangedDamage = applyModifiersToStat(rangedDamageBase, getMods('rangedDamage'))

  // Ranged accuracy: base + bow hit bonus + modifiers
  const rangedAccuracyBase = baseCombat.rangedAccuracy + bowHitBonus
  const rangedAccuracy = applyModifiersToStat(rangedAccuracyBase, getMods('rangedAccuracy'))

  // Speed: base (100) + modifiers - encumbrance
  const speedBeforeEncumbrance = applyModifiersToStat(baseCombat.speed, getMods('speed'))
  const speed = speedBeforeEncumbrance - getEncumbranceSpeedPenalty(character)

  // Crit chance: base 0 + modifiers (like Lucky racial)
  const critChance = applyModifiersToStat(0, getMods('critChance'))

  return {
    str,
    dex,
    con,
    int,
    wis,
    maxHp,
    maxMp,
    armor,
    accuracy,
    evasion,
    meleeDamage,
    rangedDamage,
    rangedAccuracy,
    speed,
    critChance,
  }
}
