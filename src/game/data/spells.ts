/**
 * Spell definitions for Borglike
 *
 * Spells are organized by school (arcane, divine, nature, shadow).
 * Each spell has a level requirement, mana cost, and effect.
 */

import type { SpellSchool, SpellEffectType, SpellDamageType, StatusEffectType } from '../types'

// ============================================================================
// TYPES
// ============================================================================

/** Buff effect granted by a spell */
export interface SpellBuff {
  type: StatusEffectType
  value: number
  duration: number // in turns
}

/** Debuff effect inflicted by a spell */
export interface SpellDebuff {
  type: 'slow' | 'weaken' | 'blind'
  value: number // percentage reduction or effect strength
  duration: number // in turns
}

/** Level-based damage scaling for late-game spells */
export interface LevelDamage {
  base: number // flat base damage
  perLevel: number // bonus per character level
}

/** Spell template definition */
export interface SpellTemplate {
  id: string
  name: string
  school: SpellSchool
  level: number // minimum level to learn
  manaCost: number
  cooldown: number // turns before can cast again (0 = no cooldown)
  effectType: SpellEffectType
  description: string

  // Damage spells
  baseDamage?: string // dice notation e.g. "2d6"
  damageScaling?: number // bonus damage per level/3 (default 1)
  damageType?: SpellDamageType

  // Late-game damage scaling (replaces baseDamage for endgame spells)
  levelDamage?: LevelDamage // base + perLevel * characterLevel

  // AOE spells
  maxTargets?: number // for aoe_damage

  // Targeting mode
  targetMode?: 'single' | 'nearest' | 'aoe' | 'los' // los = line of sight (all visible)

  // Heal spells
  baseHeal?: string // dice notation
  healScaling?: number // bonus heal per level/2 (default 1)
  curesPoison?: boolean
  fullHeal?: boolean // heals to full HP (for Restoration)
  curesAll?: boolean // cures all negative status effects

  // Buff spells
  buff?: SpellBuff

  // Debuff spells
  debuff?: SpellDebuff

  // Lifedrain spells
  drainPercent?: number // percentage of damage healed (default 50)

  // Teleport spells
  teleportRange?: number // 0 = random on level, N = within N tiles

  // Special flags
  doubleVsEvil?: boolean // 2x damage vs evil monsters
  onlyEvil?: boolean // only damages evil monsters (Divine Wrath)
  canBeam?: boolean // Bolt spell that can become a beam at higher levels
  unresistable?: boolean // bypasses all resistances/immunities

  // Multi-summon
  summonIds?: string[] // for spells that summon multiple minions
}

// ============================================================================
// ARCANE SPELLS (INT-based)
// ============================================================================

const magic_missile: SpellTemplate = {
  id: 'magic_missile',
  name: 'Magic Missile',
  school: 'arcane',
  level: 1,
  manaCost: 2,
  cooldown: 0,
  effectType: 'damage',
  baseDamage: '2d6',
  damageScaling: 1,
  damageType: 'arcane',
  canBeam: true, // Can pierce multiple enemies as beam at higher levels
  description: 'A bolt of pure magical energy strikes your foe.',
}

const frost_bolt: SpellTemplate = {
  id: 'frost_bolt',
  name: 'Frost Bolt',
  school: 'arcane',
  level: 4,
  manaCost: 4,
  cooldown: 0,
  effectType: 'damage',
  baseDamage: '2d4',
  damageScaling: 1,
  damageType: 'cold',
  debuff: { type: 'slow', value: 50, duration: 3 },
  canBeam: true, // Can pierce multiple enemies as beam at higher levels
  description: 'A bolt of freezing cold slows your enemy.',
}

const phase_door: SpellTemplate = {
  id: 'phase_door',
  name: 'Phase Door',
  school: 'arcane',
  level: 4,
  manaCost: 4,
  cooldown: 3,
  effectType: 'teleport',
  teleportRange: 8,
  description: 'Blink a short distance away.',
}

const dimension_door: SpellTemplate = {
  id: 'dimension_door',
  name: 'Dimension Door',
  school: 'arcane',
  level: 12,
  manaCost: 8,
  cooldown: 4,
  effectType: 'targeted_teleport',
  teleportRange: 0, // 0 = dynamic (use calculateLightRadius at cast time)
  description: 'Step through dimensions to any visible location.',
}

