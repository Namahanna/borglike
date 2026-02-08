/**
 * Item data extracted from Angband 4.2.6 gamedata/object.txt
 * Simplified and organized for Angband-lite roguelike
 */

/** Status effects that can be cured by potions (matches debuff StatusEffectTypes) */
export type CurableStatus =
  | 'blind'
  | 'confused'
  | 'paralyzed'
  | 'slowed'
  | 'terrified'
  | 'drained'
  | 'poisoned'

/** Buff types that potions can grant */
export type PotionBuffType = 'speed' | 'heroism' | 'berserk'

/** Resistance types that potions can grant temporarily */
export type PotionResistType = 'FIRE' | 'COLD' | 'POISON'

export interface ItemTemplate {
  name: string
  type:
    | 'weapon'
    | 'staff'
    | 'bow'
    | 'armor'
    | 'shield'
    | 'helm'
    | 'gloves'
    | 'boots'
    | 'ring'
    | 'amulet'
    | 'light'
    | 'potion'
    | 'scroll'
    | 'gold'
  slot?:
    | 'weapon'
    | 'bow'
    | 'body'
    | 'shield'
    | 'helm'
    | 'gloves'
    | 'boots'
    | 'ring'
    | 'amulet'
    | 'light'
  /** Ranged weapon range (tiles) - only for bows */
  range?: number
  /** Launcher multiplier for bows (damage × multiplier) */
  multiplier?: number
  /** Hit bonus for ranged weapons */
  hitBonus?: number
  tier: number // 1-4 based on power level and alloc-depth
  damage?: string // dice notation e.g. "2d5"
  protection?: number // AC value
  weight: number // in 0.1 lbs
  effect?: string // special effect description (display only for potions)
  minDepth?: number // minimum depth to find
  /** Light radius in tiles (only for light sources) */
  lightRadius?: number
  /** Spell power bonus percentage (staves) - adds to spell damage and healing */
  spellPower?: number
  /** True for edged weapons (swords, axes, daggers) - priests cannot use */
  isEdged?: boolean

  /** Stat bonuses like artifacts (STR, DEX, SPEED, toHit, toDam, etc.) */
  bonuses?: Record<string, number>
  /** Special abilities like artifacts ('Resist Fire', 'Free Action', etc.) */
  abilities?: string[]

  // ========== Potion-specific fields ==========
  /** Base HP healed (potions) */
  healBase?: number
  /** Additional HP healed per character level (potions) */
  healPerLevel?: number
  /** Status effects this potion cures */
  cures?: CurableStatus[]
  /** True if potion cures all debuffs */
  curesAll?: boolean
  /** Buff granted by this potion */
  buff?: {
    type: PotionBuffType
    value: number
    durationMin: number
    durationMax: number
  }
  /** Temporary resistance granted */
  grantsResistance?: PotionResistType
  /** Restores all mana */
  restoresMana?: boolean
}

// ============================================================================
// WEAPONS - Swords, Axes, Maces
// ============================================================================

