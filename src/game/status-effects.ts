/**
 * Status Effects System for Borglike
 *
 * Centralized handling of status effects, temporary resistances, and poison.
 * Used by game-loop, spell-resolution, and other modules.
 */

import type {
  Character,
  StatusEffect,
  TempResistance,
  GameState,
  GameMessage,
  MessageTag,
  MessageImportance,
} from './types'
import { recalculateAllStats } from './modifiers'

// ============================================================================
// STATUS PROTECTIONS (from equipment abilities)
// ============================================================================

/** Map protection ability strings to status effect types they prevent */
const PROTECTION_MAP: Record<string, StatusEffect['type'][]> = {
  'Protection from Fear': ['terrified'],
  'Protection from Blindness': ['blind'],
  'Protection from Confusion': ['confused'],
  'Protect Blind': ['blind'], // Amulet of the Magi variant
  'Free Action': ['paralyzed', 'slowed'],
}

/**
 * Check if character has protection against a status effect from equipment
 *
 * Scans all equipped items for protection abilities.
 *
 * @param character - The character to check
 * @param statusType - The status effect type to check protection for
 * @returns true if character is protected from this status
 */
export function hasProtectionFrom(character: Character, statusType: StatusEffect['type']): boolean {
  // Check all equipped items
  for (const item of Object.values(character.equipment)) {
    if (!item) continue

    // Check artifact abilities
    if (item.artifact?.abilities) {
      for (const ability of item.artifact.abilities) {
        const protectedTypes = PROTECTION_MAP[ability]
        if (protectedTypes?.includes(statusType)) {
          return true
        }
      }
    }

    // Check template abilities (rings/amulets)
    if (item.template.abilities) {
      for (const ability of item.template.abilities) {
        const protectedTypes = PROTECTION_MAP[ability]
        if (protectedTypes?.includes(statusType)) {
          return true
        }
      }
    }
  }

  // WARRIOR BRAVERY_30: Fear immunity at level 30+
  if (statusType === 'terrified' && hasStatusEffect(character, 'immunity_fear')) {
    return true
  }

  return false
}

/**
 * Check if character has a specific ability from any equipped item
 *
 * Used for abilities like Regeneration, Telepathy, etc.
 *
 * @param character - The character to check
 * @param abilityName - The ability string to look for (exact match)
 * @returns true if any equipped item has this ability
 */
export function hasEquipmentAbility(character: Character, abilityName: string): boolean {
  for (const item of Object.values(character.equipment)) {
    if (!item) continue

    // Check artifact abilities
    if (item.artifact?.abilities?.includes(abilityName)) {
      return true
    }

    // Check template abilities (rings/amulets)
    if (item.template.abilities?.includes(abilityName)) {
      return true
    }
  }

  return false
}

// ============================================================================
// STATUS EFFECTS
// ============================================================================

/**
 * Add or replace a status effect on a character
 * Replaces existing effect of same type
 */
export function addStatusEffect(character: Character, effect: StatusEffect): void {
  character.statusEffects = character.statusEffects.filter((e) => e.type !== effect.type)
  character.statusEffects.push(effect)
  recalculateAllStats(character)
}

/**
 * Remove a status effect by type
 */
export function removeStatusEffect(character: Character, type: StatusEffect['type']): void {
  character.statusEffects = character.statusEffects.filter((e) => e.type !== type)
  recalculateAllStats(character)
}

/**
 * Check if character has a specific status effect
 */
export function hasStatusEffect(character: Character, type: StatusEffect['type']): boolean {
  return character.statusEffects.some((e) => e.type === type)
}

/**
 * Get a specific status effect if it exists
 */
export function getStatusEffect(
  character: Character,
  type: StatusEffect['type']
): StatusEffect | null {
  return character.statusEffects.find((e) => e.type === type) ?? null
}

/**
 * Tick down status effects, removing expired ones
 * Returns list of expired effect types
 */
export function tickStatusEffects(character: Character): StatusEffect['type'][] {
  const expired: StatusEffect['type'][] = []

  character.statusEffects = character.statusEffects.filter((effect) => {
    effect.turnsRemaining--
    if (effect.turnsRemaining <= 0) {
      expired.push(effect.type)
      return false
    }
    return true
  })

  // Recalculate stats if any stat-affecting effects expired
  if (expired.length > 0) {
    recalculateAllStats(character)
  }

  return expired
}