const lightning_bolt: SpellTemplate = {
  id: 'lightning_bolt',
  name: 'Lightning Bolt',
  school: 'arcane',
  level: 10,
  manaCost: 8,
  cooldown: 0,
  effectType: 'damage',
  baseDamage: '3d6',
  damageScaling: 2,
  damageType: 'lightning',
  canBeam: true, // Can pierce multiple enemies as beam at higher levels
  description: 'A crackling bolt of lightning arcs to your target.',
}

const fireball: SpellTemplate = {
  id: 'fireball',
  name: 'Fireball',
  school: 'arcane',
  level: 15,
  manaCost: 12,
  cooldown: 2,
  effectType: 'aoe_damage',
  baseDamage: '2d8',
  damageScaling: 2,
  damageType: 'fire',
  maxTargets: 3,
  description: 'A ball of fire explodes among your enemies.',
}

const teleport: SpellTemplate = {
  id: 'teleport',
  name: 'Teleport',
  school: 'arcane',
  level: 20,
  manaCost: 15,
  cooldown: 5,
  effectType: 'teleport',
  teleportRange: 0, // anywhere on level
  description: 'Teleport to a random location on the level.',
}

const mage_armor: SpellTemplate = {
  id: 'mage_armor',
  name: 'Mage Armor',
  school: 'arcane',
  level: 1,
  manaCost: 5,
  cooldown: 30,
  effectType: 'buff',
  buff: { type: 'protection', value: 8, duration: 50 },
  description: 'A magical barrier grants +8 AC.',
}

const light_orb: SpellTemplate = {
  id: 'light_orb',
  name: 'Light Orb',
  school: 'arcane',
  level: 1,
  manaCost: 4,
  cooldown: 30,
  effectType: 'buff',
  buff: { type: 'enhanced_light', value: 2, duration: 50 },
  description: 'Conjure a glowing orb that follows you, extending your vision by 2 tiles.',
}

const slow_monster: SpellTemplate = {
  id: 'slow_monster',
  name: 'Slow Monster',
  school: 'arcane',
  level: 8,
  manaCost: 5,
  cooldown: 0,
  effectType: 'debuff',
  debuff: { type: 'slow', value: 50, duration: 12 },
  description: 'Arcane bindings slow your foe by 50% for 12 turns.',
}

const teleport_other: SpellTemplate = {
  id: 'teleport_other',
  name: 'Teleport Other',
  school: 'arcane',
  level: 12,
  manaCost: 10,
  cooldown: 3,
  effectType: 'teleport_other',
  description: 'Teleports a visible monster to a random location.',
}

const shield: SpellTemplate = {
  id: 'shield',
  name: 'Shield',
  school: 'arcane',
  level: 18,
  manaCost: 12,
  cooldown: 25,
  effectType: 'buff',
  buff: { type: 'protection', value: 15, duration: 30 },
  description: 'A powerful magical shield grants +15 AC.',
}

const resistance: SpellTemplate = {
  id: 'resistance',
  name: 'Resistance',
  school: 'arcane',
  level: 22,
  manaCost: 15,
  cooldown: 30,
  effectType: 'buff',
  // Special handling in spell-resolution.ts (no buff property)
  description: 'Gain resistance to fire, cold, lightning, and poison.',
}

// ============================================================================
// DIVINE SPELLS (WIS-based)
// ============================================================================

const minor_heal: SpellTemplate = {
  id: 'minor_heal',
  name: 'Minor Heal',
  school: 'divine',
  level: 1,
  manaCost: 2,
  cooldown: 0,
  effectType: 'heal',
  baseHeal: '1d6',
  healScaling: 1,
  description: 'A small blessing restores your wounds.',
}

const bless: SpellTemplate = {
  id: 'bless',
  name: 'Bless',
  school: 'divine',
  level: 5,
  manaCost: 4,
  cooldown: 20,
  effectType: 'buff',
  buff: { type: 'blessing', value: 5, duration: 20 },
  description: 'Divine favor grants +5 to hit and AC.',
}

const cure_wounds: SpellTemplate = {
  id: 'cure_wounds',
  name: 'Cure Wounds',
  school: 'divine',
  level: 10,
  manaCost: 8,
  cooldown: 0,
  effectType: 'heal',
  baseHeal: '2d8',
  healScaling: 2,
  description: 'Lay on hands, healing significant damage.',
}

