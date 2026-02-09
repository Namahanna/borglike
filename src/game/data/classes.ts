/**
 * Player Class definitions for Angband-Lite
 *
 * Data extracted from Angband 4.2.6 class.txt and adapted for our simplified system.
 * Stat modifiers use Angband's scale (-3 to +3 typically).
 * See ANGBAND-LITE-DESIGN.md for unlock conditions and bot behavior design.
 */

import type { StatModifiers } from './races'
import type { UnlockContext } from '@/types/progression'

/** Player class definition */
export interface GameClass {
  id: string
  name: string
  /** Stat adjustments (Angband scale: typically -3 to +3) */
  stats: StatModifiers
  /** Hit die bonus per level (Angband: 0-9, Warrior highest) */
  hitdie: number
  /** Maximum melee attacks per round */
  maxAttacks: number
  /** Primary stat for this class (determines ability effectiveness) */
  primaryStat: 'str' | 'int' | 'wis' | 'dex' | 'con'
  /** Class titles from level 1 to 50 (every 5 levels) */
  titles: string[]
  /** Does this class use magic? */
  usesMagic: boolean
  /** Is this class available at game start? */
  starting: boolean
  /** Unlock condition description (if not starting) */
  unlockCondition?: string
  /** Is this a prestige class (late-game unlock)? */
  prestige?: boolean
  /** Predicate to check if unlock condition is met (for prestige classes) */
  checkCondition?: (ctx: UnlockContext) => boolean
  /** Brief flavor text */
  description: string
  /** Bot behavior hint for auto-player AI */
  botBehavior: string
  /** SHIELD_BASH: Can perform shield bash for bonus damage when shield equipped (Warrior/Paladin) */
  canShieldBash?: boolean
  /** COMBAT_REGEN: Percentage of melee damage dealt that heals the character (Blackguard) */
  combatLifesteal?: number
  /** Spell healing potency modifier (1.0 = full, 0.8 = 80%). Hybrid classes heal for less. */
  healPotency?: number
  /** FINESSE: Uses max(STR, DEX) for melee damage and deadliness instead of just STR (Rogue) */
  finesse?: boolean
}

// =============================================================================
// STARTING CLASSES (unlocked from the beginning)
// =============================================================================

const warrior: GameClass = {
  id: 'warrior',
  name: 'Warrior',
  stats: { str: 3, int: -2, wis: -2, dex: 2, con: 2 },
  hitdie: 9, // Highest HP
  maxAttacks: 4,
  primaryStat: 'str',
  titles: [
    'Rookie',
    'Soldier',
    'Swordsman',
    'Swashbuckler',
    'Veteran',
    'Myrmidon',
    'Commando',
    'Champion',
    'Hero',
    'Lord',
  ],
  usesMagic: false,
  starting: true,
  description: 'Masters of combat who rely on strength and endurance over magic.',
  botBehavior: 'Aggressive: charges enemies, uses melee primarily, relies on potions for healing',
  canShieldBash: true,
}

const mage: GameClass = {
  id: 'mage',
  name: 'Mage',
  stats: { str: -3, int: 3, wis: 0, dex: 0, con: -2 },
  hitdie: 1, // Very low HP (was 0, bumped for survivability)
  maxAttacks: 4,
  primaryStat: 'int',
  titles: [
    'Novice',
    'Apprentice',
    'Trickster',
    'Illusionist',
    'Spellbinder',
    'Evoker',
    'Conjurer',
    'Warlock',
    'Sorcerer',
    'Arch-Mage',
  ],
  usesMagic: true,
  starting: true,
  description: 'Wielders of arcane power who destroy enemies from afar.',
  botBehavior: 'Cautious: keeps distance, uses ranged spells, teleports when threatened',
}

const rogue: GameClass = {
  id: 'rogue',
  name: 'Rogue',
  stats: { str: 0, int: 1, wis: -3, dex: 3, con: -1 },
  hitdie: 4,
  maxAttacks: 5,
  primaryStat: 'dex',
  titles: [
    'Vagabond',
    'Cutpurse',
    'Footpad',
    'Robber',
    'Burglar',
    'Filcher',
    'Sharper',
    'Rogue',
    'Thief',
    'Master Thief',
  ],
  usesMagic: true, // Limited magic
  starting: true,
  description: 'Cunning opportunists who strike from the shadows.',
  botBehavior: 'Opportunistic: picks fights carefully, high crit damage, uses escape abilities',
  finesse: true,
}

