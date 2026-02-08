/**
 * Knowledge Effects Module
 *
 * Pure functions for computing combat bonuses from bestiary kill counts.
 * Players deal more damage to and take less damage from familiar monsters.
 *
 * Balance:
 * - 1 kill = 1% bonus (linear phase)
 * - 100 kills = 10% (softcap, linear phase ends)
 * - 10,000 kills = 25% (hard cap)
 * - Bonus applies to both damage dealt AND damage reduction
 */

import type { BestiaryEntry } from '@/types/progression'

// ============================================================================
// TYPES
// ============================================================================

/** Combat bonuses from monster knowledge */
export interface KnowledgeBonuses {
  damagePercent: number // +X% damage dealt to this monster
  reductionPercent: number // -X% damage taken from this monster
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Kills needed to reach the softcap (end of linear phase) */
const SOFTCAP_KILLS = 100

/** Bonus percentage at softcap */
const SOFTCAP_BONUS = 10

/** Default maximum bonus percentage (hard cap, with all bestiary mastery upgrades) */
const DEFAULT_HARDCAP = 25

// ============================================================================
// FORMULA
// ============================================================================

/**
 * Calculate knowledge bonus percentage from kill count
 *
 * Formula:
 * - 0 kills: 0%
 * - 1-100 kills: linear 1% per kill (1 kill = 1%, 100 kills = 10%)
 * - 100-10000 kills: logarithmic scaling from 10% to hardCap%
 * - 10000+ kills: capped at hardCap%
 *
 * @param kills - Number of times this monster has been killed
 * @param hardCap - Maximum bonus % (from Bestiary Mastery upgrade, default 10 base + 5/level)
 * @returns Bonus percentage (0 to hardCap)
 */
export function getKnowledgeBonus(kills: number, hardCap = DEFAULT_HARDCAP): number {
  if (kills <= 0) return 0

  // Linear phase: 1% per kill up to 10% at 100 kills (always available)
  if (kills <= SOFTCAP_KILLS) {
    return Math.min(hardCap, kills * (SOFTCAP_BONUS / SOFTCAP_KILLS))
  }

  // If cap is at or below softcap, no log phase needed
  if (hardCap <= SOFTCAP_BONUS) return hardCap

  // Logarithmic phase: 100-10000 kills scales 10% to hardCap%
  // log10(100) = 2, log10(10000) = 4
  // logProgress goes from 0 at 100 kills to 1 at 10000 kills
  const logProgress = (Math.log10(kills) - 2) / 2

  return Math.min(hardCap, SOFTCAP_BONUS + (hardCap - SOFTCAP_BONUS) * logProgress)
}

// ============================================================================
// COMPUTE BONUSES
// ============================================================================

/**
 * Get knowledge bonuses for a specific monster from the bestiary
 *
 * @param monsterName - Name of the monster (used as bestiary key)
 * @param bestiary - Bestiary data mapping monster names to kill counts
 * @param overrideBonusPercent - If >0, use this fixed bonus instead of computing from kills
 * @param hardCap - Maximum bonus % from Bestiary Mastery upgrade (default 25)
 * @returns Combat bonuses to apply
 */
export function getKnowledgeBonuses(
  monsterName: string,
  bestiary: Record<string, BestiaryEntry> | undefined,
  overrideBonusPercent = 0,
  hardCap = DEFAULT_HARDCAP
): KnowledgeBonuses {
  // If override is set, use it directly (for testing/balance tuning)
  if (overrideBonusPercent > 0) {
    return {
      damagePercent: overrideBonusPercent,
      reductionPercent: overrideBonusPercent,
    }
  }

  if (!bestiary) {
    return { damagePercent: 0, reductionPercent: 0 }
  }

  const entry = bestiary[monsterName]
  if (!entry) {
    return { damagePercent: 0, reductionPercent: 0 }
  }

  const bonus = getKnowledgeBonus(entry.kills, hardCap)

  // Same bonus applies to both damage dealt and damage reduction
  return {
    damagePercent: bonus,
    reductionPercent: bonus,
  }
}

// ============================================================================
// DEFAULT BONUSES
// ============================================================================

/** Default bonuses when no knowledge exists */
export const DEFAULT_KNOWLEDGE_BONUSES: KnowledgeBonuses = {
  damagePercent: 0,
  reductionPercent: 0,
}