const smite_evil: SpellTemplate = {
  id: 'smite_evil',
  name: 'Smite Evil',
  school: 'divine',
  level: 10,
  manaCost: 6,
  cooldown: 0,
  effectType: 'damage',
  baseDamage: '3d8',
  damageScaling: 3,
  damageType: 'holy',
  doubleVsEvil: true,
  description: 'Holy wrath smites the wicked (2x vs evil).',
}

const orb_of_draining: SpellTemplate = {
  id: 'orb_of_draining',
  name: 'Orb of Draining',
  school: 'divine',
  level: 8,
  manaCost: 6,
  cooldown: 0,
  effectType: 'aoe_damage',
  baseDamage: '2d6',
  damageScaling: 2,
  damageType: 'holy',
  maxTargets: 3,
  doubleVsEvil: true,
  description: 'A ball of holy energy sears evil creatures (2x vs evil).',
}

const protection_from_evil: SpellTemplate = {
  id: 'protection_from_evil',
  name: 'Protection from Evil',
  school: 'divine',
  level: 12,
  manaCost: 10,
  cooldown: 30,
  effectType: 'buff',
  buff: { type: 'prot_from_evil', value: 50, duration: 50 },
  description: 'Divine ward halves damage from evil creatures.',
}

const sanctuary: SpellTemplate = {
  id: 'sanctuary',
  name: 'Sanctuary',
  school: 'divine',
  level: 20,
  manaCost: 20,
  cooldown: 50,
  effectType: 'buff',
  buff: { type: 'protection', value: 15, duration: 30 },
  description: 'Divine protection grants +15 AC for a time.',
}

const holy_word: SpellTemplate = {
  id: 'holy_word',
  name: 'Holy Word',
  school: 'divine',
  level: 30,
  manaCost: 35,
  cooldown: 5,
  effectType: 'aoe_damage',
  baseDamage: '5d8',
  damageScaling: 3,
  damageType: 'holy',
  maxTargets: 4,
  doubleVsEvil: true,
  description: 'A word of power smites all evil nearby.',
}

// ============================================================================
// NATURE SPELLS (WIS-based)
// ============================================================================

const entangle: SpellTemplate = {
  id: 'entangle',
  name: 'Entangle',
  school: 'nature',
  level: 1,
  manaCost: 3,
  cooldown: 5,
  effectType: 'debuff',
  debuff: { type: 'slow', value: 50, duration: 8 },
  description: 'Vines wrap around your foe, slowing them.',
}

const natures_balm: SpellTemplate = {
  id: 'natures_balm',
  name: "Nature's Balm",
  school: 'nature',
  level: 5,
  manaCost: 5,
  cooldown: 0,
  effectType: 'heal',
  baseHeal: '2d8',
  healScaling: 2,
  curesPoison: true,
  description: 'Natural healing cures poison and restores HP.',
}

const thorn_strike: SpellTemplate = {
  id: 'thorn_strike',
  name: 'Thorn Strike',
  school: 'nature',
  level: 10,
  manaCost: 6,
  cooldown: 0,
  effectType: 'damage',
  baseDamage: '3d6',
  damageScaling: 2,
  damageType: 'nature',
  description: 'A barrage of thorns pierces your enemy.',
}

const resist_elements: SpellTemplate = {
  id: 'resist_elements',
  name: 'Resist Elements',
  school: 'nature',
  level: 15,
  manaCost: 10,
  cooldown: 30,
  effectType: 'buff',
  // Custom handling - grants fire+cold resistance
  description: 'Gain resistance to fire and cold for a time.',
}

const lightning_storm: SpellTemplate = {
  id: 'lightning_storm',
  name: 'Lightning Storm',
  school: 'nature',
  level: 25,
  manaCost: 20,
  cooldown: 5,
  effectType: 'aoe_damage',
  baseDamage: '3d8',
  damageScaling: 2,
  damageType: 'lightning',
  maxTargets: 3,
  description: 'Call down lightning on multiple foes.',
}

const root_shot: SpellTemplate = {
  id: 'root_shot',
  name: 'Root Shot',
  school: 'nature',
  level: 1,
  manaCost: 4,
  cooldown: 5,
  effectType: 'damage',
  baseDamage: '1d4',
  damageScaling: 0,
  damageType: 'nature',
  debuff: { type: 'slow', value: 40, duration: 3 }, // 40% slow
  description: 'An arrow wrapped in vines roots your target in place.',
}

const summon_wolf: SpellTemplate = {
  id: 'summon_wolf',
  name: 'Summon Wolf',
  school: 'nature',
  level: 1,
  manaCost: 5, // Lowered to match Ranger starting mana
  cooldown: 20,
  effectType: 'summon',
  description: 'Call a loyal wolf companion to fight by your side.',
}