export const WEAPONS: ItemTemplate[] = [
  // Tier 1 - Early Game (depth 0-10)
  {
    name: 'Dagger',
    type: 'weapon',
    slot: 'weapon',
    tier: 1,
    damage: '1d4',
    weight: 12,
    minDepth: 0,
    isEdged: true,
  },
  {
    name: 'Whip',
    type: 'weapon',
    slot: 'weapon',
    tier: 1,
    damage: '1d4',
    weight: 30,
    minDepth: 0,
  },
  {
    name: 'Short Sword',
    type: 'weapon',
    slot: 'weapon',
    tier: 1,
    damage: '1d7',
    weight: 80,
    minDepth: 5,
    isEdged: true,
  },
  {
    name: 'Mace',
    type: 'weapon',
    slot: 'weapon',
    tier: 1,
    damage: '2d4',
    weight: 120,
    minDepth: 5,
  },
  {
    name: 'Blessed Mace',
    type: 'weapon',
    slot: 'weapon',
    tier: 1,
    damage: '2d5',
    weight: 100,
    minDepth: 0,
  },
  {
    name: 'Spear',
    type: 'weapon',
    slot: 'weapon',
    tier: 1,
    damage: '1d6',
    weight: 50,
    minDepth: 5,
  },

  // Tier 2 - Mid Game (depth 10-25)
  {
    name: 'Long Sword',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '2d5',
    weight: 130,
    minDepth: 10,
    isEdged: true,
  },
  {
    name: 'Broad Axe',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '2d6',
    weight: 160,
    minDepth: 15,
    isEdged: true,
  },
  {
    name: 'Morning Star',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '2d6',
    weight: 150,
    minDepth: 10,
  },
  {
    name: 'Flail',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '2d6',
    weight: 150,
    minDepth: 10,
  },
  {
    name: 'Quarterstaff',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '2d5',
    weight: 150,
    minDepth: 10,
  },
  {
    name: 'War Hammer',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '3d3',
    weight: 120,
    minDepth: 5,
  },
  {
    name: 'Lead-Filled Mace',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '3d4',
    weight: 180,
    minDepth: 15,
  },
  {
    name: 'Bastard Sword',
    type: 'weapon',
    slot: 'weapon',
    tier: 2,
    damage: '3d4',
    weight: 140,
    minDepth: 15,
    isEdged: true,
  },

  // Tier 3 - Deep Game (depth 25-40)
  {
    name: 'Katana',
    type: 'weapon',
    slot: 'weapon',
    tier: 3,
    damage: '3d5',
    weight: 120,
    minDepth: 20,
    isEdged: true,
  },
  {
    name: 'Maul',
    type: 'weapon',
    slot: 'weapon',
    tier: 3,
    damage: '4d4',
    weight: 200,
    minDepth: 20,
  },
  {
    name: 'Battle Axe',
    type: 'weapon',
    slot: 'weapon',
    tier: 3,
    damage: '2d8',
    weight: 170,
    minDepth: 15,
    isEdged: true,
  },
  {
    name: 'Great Hammer',
    type: 'weapon',
    slot: 'weapon',
    tier: 3,
    damage: '3d5',
    weight: 180,
    minDepth: 30,
  },
  {
    name: 'Two-Handed Great Flail',
    type: 'weapon',
    slot: 'weapon',
    tier: 3,
    damage: '3d6',
    weight: 280,
    minDepth: 35,
  },
  {
    name: 'Halberd',
    type: 'weapon',
    slot: 'weapon',
    tier: 3,
    damage: '3d5',
    weight: 190,
    minDepth: 25,
    isEdged: true,
  },

  // Tier 4 - Endgame (depth 40+)
  {
    name: "Executioner's Sword",
    type: 'weapon',
    slot: 'weapon',
    tier: 4,
    damage: '4d5',
    weight: 260,
    minDepth: 40,
    isEdged: true,
  },
  {
    name: 'Great Axe',
    type: 'weapon',
    slot: 'weapon',
    tier: 4,
    damage: '4d4',
    weight: 230,
    minDepth: 40,
    isEdged: true,
  },
  {
    name: 'Mace of Disruption',
    type: 'weapon',
    slot: 'weapon',
    tier: 4,
    damage: '5d8',
    weight: 400,
    effect: 'Slay Undead x3',
    minDepth: 45,
  },
]

// ============================================================================
// STAVES - Caster Weapons
// ============================================================================

export const STAVES: ItemTemplate[] = [
  // Tier 1 - Early Game (depth 0-10)
  {
    name: 'Wooden Staff',
    type: 'staff',
    slot: 'weapon',
    tier: 1,
    damage: '1d2',
    weight: 40,
    minDepth: 0,
    spellPower: 10,
  },

  // Tier 2 - Mid Game (depth 10-25)
  {
    name: 'Crystal Staff',
    type: 'staff',
    slot: 'weapon',
    tier: 2,
    damage: '1d3',
    weight: 35,
    minDepth: 10,
    spellPower: 15,
  },
  {
    name: 'Runed Staff',
    type: 'staff',
    slot: 'weapon',
    tier: 2,
    damage: '1d3',
    weight: 35,
    minDepth: 15,
    spellPower: 18,
  },

  // Tier 3 - Deep Game (depth 25-40)
  {
    name: 'Enchanted Staff',
    type: 'staff',
    slot: 'weapon',
    tier: 3,
    damage: '1d4',
    weight: 30,
    minDepth: 25,
    spellPower: 20,
  },
  {
    name: 'Staff of Wizardry',
    type: 'staff',
    slot: 'weapon',
    tier: 3,
    damage: '1d4',
    weight: 30,
    minDepth: 30,
    spellPower: 22,
  },

  // Tier 4 - Endgame (depth 40+)
  {
    name: 'Staff of Power',
    type: 'staff',
    slot: 'weapon',
    tier: 4,
    damage: '1d4',
    weight: 30,
    minDepth: 40,
    spellPower: 25,
    effect: '+25% spell power',
  },
]

