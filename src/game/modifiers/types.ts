/**
 * Modifier System Types for Borglike
 *
 * Defines the unified stat modifier system that collects bonuses from all sources
 * (race, equipment, upgrades, forms, status effects) and applies them in a
 * consistent order.
 */

// ============================================================================
// MODIFIABLE STAT TARGETS
// ============================================================================

/**
 * All stats that can be modified by the modifier system.
 * Normalized to lowercase for consistency.
 */
export type ModifiableStatTarget =
  // Core stats
  | 'str'
  | 'dex'
  | 'con'
  | 'int'
  | 'wis'
  // Combat stats
  | 'maxHp'
  | 'maxMp'
  | 'armor'
  | 'accuracy'
  | 'evasion'
  | 'meleeDamage'
  | 'rangedDamage'
  | 'rangedAccuracy'
  | 'speed'
  // Special modifiers
  | 'critChance'

// ============================================================================
// MODIFIER TYPES
// ============================================================================

/**
 * How the modifier value is applied:
 * - flat: Added directly (e.g., +5 armor)
 * - percent: Added as percentage after flat (e.g., +20% damage)
 * - multiplier: Multiplied after percent (e.g., 1.5x for form bonus)
 */
export type ModifierType = 'flat' | 'percent' | 'multiplier'

/**
 * Where the modifier comes from (determines application order within type):
 * 1. base - From level-based calculations
 * 2. booster - From per-run boosters
 * 3. equipment - From equipped items
 * 4. upgrade - From meta-progression upgrades
 * 5. racial - From racial abilities
 * 6. form - From active shapeshift form
 * 7. status - From temporary status effects
 */
export type ModifierSource =
  | 'base'
  | 'booster'
  | 'equipment'
  | 'upgrade'
  | 'racial'
  | 'form'
  | 'status'

/**
 * A single stat modifier from any source
 */
export interface StatModifier {
  source: ModifierSource
  target: ModifiableStatTarget
  type: ModifierType
  value: number
  /** Optional description for debugging/tooltips */
  description?: string
}

// ============================================================================
// EFFECTIVE STATS
// ============================================================================

/**
 * Fully computed effective stats after all modifiers applied.
 * This is what the game should use for all calculations.
 */
export interface EffectiveStats {
  // Core stats (with equipment/form bonuses)
  str: number
  dex: number
  con: number
  int: number
  wis: number

  // Combat stats
  maxHp: number
  maxMp: number
  armor: number
  accuracy: number
  evasion: number
  meleeDamage: number
  rangedDamage: number
  rangedAccuracy: number
  speed: number

  // Special stats
  critChance: number
}

// ============================================================================
// COLLECTION RESULT
// ============================================================================

/**
 * Result of collecting all modifiers for a character.
 * Grouped by target stat for efficient application.
 */
export interface ModifierCollection {
  /** All modifiers grouped by target stat */
  byTarget: Map<ModifiableStatTarget, StatModifier[]>

  /** Add a modifier to the collection */
  add(modifier: StatModifier): void

  /** Add multiple modifiers */
  addAll(modifiers: StatModifier[]): void

  /** Get all modifiers for a specific stat */
  get(target: ModifiableStatTarget): StatModifier[]
}

/**
 * Create an empty modifier collection
 */
export function createModifierCollection(): ModifierCollection {
  const byTarget = new Map<ModifiableStatTarget, StatModifier[]>()

  return {
    byTarget,

    add(modifier: StatModifier): void {
      const existing = byTarget.get(modifier.target) ?? []
      existing.push(modifier)
      byTarget.set(modifier.target, existing)
    },

    addAll(modifiers: StatModifier[]): void {
      for (const mod of modifiers) {
        this.add(mod)
      }
    },

    get(target: ModifiableStatTarget): StatModifier[] {
      return byTarget.get(target) ?? []
    },
  }
}

// ============================================================================
// OPTIONS
// ============================================================================

/**
 * Options for getEffectiveStats calculation
 */
export interface EffectiveStatsOptions {
  /** Include status effect modifiers (default: true) */
  includeStatusEffects?: boolean

  /** Include active form modifiers (default: true) */
  includeFormModifiers?: boolean
}
