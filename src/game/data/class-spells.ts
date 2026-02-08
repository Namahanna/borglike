/**
 * Class Spell Lists for Borglike
 *
 * Maps classes to their available spells and the levels at which they learn them.
 */

import { getSpellById, type SpellTemplate } from './spells'

// ============================================================================
// TYPES
// ============================================================================

/** Spell entry with level requirement */
export interface ClassSpellEntry {
  spellId: string
  learnLevel: number // character level at which spell is learned
}

/** Class spell list definition */
export interface ClassSpellList {
  classId: string
  spells: ClassSpellEntry[]
}

// ============================================================================
// CLASS SPELL LISTS
// ============================================================================

/**
 * Mage - Full arcane caster (12 spells)
 * Gets Phase Door, Mage Armor, and Light Orb at level 1 for early survival
 * Late-game spells at L35, L40, L45 for endgame scaling
 */
const mageSpells: ClassSpellList = {
  classId: 'mage',
  spells: [
    { spellId: 'magic_missile', learnLevel: 1 },
    { spellId: 'phase_door', learnLevel: 1 }, // Early escape spell
    { spellId: 'mage_armor', learnLevel: 1 }, // Early defense buff
    { spellId: 'light_orb', learnLevel: 1 }, // Early visibility buff
    { spellId: 'frost_bolt', learnLevel: 5 },
    { spellId: 'slow_monster', learnLevel: 8 }, // CC for dangerous monsters
    { spellId: 'teleport_other', learnLevel: 12 }, // Banish dangerous threats
    { spellId: 'dimension_door', learnLevel: 12 }, // Tactical kiting teleport
    { spellId: 'lightning_bolt', learnLevel: 15 },
    { spellId: 'shield', learnLevel: 18 }, // Strong AC buff (+15)
    { spellId: 'fireball', learnLevel: 20 },
    { spellId: 'resistance', learnLevel: 22 }, // Full elemental coverage
    { spellId: 'teleport', learnLevel: 25 },
    // Late-game spells for endgame scaling
    { spellId: 'arcane_torrent', learnLevel: 35 }, // LOS damage
    { spellId: 'meteor', learnLevel: 40 }, // Single target nuke
    { spellId: 'mana_storm', learnLevel: 45 }, // Ultimate AOE, unresistable
  ],
}

/**
 * Rogue - Shadow assassin (5 spells)
 * All buffs/utility — no damage spells (they waste turns vs melee)
 * Envenom + Shadow Dance stack for massive burst windows
 */
const rogueSpells: ClassSpellList = {
  classId: 'rogue',
  spells: [
    { spellId: 'envenom', learnLevel: 1 }, // Opening damage buff (+25%)
    { spellId: 'phase_door', learnLevel: 5 }, // Early escape (moved from L8)
    { spellId: 'shadow_step', learnLevel: 10 }, // Core burst: teleport + Sneak Attack
    { spellId: 'cloak_of_shadows', learnLevel: 18 }, // Defensive buff (+12 AC)
    { spellId: 'shadow_dance', learnLevel: 35 }, // Endgame power spike (+50% damage)
  ],
}

/**
 * Archmage - Ultimate arcane caster (11 spells, learns faster)
 * Prestige class - gets late-game spells earlier than Mage
 */
const archmageSpells: ClassSpellList = {
  classId: 'archmage',
  spells: [
    { spellId: 'magic_missile', learnLevel: 1 },
    { spellId: 'phase_door', learnLevel: 1 }, // Early escape like Mage - essential for glass cannon
    { spellId: 'frost_bolt', learnLevel: 1 }, // Extra damage spell at L1
    { spellId: 'light_orb', learnLevel: 1 }, // Early visibility buff
    { spellId: 'slow_monster', learnLevel: 5 }, // Early CC for glass cannon
    { spellId: 'lightning_bolt', learnLevel: 5 },
    { spellId: 'teleport_other', learnLevel: 8 }, // Banish dangerous threats (earlier than Mage)
    { spellId: 'dimension_door', learnLevel: 8 }, // Tactical kiting (earlier than Mage)
    { spellId: 'fireball', learnLevel: 12 },
    { spellId: 'shield', learnLevel: 14 }, // Strong AC buff (+15, earlier than Mage)
    { spellId: 'teleport', learnLevel: 18 },
    { spellId: 'resistance', learnLevel: 18 }, // Full elemental coverage (earlier than Mage)
    // Late-game spells - Archmage gets them earlier
    { spellId: 'arcane_torrent', learnLevel: 25 }, // LOS damage
    { spellId: 'meteor', learnLevel: 32 }, // Single target nuke
    { spellId: 'mana_storm', learnLevel: 40 }, // Ultimate AOE, unresistable
  ],
}

