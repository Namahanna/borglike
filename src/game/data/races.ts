/**
 * Player Race definitions for Angband-Lite
 *
 * Data extracted from Angband 4.2.6 p_race.txt and adapted for our simplified system.
 * Stat modifiers use Angband's scale (-4 to +4 typically).
 * See ANGBAND-LITE-DESIGN.md for unlock conditions and design rationale.
 */

import type { UnlockContext } from '@/types/progression'
import { getDragonNames, getUniques } from './monsters'

/** Starting race IDs for prestige unlock validation */
const STARTING_RACE_IDS = ['human', 'dwarf', 'elf']

/** Stat modifiers for a race */
export interface StatModifiers {
  str: number
  int: number
  wis: number
  dex: number
  con: number
}

/** Race special ability or passive */
export interface RaceAbility {
  id: string
  name: string
  description: string
}

/** Player race definition */
export interface Race {
  id: string
  name: string
  /** Stat adjustments (Angband scale: typically -4 to +4) */
  stats: StatModifiers
  /** Hit die bonus added to class hitdie (Angband: 7-12, we use 0-based adjustment) */
  hitdie: number
  /** Infravision range in 10-foot increments (0 = none) */
  infravision: number
  /** Experience penalty percentage (100 = normal, 120 = 20% more XP needed) */
  expPenalty: number
  /** Special abilities this race has */
  abilities: RaceAbility[]
  /** Is this race available at game start? */
  starting: boolean
  /** Unlock condition description (if not starting) */
  unlockCondition?: string
  /** Is this a prestige race (late-game unlock)? */
  prestige?: boolean
  /** Predicate to check if unlock condition is met (for prestige races) */
  checkCondition?: (ctx: UnlockContext) => boolean
  /** Brief flavor text */
  description: string
}

// =============================================================================
// STARTING RACES (unlocked from the beginning)
// =============================================================================

const human: Race = {
  id: 'human',
  name: 'Human',
  stats: { str: 0, int: 0, wis: 0, dex: 0, con: 0 },
  hitdie: 10,
  infravision: 0,
  expPenalty: 100, // No penalty - baseline
  abilities: [
    {
      id: 'versatile',
      name: 'Versatile',
      description: '+10% XP gain from all sources',
    },
  ],
  starting: true,
  description: 'Balanced and adaptable, humans learn quickly from their experiences.',
}

const dwarf: Race = {
  id: 'dwarf',
  name: 'Dwarf',
  stats: { str: 2, int: -3, wis: 2, dex: -2, con: 2 },
  hitdie: 10,
  infravision: 5,
  expPenalty: 120,
  abilities: [
    {
      id: 'blind_resist',
      name: 'Resist Blindness',
      description: 'Immune to blindness effects',
    },
  ],
  starting: true,
  description: 'Sturdy mountain folk with keen eyes in the dark and strong constitutions.',
}

const elf: Race = {
  id: 'elf',
  name: 'Elf',
  stats: { str: -1, int: 2, wis: -1, dex: 1, con: -1 },
  hitdie: 9,
  infravision: 3,
  expPenalty: 120,
  abilities: [
    {
      id: 'swift_feet',
      name: 'Swift Feet',
      description: '+3 speed',
    },
    {
      id: 'elven_grace',
      name: 'Elven Grace',
      description: '+3 evasion',
    },
    {
      id: 'resist_light',
      name: 'Resist Light',
      description: 'Resistant to light-based attacks',
    },
  ],
  starting: true,
  description: 'Graceful and swift, elves are hard to pin down.',
}

// =============================================================================
// UNLOCKABLE RACES (from Angband data)
// =============================================================================

const halfElf: Race = {
  id: 'half_elf',
  name: 'Half-Elf',
  stats: { str: 0, int: 1, wis: -1, dex: 1, con: 0 },
  hitdie: 10,
  infravision: 2,
  expPenalty: 120,
  abilities: [
    {
      id: 'quick_learner',
      name: 'Quick Learner',
      description: '+5% XP gain from all sources',
    },
    {
      id: 'elven_reflexes',
      name: 'Elven Reflexes',
      description: '+2 evasion',
    },
  ],
  starting: false,
  unlockCondition: 'Reach depth 50 with Human and Elf',
  checkCondition: (ctx) => {
    const best = ctx.globalStats.bestDepthPerRace ?? {}
    return (best['human'] ?? 0) >= 50 && (best['elf'] ?? 0) >= 50
  },
  description: 'Combining human adaptability with elven grace.',
}