// ============================================================================
// BOWS - Ranged Weapons
// ============================================================================

export const BOWS: ItemTemplate[] = [
  // Tier 1 - Early Game (depth 0-10)
  {
    name: 'Short Bow',
    type: 'bow',
    slot: 'bow',
    tier: 1,
    damage: '1d6',
    multiplier: 2,
    weight: 30,
    range: 8,
    minDepth: 0,
  },

  // Tier 2 - Mid Game (depth 10-25)
  {
    name: 'Long Bow',
    type: 'bow',
    slot: 'bow',
    tier: 2,
    damage: '2d4',
    multiplier: 2,
    weight: 40,
    range: 8,
    minDepth: 10,
  },
  {
    name: 'Composite Bow',
    type: 'bow',
    slot: 'bow',
    tier: 2,
    damage: '2d5',
    multiplier: 3,
    weight: 45,
    range: 8,
    minDepth: 15,
  },

  // Tier 3 - Deep Game (depth 25-40)
  {
    name: 'Elven Bow',
    type: 'bow',
    slot: 'bow',
    tier: 3,
    damage: '2d6',
    multiplier: 3,
    weight: 35,
    range: 8,
    hitBonus: 2,
    minDepth: 25,
  },
  {
    name: 'War Bow',
    type: 'bow',
    slot: 'bow',
    tier: 3,
    damage: '2d7',
    multiplier: 3,
    weight: 50,
    range: 8,
    minDepth: 35,
  },

  // Tier 4 - Endgame (depth 40+)
  {
    name: 'Bow of Precision',
    type: 'bow',
    slot: 'bow',
    tier: 4,
    damage: '3d5',
    multiplier: 3,
    weight: 40,
    range: 8,
    hitBonus: 5,
    minDepth: 45,
  },
  {
    name: 'Bow of the Serpent',
    type: 'bow',
    slot: 'bow',
    tier: 4,
    damage: '2d6',
    multiplier: 3,
    weight: 35,
    range: 8,
    hitBonus: 3,
    effect: 'Poison',
    minDepth: 50,
  },
]

// ============================================================================
// ARMOR - Body Armor
// ============================================================================

export const ARMOR: ItemTemplate[] = [
  // Tier 1 - Early Game
  {
    name: 'Robe',
    type: 'armor',
    slot: 'body',
    tier: 1,
    protection: 2,
    weight: 20,
    minDepth: 1,
  },
  {
    name: 'Soft Leather Armour',
    type: 'armor',
    slot: 'body',
    tier: 1,
    protection: 8,
    weight: 80,
    minDepth: 3,
  },
  {
    name: 'Studded Leather Armour',
    type: 'armor',
    slot: 'body',
    tier: 1,
    protection: 12,
    weight: 100,
    minDepth: 5,
  },

  // Tier 2 - Mid Game
  {
    name: 'Hard Leather Armour',
    type: 'armor',
    slot: 'body',
    tier: 2,
    protection: 16,
    weight: 120,
    minDepth: 10,
  },
  {
    name: 'Leather Scale Mail',
    type: 'armor',
    slot: 'body',
    tier: 2,
    protection: 20,
    weight: 140,
    minDepth: 15,
  },
  {
    name: 'Chain Mail',
    type: 'armor',
    slot: 'body',
    tier: 2,
    protection: 32,
    weight: 220,
    minDepth: 20,
  },

  // Tier 3 - Deep Game
  {
    name: 'Metal Scale Mail',
    type: 'armor',
    slot: 'body',
    tier: 3,
    protection: 38,
    weight: 250,
    minDepth: 25,
  },
  {
    name: 'Augmented Chain Mail',
    type: 'armor',
    slot: 'body',
    tier: 3,
    protection: 42,
    weight: 270,
    minDepth: 35,
  },
  {
    name: 'Metal Brigandine Armour',
    type: 'armor',
    slot: 'body',
    tier: 3,
    protection: 48,
    weight: 290,
    minDepth: 45,
  },
]

