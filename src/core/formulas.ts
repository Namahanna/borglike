/**
 * Formulas Module for Borglike
 *
 * Mathematical formulas for:
 * - Essence calculations (prestige currency)
 * - Prestige/reset mechanics
 * - XP/Level progression
 *
 * Sources:
 * - /work/open-loop-incremental/docs/research/patterns/tier-1-foundation/prestige-systems.md
 * - /work/borglike/docs/ANGBAND-LITE-DESIGN.md
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Prestige compression: 8x essence = 2x prestige currency (Cookie Clicker standard) */
const PRESTIGE_CUBE_ROOT = 1 / 3

/** XP curve exponent for character leveling (polynomial scaling) */
const XP_CURVE_EXPONENT = 1.5

/** Base XP required for level 2 */
const BASE_XP_REQUIREMENT = 100

/** Maximum character level in a run */
const MAX_CHARACTER_LEVEL = 50

/** Dungeon depth constants from ANGBAND-LITE-DESIGN.md */
const DUNGEON = {
  MAX_DEPTH: 50,
  SHALLOW_END: 10,
  MID_END: 25,
  DEEP_END: 40,
  BOSS_DEPTH: 50,
} as const

/** Essence rewards from ANGBAND-LITE-DESIGN.md */
const ESSENCE_REWARDS = {
  DEATH_DEPTH_10: 50,
  DEATH_DEPTH_25: 200,
  DEATH_DEPTH_40: 500,
  VICTORY_BASE: 2000,
  KILL_MIN: 1,
  KILL_MAX: 10,
} as const

// ============================================================================
// ESSENCE FORMULAS (PRESTIGE CURRENCY)
// ============================================================================

/**
 * Calculate essence earned from death.
 *
 * Death rewards scale with progress made during the run.
 * Uses piecewise formula based on depth milestones.
 *
 * @param depth - Depth at death
 * @param kills - Total monster kills this run
 * @param gold - Gold collected this run
 * @returns Total essence earned from this death
 */
export function essenceFromDeath(depth: number, kills: number, gold: number): number {
  let baseEssence = 0

  // Depth-based milestone rewards (piecewise)
  if (depth >= DUNGEON.DEEP_END) {
    baseEssence = ESSENCE_REWARDS.DEATH_DEPTH_40
  } else if (depth >= DUNGEON.MID_END) {
    baseEssence = ESSENCE_REWARDS.DEATH_DEPTH_25
  } else if (depth >= DUNGEON.SHALLOW_END) {
    baseEssence = ESSENCE_REWARDS.DEATH_DEPTH_10
  } else {
    // Shallow death: small consolation prize
    baseEssence = Math.floor(depth * 2)
  }

  // Bonus for kills (diminishing returns with sqrt)
  const killBonus = Math.floor(Math.sqrt(kills) * 2)

  // Bonus for gold (strong diminishing returns with log)
  const goldBonus = gold > 0 ? Math.floor(Math.log10(gold + 1) * 5) : 0

  return baseEssence + killBonus + goldBonus
}

/**
 * Calculate essence earned from victory (completing depth 50).
 *
 * Victory provides a large base bonus plus scaling rewards.
 *
 * @param _depth - Always 50 for victory, but passed for consistency
 * @param kills - Total monster kills this run
 * @param turnsTaken - Optional: fewer turns = bonus (speedrun reward)
 * @returns Total essence earned from victory
 */
export function essenceFromVictory(_depth: number, kills: number, turnsTaken: number = 0): number {
  const baseEssence = ESSENCE_REWARDS.VICTORY_BASE

  // Kill bonus (linear scaling for victory)
  const killBonus = Math.floor(kills * 0.5)

  // Speedrun bonus: fewer turns = more essence
  // Target: ~18000 turns for "normal" win (30 min at ~10 turns/sec)
  const speedrunBonus = turnsTaken > 0 ? Math.max(0, Math.floor((18000 - turnsTaken) / 100)) : 0

  return baseEssence + killBonus + speedrunBonus
}

// ============================================================================
// PRESTIGE FORMULAS
// ============================================================================

/**
 * Calculate prestige currency earned from total essence.
 *
 * Uses cube root compression (Cookie Clicker standard):
 * - 8x essence = 2x prestige currency
 * - Creates satisfying 90% time reduction per prestige
 *
 * @param totalEssence - Total essence ever earned
 * @param threshold - Essence required for first prestige point (default: 10000)
 * @returns Prestige currency (stars/prestiges)
 */
export function prestigeCurrency(totalEssence: number, threshold: number = 10000): number {
  if (totalEssence < threshold) return 0
  return Math.floor(Math.pow(totalEssence / threshold, PRESTIGE_CUBE_ROOT))
}

/**
 * Calculate essence needed for next prestige point.
 *
 * Inverse of prestigeCurrency: threshold * (targetPrestige)^3
 *
 * @param currentPrestige - Current prestige level
 * @param threshold - Essence required for first prestige
 * @returns Essence needed to reach next prestige level
 */
export function essenceForNextPrestige(currentPrestige: number, threshold: number = 10000): number {
  const targetPrestige = currentPrestige + 1
  return Math.ceil(threshold * Math.pow(targetPrestige, 3))
}

/**
 * Calculate the global multiplier from prestige level.
 *
 * Each prestige provides compounding bonuses to essence gain.
 * Based on ANGBAND-LITE-DESIGN.md prestige table.
 *
 * @param prestigeLevel - Current prestige level (0 = no prestige yet)
 * @returns Essence multiplier (1.0 = no bonus)
 */
export function prestigeMultiplier(prestigeLevel: number): number {
  if (prestigeLevel <= 0) return 1.0

  // Prestige 1-4 have specific values
  const baseMultipliers = [1.0, 1.5, 2.0, 3.0, 4.5]

  if (prestigeLevel < baseMultipliers.length) {
    return baseMultipliers[prestigeLevel]!
  }

  // Prestige 5+: +1.5x per level after 4
  return 4.5 + (prestigeLevel - 4) * 1.5
}

// ============================================================================
// CHARACTER PROGRESSION FORMULAS
// ============================================================================

/**
 * Calculate XP required to reach a given level.
 *
 * Two-part curve matching Angband's natural deceleration:
 *   L1-20:  100 * (L-1)^1.5     — unchanged, smooth early game
 *   L21-50: 8283 * ((L-1)/19)^4 — steep high-level curve (~1 level/depth from D20-50)
 *
 * The high-level exponent (4) compensates for monster XP growing ~depth^2.5
 * while the join at L20 is continuous (both formulas give 8283 at L=20).
 *
 * @param level - Target level (1-50)
 * @returns Total XP needed to reach that level
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  const clampedLevel = Math.min(level, MAX_CHARACTER_LEVEL)
  if (clampedLevel <= 20) {
    return Math.floor(BASE_XP_REQUIREMENT * Math.pow(clampedLevel - 1, XP_CURVE_EXPONENT))
  }
  // Continuous at L20: base20 = 100 * 19^1.5 ≈ 8283
  const base20 = BASE_XP_REQUIREMENT * Math.pow(19, XP_CURVE_EXPONENT)
  const HIGH_LEVEL_EXPONENT = 4
  return Math.floor(base20 * Math.pow((clampedLevel - 1) / 19, HIGH_LEVEL_EXPONENT))
}
