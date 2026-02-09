/**
 * Shared config-parsing utilities for runner and worker.
 *
 * Uses relative imports for src/ because Tinypool workers
 * can't resolve path aliases at runtime.
 */

import { computeBoosterBonuses, computeClassBoosterBonuses } from '../../../src/game/booster-effects'
import {
  DEFAULT_BOT_CAPABILITIES,
  FULL_BOT_CAPABILITIES,
  type BotCapabilities,
} from '../../../src/types/progression'

// ============================================================================
// CAPABILITIES
// ============================================================================

/** Named capability presets for progression testing. */
export const CAPABILITY_PRESETS: Record<string, string> = {
  early: 'town_1,farming,tactics_1,preparedness_1,targeting_1,retreat_1',
  mid: 'town_2,farming,tactics_2,preparedness_2,sweep_1,surf_1,kiting_1,targeting_2,retreat_2',
  late: 'town_3,farming,tactics_3,preparedness_3,sweep_2,surf_2,kiting_2,targeting_3,retreat_3',
}

/**
 * Parse capabilities spec string into BotCapabilities object.
 *
 * @param spec - 'none', 'full', preset name, or comma-separated IDs like 'town_1,farming,sweep_2'
 */
export function parseCapabilities(spec: string): BotCapabilities {
  const normalized = spec.toLowerCase().trim()

  const preset = CAPABILITY_PRESETS[normalized]
  if (preset) {
    return parseCapabilities(preset)
  }

  if (normalized === 'none' || normalized === 'face-rush') {
    return { ...DEFAULT_BOT_CAPABILITIES }
  }
  if (normalized === 'full') {
    return { ...FULL_BOT_CAPABILITIES }
  }

  const caps: BotCapabilities = { ...DEFAULT_BOT_CAPABILITIES }
  const ids = normalized.split(',').map((s) => s.trim()).filter(Boolean)

  for (const id of ids) {
    if (id === 'farming') caps.farming = true
    else if (id.startsWith('tactics_')) {
      const level = parseInt(id.slice(8), 10)
      if (level >= 1 && level <= 3) caps.tactics = Math.max(caps.tactics, level)
    }
    else if (id.startsWith('town_')) {
      const level = parseInt(id.slice(5), 10)
      if (level >= 1 && level <= 3) caps.town = Math.max(caps.town, level)
    }
    else if (id.startsWith('preparedness_')) {
      const level = parseInt(id.slice(13), 10)
      if (level >= 1 && level <= 3) caps.preparedness = Math.max(caps.preparedness, level)
    }
    else if (id.startsWith('sweep_')) {
      const level = parseInt(id.slice(6), 10)
      if (level >= 1 && level <= 3) caps.sweep = Math.max(caps.sweep, level)
    }
    else if (id.startsWith('surf_')) {
      const level = parseInt(id.slice(5), 10)
      if (level >= 1 && level <= 3) caps.surf = Math.max(caps.surf, level)
    }
    else if (id.startsWith('kiting_')) {
      const level = parseInt(id.slice(7), 10)
      if (level >= 1 && level <= 3) caps.kiting = Math.max(caps.kiting, level)
    }
    else if (id.startsWith('targeting_')) {
      const level = parseInt(id.slice(10), 10)
      if (level >= 1 && level <= 3) caps.targeting = Math.max(caps.targeting, level)
    }
    else if (id.startsWith('retreat_')) {
      const level = parseInt(id.slice(8), 10)
      if (level >= 1 && level <= 3) caps.retreat = Math.max(caps.retreat, level)
    }
  }

  return caps
}

// ============================================================================
// UPGRADES
// ============================================================================

/**
 * Parse custom upgrade string into UpgradeLevels.
 * Format: "vitality=3,might=2,resilience=1"
 */
export function parseCustomUpgrades(spec: string): Record<string, number> | null {
  if (!spec.includes('=')) return null

  const levels: Record<string, number> = {}
  const parts = spec.split(',').map(s => s.trim()).filter(Boolean)

  for (const part of parts) {
    const [id, levelStr] = part.split('=')
    if (id && levelStr) {
      const level = parseInt(levelStr, 10)
      if (!isNaN(level) && level > 0) {
        levels[id.trim()] = level
      }
    }
  }

  return Object.keys(levels).length > 0 ? levels : null
}

// ============================================================================
// BOOSTERS
// ============================================================================

/**
 * Resolve booster bonuses from a spec string and class ID.
 * 'none' = no boosters, 'class' = class default, or comma-separated IDs
 */
export function resolveBoosterBonuses(boosters: string | undefined, classId: string) {
  if (!boosters || boosters === 'none') {
    return undefined
  }
  if (boosters === 'class') {
    return computeClassBoosterBonuses(classId)
  }
  const boosterIds = boosters.split(',').map(s => s.trim()).filter(Boolean)
  if (boosterIds.length > 0) {
    return computeBoosterBonuses(boosterIds)
  }
  return undefined
}