// ============================================================================
// TEMPORARY RESISTANCES
// ============================================================================

/**
 * Add or replace a temporary resistance on a character
 */
export function addTempResistance(character: Character, resistance: TempResistance): void {
  character.tempResistances = character.tempResistances.filter((r) => r.type !== resistance.type)
  character.tempResistances.push(resistance)
}

/**
 * Remove a temporary resistance by type
 */
export function removeTempResistance(character: Character, type: TempResistance['type']): void {
  character.tempResistances = character.tempResistances.filter((r) => r.type !== type)
}

/**
 * Check if character has a specific temporary resistance
 */
export function hasTempResistance(character: Character, type: TempResistance['type']): boolean {
  return character.tempResistances.some((r) => r.type === type)
}

/**
 * Get a specific temporary resistance if it exists
 */
export function getTempResistance(
  character: Character,
  type: TempResistance['type']
): TempResistance | null {
  return character.tempResistances.find((r) => r.type === type) ?? null
}

/**
 * Tick down temporary resistances, removing expired ones
 * Returns list of expired resistance types
 */
export function tickTempResistances(character: Character): TempResistance['type'][] {
  const expired: TempResistance['type'][] = []

  character.tempResistances = character.tempResistances.filter((r) => {
    r.turnsRemaining--
    if (r.turnsRemaining <= 0) {
      expired.push(r.type)
      return false
    }
    return true
  })

  return expired
}

// ============================================================================
// POISON (now uses standard StatusEffect with type 'poisoned')
// ============================================================================

/**
 * Apply poison to a character (damagePerTurn stored in value field)
 * If already poisoned, takes the worse of the two (max damage, max duration)
 */
export function applyPoison(
  character: Character,
  damagePerTurn: number,
  turnsRemaining: number
): void {
  const existing = getStatusEffect(character, 'poisoned')

  if (existing) {
    // Take the worse of the two
    existing.value = Math.max(existing.value, damagePerTurn)
    existing.turnsRemaining = Math.max(existing.turnsRemaining, turnsRemaining)
  } else {
    addStatusEffect(character, {
      type: 'poisoned',
      value: damagePerTurn,
      turnsRemaining,
    })
  }
}

/**
 * Clear poison from a character
 */
export function clearPoison(character: Character): void {
  removeStatusEffect(character, 'poisoned')
}

/**
 * Check if character is poisoned
 */
export function isPoisoned(character: Character): boolean {
  return hasStatusEffect(character, 'poisoned')
}

/**
 * Get poison damage per turn (0 if not poisoned)
 */
export function getPoisonDamage(character: Character): number {
  const poison = getStatusEffect(character, 'poisoned')
  return poison?.value ?? 0
}

/**
 * Get poison turns remaining (0 if not poisoned)
 */
export function getPoisonTurnsRemaining(character: Character): number {
  const poison = getStatusEffect(character, 'poisoned')
  return poison?.turnsRemaining ?? 0
}

// ============================================================================
// GAME STATE HELPERS
// ============================================================================

/**
 * Process poison damage on a character within game context
 * Handles damage application, death check, and messaging
 * Note: Duration tick is handled by tickStatusEffects()
 */
export function processPoison(
  game: GameState,
  addMessage: (
    game: GameState,
    text: string,
    type: GameMessage['type'],
    options?: { tags?: MessageTag[]; importance?: MessageImportance }
  ) => void
): void {
  const poison = getStatusEffect(game.character, 'poisoned')
  if (!poison) return

  const damage = poison.value
  game.character.hp -= damage
  addMessage(game, `You suffer ${damage} poison damage!`, 'danger', {
    tags: ['damage.poison'],
    importance: 1,
  })

  // Check for death from poison
  if (game.character.hp <= 0) {
    game.character.hp = 0
    game.character.isDead = true
  }
}

/**
 * Called after tickStatusEffects to check if poison just expired
 */
export function checkPoisonExpired(
  expired: StatusEffect['type'][],
  game: GameState,
  addMessage: (
    game: GameState,
    text: string,
    type: GameMessage['type'],
    options?: { tags?: MessageTag[]; importance?: MessageImportance }
  ) => void
): void {
  if (expired.includes('poisoned')) {
    addMessage(game, 'The poison wears off.', 'info', { tags: ['buff'], importance: 2 })
  }
}

