/**
 * Modifier Collectors for Borglike
 *
 * Functions that collect modifiers from various sources:
 * - Equipment (artifacts, templates)
 * - Racial abilities
 * - Upgrade bonuses
 * - Shapeshift forms
 * - Status effects
 */

import type { Character, Item } from '../types'
import type { Race } from '../data/races'
import type { UpgradeBonuses } from '../upgrade-effects'
import type { ShapeformTemplate } from '../data/forms'
import type { StatModifier } from './types'
import { parseBonusRecord, flatModifier, percentModifier } from './normalize'

// ============================================================================
// EQUIPMENT MODIFIERS
// ============================================================================

/**
 * Collect all modifiers from a single equipped item
 */
export function collectItemModifiers(item: Item): StatModifier[] {
  const modifiers: StatModifier[] = []
  const itemName = item.artifact?.name ?? item.template.name

  // Artifact bonuses (STR, DEX, etc. in uppercase)
  if (item.artifact?.bonuses) {
    modifiers.push(
      ...parseBonusRecord(item.artifact.bonuses, 'equipment', `${itemName} (artifact)`)
    )
  }

  // Template bonuses (rings/amulets with STR, toHit, SPEED, etc.)
  if (item.template.bonuses) {
    modifiers.push(...parseBonusRecord(item.template.bonuses, 'equipment', itemName))
  }

  return modifiers
}

/**
 * Collect all modifiers from character's equipment
 */
export function collectEquipmentModifiers(character: Character): StatModifier[] {
  const modifiers: StatModifier[] = []

  for (const item of Object.values(character.equipment)) {
    if (!item) continue
    modifiers.push(...collectItemModifiers(item))
  }

  return modifiers
}

// ============================================================================
// RACIAL MODIFIERS
// ============================================================================

/**
 * Collect modifiers from racial abilities
 *
 * Maps racial ability IDs to their stat effects:
 * - keen_senses: +10 accuracy
 * - slippery: +5 evasion
 * - small_target: +3 evasion
 * - elven_grace: +3 evasion
 * - nimble: +5 speed
 * - swift_feet: +5 speed
 * - elven_reflexes: +2 evasion
 * - lucky: +5% crit chance
 */
export function collectRacialModifiers(race: Race): StatModifier[] {
  const modifiers: StatModifier[] = []

  for (const ability of race.abilities) {
    switch (ability.id) {
      case 'keen_senses':
        modifiers.push(flatModifier('racial', 'accuracy', 10, 'Keen Senses'))
        // Also applies to ranged accuracy (parity fix)
        modifiers.push(flatModifier('racial', 'rangedAccuracy', 10, 'Keen Senses'))
        break

      case 'slippery':
        modifiers.push(flatModifier('racial', 'evasion', 5, 'Slippery'))
        break

      case 'small_target':
        modifiers.push(flatModifier('racial', 'evasion', 3, 'Small Target'))
        break

      case 'elven_grace':
        modifiers.push(flatModifier('racial', 'evasion', 3, 'Elven Grace'))
        break

      case 'nimble':
        modifiers.push(flatModifier('racial', 'speed', 5, 'Nimble'))
        break

      case 'swift_feet':
        modifiers.push(flatModifier('racial', 'speed', 5, 'Swift Feet'))
        break

      case 'elven_reflexes':
        modifiers.push(flatModifier('racial', 'evasion', 2, 'Elven Reflexes'))
        break

      case 'lucky':
        modifiers.push(flatModifier('racial', 'critChance', 5, 'Lucky'))
        break

      // Note: berserker (+20% damage when low HP) is handled separately in combat
      // as it's conditional on HP threshold

      // Note: XP abilities (versatile, quick_learner) are handled in actions/combat.ts
    }
  }

  return modifiers
}

// ============================================================================
// UPGRADE MODIFIERS
// ============================================================================