const hobbit: Race = {
  id: 'hobbit',
  name: 'Hobbit',
  stats: { str: -2, int: 2, wis: 1, dex: 3, con: 2 },
  hitdie: 8,
  infravision: 4,
  expPenalty: 120,
  abilities: [
    {
      id: 'hold_life',
      name: 'Hold Life',
      description: 'Resistant to experience drain',
    },
    {
      id: 'second_breakfast',
      name: 'Second Breakfast',
      description: '+25% healing from potions',
    },
    {
      id: 'small_target',
      name: 'Small Target',
      description: '+3 evasion',
    },
  ],
  starting: false,
  unlockCondition: 'Reach depth 50',
  checkCondition: (ctx) => ctx.globalStats.maxDepthEver >= 50,
  description: 'Small but nimble, hobbits are natural survivors with hearty appetites.',
}

const gnome: Race = {
  id: 'gnome',
  name: 'Gnome',
  stats: { str: -1, int: 2, wis: 0, dex: 2, con: 1 },
  hitdie: 8,
  infravision: 4,
  expPenalty: 120,
  abilities: [
    {
      id: 'free_act',
      name: 'Free Action',
      description: 'Immune to paralysis',
    },
    {
      id: 'lucky',
      name: 'Lucky',
      description: '+5% critical hit chance',
    },
    {
      id: 'nimble',
      name: 'Nimble',
      description: '+5 speed',
    },
  ],
  starting: false,
  unlockCondition: 'Complete 50 runs',
  checkCondition: (ctx) => ctx.globalStats.totalRuns >= 50,
  description: 'Quick and fortunate, gnomes rely on luck and agility to survive.',
}

const halfOrc: Race = {
  id: 'half_orc',
  name: 'Half-Orc',
  stats: { str: 2, int: -1, wis: 0, dex: 0, con: 1 },
  hitdie: 10,
  infravision: 3,
  expPenalty: 120,
  abilities: [
    {
      id: 'resist_dark',
      name: 'Resist Darkness',
      description: 'Resistant to darkness attacks',
    },
    {
      id: 'berserker',
      name: 'Berserker Rage',
      description: '+20% damage when below 30% HP',
    },
  ],
  starting: false,
  unlockCondition: 'Kill 10,000 monsters total',
  checkCondition: (ctx) => ctx.globalStats.totalKills >= 10000,
  description: 'Fierce warriors who grow stronger when wounded.',
}

const halfTroll: Race = {
  id: 'half_troll',
  name: 'Half-Troll',
  stats: { str: 4, int: -4, wis: -2, dex: -4, con: 3 },
  hitdie: 12, // Highest HP
  infravision: 3,
  expPenalty: 120,
  abilities: [
    {
      id: 'sustain_str',
      name: 'Sustain Strength',
      description: 'Strength cannot be drained',
    },
    {
      id: 'regeneration',
      name: 'Regeneration',
      description: 'Recovers HP twice as fast',
    },
  ],
  starting: false,
  unlockCondition: 'Kill 250 unique monsters',
  checkCondition: (ctx) => {
    const uniqueNames = new Set(getUniques().map((m) => m.name))
    const uniqueKills = Object.entries(ctx.bestiary)
      .filter(([name]) => uniqueNames.has(name))
      .reduce((sum, [, entry]) => sum + entry.kills, 0)
    return uniqueKills >= 250
  },
  description: 'Massive and slow, but nearly impossible to kill.',
}

const dunadan: Race = {
  id: 'dunadan',
  name: 'Dunadan',
  stats: { str: 1, int: 2, wis: 2, dex: 2, con: 3 },
  hitdie: 10,
  infravision: 0,
  expPenalty: 120,
  abilities: [
    {
      id: 'sustain_con',
      name: 'Sustain Constitution',
      description: 'Constitution cannot be drained',
    },
  ],
  starting: false,
  unlockCondition: 'Win a run with Human',
  checkCondition: (ctx) => (ctx.globalStats.victoriesPerRace?.['human'] ?? 0) >= 1,
  description: 'Descendants of ancient kings, gifted in all aspects.',
}

const highElf: Race = {
  id: 'high_elf',
  name: 'High-Elf',
  stats: { str: 1, int: 3, wis: -1, dex: 3, con: 1 },
  hitdie: 10,
  infravision: 4,
  expPenalty: 145, // Highest exp penalty
  abilities: [
    {
      id: 'keen_senses',
      name: 'Keen Senses',
      description: '+10 accuracy from elven precision',
    },
    {
      id: 'resist_light',
      name: 'Resist Light',
      description: 'Resistant to light-based attacks',
    },
  ],
  starting: false,
  unlockCondition: 'Win a run with Elf',
  checkCondition: (ctx) => (ctx.globalStats.victoriesPerRace?.['elf'] ?? 0) >= 1,
  description: 'Noble and powerful, the eldest of the elven kindred.',
}