// ============================================================================
// SHIELDS
// ============================================================================

export const SHIELDS: ItemTemplate[] = [
  {
    name: 'Wicker Shield',
    type: 'shield',
    slot: 'shield',
    tier: 1,
    protection: 2,
    weight: 30,
    minDepth: 1,
  },
  {
    name: 'Small Metal Shield',
    type: 'shield',
    slot: 'shield',
    tier: 2,
    protection: 5,
    weight: 60,
    minDepth: 15,
  },
  {
    name: 'Leather Shield',
    type: 'shield',
    slot: 'shield',
    tier: 2,
    protection: 8,
    weight: 90,
    minDepth: 10,
  },
  {
    name: 'Large Metal Shield',
    type: 'shield',
    slot: 'shield',
    tier: 3,
    protection: 12,
    weight: 120,
    minDepth: 30,
  },
  {
    name: "Knight's Shield",
    type: 'shield',
    slot: 'shield',
    tier: 3,
    protection: 15,
    weight: 160,
    minDepth: 50,
  },
]

// ============================================================================
// HELMS
// ============================================================================

export const HELMS: ItemTemplate[] = [
  {
    name: 'Hard Leather Cap',
    type: 'helm',
    slot: 'helm',
    tier: 1,
    protection: 2,
    weight: 20,
    minDepth: 3,
  },
  {
    name: 'Metal Cap',
    type: 'helm',
    slot: 'helm',
    tier: 2,
    protection: 3,
    weight: 25,
    minDepth: 10,
  },
  {
    name: 'Iron Helm',
    type: 'helm',
    slot: 'helm',
    tier: 2,
    protection: 7,
    weight: 50,
    minDepth: 20,
  },
  {
    name: 'Steel Helm',
    type: 'helm',
    slot: 'helm',
    tier: 3,
    protection: 9,
    weight: 60,
    minDepth: 40,
  },
  {
    name: 'Iron Crown',
    type: 'helm',
    slot: 'helm',
    tier: 3,
    protection: 0,
    weight: 20,
    minDepth: 45,
  },
  {
    name: 'Jewel Encrusted Crown',
    type: 'helm',
    slot: 'helm',
    tier: 4,
    protection: 0,
    weight: 40,
    effect: 'Ignore Acid',
    minDepth: 50,
  },
]

// ============================================================================
// GLOVES
// ============================================================================

export const GLOVES: ItemTemplate[] = [
  {
    name: 'Leather Gloves',
    type: 'gloves',
    slot: 'gloves',
    tier: 1,
    protection: 1,
    weight: 10,
    minDepth: 1,
  },
  {
    name: 'Gauntlets',
    type: 'gloves',
    slot: 'gloves',
    tier: 2,
    protection: 3,
    weight: 25,
    minDepth: 10,
  },
  {
    name: 'Caestus',
    type: 'gloves',
    slot: 'gloves',
    tier: 2,
    protection: 5,
    weight: 40,
    damage: '1d1',
    effect: '+3 to damage',
    minDepth: 20,
  },
  {
    name: 'Mithril Gauntlets',
    type: 'gloves',
    slot: 'gloves',
    tier: 3,
    protection: 6,
    weight: 15,
    effect: 'Ignore Acid, Fire',
    minDepth: 40,
  },
  {
    name: "Alchemist's Gloves",
    type: 'gloves',
    slot: 'gloves',
    tier: 4,
    protection: 0,
    weight: 5,
    effect: 'Ignore Elements',
    minDepth: 50,
  },
]

// ============================================================================
// BOOTS
// ============================================================================

export const BOOTS: ItemTemplate[] = [
  {
    name: 'Leather Sandals',
    type: 'boots',
    slot: 'boots',
    tier: 1,
    protection: 1,
    weight: 15,
    minDepth: 1,
  },
  {
    name: 'Leather Boots',
    type: 'boots',
    slot: 'boots',
    tier: 1,
    protection: 2,
    weight: 20,
    minDepth: 3,
  },
  {
    name: 'Iron Shod Boots',
    type: 'boots',
    slot: 'boots',
    tier: 2,
    protection: 4,
    weight: 35,
    effect: 'Ignore Fire',
    minDepth: 5,
  },
  {
    name: 'Steel Shod Boots',
    type: 'boots',
    slot: 'boots',
    tier: 3,
    protection: 7,
    weight: 60,
    effect: 'Ignore Fire',
    minDepth: 20,
  },
  {
    name: 'Ethereal Slippers',
    type: 'boots',
    slot: 'boots',
    tier: 4,
    protection: 0,
    weight: 0,
    effect: 'Ignore All Elements',
    minDepth: 30,
  },
]