const hunters_mark: SpellTemplate = {
  id: 'hunters_mark',
  name: "Hunter's Mark",
  school: 'nature',
  level: 8,
  manaCost: 5,
  cooldown: 0,
  effectType: 'buff',
  buff: { type: 'damage_bonus', value: 25, duration: 15 },
  description: 'Mark your prey. All attacks deal +25% damage.',
}

const camouflage: SpellTemplate = {
  id: 'camouflage',
  name: 'Camouflage',
  school: 'nature',
  level: 18,
  manaCost: 12,
  cooldown: 30,
  effectType: 'buff',
  buff: { type: 'protection', value: 50, duration: 8 },
  description: 'Blend into your surroundings, taking 50% less damage.',
}

const summon_bear: SpellTemplate = {
  id: 'summon_bear',
  name: 'Summon Bear',
  school: 'nature',
  level: 22,
  manaCost: 15,
  cooldown: 25,
  effectType: 'summon',
  description: 'Call a powerful bear to maul your enemies.',
}

const summon_skeleton: SpellTemplate = {
  id: 'summon_skeleton',
  name: 'Raise Skeleton',
  school: 'shadow',
  level: 1, // Lowered to match Necromancer class-spell level
  manaCost: 5, // Lowered to match Necromancer starting mana
  cooldown: 15,
  effectType: 'summon',
  description: 'Raise a skeletal warrior from the bones of the fallen.',
}

// ============================================================================
// SHADOW SPELLS (INT-based)
// ============================================================================

const drain_life: SpellTemplate = {
  id: 'drain_life',
  name: 'Drain Life',
  school: 'shadow',
  level: 1,
  manaCost: 3,
  cooldown: 0,
  effectType: 'lifedrain',
  baseDamage: '1d6',
  damageScaling: 2,
  damageType: 'dark',
  drainPercent: 50,
  description: 'Steal life force from your enemy.',
}

const shadow_step: SpellTemplate = {
  id: 'shadow_step',
  name: 'Shadow Step',
  school: 'shadow',
  level: 10,
  manaCost: 6,
  cooldown: 5,
  effectType: 'shadow_step',
  description: 'Step through shadows to appear adjacent to a visible enemy.',
}

const shadow_sight: SpellTemplate = {
  id: 'shadow_sight',
  name: 'Shadow Sight',
  school: 'shadow',
  level: 1,
  manaCost: 4,
  cooldown: 30,
  effectType: 'buff',
  buff: { type: 'enhanced_light', value: 2, duration: 50 },
  description: 'Your eyes adapt to darkness, extending your vision by 2 tiles.',
}

const shadow_bolt: SpellTemplate = {
  id: 'shadow_bolt',
  name: 'Shadow Bolt',
  school: 'shadow',
  level: 5,
  manaCost: 5,
  cooldown: 0,
  effectType: 'damage',
  baseDamage: '2d6',
  damageScaling: 1,
  damageType: 'dark',
  canBeam: true, // Can pierce multiple enemies as beam at higher levels
  description: 'A bolt of darkness strikes your foe.',
}

const weaken: SpellTemplate = {
  id: 'weaken',
  name: 'Weaken',
  school: 'shadow',
  level: 10,
  manaCost: 6,
  cooldown: 8,
  effectType: 'debuff',
  debuff: { type: 'weaken', value: 25, duration: 10 },
  description: 'Curse your foe to deal 25% less damage.',
}

const dark_pact: SpellTemplate = {
  id: 'dark_pact',
  name: 'Dark Pact',
  school: 'shadow',
  level: 15,
  manaCost: 8,
  cooldown: 20,
  effectType: 'buff',
  buff: { type: 'damage_bonus', value: 30, duration: 15 },
  // Note: also costs 10 HP on cast - handled in resolution
  description: 'Sacrifice 10 HP for +30% damage.',
}

const soul_rend: SpellTemplate = {
  id: 'soul_rend',
  name: 'Soul Rend',
  school: 'shadow',
  level: 25,
  manaCost: 25,
  cooldown: 8,
  effectType: 'aoe_damage',
  baseDamage: '4d6',
  damageScaling: 2,
  damageType: 'dark',
  maxTargets: 2,
  drainPercent: 25, // Heals 25% of total damage dealt
  description: 'Tear the souls of nearby enemies, healing yourself.',
}

