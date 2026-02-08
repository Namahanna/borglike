/**
 * Booster Definitions for Borglike
 *
 * Boosters are per-run bonuses that players unlock permanently with essence
 * and choose as a loadout (up to 2) before starting a run.
 *
 * Categories:
 * - equipment: Starting weapon/armor enchantment bonuses
 * - stats: Base stat bonuses (STR, DEX, CON, INT, WIS)
 * - special: Unique effects (gold/XP multipliers, special abilities)
 */

// ============================================================================
// TYPES
// ============================================================================

export type BoosterCategory = 'equipment' | 'stats' | 'special'

export type BoosterEffect =
  | { type: 'stat_bonus'; stat: 'str' | 'dex' | 'con' | 'int' | 'wis'; value: number }
  | { type: 'equipment_bonus'; slot: 'weapon' | 'armor' | 'both'; value: number }
  | { type: 'multiplier'; stat: 'xp' | 'gold' | 'essence'; percent: number }
  | { type: 'special'; effect: string; value?: number }

export interface BoosterDefinition {
  id: string
  name: string
  description: string
  category: BoosterCategory
  icon: string
  unlockCost: number
  requires?: string | string[] // Prerequisite booster ID(s) - all must be unlocked
  effect: BoosterEffect
}

// ============================================================================
// EQUIPMENT BOOSTERS
// ============================================================================

const weaponPlus1: BoosterDefinition = {
  id: 'weapon_plus_1',
  name: 'Sharpened Blade',
  description: 'Starting weapon +1 enchantment',
  category: 'equipment',
  icon: '/',
  unlockCost: 500,
  effect: { type: 'equipment_bonus', slot: 'weapon', value: 1 },
}

const weaponPlus2: BoosterDefinition = {
  id: 'weapon_plus_2',
  name: 'Keen Edge',
  description: 'Starting weapon +2 enchantment',
  category: 'equipment',
  icon: '⚔',
  unlockCost: 3000,
  requires: 'weapon_plus_1',
  effect: { type: 'equipment_bonus', slot: 'weapon', value: 2 },
}

const armorPlus1: BoosterDefinition = {
  id: 'armor_plus_1',
  name: 'Reinforced Armor',
  description: 'Starting armor +1 enchantment',
  category: 'equipment',
  icon: '[',
  unlockCost: 500,
  effect: { type: 'equipment_bonus', slot: 'armor', value: 1 },
}

const armorPlus2: BoosterDefinition = {
  id: 'armor_plus_2',
  name: 'Fortified Armor',
  description: 'Starting armor +2 enchantment',
  category: 'equipment',
  icon: '◆',
  unlockCost: 3000,
  requires: 'armor_plus_1',
  effect: { type: 'equipment_bonus', slot: 'armor', value: 2 },
}

const gearPlus1: BoosterDefinition = {
  id: 'gear_plus_1',
  name: 'Honed Gear',
  description: 'Starting weapon & armor +1 enchantment',
  category: 'equipment',
  icon: '*',
  unlockCost: 1000,
  requires: ['weapon_plus_1', 'armor_plus_1'],
  effect: { type: 'equipment_bonus', slot: 'both', value: 1 },
}

const gearPlus2: BoosterDefinition = {
  id: 'gear_plus_2',
  name: 'Masterwork Gear',
  description: 'Starting weapon & armor +2 enchantment',
  category: 'equipment',
  icon: '★',
  unlockCost: 6000,
  requires: ['weapon_plus_2', 'armor_plus_2'],
  effect: { type: 'equipment_bonus', slot: 'both', value: 2 },
}

// ============================================================================
// STAT BOOSTERS
// ============================================================================

// STR boosters
const strMinor: BoosterDefinition = {
  id: 'str_minor',
  name: 'Minor Strength',
  description: '+1 STR',
  category: 'stats',
  icon: '♠',
  unlockCost: 200,
  effect: { type: 'stat_bonus', stat: 'str', value: 1 },
}

const strGreater: BoosterDefinition = {
  id: 'str_greater',
  name: 'Greater Strength',
  description: '+2 STR',
  category: 'stats',
  icon: '♠',
  unlockCost: 1200,
  requires: 'str_minor',
  effect: { type: 'stat_bonus', stat: 'str', value: 2 },
}

