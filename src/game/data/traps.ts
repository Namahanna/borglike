/**
 * Trap system - hidden hazards in the dungeon
 *
 * Traps are hidden until detected, then revealed to the player.
 * Most traps are single-use; some can rearm after triggering.
 */

import { random } from '../rng'

export type TrapEffect = 'damage' | 'poison' | 'teleport' | 'alarm' | 'pit'

export interface TrapTemplate {
  id: string
  name: string
  char: string // Always '^' when revealed
  color: number
  effect: TrapEffect
  /** Base damage dealt (0 for non-damage traps) */
  damage: number
  /** Detection difficulty (0-100, higher = harder to detect) */
  baseDifficulty: number
  minDepth: number
  /** Rarity weight (higher = more common) */
  rarity: number
  /** Turns until trap rearms after triggering (0 = single-use) */
  rearmTurns: number
}

export const TRAPS: TrapTemplate[] = [
  {
    id: 'spike_trap',
    name: 'Spike Trap',
    char: '^',
    color: 0x94a3b8, // slate gray
    effect: 'damage',
    damage: 15,
    baseDifficulty: 30,
    minDepth: 1,
    rarity: 10,
    rearmTurns: 0, // Single-use
  },
  {
    id: 'poison_dart',
    name: 'Poison Dart Trap',
    char: '^',
    color: 0x22c55e, // green
    effect: 'poison',
    damage: 8,
    baseDifficulty: 45,
    minDepth: 5,
    rarity: 6,
    rearmTurns: 0, // Single-use
  },
  {
    id: 'teleport_trap',
    name: 'Teleport Trap',
    char: '^',
    color: 0x8b5cf6, // purple
    effect: 'teleport',
    damage: 0,
    baseDifficulty: 60,
    minDepth: 8,
    rarity: 4,
    rearmTurns: 0, // Single-use
  },
  {
    id: 'alarm_trap',
    name: 'Alarm Trap',
    char: '^',
    color: 0xfbbf24, // amber
    effect: 'alarm',
    damage: 0,
    baseDifficulty: 35,
    minDepth: 3,
    rarity: 5,
    rearmTurns: 10, // Rearms after 10 turns
  },
  {
    id: 'pit_trap',
    name: 'Pit Trap',
    char: '^',
    color: 0x1e293b, // dark slate
    effect: 'pit',
    damage: 20,
    baseDifficulty: 50,
    minDepth: 10,
    rarity: 3,
    rearmTurns: 0, // Single-use (you fall in)
  },
]

/**
 * Get traps available at a given depth
 */
export function getTrapsForDepth(depth: number): TrapTemplate[] {
  return TRAPS.filter((t) => t.minDepth <= depth)
}

/**
 * Select a random trap for a depth (weighted by rarity)
 */
export function selectTrap(depth: number): TrapTemplate | null {
  const available = getTrapsForDepth(depth)
  if (available.length === 0) return null

  const totalRarity = available.reduce((sum, t) => sum + t.rarity, 0)
  let roll = random() * totalRarity

  for (const trap of available) {
    roll -= trap.rarity
    if (roll <= 0) return trap
  }

  return available[0]!
}

/**
 * Get trap by ID
 */
export function getTrapById(id: string): TrapTemplate | undefined {
  return TRAPS.find((t) => t.id === id)
}