/**
 * Priest - Full divine caster (10 spells)
 * Focused on healing and anti-evil, late-game devastation vs evil
 */
const priestSpells: ClassSpellList = {
  classId: 'priest',
  spells: [
    { spellId: 'minor_heal', learnLevel: 1 },
    { spellId: 'bless', learnLevel: 5 },
    { spellId: 'orb_of_draining', learnLevel: 8 }, // Primary attack spell
    { spellId: 'cure_wounds', learnLevel: 10 },
    { spellId: 'protection_from_evil', learnLevel: 12 }, // Defensive buff vs EVIL
    { spellId: 'smite_evil', learnLevel: 15 },
    { spellId: 'sanctuary', learnLevel: 25 },
    { spellId: 'holy_word', learnLevel: 35 },
    // Late-game divine power
    { spellId: 'divine_wrath', learnLevel: 40 }, // LOS damage to all evil
    { spellId: 'restoration', learnLevel: 45 }, // Full heal + cure all
  ],
}

/**
 * Paladin - Limited divine magic (6 spells)
 * Combat-focused divine warrior with late-game holy power
 */
const paladinSpells: ClassSpellList = {
  classId: 'paladin',
  spells: [
    { spellId: 'minor_heal', learnLevel: 3 },
    { spellId: 'bless', learnLevel: 8 },
    { spellId: 'smite_evil', learnLevel: 12 },
    { spellId: 'cure_wounds', learnLevel: 20 },
    // Late-game divine power (learns later than Priest)
    { spellId: 'holy_word', learnLevel: 38 },
    { spellId: 'divine_wrath', learnLevel: 45 }, // LOS damage to all evil
  ],
}

/**
 * Druid - Nature caster (7 spells)
 * Nature magic with healing and elemental power, late-game elemental devastation
 */
const druidSpells: ClassSpellList = {
  classId: 'druid',
  spells: [
    { spellId: 'entangle', learnLevel: 1 },
    { spellId: 'natures_balm', learnLevel: 5 },
    { spellId: 'thorn_strike', learnLevel: 10 },
    { spellId: 'resist_elements', learnLevel: 18 },
    { spellId: 'lightning_storm', learnLevel: 28 },
    // Late-game elemental power
    { spellId: 'ice_storm', learnLevel: 35 }, // LOS cold + slow
    { spellId: 'volcanic_eruption', learnLevel: 42 }, // Massive fire AOE
  ],
}

/**
 * Ranger - Nature magic with companion (11 spells)
 * Gets wolf companion and root shot early for survival
 * Mid-game: Hunter's Mark for damage, Camouflage for escape
 * Late-game: Pack tactics and elemental storms
 */
const rangerSpells: ClassSpellList = {
  classId: 'ranger',
  spells: [
    { spellId: 'summon_wolf', learnLevel: 1 }, // Wolf companion from start
    { spellId: 'root_shot', learnLevel: 1 }, // Stun shot for kiting
    { spellId: 'natures_balm', learnLevel: 5 }, // Early heal for sustain
    { spellId: 'hunters_mark', learnLevel: 8 }, // +25% damage buff
    { spellId: 'entangle', learnLevel: 10 },
    { spellId: 'camouflage', learnLevel: 18 }, // Escape/protection
    { spellId: 'resist_elements', learnLevel: 25 },
    { spellId: 'ice_storm', learnLevel: 40 }, // LOS cold + slow
  ],
}

/**
 * Necromancer - Shadow caster with minions (9 spells)
 * Dark magic with life drain and skeleton summon from L1
 * Late-game mass drain and dark storms
 */