const strSuperior: BoosterDefinition = {
  id: 'str_superior',
  name: 'Superior Strength',
  description: '+3 STR',
  category: 'stats',
  icon: '♠',
  unlockCost: 6000,
  requires: 'str_greater',
  effect: { type: 'stat_bonus', stat: 'str', value: 3 },
}

// DEX boosters
const dexMinor: BoosterDefinition = {
  id: 'dex_minor',
  name: 'Minor Dexterity',
  description: '+1 DEX',
  category: 'stats',
  icon: '»',
  unlockCost: 200,
  effect: { type: 'stat_bonus', stat: 'dex', value: 1 },
}

const dexGreater: BoosterDefinition = {
  id: 'dex_greater',
  name: 'Greater Dexterity',
  description: '+2 DEX',
  category: 'stats',
  icon: '»',
  unlockCost: 1200,
  requires: 'dex_minor',
  effect: { type: 'stat_bonus', stat: 'dex', value: 2 },
}

const dexSuperior: BoosterDefinition = {
  id: 'dex_superior',
  name: 'Superior Dexterity',
  description: '+3 DEX',
  category: 'stats',
  icon: '»',
  unlockCost: 6000,
  requires: 'dex_greater',
  effect: { type: 'stat_bonus', stat: 'dex', value: 3 },
}

// CON boosters
const conMinor: BoosterDefinition = {
  id: 'con_minor',
  name: 'Minor Constitution',
  description: '+1 CON',
  category: 'stats',
  icon: '♥',
  unlockCost: 200,
  effect: { type: 'stat_bonus', stat: 'con', value: 1 },
}

const conGreater: BoosterDefinition = {
  id: 'con_greater',
  name: 'Greater Constitution',
  description: '+2 CON',
  category: 'stats',
  icon: '♥',
  unlockCost: 1200,
  requires: 'con_minor',
  effect: { type: 'stat_bonus', stat: 'con', value: 2 },
}

const conSuperior: BoosterDefinition = {
  id: 'con_superior',
  name: 'Superior Constitution',
  description: '+3 CON',
  category: 'stats',
  icon: '♥',
  unlockCost: 6000,
  requires: 'con_greater',
  effect: { type: 'stat_bonus', stat: 'con', value: 3 },
}

// INT boosters
const intMinor: BoosterDefinition = {
  id: 'int_minor',
  name: 'Minor Intelligence',
  description: '+1 INT',
  category: 'stats',
  icon: '◎',
  unlockCost: 200,
  effect: { type: 'stat_bonus', stat: 'int', value: 1 },
}

const intGreater: BoosterDefinition = {
  id: 'int_greater',
  name: 'Greater Intelligence',
  description: '+2 INT',
  category: 'stats',
  icon: '◎',
  unlockCost: 1200,
  requires: 'int_minor',
  effect: { type: 'stat_bonus', stat: 'int', value: 2 },
}

const intSuperior: BoosterDefinition = {
  id: 'int_superior',
  name: 'Superior Intelligence',
  description: '+3 INT',
  category: 'stats',
  icon: '◎',
  unlockCost: 6000,
  requires: 'int_greater',
  effect: { type: 'stat_bonus', stat: 'int', value: 3 },
}

// WIS boosters
const wisMinor: BoosterDefinition = {
  id: 'wis_minor',
  name: 'Minor Wisdom',
  description: '+1 WIS',
  category: 'stats',
  icon: '☆',
  unlockCost: 200,
  effect: { type: 'stat_bonus', stat: 'wis', value: 1 },
}

const wisGreater: BoosterDefinition = {
  id: 'wis_greater',
  name: 'Greater Wisdom',
  description: '+2 WIS',
  category: 'stats',
  icon: '☆',
  unlockCost: 1200,
  requires: 'wis_minor',
  effect: { type: 'stat_bonus', stat: 'wis', value: 2 },
}

const wisSuperior: BoosterDefinition = {
  id: 'wis_superior',
  name: 'Superior Wisdom',
  description: '+3 WIS',
  category: 'stats',
  icon: '☆',
  unlockCost: 6000,
  requires: 'wis_greater',
  effect: { type: 'stat_bonus', stat: 'wis', value: 3 },
}