// ============================================================================
// RINGS
// ============================================================================

export const RINGS: ItemTemplate[] = [
  // Stat Rings
  {
    name: 'Ring of Strength',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    effect: '+3 STR, Sustain STR',
    minDepth: 30,
    bonuses: { STR: 3 },
    abilities: ['Sustain STR'],
  },
  {
    name: 'Ring of Dexterity',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    effect: '+3 DEX, Sustain DEX',
    minDepth: 30,
    bonuses: { DEX: 3 },
    abilities: ['Sustain DEX'],
  },
  {
    name: 'Ring of Constitution',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    effect: '+3 CON, Sustain CON',
    minDepth: 30,
    bonuses: { CON: 3 },
    abilities: ['Sustain CON'],
  },

  // Utility Rings
  {
    name: 'Ring of Protection',
    type: 'ring',
    slot: 'ring',
    tier: 1,
    weight: 2,
    protection: 10,
    effect: '+10 AC',
    minDepth: 10,
  },
  {
    name: 'Ring of Free Action',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    effect: 'Free Action',
    minDepth: 20,
    abilities: ['Free Action'],
  },
  {
    name: 'Ring of Light',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    lightRadius: 1,
    effect: '+1 Light Radius',
    minDepth: 15,
  },
  {
    name: 'Ring of Resist Fire and Cold',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    effect: 'Resist Fire, Resist Cold',
    minDepth: 10,
    abilities: ['Resist Fire', 'Resist Cold'],
  },
  {
    name: 'Ring of Resist Poison',
    type: 'ring',
    slot: 'ring',
    tier: 3,
    weight: 2,
    effect: 'Resist Poison',
    minDepth: 40,
    abilities: ['Resist Poison'],
  },

  // Combat Rings
  {
    name: 'Ring of Damage',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    effect: '+10 to damage',
    minDepth: 20,
    bonuses: { toDam: 10 },
  },
  {
    name: 'Ring of Accuracy',
    type: 'ring',
    slot: 'ring',
    tier: 2,
    weight: 2,
    effect: '+15 to hit',
    minDepth: 20,
    bonuses: { toHit: 15 },
  },
  {
    name: 'Ring of Slaying',
    type: 'ring',
    slot: 'ring',
    tier: 3,
    weight: 2,
    effect: '+5 to hit, +3 to damage',
    minDepth: 40,
    bonuses: { toHit: 5, toDam: 3 },
  },

  // Top Tier
]

// ============================================================================
// AMULETS
// ============================================================================

export const AMULETS: ItemTemplate[] = [
  {
    name: 'Amulet of Wisdom',
    type: 'amulet',
    slot: 'amulet',
    tier: 2,
    weight: 3,
    effect: '+3 WIS, Sustain WIS',
    minDepth: 20,
    bonuses: { WIS: 3 },
    abilities: ['Sustain WIS'],
  },
  {
    name: 'Amulet of Resist Lightning',
    type: 'amulet',
    slot: 'amulet',
    tier: 1,
    weight: 3,
    effect: 'Resist Lightning',
    minDepth: 10,
    abilities: ['Resist Lightning'],
  },
  {
    name: 'Amulet of Resist Acid',
    type: 'amulet',
    slot: 'amulet',
    tier: 1,
    weight: 3,
    effect: 'Resist Acid',
    minDepth: 10,
    abilities: ['Resist Acid'],
  },
  {
    name: 'Amulet of Regeneration',
    type: 'amulet',
    slot: 'amulet',
    tier: 2,
    weight: 3,
    effect: 'Regeneration',
    minDepth: 30,
    abilities: ['Regeneration'],
  },
  {
    name: 'Amulet of Infravision',
    type: 'amulet',
    slot: 'amulet',
    tier: 1,
    weight: 3,
    effect: '+3 Infravision',
    minDepth: 10,
    bonuses: { INFRAVISION: 3 },
  },
]

// ============================================================================
// LIGHT SOURCES
// ============================================================================