// ============================================================================
// ROGUE SHADOW SPELLS
// ============================================================================

const envenom: SpellTemplate = {
  id: 'envenom',
  name: 'Envenom',
  school: 'shadow',
  level: 1,
  manaCost: 4,
  cooldown: 20,
  effectType: 'buff',
  buff: { type: 'damage_bonus', value: 25, duration: 15 },
  description: 'Coat your blade in venom, dealing +25% damage for 15 turns.',
}

const cloak_of_shadows: SpellTemplate = {
  id: 'cloak_of_shadows',
  name: 'Cloak of Shadows',
  school: 'shadow',
  level: 18,
  manaCost: 10,
  cooldown: 30,
  effectType: 'buff',
  buff: { type: 'protection', value: 12, duration: 25 },
  description: 'Wrap yourself in shadows, gaining +12 AC.',
}

const shadow_dance: SpellTemplate = {
  id: 'shadow_dance',
  name: 'Shadow Dance',
  school: 'shadow',
  level: 35,
  manaCost: 20,
  cooldown: 30,
  effectType: 'buff',
  buff: { type: 'damage_bonus', value: 50, duration: 10 },
  description: 'Enter a deadly dance of blades, dealing +50% damage for 10 turns.',
}

// ============================================================================
// LATE-GAME ARCANE SPELLS (L35-45)
// ============================================================================

const arcane_torrent: SpellTemplate = {
  id: 'arcane_torrent',
  name: 'Arcane Torrent',
  school: 'arcane',
  level: 35,
  manaCost: 25,
  cooldown: 3,
  effectType: 'aoe_damage',
  levelDamage: { base: 12, perLevel: 1 }, // 12 + level = 62 at L50
  damageType: 'arcane',
  targetMode: 'los', // hits ALL visible enemies
  description: 'A torrent of arcane energy strikes all visible foes.',
}

const meteor: SpellTemplate = {
  id: 'meteor',
  name: 'Meteor',
  school: 'arcane',
  level: 40,
  manaCost: 30,
  cooldown: 4,
  effectType: 'damage',
  levelDamage: { base: 30, perLevel: 2 }, // 30 + level*2 = 130 at L50
  damageType: 'fire',
  description: 'Call down a devastating meteor on your foe.',
}

const mana_storm: SpellTemplate = {
  id: 'mana_storm',
  name: 'Mana Storm',
  school: 'arcane',
  level: 45,
  manaCost: 40,
  cooldown: 8,
  effectType: 'aoe_damage',
  levelDamage: { base: 50, perLevel: 2 }, // 50 + level*2 = 150 at L50
  damageType: 'arcane',
  maxTargets: 5,
  unresistable: true,
  description: 'A storm of pure mana devastates all nearby foes. Unresistable.',
}

// ============================================================================
// LATE-GAME DIVINE SPELLS (L40-45)
// ============================================================================

const divine_wrath: SpellTemplate = {
  id: 'divine_wrath',
  name: 'Divine Wrath',
  school: 'divine',
  level: 40,
  manaCost: 35,
  cooldown: 3,
  effectType: 'aoe_damage',
  levelDamage: { base: 30, perLevel: 3 }, // 30 + level*3 = 180 at L50
  damageType: 'holy',
  targetMode: 'los', // hits ALL visible enemies
  onlyEvil: true, // only damages evil monsters
  description: 'Holy wrath smites all evil creatures in sight.',
}

const restoration: SpellTemplate = {
  id: 'restoration',
  name: 'Restoration',
  school: 'divine',
  level: 45,
  manaCost: 50,
  cooldown: 20,
  effectType: 'heal',
  fullHeal: true, // heals to full HP
  curesPoison: true,
  curesAll: true, // removes all negative effects
  description: 'Divine power fully restores your body and spirit.',
}

// ============================================================================
// LATE-GAME NATURE SPELLS (L35-42)
// ============================================================================

const ice_storm: SpellTemplate = {
  id: 'ice_storm',
  name: 'Ice Storm',
  school: 'nature',
  level: 35,
  manaCost: 30,
  cooldown: 4,
  effectType: 'aoe_damage',
  levelDamage: { base: 20, perLevel: 2 }, // 20 + level*2 = 120 at L50
  damageType: 'cold',
  targetMode: 'los', // hits ALL visible enemies
  debuff: { type: 'slow', value: 50, duration: 5 }, // slows all targets
  description: 'A freezing storm strikes all visible enemies, slowing them.',
}