// ============================================================================
// DEBUFF STATUS EFFECTS
// ============================================================================

/** List of debuff status types (including poisoned) */
export const DEBUFF_TYPES: StatusEffect['type'][] = [
  'blind',
  'confused',
  'paralyzed',
  'slowed',
  'terrified',
  'drained',
  'poisoned',
]

/**
 * Check if character has any debuff status effect
 */
export function hasAnyDebuff(character: Character): boolean {
  return character.statusEffects.some((e) => DEBUFF_TYPES.includes(e.type))
}

/**
 * Remove a status effect if present and return true if it was removed
 */
export function removeStatusEffectIfPresent(
  character: Character,
  type: StatusEffect['type']
): boolean {
  const had = character.statusEffects.some((e) => e.type === type)
  character.statusEffects = character.statusEffects.filter((e) => e.type !== type)
  if (had) recalculateAllStats(character)
  return had
}

/**
 * Remove all debuff status effects
 * Returns list of removed effect types
 */
export function removeAllDebuffs(character: Character): StatusEffect['type'][] {
  const removed: StatusEffect['type'][] = []

  character.statusEffects = character.statusEffects.filter((e) => {
    if (DEBUFF_TYPES.includes(e.type)) {
      removed.push(e.type)
      return false
    }
    return true
  })

  if (removed.length > 0) recalculateAllStats(character)
  return removed
}

/**
 * Check if character is paralyzed (cannot act)
 */
export function isParalyzed(character: Character): boolean {
  return hasStatusEffect(character, 'paralyzed')
}

/**
 * Check if character is confused (random movement 50%)
 */
export function isConfused(character: Character): boolean {
  return hasStatusEffect(character, 'confused')
}

/**
 * Check if character is blind (reduced FOV)
 */
export function isBlind(character: Character): boolean {
  return hasStatusEffect(character, 'blind')
}

/**
 * Check if character is terrified (cannot attack)
 */
export function isTerrified(character: Character): boolean {
  return hasStatusEffect(character, 'terrified')
}

/**
 * Check if character is slowed (-50% speed)
 */
export function isSlowed(character: Character): boolean {
  return hasStatusEffect(character, 'slowed')
}

/**
 * Check if character is drained (-20% all stats)
 */
export function isDrained(character: Character): boolean {
  return hasStatusEffect(character, 'drained')
}

/**
 * Get the speed modifier from slowed status
 * Returns the percentage reduction (0-100)
 */
export function getSlowedSpeedReduction(character: Character): number {
  const effect = getStatusEffect(character, 'slowed')
  return effect?.value ?? 0
}

/**
 * Get the stat modifier from drained status
 * Returns the percentage reduction to apply to all stats (0-100)
 */
export function getDrainedStatReduction(character: Character): number {
  const effect = getStatusEffect(character, 'drained')
  return effect?.value ?? 0
}

/**
 * Get the FOV reduction from blind status
 * Returns reduced light radius (1 when blind)
 */
export function getBlindFovRadius(): number {
  return 1 // Can only see adjacent tiles when blind
}

/**
 * Check and trigger Second Wind if applicable
 * Second Wind heals the character once when they drop to critical HP (≤20% max)
 */
export function checkSecondWind(
  game: GameState,
  addMessage: (
    game: GameState,
    text: string,
    type: GameMessage['type'],
    options?: { tags?: MessageTag[]; importance?: MessageImportance }
  ) => void
): boolean {
  const bonuses = game.boosterBonuses
  if (!bonuses?.hasSecondWind) return false
  if (game.usedSecondWind) return false
  if (game.character.isDead) return false

  // Check if at or below critical threshold (20% of max HP)
  const criticalThreshold = Math.floor(game.character.maxHp * 0.2)
  if (game.character.hp > 0 && game.character.hp <= criticalThreshold) {
    // Trigger Second Wind
    const healAmount = Math.floor(game.character.maxHp * (bonuses.secondWindPercent / 100))
    game.character.hp = Math.min(game.character.hp + healAmount, game.character.maxHp)
    game.usedSecondWind = true
    addMessage(game, `Second Wind! You recover ${healAmount} HP!`, 'good', {
      tags: ['healing'],
      importance: 4,
    })
    return true
  }

  return false
}
