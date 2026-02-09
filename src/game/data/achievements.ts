/**
 * Achievement Definitions
 *
 * Achievements track player progress and reward essence for completing goals.
 * Mastery achievements track wins per race/class and are displayed in a compact grid.
 */

import type { GlobalStats } from '@/types/progression'
import { races, startingRaces } from './races'
import { classes, startingClasses } from './classes'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string // ASCII/emoji
  category: 'progress' | 'challenge' | 'cumulative' | 'mastery'
  target: number // For progress tracking (e.g., 100 kills)
  reward: number // Essence reward
  hidden?: boolean // Don't show until unlocked
  /** GlobalStats key this achievement tracks progress against. Required for cumulative achievements. */
  statKey?: keyof GlobalStats
  /** Whether this is a prestige race/class achievement (visually marked in UI) */
  prestige?: boolean
  /** Mastery sub-group for grid layout */
  group?: 'race' | 'class' | 'meta'
}

/**
 * All achievement definitions
 */
export const achievements: Achievement[] = [
  // Progress achievements (single-run milestones)
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Kill your first monster',
    icon: '!',
    category: 'progress',
    target: 1,
    reward: 10,
  },
  {
    id: 'depth_10',
    name: 'Depth 10',
    description: 'Reach dungeon depth 10',
    icon: 'v',
    category: 'progress',
    target: 10,
    reward: 50,
  },
  {
    id: 'depth_25',
    name: 'Depth 25',
    description: 'Reach dungeon depth 25',
    icon: 'v',
    category: 'progress',
    target: 25,
    reward: 200,
  },
  {
    id: 'depth_50',
    name: 'Depth 50',
    description: 'Reach dungeon depth 50',
    icon: 'v',
    category: 'progress',
    target: 50,
    reward: 1000,
  },
  {
    id: 'first_victory',
    name: 'First Victory',
    description: 'Win the game',
    icon: '*',
    category: 'progress',
    target: 1,
    reward: 5000,
  },

  // Cumulative achievements (track global stats)
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Kill 100 monsters total',
    icon: 'k',
    category: 'cumulative',
    target: 100,
    reward: 100,
    statKey: 'totalKills',
  },
  {
    id: 'slayer',
    name: 'Slayer',
    description: 'Kill 1,000 monsters total',
    icon: 'K',
    category: 'cumulative',
    target: 1000,
    reward: 500,
    statKey: 'totalKills',
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Collect 10,000 gold total',
    icon: '$',
    category: 'cumulative',
    target: 10000,
    reward: 500,
    statKey: 'totalGold',
  },
  {
    id: 'frequent_dier',
    name: 'Frequent Dier',
    description: 'Die 100 times',
    icon: 'x',
    category: 'cumulative',
    target: 100,
    reward: 1000,
    statKey: 'totalDeaths',
  },
  // Monster kill tiers (continued)
  {
    id: 'butcher',
    name: 'Butcher',
    description: 'Kill 5,000 monsters total',
    icon: 'K',
    category: 'cumulative',
    target: 5000,
    reward: 1000,
    statKey: 'totalKills',
  },
  {
    id: 'annihilator',
    name: 'Annihilator',
    description: 'Kill 25,000 monsters total',
    icon: 'K',
    category: 'cumulative',
    target: 25000,
    reward: 2500,
    statKey: 'totalKills',
  },
  {
    id: 'genocide',
    name: 'Genocide',
    description: 'Kill 100,000 monsters total',
    icon: 'K',
    category: 'cumulative',
    target: 100000,
    reward: 5000,
    statKey: 'totalKills',
  },

  // Depth 50 tiers — reaching the final level
  {
    id: 'deep_diver',
    name: 'Deep Diver',
    description: 'Reach depth 50 fifty times',
    icon: 'v',
    category: 'cumulative',
    target: 50,
    reward: 300,
    statKey: 'timesReachedDepth50',
  },
  {
    id: 'abyss_regular',
    name: 'Abyss Regular',
    description: 'Reach depth 50 one hundred times',
    icon: 'v',
    category: 'cumulative',
    target: 100,
    reward: 500,
    statKey: 'timesReachedDepth50',
  },
  {
    id: 'bottom_dweller',
    name: 'Bottom Dweller',
    description: 'Reach depth 50 two hundred fifty times',
    icon: 'v',
    category: 'cumulative',
    target: 250,
    reward: 1000,
    statKey: 'timesReachedDepth50',
  },
  {
    id: 'abyss_veteran',
    name: 'Abyss Veteran',
    description: 'Reach depth 50 five hundred times',
    icon: 'v',
    category: 'cumulative',
    target: 500,
    reward: 2000,
    statKey: 'timesReachedDepth50',
  },
  {
    id: 'eternal_delver',
    name: 'Eternal Delver',
    description: 'Reach depth 50 one thousand times',
    icon: 'v',
    category: 'cumulative',
    target: 1000,
    reward: 4000,
    statKey: 'timesReachedDepth50',
  },

  // Death tiers (continued)
  {
    id: 'professional_corpse',
    name: 'Professional Corpse',
    description: 'Die 500 times',
    icon: 'x',
    category: 'cumulative',
    target: 500,
    reward: 2000,
    statKey: 'totalDeaths',
  },
  {
    id: 'death_enthusiast',
    name: 'Death Enthusiast',
    description: 'Die 1,000 times',
    icon: 'x',
    category: 'cumulative',
    target: 1000,
    reward: 3000,
    statKey: 'totalDeaths',
  },
  {
    id: 'immortally_mortal',
    name: 'Immortally Mortal',
    description: 'Die 5,000 times',
    icon: 'x',
    category: 'cumulative',
    target: 5000,
    reward: 5000,
    statKey: 'totalDeaths',
  },

  // Gold tiers (continued)
  {
    id: 'tycoon',
    name: 'Tycoon',
    description: 'Collect 100,000 gold total',
    icon: '$',
    category: 'cumulative',
    target: 100000,
    reward: 1500,
    statKey: 'totalGold',
  },
  {
    id: 'mogul',
    name: 'Mogul',
    description: 'Collect 500,000 gold total',
    icon: '$',
    category: 'cumulative',
    target: 500000,
    reward: 3000,
    statKey: 'totalGold',
  },
  {
    id: 'dragons_hoard',
    name: "Dragon's Hoard",
    description: 'Collect 1,000,000 gold total',
    icon: '$',
    category: 'cumulative',
    target: 1000000,
    reward: 5000,
    statKey: 'totalGold',
  },

  // Challenge achievements (single-run challenges)
  {
    id: 'massacre',
    name: 'Massacre',
    description: 'Kill 50 monsters in a single run',
    icon: 'M',
    category: 'challenge',
    target: 50,
    reward: 150,
  },
  {
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    description: 'Collect 1,000 gold in a single run',
    icon: '$',
    category: 'challenge',
    target: 1000,
    reward: 200,
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Reach depth 10 in under 500 turns',
    icon: '>',
    category: 'challenge',
    target: 500,
    reward: 250,
    hidden: true,
  },

  // =========================================================================
  // Mastery achievements — win as each race/class
  // =========================================================================

  // Race mastery (14 races)
  ...races.map(
    (race): Achievement => ({
      id: `win_race_${race.id}`,
      name: `${race.name} Victor`,
      description: `Win the game as a ${race.name}`,
      icon: '@',
      category: 'mastery',
      target: 1,
      reward: 500,
      prestige: race.prestige,
      group: 'race',
    })
  ),

  // Class mastery (11 classes)
  ...classes.map(
    (cls): Achievement => ({
      id: `win_class_${cls.id}`,
      name: `${cls.name} Victor`,
      description: `Win the game as a ${cls.name}`,
      icon: '&',
      category: 'mastery',
      target: 1,
      reward: 500,
      prestige: cls.prestige,
      group: 'class',
    })
  ),

  // Meta mastery achievements
  {
    id: 'win_all_starting_races',
    name: 'Racial Trio',
    description: `Win with all ${startingRaces.length} starting races`,
    icon: '+',
    category: 'mastery',
    target: startingRaces.length,
    reward: 2000,
    group: 'meta',
  },
  {
    id: 'win_all_starting_classes',
    name: 'Class Trio',
    description: `Win with all ${startingClasses.length} starting classes`,
    icon: '+',
    category: 'mastery',
    target: startingClasses.length,
    reward: 2000,
    group: 'meta',
  },
  {
    id: 'win_all_races',
    name: 'Master of Races',
    description: `Win with all ${races.length} races`,
    icon: '+',
    category: 'mastery',
    target: races.length,
    reward: 10000,
    group: 'meta',
  },
  {
    id: 'win_all_classes',
    name: 'Master of Classes',
    description: `Win with all ${classes.length} classes`,
    icon: '+',
    category: 'mastery',
    target: classes.length,
    reward: 10000,
    group: 'meta',
  },
]

/**
 * Get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return achievements.find((a) => a.id === id)
}

/**
 * Get achievements by category
 */
export function getAchievementsByCategory(category: Achievement['category']): Achievement[] {
  return achievements.filter((a) => a.category === category)
}

/**
 * Get total possible essence from all achievements
 */
export function getTotalAchievementRewards(): number {
  return achievements.reduce((sum, a) => sum + a.reward, 0)
}

/** Mastery achievements only */
export function getMasteryAchievements(): Achievement[] {
  return achievements.filter((a) => a.category === 'mastery')
}

/** Race mastery achievements (individual wins) */
export function getRaceAchievements(): Achievement[] {
  return achievements.filter((a) => a.category === 'mastery' && a.group === 'race')
}

/** Class mastery achievements (individual wins) */
export function getClassAchievements(): Achievement[] {
  return achievements.filter((a) => a.category === 'mastery' && a.group === 'class')
}

/** Meta mastery achievements (collection milestones) */
export function getMetaAchievements(): Achievement[] {
  return achievements.filter((a) => a.category === 'mastery' && a.group === 'meta')
}