/**
 * Collect modifiers from meta-progression upgrades
 *
 * Maps UpgradeBonuses fields to stat modifiers:
 * - maxHpBonus: flat maxHp
 * - armorBonus: flat armor
 * - dodgePercent: flat evasion (despite name, it's applied as flat)
 * - speedBonus: flat speed
 * - damagePercent: percent meleeDamage and rangedDamage
 * Note: armorPenPercent is applied in combat, not as a stat modifier
 */
export function collectUpgradeModifiers(bonuses: UpgradeBonuses): StatModifier[] {
  const modifiers: StatModifier[] = []

  if (bonuses.maxHpBonus > 0) {
    modifiers.push(flatModifier('upgrade', 'maxHp', bonuses.maxHpBonus, 'Vitality'))
  }
  if (bonuses.maxHpPercent > 0) {
    modifiers.push(percentModifier('upgrade', 'maxHp', bonuses.maxHpPercent, 'Vitality'))
  }

  if (bonuses.armorBonus > 0) {
    modifiers.push(flatModifier('upgrade', 'armor', bonuses.armorBonus, 'Resilience'))
  }
  if (bonuses.armorPercent > 0) {
    modifiers.push(percentModifier('upgrade', 'armor', bonuses.armorPercent, 'Resilience'))
  }

  // dodgePercent is named poorly - it's actually flat evasion bonus
  if (bonuses.dodgePercent > 0) {
    modifiers.push(flatModifier('upgrade', 'evasion', bonuses.dodgePercent, 'Reflexes'))
  }

  if (bonuses.speedBonus > 0) {
    modifiers.push(flatModifier('upgrade', 'speed', bonuses.speedBonus, 'Swiftness'))
  }

  // Damage percent applies to both melee and ranged
  if (bonuses.damagePercent > 0) {
    modifiers.push(percentModifier('upgrade', 'meleeDamage', bonuses.damagePercent, 'Might'))
    modifiers.push(percentModifier('upgrade', 'rangedDamage', bonuses.damagePercent, 'Might'))
  }

  return modifiers
}

// ============================================================================
// FORM MODIFIERS
// ============================================================================

/**
 * Collect modifiers from an active shapeshift form
 *
 * Forms provide:
 * - Stat modifiers (strMod, dexMod, etc.)
 * - Combat modifiers (armorMod, speedMod, evasionMod, meleeDamageMod)
 */
export function collectFormModifiers(form: ShapeformTemplate): StatModifier[] {
  const modifiers: StatModifier[] = []
  const mods = form.statMods

  // Core stat modifiers
  if (mods.strMod) {
    modifiers.push(flatModifier('form', 'str', mods.strMod, form.name))
  }
  if (mods.dexMod) {
    modifiers.push(flatModifier('form', 'dex', mods.dexMod, form.name))
  }
  if (mods.conMod) {
    modifiers.push(flatModifier('form', 'con', mods.conMod, form.name))
  }
  if (mods.intMod) {
    modifiers.push(flatModifier('form', 'int', mods.intMod, form.name))
  }
  if (mods.wisMod) {
    modifiers.push(flatModifier('form', 'wis', mods.wisMod, form.name))
  }

  // Combat modifiers
  if (mods.armorMod) {
    modifiers.push(flatModifier('form', 'armor', mods.armorMod, form.name))
  }
  if (mods.speedMod) {
    modifiers.push(flatModifier('form', 'speed', mods.speedMod, form.name))
  }
  if (mods.evasionMod) {
    modifiers.push(flatModifier('form', 'evasion', mods.evasionMod, form.name))
  }

  // Melee damage percent is a percent modifier
  if (mods.meleeDamageMod) {
    modifiers.push(percentModifier('form', 'meleeDamage', mods.meleeDamageMod, form.name))
  }

  return modifiers
}

// ============================================================================
// STATUS EFFECT MODIFIERS
// ============================================================================