// =============================================================================
// UNLOCKABLE CLASSES (require achievement to unlock)
// =============================================================================

const priest: GameClass = {
  id: 'priest',
  name: 'Priest',
  stats: { str: -1, int: -3, wis: 3, dex: -1, con: 1 },
  hitdie: 2,
  maxAttacks: 4,
  primaryStat: 'wis',
  titles: [
    'Believer',
    'Acolyte',
    'Devotee',
    'Adept',
    'Evangelist',
    'Priest',
    'Elder',
    'Prophet',
    'Patriarch',
    'High Priest',
  ],
  usesMagic: true,
  starting: false,
  unlockCondition: 'Reach depth 40',
  checkCondition: (ctx) => ctx.globalStats.maxDepthEver >= 40,
  description: 'Holy servants who heal wounds and smite evil.',
  botBehavior: 'Sustain: prioritizes healing, slow but steady, excels against undead/evil',
}

const ranger: GameClass = {
  id: 'ranger',
  name: 'Ranger',
  stats: { str: 0, int: 0, wis: 2, dex: 1, con: -1 },
  hitdie: 5,
  maxAttacks: 5,
  primaryStat: 'dex',
  titles: [
    'Runner',
    'Strider',
    'Scout',
    'Courser',
    'Tracker',
    'Guide',
    'Explorer',
    'Pathfinder',
    'Ranger',
    'Ranger Lord',
  ],
  usesMagic: true, // Nature magic
  starting: false,
  unlockCondition: 'Reach depth 50 with Rogue',
  checkCondition: (ctx) => (ctx.globalStats.bestDepthPerClass?.['rogue'] ?? 0) >= 50,
  description: 'Wilderness experts who excel at ranged combat and tracking.',
  botBehavior: 'Kiting: maintains distance, uses bow/ranged primarily, safe but slower',
}

const paladin: GameClass = {
  id: 'paladin',
  name: 'Paladin',
  stats: { str: 1, int: -3, wis: 1, dex: -1, con: 2 },
  hitdie: 6,
  maxAttacks: 4,
  primaryStat: 'wis', // Divine power
  titles: [
    'Gallant',
    'Keeper',
    'Protector',
    'Defender',
    'Warder',
    'Knight',
    'Guardian',
    'Chevalier',
    'Paladin',
    'Paladin Lord',
  ],
  usesMagic: true, // Divine combat magic
  starting: false,
  unlockCondition: 'Reach depth 50 with Warrior and Priest',
  checkCondition: (ctx) => {
    const best = ctx.globalStats.bestDepthPerClass ?? {}
    return (best['warrior'] ?? 0) >= 50 && (best['priest'] ?? 0) >= 50
  },
  description: 'Holy warriors who combine martial prowess with divine power.',
  botBehavior: 'Adaptive: switches between melee and healing, balanced approach',
  healPotency: 0.8, // Hybrid warrior-caster heals for 80%
}

// =============================================================================
// PRESTIGE CLASSES (late-game unlocks, unique mechanics)
// =============================================================================

const necromancer: GameClass = {
  id: 'necromancer',
  name: 'Necromancer',
  stats: { str: -3, int: 3, wis: 0, dex: 0, con: -2 },
  hitdie: 2,
  maxAttacks: 4,
  primaryStat: 'int',
  titles: [
    'Acolyte',
    'Curser',
    'Dark Student',
    'Initiate',
    'Slavemaster',
    'Summoner',
    'Controller',
    'Commander',
    'Dark Master',
    'Night Lord',
  ],
  usesMagic: true,
  starting: false,
  unlockCondition: 'Die 100 times total',
  prestige: true,
  checkCondition: (ctx) => ctx.globalStats.totalDeaths >= 100,
  description: 'Masters of death who raise fallen enemies as allies.',
  botBehavior: 'Summoner: raises slain monsters, builds undead army, stays behind minions',
}

const berserker: GameClass = {
  id: 'berserker',
  name: 'Berserker',
  stats: { str: 3, int: -4, wis: -4, dex: 2, con: 3 },
  hitdie: 10, // Even higher than warrior
  maxAttacks: 5, // d10 hitdie + STR is the differentiator
  primaryStat: 'str',
  titles: [
    'Brawler',
    'Scrapper',
    'Bruiser',
    'Ravager',
    'Destroyer',
    'Slayer',
    'Maniac',
    'Butcher',
    'Berserker',
    'Warlord',
  ],
  usesMagic: false,
  starting: false,
  unlockCondition: 'Win a run with Warrior class',
  prestige: true,
  checkCondition: (ctx) => (ctx.globalStats.victoriesPerClass?.['warrior'] ?? 0) >= 1,
  description: 'Unstoppable fury incarnate - no healing, only damage.',
  botBehavior: 'All-in: never retreats, maximum aggression, wins fast or dies trying',
}

