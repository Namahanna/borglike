/**
 * Druid Shapeshift Bot AI
 *
 * Three-form system: Cat (DPS), Bear (tank), Raven (escape).
 *
 * Combat Pattern:
 * 1. Approach in base form → volcanic_eruption + ice_storm + lightning_storm
 * 2. Enemy closes → Cat Form (DPS: +40% melee, speed 115, thorn_strike filler)
 * 3. HP < 40% → Bear Form (tank: +20 armor, CON+3, natures_balm heal)
 * 4. HP > 60% → back to Cat
 * 5. HP < 25% → Raven escape → heal → exit → base form → repeat
 */

import type { GameState, GameAction, Monster } from '../types'
import type { BotState, BotContext, DangerResult, DangerTier, DangerMap } from './types'
import { recordProgress } from './state'
import { getAvailableSpells } from '../spell-resolution'
import { getLocalDanger } from './danger'
import { getHealingSpellAction, getDamageSpellAction, getDebuffSpellAction } from './spells'
import { countAdjacentMonsters, findClosestMonster } from './combat'
import { canTransform } from '../actions/shapeshift'
import { findManaPotion } from './items'

// ============================================================================
// CONSTANTS
// ============================================================================

/** HP threshold to enter Raven Form (desperate escape) */
const RAVEN_ESCAPE_HP_THRESHOLD = 0.25

/** HP threshold to exit Raven Form (recovered enough) */
const RAVEN_EXIT_HP_THRESHOLD = 0.5

/** Enter Raven if this many adjacent enemies */
const RAVEN_ESCAPE_ADJACENT = 3

/** HP threshold below which bear form is defensive (switch from cat) */
const BEAR_DEFENSIVE_HP = 0.4

/** Mana buffer required for Bear (10 form + 5 for emergency heal) */
const BEAR_MANA_BUFFER = 15

/** Mana buffer required for Cat (10 form cost) */
const CAT_MANA_BUFFER = 10

/** HP threshold above which Cat Form is safe to use */
const CAT_HP_THRESHOLD = 0.5

// ============================================================================
// QUERIES
// ============================================================================

/** Check if class uses shapeshifting */
export function isShapeshifterClass(classId: string): boolean {
  return classId === 'druid'
}

/** Check if character is in Bear Form */
export function isInBearForm(character: { activeFormId: string | null }): boolean {
  return character.activeFormId === 'bear_form'
}

/** Check if character is in Raven Form */
export function isInRavenForm(character: { activeFormId: string | null }): boolean {
  return character.activeFormId === 'raven_form'
}

/** Check if character is in Cat Form */
export function isInCatForm(character: { activeFormId: string | null }): boolean {
  return character.activeFormId === 'cat_form'
}

/** Check if character is in any shapeshift form */
export function isInAnyForm(character: { activeFormId: string | null }): boolean {
  return character.activeFormId !== null
}

/** Check if Bear Form is available (level + mana) */
export function canEnterBearForm(game: GameState): boolean {
  return canTransform(game, 'bear_form')
}

/** Check if Raven Form is available (level + mana) */
export function canEnterRavenForm(game: GameState): boolean {
  return canTransform(game, 'raven_form')
}

/** Check if Cat Form is available (level ≥ 20 + mana) */
export function canEnterCatForm(game: GameState): boolean {
  return canTransform(game, 'cat_form')
}

// ============================================================================
// DECISION LOGIC
// ============================================================================

/**
 * Should the druid enter Bear Form?
 *
 * Enter Bear when:
 * - (HP < 40% AND adjacent enemy) — defensive switch (including from cat form)
 * - OR 3+ adjacent enemies (surrounded, need tank)
 */
export function shouldEnterBearForm(
  game: GameState,
  _visibleMonsters: Monster[],
  adjacentCount: number
): boolean {
  const character = game.character

  // Already in Bear Form
  if (isInBearForm(character)) return false

  // Can't enter Bear Form
  if (!canEnterBearForm(game)) return false

  // Need mana buffer for healing after entering
  if (character.mp < BEAR_MANA_BUFFER) return false

  const hpRatio = character.hp / character.maxHp

  // Defensive switch: hurt + adjacent (works from cat form too)
  if (hpRatio < BEAR_DEFENSIVE_HP && adjacentCount > 0) return true

  // Surrounded: need tank mode
  if (adjacentCount >= 3) return true

  return false
}

