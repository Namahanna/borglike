/**
 * Personality System
 *
 * Defines bot personality configurations and provides functions
 * for tuning, validating, and describing personality parameters.
 *
 * Each personality parameter affects specific bot behaviors:
 * - aggression: How readily the bot engages in combat vs fleeing
 * - greed: How far the bot will detour for items
 * - caution: HP threshold for retreat (as percentage)
 * - exploration: How much to explore before descending (as percentage)
 * - patience: Maximum turns on a level before forcing descent
 */

import type { BotPersonality } from '../types'
import type { PersonalityConfig } from './types'
import type { GradedCapabilityField } from '@game/data/bot-upgrades'

// ============================================================================
// PERSONALITY CONFIGURATIONS
// ============================================================================

/**
 * Base personality configurations
 *
 * Each personality represents a distinct playstyle:
 * - cautious: Prioritizes survival, retreats early, explores thoroughly
 * - aggressive: Fights to low HP, seeks combat, progresses quickly
 * - greedy: Prioritizes items and gold, will detour for loot
 * - speedrunner: Beelines for stairs, ignores most items
 */
export const PERSONALITIES: Record<BotPersonality, PersonalityConfig> = {
  cautious: {
    aggression: 30, // Avoids unnecessary fights
    greed: 40, // Moderate item interest
    caution: 35, // Retreat at 35% HP (was 50)
    exploration: 80, // Explore 80% before descending
    patience: 200, // Wait up to 200 turns
  },
  aggressive: {
    aggression: 80, // Seeks out combat
    greed: 30, // Low item interest
    caution: 20, // Fight to 20% HP
    exploration: 60, // Moderate exploration
    patience: 150, // Move on after 150 turns
  },
  greedy: {
    aggression: 50, // Balanced combat approach
    greed: 80, // High item interest - detour far for items
    caution: 30, // Retreat at 30% HP (was 40)
    exploration: 90, // Explore thoroughly for loot
    patience: 300, // Very patient - look for all items
  },
  speedrunner: {
    aggression: 40, // Avoid fights when possible
    greed: 20, // Ignore most items
    caution: 25, // Retreat at 25% HP (was 35)
    exploration: 30, // Minimal exploration - beeline for stairs
    patience: 100, // Very impatient - descend quickly
  },
  custom: {
    aggression: 50, // Balanced defaults for custom
    greed: 50,
    caution: 40,
    exploration: 60,
    patience: 150,
  },
}

// ============================================================================
// PERSONALITY ACCESS
// ============================================================================

/**
 * Get personality configuration for a personality type
 */
export function getPersonalityConfig(personality: BotPersonality): PersonalityConfig {
  return PERSONALITIES[personality]
}

/**
 * Get all available personality types
 */
export function getPersonalityTypes(): BotPersonality[] {
  return Object.keys(PERSONALITIES) as BotPersonality[]
}

/**
 * Check if a string is a valid personality type
 */
export function isValidPersonality(value: string): value is BotPersonality {
  return value in PERSONALITIES
}

// ============================================================================
// PARAMETER DESCRIPTIONS
// ============================================================================

/** Parameter metadata for UI and debugging */
export interface ParameterInfo {
  name: string
  description: string
  min: number
  max: number
  unit: string
}

/** Information about each personality parameter */
export const PARAMETER_INFO: Record<keyof PersonalityConfig, ParameterInfo> = {
  aggression: {
    name: 'Aggression',
    description: 'How readily the bot engages in combat vs fleeing',
    min: 0,
    max: 100,
    unit: '%',
  },
  greed: {
    name: 'Greed',
    description: 'How far the bot will detour for items',
    min: 0,
    max: 100,
    unit: '%',
  },
  caution: {
    name: 'Caution',
    description: 'HP threshold for retreat',
    min: 0,
    max: 100,
    unit: '% HP',
  },
  exploration: {
    name: 'Exploration',
    description: 'How much to explore before descending',
    min: 0,
    max: 100,
    unit: '%',
  },
  patience: {
    name: 'Patience',
    description: 'Maximum turns on a level before forcing descent',
    min: 50,
    max: 500,
    unit: ' turns',
  },
}