/**
 * Collect modifiers from active status effects
 *
 * Status effects that modify stats:
 * - speed/haste: +value speed
 * - slowed: -value/2 speed (value is percentage, we convert to flat penalty)
 * - heroism: +value accuracy
 * - blessing: +value accuracy, +value armor
 * - drained: -20% to all core stats (the BIG fix - this was never applied!)
 *
 * Note: These are "status" source modifiers, applied last
 */
export function collectStatusModifiers(character: Character): StatModifier[] {
  const modifiers: StatModifier[] = []

  for (const effect of character.statusEffects) {
    switch (effect.type) {
      case 'speed':
        modifiers.push(flatModifier('status', 'speed', effect.value, 'Haste'))
        break

      case 'slowed': {
        // Slowed value is percentage (e.g., 50 = -50% speed)
        // Convert to flat penalty: 50% reduction = -50 speed points
        const slowPenalty = Math.floor(effect.value / 2)
        modifiers.push(flatModifier('status', 'speed', -slowPenalty, 'Slowed'))
        break
      }

      case 'heroism':
        modifiers.push(flatModifier('status', 'accuracy', effect.value, 'Heroism'))
        modifiers.push(flatModifier('status', 'rangedAccuracy', effect.value, 'Heroism'))
        break

      case 'blessing':
        modifiers.push(flatModifier('status', 'accuracy', effect.value, 'Blessing'))
        modifiers.push(flatModifier('status', 'rangedAccuracy', effect.value, 'Blessing'))
        modifiers.push(flatModifier('status', 'armor', effect.value, 'Blessing'))
        break

      case 'protection':
        // Mage Armor (+8), Shield (+15), Sanctuary (+15), Cloak of Shadows (+12)
        modifiers.push(flatModifier('status', 'armor', effect.value, 'Protection'))
        break

      case 'drained':
        // THE BIG FIX: Drained now actually reduces stats!
        // Value is percentage reduction (typically 20)
        // Apply as percent modifier to all core stats
        modifiers.push(percentModifier('status', 'str', -effect.value, 'Drained'))
        modifiers.push(percentModifier('status', 'dex', -effect.value, 'Drained'))
        modifiers.push(percentModifier('status', 'con', -effect.value, 'Drained'))
        modifiers.push(percentModifier('status', 'int', -effect.value, 'Drained'))
        modifiers.push(percentModifier('status', 'wis', -effect.value, 'Drained'))
        break

      // Note: berserk damage bonus is handled inline in attack/rangedAttack
      // as it applies to actual dice-based damage, not the average-based stat

      // Note: Binary effects like paralyzed, confused, blind, terrified
      // don't modify stats - they change behavior
    }
  }

  return modifiers
}

// ============================================================================
// COMBINED COLLECTION
// ============================================================================

/**
 * Options for collecting modifiers
 */
export interface CollectOptions {
  includeStatusEffects?: boolean
  includeFormModifiers?: boolean
}

/**
 * Collect all modifiers from all sources for a character
 *
 * @param character - The character to collect modifiers for
 * @param race - The character's race data
 * @param form - Active shapeshift form (if any)
 * @param options - Collection options
 * @returns Array of all applicable modifiers
 */
export function collectAllModifiers(
  character: Character,
  race: Race,
  form: ShapeformTemplate | null,
  options: CollectOptions = {}
): StatModifier[] {
  const { includeStatusEffects = true, includeFormModifiers = true } = options

  const modifiers: StatModifier[] = []

  // 1. Equipment modifiers
  modifiers.push(...collectEquipmentModifiers(character))

  // 2. Upgrade modifiers (if character has upgrade bonuses)
  if (character.upgradeBonuses) {
    modifiers.push(...collectUpgradeModifiers(character.upgradeBonuses))
  }

  // 3. Racial modifiers
  modifiers.push(...collectRacialModifiers(race))

  // 4. Form modifiers (if active and enabled)
  if (form && includeFormModifiers) {
    modifiers.push(...collectFormModifiers(form))
  }

  // 5. Status effect modifiers (if enabled)
  if (includeStatusEffects) {
    modifiers.push(...collectStatusModifiers(character))
  }

  return modifiers
}
