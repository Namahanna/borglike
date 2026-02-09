/**
 * Stats Tracking Helpers for Borglike
 *
 * Utility functions for incrementing and tracking run statistics.
 */

import type { RunTally } from './types'

/**
 * Increment a numeric value in a Record by key
 * Creates the key if it doesn't exist
 */
export function incrementStat(record: Record<string, number>, key: string, amount: number): void {
  record[key] = (record[key] ?? 0) + amount
}

/**
 * Track spell usage (casts, damage, mana)
 */
export function trackSpellUsage(
  stats: RunTally,
  spellName: string,
  damage: number,
  manaCost: number
): void {
  if (!stats.spellUsage[spellName]) {
    stats.spellUsage[spellName] = { casts: 0, damage: 0, mana: 0 }
  }
  stats.spellUsage[spellName].casts++
  stats.spellUsage[spellName].damage += damage
  stats.spellUsage[spellName].mana += manaCost
}

/**
 * Track ability usage (uses, damage)
 */
export function trackAbilityUsage(stats: RunTally, abilityName: string, damage: number): void {
  if (!stats.abilityUsage[abilityName]) {
    stats.abilityUsage[abilityName] = { uses: 0, damage: 0 }
  }
  stats.abilityUsage[abilityName].uses++
  stats.abilityUsage[abilityName].damage += damage
}

/**
 * Check and track close calls (HP dropped below 20% but survived)
 */
export function checkCloseCall(stats: RunTally, hp: number, maxHp: number): void {
  if (hp > 0 && hp < maxHp * 0.2) {
    stats.closeCalls++
  }
}