export const LIGHTS: ItemTemplate[] = [
  {
    name: 'Wooden Torch',
    type: 'light',
    slot: 'light',
    tier: 1,
    weight: 22,
    effect: 'Light radius 2',
    minDepth: 1,
    lightRadius: 2,
  },
  {
    name: 'Lantern',
    type: 'light',
    slot: 'light',
    tier: 2,
    weight: 50,
    effect: 'Light radius 3',
    minDepth: 5,
    lightRadius: 3,
  },
]

// ============================================================================
// POTIONS - Healing, Mana, Buffs
// ============================================================================

export const POTIONS: ItemTemplate[] = [
  // Healing Potions (4 tiers) - heal amount = healBase + healPerLevel * level
  {
    name: 'Potion of Cure Light Wounds',
    type: 'potion',
    tier: 1,
    weight: 4,
    healBase: 10,
    healPerLevel: 1, // L50: 60 HP
    cures: ['blind'],
    effect: 'Heal 10+L HP, cure blind',
    minDepth: 1,
  },
  {
    name: 'Potion of Cure Serious Wounds',
    type: 'potion',
    tier: 2,
    weight: 4,
    healBase: 25,
    healPerLevel: 2, // L50: 125 HP
    cures: ['blind', 'confused'],
    effect: 'Heal 25+2L HP, cure blind/confusion',
    minDepth: 5,
  },
  {
    name: 'Potion of Cure Critical Wounds',
    type: 'potion',
    tier: 3,
    weight: 4,
    healBase: 60,
    healPerLevel: 4, // L50: 260 HP
    curesAll: true,
    effect: 'Heal 60+4L HP, cure all',
    minDepth: 12,
  },
  {
    name: 'Potion of Healing',
    type: 'potion',
    tier: 4,
    weight: 4,
    healBase: 100,
    healPerLevel: 5, // L50: 350 HP
    curesAll: true,
    effect: 'Heal 100+5L HP, cure all',
    minDepth: 30,
  },

  // Mana Potions
  {
    name: 'Potion of Restore Mana',
    type: 'potion',
    tier: 3,
    weight: 4,
    restoresMana: true,
    effect: 'Restore all mana',
    minDepth: 15,
  },

  // Buff Potions
  {
    name: 'Potion of Speed',
    type: 'potion',
    tier: 2,
    weight: 4,
    buff: { type: 'speed', value: 10, durationMin: 20, durationMax: 39 },
    effect: 'Haste (+10 speed) for 20-40 turns',
    minDepth: 1,
  },
  {
    name: 'Potion of Heroism',
    type: 'potion',
    tier: 2,
    weight: 4,
    healBase: 10,
    cures: ['terrified'],
    buff: { type: 'heroism', value: 12, durationMin: 25, durationMax: 49 },
    effect: 'Heal 10 HP, cure fear, +12 to hit for 25-50 turns',
    minDepth: 1,
  },
  {
    name: 'Potion of Berserk Strength',
    type: 'potion',
    tier: 2,
    weight: 4,
    healBase: 30,
    cures: ['terrified'],
    buff: { type: 'berserk', value: 24, durationMin: 25, durationMax: 49 },
    effect: 'Heal 30 HP, cure fear, berserk for 25-50 turns',
    minDepth: 3,
  },

  // Resistance Potions
  {
    name: 'Potion of Resist Heat',
    type: 'potion',
    tier: 2,
    weight: 4,
    grantsResistance: 'FIRE',
    effect: 'Temporary fire resistance',
    minDepth: 30,
  },
  {
    name: 'Potion of Resist Cold',
    type: 'potion',
    tier: 2,
    weight: 4,
    grantsResistance: 'COLD',
    effect: 'Temporary cold resistance',
    minDepth: 30,
  },
  {
    name: 'Potion of Resist Poison',
    type: 'potion',
    tier: 2,
    weight: 4,
    cures: ['poisoned'],
    grantsResistance: 'POISON',
    effect: 'Temporary poison resistance, cure poison',
    minDepth: 20,
  },

  // Utility
  {
    name: 'Potion of Neutralize Poison',
    type: 'potion',
    tier: 1,
    weight: 4,
    cures: ['poisoned'],
    effect: 'Cure poison',
    minDepth: 1,
  },
  // Status cure potions
  {
    name: 'Potion of Free Action',
    type: 'potion',
    tier: 2,
    weight: 4,
    cures: ['paralyzed', 'slowed'],
    effect: 'Cure paralysis and slow',
    minDepth: 8,
  },
  {
    name: 'Potion of Clarity',
    type: 'potion',
    tier: 2,
    weight: 4,
    cures: ['confused', 'blind'],
    effect: 'Cure confusion and blind',
    minDepth: 10,
  },
  {
    name: 'Potion of Restoration',
    type: 'potion',
    tier: 3,
    weight: 4,
    cures: ['drained'],
    effect: 'Cure drain, restore stats',
    minDepth: 20,
  },
  {
    name: 'Potion of Purity',
    type: 'potion',
    tier: 2,
    weight: 4,
    curesAll: true,
    effect: 'Cures all ailments',
    minDepth: 15,
  },
]

