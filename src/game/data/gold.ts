/**
 * Gold pile definitions
 *
 * Gold piles are items that grant gold when picked up.
 * Amount varies within a range, scaled by depth and goldMultiplier upgrade.
 */

import type { ItemTemplate } from './items'
import { random, randomInt } from '../rng'

export interface GoldPileTemplate extends Omit<ItemTemplate, 'type'> {
  type: 'gold'
  /** Gold value range [min, max] */
  goldValue: [number, number]
}

export const GOLD_PILES: GoldPileTemplate[] = [
  {
    name: 'Copper Coins',
    type: 'gold',
    tier: 1,
    weight: 1,
    goldValue: [1, 10],
    minDepth: 1,
  },
  {
    name: 'Silver Coins',
    type: 'gold',
    tier: 1,
    weight: 2,
    goldValue: [10, 40],
    minDepth: 5,
  },
  {
    name: 'Gold Coins',
    type: 'gold',
    tier: 2,
    weight: 3,
    goldValue: [25, 80],
    minDepth: 15,
  },
  {
    name: 'Small Treasure',
    type: 'gold',
    tier: 2,
    weight: 10,
    goldValue: [40, 120],
    minDepth: 25,
  },
  {
    name: 'Treasure Chest',
    type: 'gold',
    tier: 3,
    weight: 25,
    goldValue: [80, 250],
    minDepth: 35,
  },
  {
    name: 'Dragon Hoard',
    type: 'gold',
    tier: 4,
    weight: 50,
    goldValue: [150, 500],
    minDepth: 50,
  },
]

/**
 * Get gold piles available at a given depth
 */
export function getGoldPilesForDepth(depth: number): GoldPileTemplate[] {
  return GOLD_PILES.filter((pile) => (pile.minDepth ?? 0) <= depth)
}

/**
 * Select a random gold pile appropriate for the depth
 * Weighted towards lower-value piles
 */
export function selectGoldPile(depth: number): GoldPileTemplate | null {
  const available = getGoldPilesForDepth(depth)
  if (available.length === 0) return null

  // Weight towards lower tiers
  const weights = available.map((pile) => 1 / pile.tier)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  let roll = random() * totalWeight
  for (let i = 0; i < available.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return available[i]!
  }

  return available[0]!
}

/**
 * Calculate gold value from a pile (random within range)
 */
export function rollGoldValue(pile: GoldPileTemplate, depthBonus: number = 0): number {
  const [min, max] = pile.goldValue
  const base = randomInt(min, max)
  // Apply depth bonus (1% per depth)
  return Math.floor(base * (1 + depthBonus / 100))
}

/**
 * Monster gold drop configuration
 */
export interface MonsterGoldDrop {
  /** Probability of dropping gold (0-1) */
  chance: number
  /** Gold amount range [min, max] */
  amount: [number, number]
}

/**
 * Default gold drop chances by monster tier
 * Calculated from minDepth ranges
 *
 * Late-game drops are reduced to flatten the gold curve -
 * early game intact, mid-game slightly reduced, late-game heavily reduced.
 */
export function getDefaultGoldDrop(minDepth: number): MonsterGoldDrop {
  if (minDepth >= 40) {
    return { chance: 0.65, amount: [35, 100] }
  } else if (minDepth >= 25) {
    return { chance: 0.55, amount: [25, 75] }
  } else if (minDepth >= 15) {
    return { chance: 0.45, amount: [15, 50] }
  } else if (minDepth >= 5) {
    return { chance: 0.35, amount: [5, 25] }
  } else {
    return { chance: 0.2, amount: [1, 10] }
  }
}

/**
 * Roll gold drop from a monster
 */
export function rollMonsterGold(drop: MonsterGoldDrop, goldMultiplier: number = 1): number {
  if (random() > drop.chance) return 0

  const [min, max] = drop.amount
  const base = randomInt(min, max)
  return Math.floor(base * goldMultiplier)
}