const archmage: GameClass = {
  id: 'archmage',
  name: 'Archmage',
  stats: { str: -4, int: 4, wis: 1, dex: 0, con: -3 },
  hitdie: -2, // Even more fragile than mage
  maxAttacks: 3,
  primaryStat: 'int',
  titles: [
    'Initiate',
    'Adept',
    'Channeler',
    'Weaver',
    'Invoker',
    'Master',
    'Sage',
    'Wizard',
    'Archmage',
    'Grand Archmage',
  ],
  usesMagic: true,
  starting: false,
  unlockCondition: 'Win a run with Mage defeating the final boss',
  prestige: true,
  checkCondition: (ctx) => (ctx.globalStats.victoriesPerClass?.['mage'] ?? 0) >= 1,
  description: 'Supreme magical power at the cost of extreme fragility.',
  botBehavior:
    'Glass cannon: devastating AOE spells, teleports constantly, one-shots or gets one-shot',
}

// =============================================================================
// ADDITIONAL ANGBAND CLASSES (for completeness, unlockable)
// =============================================================================

const druid: GameClass = {
  id: 'druid',
  name: 'Druid',
  stats: { str: -2, int: 0, wis: 2, dex: -2, con: 0 },
  hitdie: 4,
  maxAttacks: 4,
  primaryStat: 'wis',
  titles: [
    'Wanderer',
    'Tamer',
    'Nurturer',
    'Gardener',
    'Forester',
    'Creator',
    'Earth Warder',
    'Windrider',
    'Stormwielder',
    'High Mystic',
  ],
  usesMagic: true, // Nature magic
  starting: false,
  unlockCondition: 'Reach depth 30',
  checkCondition: (ctx) => ctx.globalStats.maxDepthEver >= 30,
  description: 'Shapeshifters who command the forces of nature.',
  botBehavior: 'Versatile: shapeshifts based on situation, nature spells, animal charm',
}

const blackguard: GameClass = {
  id: 'blackguard',
  name: 'Blackguard',
  stats: { str: 2, int: 0, wis: -3, dex: 0, con: 2 },
  hitdie: 8,
  maxAttacks: 5,
  primaryStat: 'str',
  titles: [
    'Rat',
    'Bully',
    'Thug',
    'Ruffian',
    'Brigand',
    'Raider',
    'Tormentor',
    'Marauder',
    'Destroyer',
    'Tyrant',
  ],
  usesMagic: true, // Dark combat magic
  starting: false,
  unlockCondition: 'Kill 10,000 monsters total',
  checkCondition: (ctx) => ctx.globalStats.totalKills >= 10000,
  description: 'Dark knights who regenerate health through combat.',
  botBehavior: 'Bloodthirsty: aggressive melee, heals by dealing damage, fears nothing',
  combatLifesteal: 8, // Heals 8% of melee damage dealt
}

// =============================================================================
// EXPORTS
// =============================================================================

/** All classes in the game */
export const classes: GameClass[] = [
  // Starting classes
  warrior,
  mage,
  rogue,
  // Unlockable classes
  priest,
  ranger,
  paladin,
  druid,
  blackguard,
  // Prestige classes
  necromancer,
  berserker,
  archmage,
]

/** Starting classes only */
export const startingClasses = classes.filter((c) => c.starting)

/** Non-starting classes (unlockable) */
export const unlockableClasses = classes.filter((c) => !c.starting && !c.prestige)

/** Prestige classes (late-game) */
export const prestigeClasses = classes.filter((c) => c.prestige)

/** Get a class by ID */
export function getClassById(id: string): GameClass | undefined {
  return classes.find((c) => c.id === id)
}

/**
 * Calculate effective hitdie for a character
 * Formula: race.hitdie + class.hitdie (can be negative for fragile classes)
 */
export function calculateHitdie(raceHitdie: number, classHitdie: number): number {
  return Math.max(1, raceHitdie + classHitdie) // Minimum of 1
}