/**
 * Should the druid enter Cat Form?
 *
 * Enter Cat when:
 * - 1-2 adjacent enemies (not surrounded)
 * - HP > 50% (healthy enough for glass cannon)
 * - Level ≥ 20 (cat form requirement)
 * - Enough mana
 */
export function shouldEnterCatForm(
  game: GameState,
  _visibleMonsters: Monster[],
  adjacentCount: number
): boolean {
  const character = game.character

  // Already in Cat Form
  if (isInCatForm(character)) return false

  // Can't enter Cat Form
  if (!canEnterCatForm(game)) return false

  // Need mana buffer
  if (character.mp < CAT_MANA_BUFFER) return false

  // Only enter cat with 1-2 adjacent (not surrounded)
  if (adjacentCount < 1 || adjacentCount > 2) return false

  // Must be healthy enough — cat has -5 armor
  const hpRatio = character.hp / character.maxHp
  if (hpRatio <= CAT_HP_THRESHOLD) return false

  return true
}

/**
 * Should the druid enter Raven Form?
 *
 * Enter Raven when (emergency escape):
 * - HP < 25% with any visible threat
 * - OR 3+ adjacent enemies (surrounded)
 * - OR high danger + low HP combination
 */
export function shouldEnterRavenForm(
  game: GameState,
  dangers: DangerMap,
  adjacentCount: number,
  visibleMonsters: Monster[]
): boolean {
  const character = game.character

  // Already in Raven Form
  if (isInRavenForm(character)) return false

  // Can't enter Raven Form
  if (!canEnterRavenForm(game)) return false

  const hpRatio = character.hp / character.maxHp

  // Surrounded - escape!
  if (adjacentCount >= RAVEN_ESCAPE_ADJACENT) return true

  // Critical HP with any threat
  if (hpRatio < RAVEN_ESCAPE_HP_THRESHOLD && visibleMonsters.length > 0) return true

  // High local danger + hurt
  const localDanger = getLocalDanger(dangers, character.position)
  if (hpRatio < 0.4 && localDanger > 100) return true

  return false
}

/**
 * Should the druid exit current form?
 *
 * Bear Form exit: No adjacent AND closest > 5 tiles
 * Cat Form exit: No adjacent AND closest > 3 tiles (tighter — cat is fast)
 * Raven Form exit: HP > 50% AND no adjacent enemies
 */
export function shouldExitCurrentForm(
  game: GameState,
  visibleMonsters: Monster[],
  adjacentCount: number
): boolean {
  const character = game.character

  // Not in any form
  if (!isInAnyForm(character)) return false

  if (isInBearForm(character)) {
    if (adjacentCount > 0) return false
    if (visibleMonsters.length === 0) return true
    const closest = findClosestMonster(visibleMonsters, character.position)
    return closest !== null && closest.distance > 5
  }

  if (isInCatForm(character)) {
    if (adjacentCount > 0) return false
    if (visibleMonsters.length === 0) return true
    const closest = findClosestMonster(visibleMonsters, character.position)
    return closest !== null && closest.distance > 3
  }

  if (isInRavenForm(character)) {
    const hpRatio = character.hp / character.maxHp
    return hpRatio >= RAVEN_EXIT_HP_THRESHOLD && adjacentCount === 0
  }

  return false
}

// ============================================================================
// ACTION GETTERS
// ============================================================================

/**
 * Get shapeshift action if form change is needed.
 * Priority: Raven (emergency) > Bear (defensive) > Cat (DPS) > Exit (disengage)
 */