// ============================================================================
// SLIDER UPGRADE GATES (which upgrade chain unlocks each slider at L2)
// ============================================================================

/** Maps each personality slider to the upgrade chain + level that unlocks it */
export const SLIDER_UPGRADE_GATES: Record<
  keyof PersonalityConfig,
  { field: GradedCapabilityField; level: number }
> = {
  aggression: { field: 'tactics', level: 2 },
  caution: { field: 'retreat', level: 2 },
  exploration: { field: 'sweep', level: 2 },
  patience: { field: 'preparedness', level: 2 },
  greed: { field: 'town', level: 2 },
}

// ============================================================================
// PERSONALITY TUNING
// ============================================================================

/**
 * Create a custom personality configuration
 * All parameters default to balanced values if not specified
 */
export function createCustomPersonality(
  overrides: Partial<PersonalityConfig> = {}
): PersonalityConfig {
  return {
    aggression: overrides.aggression ?? 50,
    greed: overrides.greed ?? 50,
    caution: overrides.caution ?? 40,
    exploration: overrides.exploration ?? 60,
    patience: overrides.patience ?? 150,
  }
}

/**
 * Blend two personalities together
 * @param a First personality
 * @param b Second personality
 * @param ratio Blend ratio (0 = all A, 1 = all B)
 */
export function blendPersonalities(
  a: PersonalityConfig,
  b: PersonalityConfig,
  ratio: number = 0.5
): PersonalityConfig {
  const clampedRatio = Math.max(0, Math.min(1, ratio))
  const blend = (va: number, vb: number) => Math.round(va * (1 - clampedRatio) + vb * clampedRatio)

  return {
    aggression: blend(a.aggression, b.aggression),
    greed: blend(a.greed, b.greed),
    caution: blend(a.caution, b.caution),
    exploration: blend(a.exploration, b.exploration),
    patience: blend(a.patience, b.patience),
  }
}

/**
 * Apply a modifier to a personality
 * Modifier values are added to base values and clamped to valid ranges
 */
export function modifyPersonality(
  base: PersonalityConfig,
  modifiers: Partial<PersonalityConfig>
): PersonalityConfig {
  return {
    aggression: clampParam(base.aggression + (modifiers.aggression ?? 0), 0, 100),
    greed: clampParam(base.greed + (modifiers.greed ?? 0), 0, 100),
    caution: clampParam(base.caution + (modifiers.caution ?? 0), 0, 100),
    exploration: clampParam(base.exploration + (modifiers.exploration ?? 0), 0, 100),
    patience: clampParam(base.patience + (modifiers.patience ?? 0), 50, 500),
  }
}

/**
 * Validate a personality configuration
 * Returns array of validation errors (empty if valid)
 */
export function validatePersonality(config: PersonalityConfig): string[] {
  const errors: string[] = []

  if (config.aggression < 0 || config.aggression > 100) {
    errors.push(`Aggression must be 0-100 (got ${config.aggression})`)
  }
  if (config.greed < 0 || config.greed > 100) {
    errors.push(`Greed must be 0-100 (got ${config.greed})`)
  }
  if (config.caution < 0 || config.caution > 100) {
    errors.push(`Caution must be 0-100 (got ${config.caution})`)
  }
  if (config.exploration < 0 || config.exploration > 100) {
    errors.push(`Exploration must be 0-100 (got ${config.exploration})`)
  }
  if (config.patience < 50 || config.patience > 500) {
    errors.push(`Patience must be 50-500 (got ${config.patience})`)
  }

  return errors
}

// ============================================================================
// PERSONALITY DESCRIPTIONS
// ============================================================================

/**
 * Get a human-readable description of a personality
 */
export function describePersonality(personality: BotPersonality): string {
  switch (personality) {
    case 'cautious':
      return 'Prioritizes survival. Retreats at 50% HP, explores thoroughly before descending, and avoids unnecessary fights.'
    case 'aggressive':
      return 'Seeks combat and pushes forward. Fights to 20% HP before retreating, explores moderately, and progresses quickly.'
    case 'greedy':
      return 'Prioritizes items and gold. Will detour far for loot, explores very thoroughly, and is very patient.'
    case 'speedrunner':
      return 'Beelines for stairs. Ignores most items, explores minimally, and descends as quickly as possible.'
    case 'custom':
      return 'Player-tuned personality sliders. Adjust individual parameters for fine-grained control.'
    default:
      return 'Unknown personality type'
  }
}