const volcanic_eruption: SpellTemplate = {
  id: 'volcanic_eruption',
  name: 'Volcanic Eruption',
  school: 'nature',
  level: 42,
  manaCost: 40,
  cooldown: 5,
  effectType: 'aoe_damage',
  levelDamage: { base: 30, perLevel: 2 }, // 30 + level*2 = 130 at L50
  damageType: 'fire',
  maxTargets: 6,
  description: 'The earth erupts in fire, scorching all nearby foes.',
}

const summon_pack: SpellTemplate = {
  id: 'summon_pack',
  name: 'Summon Pack',
  school: 'nature',
  level: 32,
  manaCost: 25,
  cooldown: 30,
  effectType: 'summon',
  summonIds: ['summon_wolf', 'summon_bear'], // summons both
  description: 'Call your wolf and bear companions together.',
}

// ============================================================================
// LATE-GAME SHADOW SPELLS (L35-42)
// ============================================================================

const mass_drain: SpellTemplate = {
  id: 'mass_drain',
  name: 'Mass Drain',
  school: 'shadow',
  level: 35,
  manaCost: 30,
  cooldown: 5,
  effectType: 'aoe_damage',
  levelDamage: { base: 15, perLevel: 1 }, // 15 + level = 65 at L50
  damageType: 'dark',
  maxTargets: 4,
  drainPercent: 50, // heals 50% of all damage dealt
  description: 'Drain life from multiple enemies, healing yourself.',
}

const storm_of_darkness: SpellTemplate = {
  id: 'storm_of_darkness',
  name: 'Storm of Darkness',
  school: 'shadow',
  level: 42,
  manaCost: 35,
  cooldown: 6,
  effectType: 'aoe_damage',
  levelDamage: { base: 25, perLevel: 2 }, // 25 + level*2 = 125 at L50
  damageType: 'dark',
  maxTargets: 5,
  description: 'A storm of darkness engulfs your enemies.',
}

// ============================================================================
// SPELL COLLECTION
// ============================================================================

/** All spells in the game, indexed by ID */
export const SPELLS: Record<string, SpellTemplate> = {
  // Arcane (early/mid)
  magic_missile,
  frost_bolt,
  phase_door,
  dimension_door,
  lightning_bolt,
  fireball,
  teleport,
  mage_armor,
  light_orb,
  slow_monster,
  teleport_other,
  shield,
  resistance,
  // Arcane (late-game)
  arcane_torrent,
  meteor,
  mana_storm,
  // Divine (early/mid)
  minor_heal,
  bless,
  cure_wounds,
  smite_evil,
  orb_of_draining,
  protection_from_evil,
  sanctuary,
  holy_word,
  // Divine (late-game)
  divine_wrath,
  restoration,
  // Nature (early/mid)
  entangle,
  natures_balm,
  thorn_strike,
  resist_elements,
  lightning_storm,
  root_shot,
  summon_wolf,
  hunters_mark,
  camouflage,
  summon_bear,
  // Nature (late-game)
  ice_storm,
  volcanic_eruption,
  summon_pack,
  // Shadow (early/mid)
  drain_life,
  shadow_step,
  shadow_sight,
  shadow_bolt,
  weaken,
  dark_pact,
  soul_rend,
  summon_skeleton,
  // Shadow (rogue)
  envenom,
  cloak_of_shadows,
  shadow_dance,
  // Shadow (late-game)
  mass_drain,
  storm_of_darkness,
}

/** All spells as an array */
export const ALL_SPELLS: SpellTemplate[] = Object.values(SPELLS)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a spell by ID
 */
export function getSpellById(id: string): SpellTemplate | undefined {
  return SPELLS[id]
}

/**
 * Get all spells in a school
 */
export function getSpellsBySchool(school: SpellSchool): SpellTemplate[] {
  return ALL_SPELLS.filter((spell) => spell.school === school)
}

/**
 * Get all spells of a given level or lower
 */
export function getSpellsByMaxLevel(maxLevel: number): SpellTemplate[] {
  return ALL_SPELLS.filter((spell) => spell.level <= maxLevel)
}

/**
 * Get the primary stat for a spell school
 */
export function getSchoolStat(school: SpellSchool): 'int' | 'wis' {
  switch (school) {
    case 'arcane':
    case 'shadow':
      return 'int'
    case 'divine':
    case 'nature':
      return 'wis'
  }
}