export function getShapeshiftAction(
  game: GameState,
  context: BotContext,
  dangers: DangerMap
): GameAction | null {
  const { visibleMonsters } = context
  const adjacentCount = countAdjacentMonsters(game, game.character.position)

  // Priority 1: Emergency escape via Raven
  if (shouldEnterRavenForm(game, dangers, adjacentCount, visibleMonsters)) {
    return { type: 'shapeshift', formId: 'raven_form' }
  }

  // Priority 2: Defensive switch to Bear (hurt + adjacent, or surrounded)
  if (shouldEnterBearForm(game, visibleMonsters, adjacentCount)) {
    return { type: 'shapeshift', formId: 'bear_form' }
  }

  // Priority 3: DPS via Cat (healthy + 1-2 adjacent)
  if (shouldEnterCatForm(game, visibleMonsters, adjacentCount)) {
    return { type: 'shapeshift', formId: 'cat_form' }
  }

  // Priority 4: Exit form if safe/recovered
  if (shouldExitCurrentForm(game, visibleMonsters, adjacentCount)) {
    return { type: 'shapeshift', formId: game.character.activeFormId! }
  }

  return null
}

/**
 * Get druid tier-specific action.
 * Integrates with the tier system for class-specific combat behavior.
 */
export function getDruidTierAction(
  game: GameState,
  context: BotContext,
  botState: BotState,
  dangerResult: DangerResult,
  tier: DangerTier,
  adjacentMonster: Monster | null
): GameAction | null {
  const character = game.character
  const pos = character.position
  const localDanger = getLocalDanger(dangerResult.dangers, pos)

  // Check for shapeshift action first (highest priority for druid)
  const shapeshiftAction = getShapeshiftAction(game, context, dangerResult.dangers)
  if (shapeshiftAction) {
    recordProgress(botState, game.turn)
    return shapeshiftAction
  }

  // Form-specific combat behavior
  if (isInCatForm(character)) {
    return getCatFormCombatAction(game, botState, adjacentMonster)
  }

  if (isInBearForm(character)) {
    return getBearFormCombatAction(game, context, botState, localDanger, tier, adjacentMonster)
  }

  if (isInRavenForm(character)) {
    return getRavenFormAction(game, context, botState, localDanger, tier)
  }

  // Base form: Full spellcasting + mana management
  return getBaseFormAction(game, context, botState, localDanger, tier, adjacentMonster)
}

/**
 * Cat Form combat: pure DPS, no healing (shift to bear to heal)
 */
function getCatFormCombatAction(
  game: GameState,
  botState: BotState,
  adjacentMonster: Monster | null
): GameAction | null {
  if (!adjacentMonster) return null

  const character = game.character

  // Thorn Strike for extra damage
  const available = getAvailableSpells(character, game.turn)
  const thornStrike = available.find((e) => e.canCast && e.spell.id === 'thorn_strike')
  if (thornStrike) {
    recordProgress(botState, game.turn)
    return { type: 'cast', spellId: 'thorn_strike', targetId: adjacentMonster.id }
  }

  // Melee attack (+40% melee damage from cat form)
  recordProgress(botState, game.turn)
  return { type: 'attack', targetId: adjacentMonster.id }
}

/**
 * Bear Form combat: tank with damage-before-heal when healthy
 */
function getBearFormCombatAction(
  game: GameState,
  context: BotContext,
  botState: BotState,
  localDanger: number,
  tier: DangerTier,
  adjacentMonster: Monster | null
): GameAction | null {
  const { config } = context
  const character = game.character
  const hpRatio = character.hp / character.maxHp

  if (tier === 'CRITICAL' || tier === 'DANGER') {
    if (hpRatio > 0.5 && adjacentMonster) {
      // Damage first when healthy enough: thorn_strike → melee → heal fallback
      const available = getAvailableSpells(character, game.turn)
      const thornStrike = available.find((e) => e.canCast && e.spell.id === 'thorn_strike')
      if (thornStrike) {
        recordProgress(botState, game.turn)
        return { type: 'cast', spellId: 'thorn_strike', targetId: adjacentMonster.id }
      }
      recordProgress(botState, game.turn)
      return { type: 'attack', targetId: adjacentMonster.id }
    }

    // HP ≤ 50%: heal first
    const healAction = getHealingSpellAction(game, config, localDanger, true)
    if (healAction) {
      recordProgress(botState, game.turn)
      return healAction
    }
  }

  // Thorn Strike for extra damage (if adjacent and spell available)
  if (adjacentMonster) {
    const available = getAvailableSpells(character, game.turn)
    const thornStrike = available.find((e) => e.canCast && e.spell.id === 'thorn_strike')
    if (thornStrike) {
      recordProgress(botState, game.turn)
      return { type: 'cast', spellId: 'thorn_strike', targetId: adjacentMonster.id }
    }
  }

  // Melee attack
  if (adjacentMonster) {
    recordProgress(botState, game.turn)
    return { type: 'attack', targetId: adjacentMonster.id }
  }

  // No adjacent - proactive healing in CAUTION/SAFE
  if (tier === 'CAUTION' || tier === 'SAFE') {
    if (hpRatio < 0.7) {
      const healAction = getHealingSpellAction(game, config, localDanger, true)
      if (healAction) {
        recordProgress(botState, game.turn)
        return healAction
      }
    }
  }

  return null
}