// ============================================================================
// SCROLLS - Teleport, Identify, Mapping, etc.
// ============================================================================

export const SCROLLS: ItemTemplate[] = [
  // Detection
  {
    name: 'Scroll of Detect Stairs',
    type: 'scroll',
    tier: 1,
    weight: 5,
    effect: 'Reveals stairs location on current level',
    minDepth: 0,
  },

  // Teleportation
  {
    name: 'Scroll of Phase Door',
    type: 'scroll',
    tier: 1,
    weight: 5,
    effect: 'Teleport up to 10 squares',
    minDepth: 1,
  },
  {
    name: 'Scroll of Teleportation',
    type: 'scroll',
    tier: 2,
    weight: 5,
    effect: 'Teleport to random location on level',
    minDepth: 10,
  },
  {
    name: 'Scroll of Teleport Level',
    type: 'scroll',
    tier: 3,
    weight: 5,
    effect: 'Teleport to adjacent dungeon level',
    minDepth: 20,
  },

  // Detection & Mapping
  {
    name: 'Scroll of Magic Mapping',
    type: 'scroll',
    tier: 2,
    weight: 5,
    effect: 'Magic Mapping - reveal level',
    minDepth: 5,
  },

  // Enchantment
  {
    name: 'Scroll of Enchant Weapon',
    type: 'scroll',
    tier: 2,
    weight: 5,
    effect: '+1 to weapon to-hit or to-dam',
    minDepth: 15,
  },
  {
    name: 'Scroll of Enchant Armour',
    type: 'scroll',
    tier: 2,
    weight: 5,
    effect: '+1 to armor AC',
    minDepth: 15,
  },
  // Town Portal
  {
    name: 'Scroll of Town Portal',
    type: 'scroll',
    tier: 2,
    weight: 5,
    effect: 'Opens portal to town for 1000 turns',
    minDepth: 1,
  },

  // Combat
  {
    name: 'Scroll of Blessing',
    type: 'scroll',
    tier: 1,
    weight: 5,
    effect: '+5 to hit, +5 AC for 6-18 turns',
    minDepth: 1,
  },
  {
    name: 'Scroll of Protection from Evil',
    type: 'scroll',
    tier: 2,
    weight: 5,
    effect: 'Protection from evil monsters',
    minDepth: 30,
  },
]

// ============================================================================
// COMBINED EXPORTS
// ============================================================================

export const ALL_EQUIPMENT: ItemTemplate[] = [
  ...WEAPONS,
  ...STAVES,
  ...BOWS,
  ...ARMOR,
  ...SHIELDS,
  ...HELMS,
  ...GLOVES,
  ...BOOTS,
  ...RINGS,
  ...AMULETS,
  ...LIGHTS,
]

export const ALL_CONSUMABLES: ItemTemplate[] = [...POTIONS, ...SCROLLS]

export const ALL_ITEMS: ItemTemplate[] = [...ALL_EQUIPMENT, ...ALL_CONSUMABLES]

/**
 * Get items by tier
 */
export function getItemsByTier(tier: number): ItemTemplate[] {
  return ALL_ITEMS.filter((item) => item.tier === tier)
}

/**
 * Get items by type
 */
export function getItemsByType(type: ItemTemplate['type']): ItemTemplate[] {
  return ALL_ITEMS.filter((item) => item.type === type)
}

/**
 * Get items appropriate for a given depth
 * Returns items whose minDepth is <= the given depth
 */
export function getItemsForDepth(depth: number): ItemTemplate[] {
  return ALL_ITEMS.filter((item) => (item.minDepth ?? 0) <= depth)
}