// ============================================================================
// SPECIAL BOOSTERS
// ============================================================================

const adrenalineRush: BoosterDefinition = {
  id: 'adrenaline_rush',
  name: 'Adrenaline Rush',
  description: '+10% damage when below 20% HP',
  category: 'special',
  icon: '!',
  unlockCost: 800,
  effect: { type: 'special', effect: 'adrenaline_rush', value: 10 },
}

const treasureHunter: BoosterDefinition = {
  id: 'treasure_hunter',
  name: 'Treasure Hunter',
  description: '+15% gold this run',
  category: 'special',
  icon: '$',
  unlockCost: 1200,
  effect: { type: 'multiplier', stat: 'gold', percent: 15 },
}

const quickStudy: BoosterDefinition = {
  id: 'quick_study',
  name: 'Quick Study',
  description: '+15% XP this run',
  category: 'special',
  icon: '★',
  unlockCost: 1200,
  effect: { type: 'multiplier', stat: 'xp', percent: 15 },
}

const secondWind: BoosterDefinition = {
  id: 'second_wind',
  name: 'Second Wind',
  description: 'Auto-heal 20% once when critical',
  category: 'special',
  icon: '✚',
  unlockCost: 2400,
  effect: { type: 'special', effect: 'second_wind', value: 20 },
}

const essenceMagnet: BoosterDefinition = {
  id: 'essence_magnet',
  name: 'Essence Magnet',
  description: '+15% essence gain this run',
  category: 'special',
  icon: '◇',
  unlockCost: 1000,
  effect: { type: 'multiplier', stat: 'essence', percent: 15 },
}

// ============================================================================
// CHEAT BOOSTERS (only available when cheat mode is enabled)
// ============================================================================

const cheatBooster: BoosterDefinition = {
  id: 'cheat_booster',
  name: 'Cheat: +10 All Stats',
  description: '+10 to STR, DEX, CON, INT, WIS',
  category: 'special',
  icon: '⚡',
  unlockCost: 0,
  effect: { type: 'special', effect: 'cheat_stats', value: 10 },
}

export { cheatBooster }

// ============================================================================
// EXPORTS
// ============================================================================

export const boosters: BoosterDefinition[] = [
  // Equipment
  weaponPlus1,
  weaponPlus2,
  armorPlus1,
  armorPlus2,
  gearPlus1,
  gearPlus2,
  // Stats - STR
  strMinor,
  strGreater,
  strSuperior,
  // Stats - DEX
  dexMinor,
  dexGreater,
  dexSuperior,
  // Stats - CON
  conMinor,
  conGreater,
  conSuperior,
  // Stats - INT
  intMinor,
  intGreater,
  intSuperior,
  // Stats - WIS
  wisMinor,
  wisGreater,
  wisSuperior,
  // Special
  adrenalineRush,
  treasureHunter,
  quickStudy,
  secondWind,
  essenceMagnet,
]

export const boostersByCategory = {
  equipment: boosters.filter((b) => b.category === 'equipment'),
  stats: boosters.filter((b) => b.category === 'stats'),
  special: boosters.filter((b) => b.category === 'special'),
}

/**
 * Get a booster definition by ID
 */
export function getBoosterById(id: string): BoosterDefinition | undefined {
  if (id === cheatBooster.id) return cheatBooster
  return boosters.find((b) => b.id === id)
}

/**
 * Check if a booster's prerequisites are met
 */
export function canUnlockBooster(id: string, unlockedBoosters: Set<string>): boolean {
  const booster = getBoosterById(id)
  if (!booster) return false
  if (unlockedBoosters.has(id)) return false // Already unlocked
  if (!booster.requires) return true

  // Handle both single string and array of prerequisites
  const prereqs = Array.isArray(booster.requires) ? booster.requires : [booster.requires]
  return prereqs.every((prereq) => unlockedBoosters.has(prereq))
}

/**
 * Get all boosters that require a specific booster
 */
export function getBoostersDependingOn(id: string): BoosterDefinition[] {
  return boosters.filter((b) => {
    if (!b.requires) return false
    if (Array.isArray(b.requires)) {
      return b.requires.includes(id)
    }
    return b.requires === id
  })
}