/**
 * Raven Form: Escape and heal, no combat
 */
function getRavenFormAction(
  game: GameState,
  context: BotContext,
  botState: BotState,
  localDanger: number,
  _tier: DangerTier
): GameAction | null {
  const { config } = context

  // In Raven, focus on healing to recover
  // Movement is handled by goal system (flee behavior)
  const healAction = getHealingSpellAction(game, config, localDanger, true)
  if (healAction) {
    recordProgress(botState, game.turn)
    return healAction
  }

  // Raven has +15 evasion and +20 speed - let movement system handle escape
  return null
}

/**
 * Base Form: Full spellcasting, damage-before-heal when healthy, mana management
 */
function getBaseFormAction(
  game: GameState,
  context: BotContext,
  botState: BotState,
  localDanger: number,
  tier: DangerTier,
  adjacentMonster: Monster | null
): GameAction | null {
  const { config, visibleMonsters } = context
  const character = game.character
  const hpRatio = character.hp / character.maxHp

  if (tier === 'CRITICAL' || tier === 'DANGER') {
    if (hpRatio > 0.5 && visibleMonsters.length > 0) {
      // Damage first when healthy: all spells available (including at adjacent targets)
      const damageAction = getDamageSpellAction(game, config, visibleMonsters)
      if (damageAction) {
        recordProgress(botState, game.turn)
        return damageAction
      }
    }

    // Heal when hurt
    const healAction = getHealingSpellAction(game, config, localDanger, true)
    if (healAction) {
      recordProgress(botState, game.turn)
      return healAction
    }

    // Damage fallback (if heal not needed or unavailable)
    if (visibleMonsters.length > 0) {
      const damageAction = getDamageSpellAction(game, config, visibleMonsters)
      if (damageAction) {
        recordProgress(botState, game.turn)
        return damageAction
      }
    }
  }

  // Cast damage spells at visible enemies (any range, including adjacent)
  if (visibleMonsters.length > 0) {
    // Debuff to slow approaching enemies
    const debuffAction = getDebuffSpellAction(game, config, visibleMonsters)
    if (debuffAction) {
      recordProgress(botState, game.turn)
      return debuffAction
    }

    // Damage spells at any target
    const damageAction = getDamageSpellAction(game, config, visibleMonsters)
    if (damageAction) {
      recordProgress(botState, game.turn)
      return damageAction
    }
  }

  // If adjacent in base form and can't shift, use thorn_strike
  if (adjacentMonster) {
    const available = getAvailableSpells(character, game.turn)
    const thornStrike = available.find((e) => e.canCast && e.spell.id === 'thorn_strike')
    if (thornStrike) {
      recordProgress(botState, game.turn)
      return { type: 'cast', spellId: 'thorn_strike', targetId: adjacentMonster.id }
    }
  }

  // Mana potion if MP < 15%
  const manaRatio = character.maxMp > 0 ? character.mp / character.maxMp : 1
  if (manaRatio < 0.15) {
    const manaPotion = findManaPotion(character)
    if (manaPotion) {
      recordProgress(botState, game.turn)
      return { type: 'use', itemId: manaPotion.id }
    }
  }

  // Proactive healing when safe
  if ((tier === 'CAUTION' || tier === 'SAFE') && !adjacentMonster) {
    if (hpRatio < 0.6) {
      const healAction = getHealingSpellAction(game, config, localDanger, true)
      if (healAction) {
        recordProgress(botState, game.turn)
        return healAction
      }
    }
  }

  return null
}
