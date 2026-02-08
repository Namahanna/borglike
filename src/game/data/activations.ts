/**
 * Activation system for artifact abilities, racial powers, and consumable wands/rods
 *
 * Activations provide a unified interface for cooldown-based abilities from:
 * - Artifact equipped abilities (Phial's illuminate, Ringil's cold ball, etc.)
 * - Racial innate powers (Draconian breath weapon)
 * - Future: Wands and rods with charges
 */

import type { SpellDamageType, StatusEffectType } from '../types'

// ============================================================================
// TYPES
// ============================================================================

/** How the activation's availability is tracked */
export type ActivationMode = 'cooldown' | 'charges' | 'per_rest'

/** Effect categories for activations (overlaps with spells intentionally) */
export type ActivationEffectType =
  // Reuse from spells
  | 'damage'
  | 'aoe_damage'
  | 'heal'
  | 'buff'
  | 'teleport'
  // Activation-specific
  | 'illuminate'
  | 'debuff'
  | 'haste'

/** Template for an activation ability */
export interface ActivationTemplate {
  id: string
  name: string
  effectType: ActivationEffectType
  mode: ActivationMode
  /** Turns until usable again (for 'cooldown' mode) */
  cooldown?: number
  /** Turns between uses, reset on rest (for 'per_rest' mode) */
  restInterval?: number
  /** HP cost to use */
  hpCost?: number
  /** MP cost to use */
  mpCost?: number
  /** Base damage for damage effects */
  baseDamage?: number
  /** Damage type for elemental damage */
  damageType?: SpellDamageType
  /** Maximum targets for multi-target effects */
  maxTargets?: number
  /** AOE radius for area effects */
  aoeRadius?: number
  /** Buff effect to apply */
  buff?: { type: StatusEffectType; value: number; duration: number }
  /** Radius for illuminate effect */
  illuminateRadius?: number
  /** Description for UI */
  description: string
}

// ============================================================================
// ACTIVATION REGISTRY
// ============================================================================

export const ACTIVATIONS: Record<string, ActivationTemplate> = {
  // ---------------------------------------------------------------------------
  // Artifact Activations (from artifacts.ts)
  // ---------------------------------------------------------------------------

  illuminate_area: {
    id: 'illuminate_area',
    name: 'Illuminate Area',
    effectType: 'illuminate',
    mode: 'cooldown',
    cooldown: 50,
    illuminateRadius: 8,
    description: 'Lights up the surrounding area, revealing tiles and dispelling darkness.',
  },

  blind_monsters: {
    id: 'blind_monsters',
    name: 'Blind Monsters',
    effectType: 'debuff',
    mode: 'cooldown',
    cooldown: 40,
    maxTargets: 4,
    aoeRadius: 5,
    description: 'Blinds up to 4 nearby monsters, reducing their accuracy.',
  },

  fire_ball_72: {
    id: 'fire_ball_72',
    name: 'Fire Ball',
    effectType: 'aoe_damage',
    mode: 'cooldown',
    cooldown: 20,
    baseDamage: 72,
    damageType: 'fire',
    aoeRadius: 2,
    description: 'Hurls a ball of fire dealing 72 damage to enemies in a radius.',
  },

  cold_ball_100: {
    id: 'cold_ball_100',
    name: 'Cold Ball',
    effectType: 'aoe_damage',
    mode: 'cooldown',
    cooldown: 25,
    baseDamage: 100,
    damageType: 'cold',
    aoeRadius: 2,
    description: 'Unleashes a freezing blast dealing 100 cold damage in an area.',
  },

  haste_self: {
    id: 'haste_self',
    name: 'Haste Self',
    effectType: 'haste',
    mode: 'cooldown',
    cooldown: 100,
    buff: { type: 'speed', value: 10, duration: 50 },
    description: 'Grants +10 speed for 50 turns.',
  },

  // ---------------------------------------------------------------------------
  // Racial Activations
  // ---------------------------------------------------------------------------

  draconian_breath: {
    id: 'draconian_breath',
    name: 'Breath Weapon',
    effectType: 'aoe_damage',
    mode: 'per_rest',
    restInterval: 50,
    hpCost: 5,
    baseDamage: 0, // Calculated as level * 2
    aoeRadius: 3,
    maxTargets: 6,
    description:
      'Breathes a cone of elemental energy (fire, cold, or acid). Damage scales with level.',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get activation template by ID
 */
export function getActivationById(id: string): ActivationTemplate | undefined {
  return ACTIVATIONS[id]
}

/**
 * Parse artifact ability string to extract activation ID
 * Returns null if the ability is not an activation
 *
 * Examples:
 *   "Activation: Illuminate Area" -> "illuminate_area"
 *   "Activation: Fire Ball (72 damage)" -> "fire_ball_72"
 *   "Slay Evil" -> null (not an activation)
 */
export function parseArtifactActivation(ability: string): string | null {
  if (!ability.startsWith('Activation:')) return null

  const content = ability.replace('Activation:', '').trim()

  // Map known activation strings to IDs
  const mappings: Record<string, string> = {
    'Illuminate Area': 'illuminate_area',
    'Blind Monsters': 'blind_monsters',
    'Fire Ball (72 damage)': 'fire_ball_72',
    'Cold Ball (100 damage)': 'cold_ball_100',
    'Haste Self': 'haste_self',
  }

  return mappings[content] ?? null
}

/**
 * Get all activation IDs from an artifact's abilities
 */
export function getArtifactActivations(abilities: string[]): string[] {
  return abilities.map(parseArtifactActivation).filter((id): id is string => id !== null)
}

/**
 * Check if an artifact has any activations
 */
export function hasActivation(abilities: string[]): boolean {
  return abilities.some((a) => a.startsWith('Activation:'))
}

/**
 * Get random element for Draconian breath (fire, cold, or acid)
 */
export function getRandomBreathElement(): SpellDamageType {
  const elements: SpellDamageType[] = ['fire', 'cold', 'nature'] // nature = acid
  return elements[Math.floor(Math.random() * elements.length)] as SpellDamageType
}

/**
 * Calculate Draconian breath damage based on character level
 */
export function calculateBreathDamage(characterLevel: number): number {
  return characterLevel * 2
}