const necromancerSpells: ClassSpellList = {
  classId: 'necromancer',
  spells: [
    { spellId: 'drain_life', learnLevel: 1 },
    { spellId: 'summon_skeleton', learnLevel: 1 }, // Skeleton from start for early survival
    { spellId: 'shadow_sight', learnLevel: 1 }, // Early visibility buff
    { spellId: 'shadow_bolt', learnLevel: 5 },
    { spellId: 'weaken', learnLevel: 12 },
    { spellId: 'dimension_door', learnLevel: 12 }, // Tactical kiting (cross-school utility)
    { spellId: 'dark_pact', learnLevel: 18 },
    { spellId: 'soul_rend', learnLevel: 28 },
    // Late-game shadow power
    { spellId: 'mass_drain', learnLevel: 35 }, // AOE lifedrain
    { spellId: 'storm_of_darkness', learnLevel: 42 }, // Massive dark AOE
  ],
}

/**
 * Blackguard - Limited shadow magic (6 spells)
 * Dark warrior with life steal and late-game dark power
 */
const blackguardSpells: ClassSpellList = {
  classId: 'blackguard',
  spells: [
    { spellId: 'drain_life', learnLevel: 3 },
    { spellId: 'shadow_bolt', learnLevel: 8 },
    { spellId: 'weaken', learnLevel: 15 },
    { spellId: 'dark_pact', learnLevel: 22 },
    // Late-game shadow power (learns later than Necromancer)
    { spellId: 'soul_rend', learnLevel: 35 },
    { spellId: 'mass_drain', learnLevel: 42 }, // AOE lifedrain
  ],
}

// ============================================================================
// SPELL LIST COLLECTION
// ============================================================================

/** All class spell lists, indexed by class ID */
export const CLASS_SPELL_LISTS: Record<string, ClassSpellList> = {
  mage: mageSpells,
  rogue: rogueSpells,
  archmage: archmageSpells,
  priest: priestSpells,
  paladin: paladinSpells,
  druid: druidSpells,
  ranger: rangerSpells,
  necromancer: necromancerSpells,
  blackguard: blackguardSpells,
}

/** Classes that have no spells */
export const NON_CASTER_CLASSES = ['warrior', 'berserker']

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the spell list for a class
 */
export function getClassSpellList(classId: string): ClassSpellList | undefined {
  return CLASS_SPELL_LISTS[classId]
}

/**
 * Check if a class can cast spells
 */
export function classCanCast(classId: string): boolean {
  return CLASS_SPELL_LISTS[classId] !== undefined
}

/**
 * Get spells available to a class at a given level
 */
export function getSpellsForLevel(classId: string, level: number): SpellTemplate[] {
  const spellList = CLASS_SPELL_LISTS[classId]
  if (!spellList) return []

  return spellList.spells
    .filter((entry) => entry.learnLevel <= level)
    .map((entry) => getSpellById(entry.spellId))
    .filter((spell): spell is SpellTemplate => spell !== undefined)
}

/**
 * Get spell IDs available to a class at a given level
 */
export function getSpellIdsForLevel(classId: string, level: number): string[] {
  const spellList = CLASS_SPELL_LISTS[classId]
  if (!spellList) return []

  return spellList.spells.filter((entry) => entry.learnLevel <= level).map((entry) => entry.spellId)
}

/**
 * Get newly learned spells when leveling up
 */
export function getNewSpellsAtLevel(classId: string, level: number): SpellTemplate[] {
  const spellList = CLASS_SPELL_LISTS[classId]
  if (!spellList) return []

  return spellList.spells
    .filter((entry) => entry.learnLevel === level)
    .map((entry) => getSpellById(entry.spellId))
    .filter((spell): spell is SpellTemplate => spell !== undefined)
}

/**
 * Get the primary school for a class (for UI/theme purposes)
 */
export function getClassPrimarySchool(
  classId: string
): 'arcane' | 'divine' | 'nature' | 'shadow' | null {
  switch (classId) {
    case 'mage':
    case 'archmage':
      return 'arcane'
    case 'priest':
    case 'paladin':
      return 'divine'
    case 'druid':
    case 'ranger':
      return 'nature'
    case 'rogue':
    case 'necromancer':
    case 'blackguard':
      return 'shadow'
    default:
      return null
  }
}