/**
 * Get a short summary of personality stats
 */
export function summarizePersonality(config: PersonalityConfig): string {
  const parts: string[] = []

  if (config.aggression >= 70) parts.push('very aggressive')
  else if (config.aggression >= 50) parts.push('balanced combat')
  else if (config.aggression >= 30) parts.push('defensive')
  else parts.push('very defensive')

  if (config.greed >= 70) parts.push('loot-focused')
  else if (config.greed <= 30) parts.push('ignores items')

  if (config.caution >= 60) parts.push('retreats early')
  else if (config.caution <= 25) parts.push('fights to low HP')

  if (config.exploration >= 80) parts.push('thorough explorer')
  else if (config.exploration <= 40) parts.push('minimal exploration')

  if (config.patience >= 250) parts.push('very patient')
  else if (config.patience <= 120) parts.push('impatient')

  return parts.join(', ')
}

/**
 * Compare two personalities and describe differences
 */
export function comparePersonalities(
  a: PersonalityConfig,
  b: PersonalityConfig
): Record<keyof PersonalityConfig, number> {
  return {
    aggression: b.aggression - a.aggression,
    greed: b.greed - a.greed,
    caution: b.caution - a.caution,
    exploration: b.exploration - a.exploration,
    patience: b.patience - a.patience,
  }
}

// ============================================================================
// BEHAVIOR PREDICTIONS
// ============================================================================

/**
 * Predict combat behavior based on personality
 */
export function predictCombatBehavior(config: PersonalityConfig): {
  engageWillingly: boolean
  retreatEarly: boolean
  fightToLowHP: boolean
} {
  return {
    engageWillingly: config.aggression >= 60,
    retreatEarly: config.caution >= 50,
    fightToLowHP: config.caution <= 25,
  }
}

/**
 * Predict exploration behavior based on personality
 */
export function predictExplorationBehavior(config: PersonalityConfig): {
  thoroughExplorer: boolean
  speedrunner: boolean
  itemCollector: boolean
  maxTurnsPerLevel: number
} {
  return {
    thoroughExplorer: config.exploration >= 70,
    speedrunner: config.exploration <= 40 && config.greed <= 30,
    itemCollector: config.greed >= 60,
    maxTurnsPerLevel: config.patience,
  }
}

/**
 * Calculate effective item detour distance
 * Higher greed = willing to walk further for items
 */
export function getItemDetourDistance(config: PersonalityConfig): number {
  // Base distance + greed bonus
  // At greed 0: distance 3
  // At greed 100: distance 13
  return 3 + Math.floor(config.greed / 10)
}

/**
 * Calculate effective danger threshold
 * Based on aggression and caution
 */
export function getEffectiveDangerThreshold(config: PersonalityConfig): number {
  // Higher aggression = tolerate more danger
  // Higher caution = tolerate less danger
  const base = 50
  const aggressionBonus = (config.aggression - 50) * 0.5
  const cautionPenalty = (config.caution - 50) * 0.3
  return Math.round(base + aggressionBonus - cautionPenalty)
}

// ============================================================================
// HELPERS
// ============================================================================

function clampParam(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

// ============================================================================
// DEBUG
// ============================================================================

/**
 * Get debug string for a personality
 */
export function getPersonalityDebugInfo(personality: BotPersonality): string {
  const config = PERSONALITIES[personality]
  const lines = [
    `Personality: ${personality}`,
    `  Aggression: ${config.aggression}%`,
    `  Greed: ${config.greed}%`,
    `  Caution: ${config.caution}% HP`,
    `  Exploration: ${config.exploration}%`,
    `  Patience: ${config.patience} turns`,
    `  Summary: ${summarizePersonality(config)}`,
  ]
  return lines.join('\n')
}
