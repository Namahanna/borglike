/**
 * Lighting system for dynamic FOV radius
 *
 * Calculates light radius based on:
 * - Equipped light source (torch, lantern, etc.)
 * - Artifact LIGHT bonuses
 * - Race infravision
 * - Depth penalties (deep dungeon is darker)
 * - Town is always fully lit
 */

import type { Character } from './types'
import { getRaceById } from './data/index'

/** Base light radius without any light source (groping in dark) */
const BASE_LIGHT_RADIUS = 1

/** Maximum FOV radius (also used for Town) */
export const MAX_FOV_RADIUS = 8

/**
 * Calculate the effective light radius for a character at a given depth
 *
 * @param character - The character to calculate light for
 * @param depth - Current dungeon depth (0 = Town)
 * @returns Light radius in tiles (2-8)
 */
export function calculateLightRadius(character: Character, depth: number): number {
  // Town is always fully lit
  if (depth === 0) return MAX_FOV_RADIUS

  // Blind characters can only see adjacent tiles
  const isBlind = character.statusEffects.some((e) => e.type === 'blind')
  if (isBlind) return 1

  let radius = BASE_LIGHT_RADIUS

  // Equipped light source provides its lightRadius
  const light = character.equipment.light
  if (light?.template.lightRadius) {
    radius = Math.max(radius, light.template.lightRadius)
  }

  // Artifact LIGHT bonuses from any equipped item
  for (const item of Object.values(character.equipment)) {
    if (item?.artifact?.bonuses?.LIGHT) {
      radius += item.artifact.bonuses.LIGHT
    }
    // Non-light equipment with lightRadius bonus (e.g., Ring of Light)
    if (item?.template.lightRadius && item.template.slot !== 'light') {
      radius += item.template.lightRadius
    }
  }

  // Race infravision (convert from Angband 10-ft increments to tiles)
  // Infravision values: 0-5, so this adds 0-2 tiles
  const race = getRaceById(character.raceId)
  if (race?.infravision) {
    radius += Math.floor(race.infravision / 2)
  }

  // Enhanced light from Light Orb spell
  const enhancedLight = character.statusEffects.find((e) => e.type === 'enhanced_light')
  if (enhancedLight) {
    radius += enhancedLight.value
  }

  // Depth penalty for very deep levels (optional darkening)
  // Depth 30+: 10% reduction
  // Depth 40+: 20% reduction
  if (depth > 40) {
    radius = Math.max(3, Math.floor(radius * 0.8))
  } else if (depth > 30) {
    radius = Math.max(3, Math.floor(radius * 0.9))
  }

  // Clamp to valid range
  return Math.min(radius, MAX_FOV_RADIUS)
}
