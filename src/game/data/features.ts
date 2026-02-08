/**
 * Dungeon features - Fountains, Altars, and other interactive tiles
 *
 * These are special tiles that provide effects when used.
 */

import { random } from '../rng'

export type FeatureEffect = 'heal' | 'mana' | 'buff' | 'cure' | 'bless' | 'random'

export interface FountainTemplate {
  id: string
  name: string
  char: string
  color: number
  effect: FeatureEffect
  /** Effect power (percentage for heal/mana, flat for buffs) */
  power: number
  /** Number of uses (-1 = infinite) */
  uses: number
  minDepth: number
  /** Rarity weight (higher = more common) */
  rarity: number
}

export const FOUNTAINS: FountainTemplate[] = [
  {
    id: 'healing_fountain',
    name: 'Healing Fountain',
    char: '≈',
    color: 0x22c55e, // green
    effect: 'heal',
    power: 50, // Heal 50% of max HP
    uses: 3,
    minDepth: 1,
    rarity: 10,
  },
  {
    id: 'restoration_fountain',
    name: 'Fountain of Restoration',
    char: '≈',
    color: 0x3b82f6, // blue
    effect: 'heal',
    power: 100, // Full heal
    uses: 1,
    minDepth: 15,
    rarity: 3,
  },
  {
    id: 'mana_fountain',
    name: 'Mystic Fountain',
    char: '≈',
    color: 0x8b5cf6, // purple
    effect: 'mana',
    power: 100, // Full mana restore
    uses: 2,
    minDepth: 10,
    rarity: 5,
  },
  {
    id: 'blessed_fountain',
    name: 'Blessed Waters',
    char: '≈',
    color: 0xfbbf24, // amber
    effect: 'buff',
    power: 20, // +20 to hit/AC for duration
    uses: 1,
    minDepth: 20,
    rarity: 2,
  },
  {
    id: 'cleansing_fountain',
    name: 'Cleansing Spring',
    char: '≈',
    color: 0x06b6d4, // cyan
    effect: 'cure',
    power: 0, // Cures all status effects
    uses: 2,
    minDepth: 8,
    rarity: 4,
  },
  {
    id: 'mysterious_fountain',
    name: 'Mysterious Fountain',
    char: '?',
    color: 0x6b7280, // gray
    effect: 'random',
    power: 0,
    uses: 1,
    minDepth: 5,
    rarity: 3,
  },
]

export interface AltarTemplate {
  id: string
  name: string
  char: string
  color: number
  effect: 'bless' | 'enchant'
  /** Cost in gold to use (0 = free) */
  cost: number
  minDepth: number
  rarity: number
}

export const ALTARS: AltarTemplate[] = [
  {
    id: 'blessing_altar',
    name: 'Altar of Blessing',
    char: '_',
    color: 0xfbbf24, // amber
    effect: 'bless',
    cost: 50,
    minDepth: 10,
    rarity: 3,
  },
  {
    id: 'enchantment_altar',
    name: 'Altar of Enchantment',
    char: '_',
    color: 0x22c55e, // green
    effect: 'enchant',
    cost: 200,
    minDepth: 25,
    rarity: 1,
  },
]

/**
 * Get fountains available at a given depth
 */
export function getFountainsForDepth(depth: number): FountainTemplate[] {
  return FOUNTAINS.filter((f) => f.minDepth <= depth)
}

/**
 * Select a random fountain for a depth (weighted by rarity)
 */
export function selectFountain(depth: number): FountainTemplate | null {
  const available = getFountainsForDepth(depth)
  if (available.length === 0) return null

  const totalRarity = available.reduce((sum, f) => sum + f.rarity, 0)
  let roll = random() * totalRarity

  for (const fountain of available) {
    roll -= fountain.rarity
    if (roll <= 0) return fountain
  }

  return available[0]!
}

/**
 * Get altars available at a given depth
 */
export function getAltarsForDepth(depth: number): AltarTemplate[] {
  return ALTARS.filter((a) => a.minDepth <= depth)
}

/**
 * Select a random altar for a depth (weighted by rarity)
 */
export function selectAltar(depth: number): AltarTemplate | null {
  const available = getAltarsForDepth(depth)
  if (available.length === 0) return null

  const totalRarity = available.reduce((sum, a) => sum + a.rarity, 0)
  let roll = random() * totalRarity

  for (const altar of available) {
    roll -= altar.rarity
    if (roll <= 0) return altar
  }

  return available[0]!
}

/**
 * Get fountain by ID
 */
export function getFountainById(id: string): FountainTemplate | undefined {
  return FOUNTAINS.find((f) => f.id === id)
}

/**
 * Get altar by ID
 */
export function getAltarById(id: string): AltarTemplate | undefined {
  return ALTARS.find((a) => a.id === id)
}