const kobold: Race = {
  id: 'kobold',
  name: 'Kobold',
  stats: { str: -1, int: -1, wis: 0, dex: 2, con: 2 },
  hitdie: 8,
  infravision: 5,
  expPenalty: 120,
  abilities: [
    {
      id: 'resist_poison',
      name: 'Resist Poison',
      description: 'Immune to poison',
    },
    {
      id: 'slippery',
      name: 'Slippery',
      description: '+5 evasion from being hard to pin down',
    },
  ],
  starting: false,
  unlockCondition: 'Die 100 times',
  checkCondition: (ctx) => ctx.globalStats.totalDeaths >= 100,
  description: 'Scrappy survivors who have learned from countless deaths.',
}

// =============================================================================
// PRESTIGE RACES (late-game unlocks, more powerful)
// =============================================================================

const vampire: Race = {
  id: 'vampire',
  name: 'Vampire',
  stats: { str: 2, int: 2, wis: -2, dex: 2, con: 0 },
  hitdie: 10,
  infravision: 5,
  expPenalty: 150,
  abilities: [
    {
      id: 'life_steal',
      name: 'Life Steal',
      description: 'Melee attacks heal for 20% of damage dealt',
    },
    {
      id: 'no_potions',
      name: 'Undead Curse',
      description: 'Cannot use healing potions',
    },
    {
      id: 'light_vuln',
      name: 'Light Vulnerability',
      description: 'Takes double damage from light attacks',
    },
  ],
  starting: false,
  unlockCondition: 'Win a run with each starting race (Human, Dwarf, Elf)',
  prestige: true,
  checkCondition: (ctx) => {
    const wins = ctx.globalStats.victoriesPerRace ?? {}
    return STARTING_RACE_IDS.every((id) => (wins[id] ?? 0) >= 1)
  },
  description: 'Immortal predators who sustain themselves on the life force of others.',
}

const golem: Race = {
  id: 'golem',
  name: 'Golem',
  stats: { str: 4, int: -4, wis: -4, dex: -2, con: 4 },
  hitdie: 14, // Massive HP
  infravision: 0,
  expPenalty: 160,
  abilities: [
    {
      id: 'construct',
      name: 'Construct',
      description: 'Immune to poison, disease, and mind effects',
    },
    {
      id: 'no_magic',
      name: 'Arcane Void',
      description: 'Cannot use scrolls or cast spells',
    },
    {
      id: 'slow_heal',
      name: 'Stone Body',
      description: 'Heals at 50% normal rate',
    },
  ],
  starting: false,
  unlockCondition: 'Collect 10,000,000 gold total across all runs',
  prestige: true,
  checkCondition: (ctx) => ctx.globalStats.totalGold >= 10000000,
  description: 'Animated constructs of stone and metal, nearly indestructible.',
}

const draconian: Race = {
  id: 'draconian',
  name: 'Draconian',
  stats: { str: 2, int: 1, wis: 0, dex: 0, con: 2 },
  hitdie: 11,
  infravision: 2,
  expPenalty: 150,
  abilities: [
    {
      id: 'breath_weapon',
      name: 'Breath Weapon',
      description: 'Can breathe fire/cold/acid (random) in a cone',
    },
    {
      id: 'elem_resist',
      name: 'Elemental Affinity',
      description: 'Resistant to fire, cold, and acid',
    },
  ],
  starting: false,
  unlockCondition: 'Kill 10,000 dragons total',
  prestige: true,
  checkCondition: (ctx) => {
    const dragonNames = getDragonNames()
    const totalDragonKills = dragonNames.reduce(
      (sum, name) => sum + (ctx.bestiary[name]?.kills ?? 0),
      0
    )
    return totalDragonKills >= 10000
  },
  description: 'Dragon-blooded humanoids with elemental powers.',
}

// =============================================================================
// EXPORTS
// =============================================================================

/** All races in the game */
export const races: Race[] = [
  // Starting races
  human,
  dwarf,
  elf,
  // Unlockable races
  halfElf,
  hobbit,
  gnome,
  halfOrc,
  halfTroll,
  dunadan,
  highElf,
  kobold,
  // Prestige races
  vampire,
  golem,
  draconian,
]

/** Starting races only */
export const startingRaces = races.filter((r) => r.starting)

/** Non-starting races (unlockable) */
export const unlockableRaces = races.filter((r) => !r.starting && !r.prestige)

/** Prestige races (late-game) */
export const prestigeRaces = races.filter((r) => r.prestige)

/** Get a race by ID */
export function getRaceById(id: string): Race | undefined {
  return races.find((r) => r.id === id)
}
