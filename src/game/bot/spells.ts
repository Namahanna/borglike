/**
 * Bot Spell Decision Making
 *
 * Handles spell casting decisions for magic-using classes.
 * Determines when to cast healing, damage, buff, and escape spells.
 */

import type { GameState, GameAction, Monster, Character, Point } from '../types'
import { chebyshevDistance, isMonsterAt } from '../types'
import type { PersonalityConfig, DangerMap } from './types'
import type { SpellTemplate } from '../data/spells'
import { getAvailableSpells, getNearestVisibleMonster, selectAOETargets } from '../spell-resolution'
import { getLocalDanger } from './danger'
import { countAdjacentMonsters, findClosestMonster } from './combat'
import { hasStatusEffect } from './items'
import { hasAbility, getDiceAverage } from '../data/monsters'
import { getMonsterEffectiveSpeed, hasLineOfSight } from '../monster-ai'
import { calculateLightRadius } from '../lighting'
import { getTile, isWalkable } from '../dungeon'
import { estimateDamageAfterArmor } from '../combat'

// ============================================================================
// RACE RESTRICTIONS
// ============================================================================

/**
 * Get castable spells for a character, respecting race restrictions.
 * GOLEM RESTRICTION: Golems cannot cast spells — returns empty array.
 * Combines the race gate with getAvailableSpells() so every spell function
 * only needs a single call instead of a two-step guard + fetch.
 */
function getCastableSpells(
  character: Character,
  turn: number
): { spell: SpellTemplate; canCast: boolean; reason?: string }[] {
  if (character.raceId === 'golem') return []
  return getAvailableSpells(character, turn)
}

// ============================================================================
// HEALING SPELLS
// ============================================================================

/**
 * Check if we should cast a healing spell
 *
 * Higher priority than potions for casters (mana is renewable, potions aren't)
 * Uses Angband-style graduated thresholds based on danger level.
 *
 * @param game - Current game state
 * @param config - Personality configuration
 * @param danger - Local danger value (damage potential from nearby monsters)
 * @param healsPriority - If true, heal more aggressively (Priest, Paladin)
 * @returns GameAction to cast a heal spell, or null if no healing needed/available
 */
export function getHealingSpellAction(
  game: GameState,
  config: PersonalityConfig,
  danger: number = 0,
  healsPriority: boolean = false
): GameAction | null {
  const character = game.character
  const hpRatio = character.hp / character.maxHp
  const hpDown = character.maxHp - character.hp

  // Angband-style graduated thresholds based on danger
  if (!evaluateHealNeed(hpRatio, danger, character.hp, config, healsPriority)) {
    return null
  }

  // Get available heal spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const healSpells = available.filter(
    (entry) =>
      entry.canCast && (entry.spell.effectType === 'heal' || entry.spell.effectType === 'lifedrain')
  )

  if (healSpells.length === 0) return null

  // Select appropriate heal based on wound size and danger
  const spell = selectHealSpell(healSpells, hpDown, danger)
  if (spell) {
    // Lifedrain requires a visible target to drain from
    if (spell.effectType === 'lifedrain') {
      const target = getNearestVisibleMonster(game)
      if (!target) {
        // No target for lifedrain - can't heal this way
        // Try pure heal fallback (in case selectHealSpell picked lifedrain over a pure heal)
        const pureHeals = healSpells.filter((e) => e.spell.effectType === 'heal')
        if (pureHeals.length > 0) {
          const fallback = selectHealSpell(pureHeals, hpDown, danger)
          if (fallback) {
            return { type: 'cast', spellId: fallback.id }
          }
        }
        return null
      }
      return { type: 'cast', spellId: spell.id, targetId: target.id }
    }
    return { type: 'cast', spellId: spell.id }
  }

  return null
}

/**
 * Evaluate whether healing is needed based on Angband-style graduated thresholds.
 * Lower HP = always heal, higher HP = only heal if danger is high.
 *
 * Classes with healsPriority (Priest, Paladin) heal more aggressively since
 * they have renewable spell healing and should reserve potions.
 */
function evaluateHealNeed(
  hpRatio: number,
  danger: number,
  currentHp: number,
  _config: PersonalityConfig,
  healsPriority: boolean = false
): boolean {
  // Always heal if danger exceeds current HP (would die next hit)
  if (danger >= currentHp) return true

  if (healsPriority) {
    // Priests/Paladins heal more aggressively with spells (mana is renewable)
    // This keeps them at higher HP and reserves potions for emergencies
    if (hpRatio < 0.4) return true // Always heal below 40%
    if (hpRatio < 0.6) return danger > 10 // Very low danger threshold
    if (hpRatio < 0.75) return danger > 30 // Low danger threshold
    if (hpRatio < 0.85) return danger > 60 // Moderate danger threshold
  } else {
    // Standard thresholds (Angband-style)
    // Lower HP = always heal, higher HP = only if danger justifies it
    if (hpRatio < 0.25) return true // Always heal below 25%
    if (hpRatio < 0.4) return danger > 20 // Heal at 40% if any real danger
    if (hpRatio < 0.55) return danger > 50 // Heal at 55% if moderate danger
    if (hpRatio < 0.7) return danger > 100 // Heal at 70% if high danger
  }

  return false
}

/**
 * Select the appropriate healing spell based on wound size and danger.
 * Implements anti-rope-a-dope: don't waste small heals against big danger.
 */
function selectHealSpell(
  healSpells: Array<{ spell: SpellTemplate; canCast: boolean }>,
  hpDown: number,
  danger: number
): SpellTemplate | null {
  // Anti-rope-a-dope: filter out heals that are too small relative to danger
  // A heal must restore at least 1/3 of the danger to be worthwhile
  const validHeals = healSpells.filter((entry) => {
    const estimatedHeal = entry.spell.level * 5 + 10
    // If danger is low, any heal is fine
    if (danger < 30) return true
    // Otherwise, heal must be meaningful relative to danger
    return estimatedHeal > danger / 3
  })

  // If no heals pass the anti-rope-a-dope filter, use best available anyway
  // (better to heal a little than die)
  const candidates = validHeals.length > 0 ? validHeals : healSpells

  // Prefer pure heals over lifedrain when we need reliable healing
  const pureHeals = candidates.filter((entry) => entry.spell.effectType === 'heal')
  const sortedCandidates = pureHeals.length > 0 ? pureHeals : candidates

  // Sort by spell level (higher = stronger heal)
  // Prefer larger heals when more wounded
  sortedCandidates.sort((a, b) => b.spell.level - a.spell.level)

  // If wound is small, use smallest adequate heal to conserve mana
  if (hpDown < 30) {
    // Reverse to get smallest first
    const smallest = [...sortedCandidates].sort((a, b) => a.spell.level - b.spell.level)
    return smallest[0]?.spell ?? null
  }

  // For larger wounds, use biggest heal
  return sortedCandidates[0]?.spell ?? null
}

// ============================================================================
// DAMAGE SPELLS
// ============================================================================

/**
 * Check if we should cast a damage spell
 *
 * Considers:
 * - Mana efficiency (don't waste mana on weak enemies)
 * - AOE opportunities (multiple targets)
 * - Distance (prefer ranged spells when not adjacent)
 * - Monster threat level
 *
 * @returns GameAction to cast a damage spell, or null if melee is better
 */
export function getDamageSpellAction(
  game: GameState,
  config: PersonalityConfig,
  visibleMonsters: Monster[]
): GameAction | null {
  const character = game.character

  if (visibleMonsters.length === 0) {
    return null
  }

  // Get available damage spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const damageSpells = available.filter(
    (entry) =>
      entry.canCast &&
      (entry.spell.effectType === 'damage' ||
        entry.spell.effectType === 'aoe_damage' ||
        entry.spell.effectType === 'lifedrain')
  )

  if (damageSpells.length === 0) {
    return null
  }

  // Check mana - don't cast if we're very low on mana
  const mpRatio = character.mp / character.maxMp
  if (mpRatio < 0.2 && !isInDanger(game, config)) {
    return null // Save mana for emergencies
  }

  // Find nearest monster
  const nearest = getNearestVisibleMonster(game)
  if (!nearest) return null

  const distToNearest =
    Math.abs(nearest.position.x - character.position.x) +
    Math.abs(nearest.position.y - character.position.y)

  // Check for AOE opportunities
  const aoeSpells = damageSpells.filter((entry) => entry.spell.effectType === 'aoe_damage')
  if (aoeSpells.length > 0 && visibleMonsters.length >= 2) {
    // Worth using AOE if 2+ targets
    const bestAoe = aoeSpells[0]
    if (bestAoe && bestAoe.spell.manaCost <= character.mp) {
      // Check if we can hit multiple targets
      const potentialTargets = selectAOETargets(game, bestAoe.spell.maxTargets ?? 3)
      if (potentialTargets.length >= 2) {
        return { type: 'cast', spellId: bestAoe.spell.id }
      }
    }
  }

  // Single target spell selection
  if (distToNearest > 1) {
    // Not adjacent - ranged spell is good
    // Prefer lifedrain if we're below full HP
    const hpRatio = character.hp / character.maxHp
    if (hpRatio < 0.8) {
      const lifedrain = damageSpells.find((entry) => entry.spell.effectType === 'lifedrain')
      if (lifedrain) {
        return { type: 'cast', spellId: lifedrain.spell.id, targetId: nearest.id }
      }
    }

    // Use most mana-efficient damage spell
    const sortedByEfficiency = damageSpells
      .filter((entry) => entry.spell.effectType !== 'aoe_damage')
      .sort((a, b) => {
        // Rough damage per mana estimate
        const aEff = (a.spell.level * 2) / a.spell.manaCost
        const bEff = (b.spell.level * 2) / b.spell.manaCost
        return bEff - aEff
      })

    if (sortedByEfficiency[0]) {
      return { type: 'cast', spellId: sortedByEfficiency[0].spell.id, targetId: nearest.id }
    }
  }

  // Adjacent - only cast if spell is worth it over melee
  // (e.g., lifedrain for sustain, or very high damage spell)
  if (distToNearest === 1) {
    const hpRatio = character.hp / character.maxHp

    // Lifedrain is always good when we need HP
    if (hpRatio < 0.7) {
      const lifedrain = damageSpells.find((entry) => entry.spell.effectType === 'lifedrain')
      if (lifedrain) {
        return { type: 'cast', spellId: lifedrain.spell.id, targetId: nearest.id }
      }
    }

    // High-level spells might outdamage melee
    const meleeDamage = character.combat.meleeDamage
    const highDamageSpell = damageSpells.find((entry) => {
      const estimatedDamage = entry.spell.level * 3 + 5
      return estimatedDamage > meleeDamage * 1.5 // 50% better than melee
    })

    if (highDamageSpell) {
      return { type: 'cast', spellId: highDamageSpell.spell.id, targetId: nearest.id }
    }
  }

  return null
}

// ============================================================================
// BUFF SPELLS
// ============================================================================

/**
 * Check if we should cast a buff spell
 *
 * Casts buffs when:
 * - Tactics L2+ capability is enabled
 * - Entering combat (enemies visible but not adjacent)
 * - Before descending to new level
 * - Buff has worn off
 *
 * @returns GameAction to cast a buff spell, or null
 */
export function getBuffSpellAction(
  game: GameState,
  _config: PersonalityConfig,
  visibleMonsters: Monster[],
  tacticsLevel: number = 3
): GameAction | null {
  // Gate behind tactics L2 (buffs)
  if (tacticsLevel < 2) return null

  const character = game.character

  // Get available buff spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const buffSpells = available.filter((entry) => entry.canCast && entry.spell.effectType === 'buff')

  if (buffSpells.length === 0) return null

  // Don't buff if mana is very low (save for healing/escape)
  if (character.mp < character.maxMp * 0.3) return null

  // Check if we already have active buffs
  const existingBuffTypes = character.statusEffects.map((e) => e.type)

  // Consider casting if enemies are visible but not adjacent
  const adjacentCount = countAdjacentMonsters(game, character.position)
  if (adjacentCount > 0) {
    // In melee - damage buffs worth casting mid-fight
    if (!existingBuffTypes.includes('damage_bonus')) {
      // Shadow Dance: powerful burst for tough fights (rogue)
      const shadowDance = buffSpells.find((entry) => entry.spell.id === 'shadow_dance')
      if (shadowDance) {
        return { type: 'cast', spellId: 'shadow_dance' }
      }
      // Envenom: standard damage buff (rogue)
      const envenom = buffSpells.find((entry) => entry.spell.id === 'envenom')
      if (envenom) {
        return { type: 'cast', spellId: 'envenom' }
      }
      // Dark Pact: damage buff at HP cost (necromancer/blackguard)
      const darkPact = buffSpells.find((entry) => entry.spell.id === 'dark_pact')
      if (darkPact && !hasStatusEffect(character, 'berserk') && character.hp > 20) {
        return { type: 'cast', spellId: 'dark_pact' }
      }
    }
    return null
  }

  if (visibleMonsters.length > 0) {
    // Enemies nearby but not adjacent - good time for buffs

    // Protection buffs: Shield > Cloak of Shadows > Mage Armor > Sanctuary
    if (!existingBuffTypes.includes('protection')) {
      const shield = buffSpells.find((entry) => entry.spell.id === 'shield')
      if (shield) {
        return { type: 'cast', spellId: 'shield' }
      }
      const cloak = buffSpells.find((entry) => entry.spell.id === 'cloak_of_shadows')
      if (cloak) {
        return { type: 'cast', spellId: 'cloak_of_shadows' }
      }
      const mageArmor = buffSpells.find((entry) => entry.spell.id === 'mage_armor')
      if (mageArmor) {
        return { type: 'cast', spellId: 'mage_armor' }
      }
    }

    // Damage buffs: Shadow Dance > Envenom > Hunter's Mark
    if (!existingBuffTypes.includes('damage_bonus')) {
      const shadowDance = buffSpells.find((entry) => entry.spell.id === 'shadow_dance')
      if (shadowDance) {
        return { type: 'cast', spellId: 'shadow_dance' }
      }
      const envenom = buffSpells.find((entry) => entry.spell.id === 'envenom')
      if (envenom) {
        return { type: 'cast', spellId: 'envenom' }
      }
    }

    // Bless for combat
    const bless = buffSpells.find((entry) => entry.spell.id === 'bless')
    if (bless && !existingBuffTypes.includes('blessing')) {
      return { type: 'cast', spellId: 'bless' }
    }

    // Sanctuary for tough fights (multiple enemies)
    if (visibleMonsters.length >= 2) {
      const sanctuary = buffSpells.find((entry) => entry.spell.id === 'sanctuary')
      if (sanctuary && !existingBuffTypes.includes('protection')) {
        return { type: 'cast', spellId: 'sanctuary' }
      }
    }

    // Elemental resistance: Resistance > Resist Elements
    // Resistance covers fire/cold/lightning/poison, Resist Elements only fire/cold
    const hasElementalEnemy = visibleMonsters.some(
      (m) =>
        hasAbility(m.template, 'FIRE') ||
        hasAbility(m.template, 'COLD') ||
        hasAbility(m.template, 'ELEC') ||
        hasAbility(m.template, 'POISON')
    )
    if (hasElementalEnemy) {
      // Check if we already have all relevant resistances
      const hasFire = character.tempResistances.some((r) => r.type === 'FIRE')
      const hasCold = character.tempResistances.some((r) => r.type === 'COLD')
      const hasLightning = character.tempResistances.some((r) => r.type === 'LIGHTNING')
      const hasPoison = character.tempResistances.some((r) => r.type === 'POISON')

      // Prefer Resistance spell (full coverage) over Resist Elements
      if (!hasFire || !hasCold || !hasLightning || !hasPoison) {
        const resistance = buffSpells.find((entry) => entry.spell.id === 'resistance')
        if (resistance) {
          return { type: 'cast', spellId: 'resistance' }
        }
      }

      // Fall back to Resist Elements if we don't have Resistance spell
      if (!hasFire || !hasCold) {
        const resistElements = buffSpells.find((entry) => entry.spell.id === 'resist_elements')
        if (resistElements) {
          return { type: 'cast', spellId: 'resist_elements' }
        }
      }
    }
  }

  return null
}

// ============================================================================
// ESCAPE/UTILITY SPELLS
// ============================================================================

/**
 * Check if we should cast an escape spell (teleport/phase door)
 *
 * Higher priority than scroll because spells are renewable
 *
 * @returns GameAction to cast an escape spell, or null
 */
export function getEscapeSpellAction(
  game: GameState,
  _config: PersonalityConfig,
  dangers: DangerMap
): GameAction | null {
  const character = game.character
  const hpRatio = character.hp / character.maxHp
  const pos = character.position

  // Check local danger
  const localDanger = getLocalDanger(dangers, pos)
  const adjacentCount = countAdjacentMonsters(game, pos)

  // Emergency teleport conditions:
  // - Very low HP + in danger
  // - Surrounded (3+ adjacent monsters)
  const isEmergency =
    (hpRatio < 0.2 && adjacentCount > 0) ||
    adjacentCount >= 3 ||
    (hpRatio < 0.3 && localDanger > 150)

  if (!isEmergency) return null

  // Get available teleport spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const teleportSpells = available.filter(
    (entry) => entry.canCast && entry.spell.effectType === 'teleport'
  )

  if (teleportSpells.length === 0) return null

  // Prefer full teleport for emergencies, phase door for tactical repositioning
  if (hpRatio < 0.15 || adjacentCount >= 3) {
    // Full emergency - use best teleport
    const fullTeleport = teleportSpells.find((entry) => entry.spell.teleportRange === 0)
    if (fullTeleport) {
      return { type: 'cast', spellId: fullTeleport.spell.id }
    }
  }

  // Phase door for moderate emergencies
  const phaseDoor = teleportSpells.find((entry) => (entry.spell.teleportRange ?? 0) > 0)
  if (phaseDoor) {
    return { type: 'cast', spellId: phaseDoor.spell.id }
  }

  // Use any teleport
  if (teleportSpells[0]) {
    return { type: 'cast', spellId: teleportSpells[0].spell.id }
  }

  return null
}

/**
 * Get a teleport/phase door spell without emergency checks
 * Used for proactive escape when entering DANGER tier with adjacent enemies
 */
export function getTeleportSpellAction(game: GameState): GameAction | null {
  const character = game.character

  const available = getCastableSpells(character, game.turn)
  const teleportSpells = available.filter(
    (entry) => entry.canCast && entry.spell.effectType === 'teleport'
  )

  if (teleportSpells.length === 0) return null

  // Prefer phase door (shorter range) for tactical repositioning
  const phaseDoor = teleportSpells.find((entry) => (entry.spell.teleportRange ?? 0) > 0)
  if (phaseDoor) {
    return { type: 'cast', spellId: phaseDoor.spell.id }
  }

  // Fall back to full teleport
  if (teleportSpells[0]) {
    return { type: 'cast', spellId: teleportSpells[0].spell.id }
  }

  return null
}

/**
 * Get Phase Door spell only (no full teleport fallback)
 * Used for DANGER tier tactical escape - stays in same area, goals remain valid
 * Only mage/archmage have this spell (at L1)
 */
export function getPhaseDoorSpellAction(game: GameState): GameAction | null {
  const character = game.character

  const available = getCastableSpells(character, game.turn)

  // Find phase door specifically (teleportRange > 0 means short-range)
  const phaseDoor = available.find(
    (entry) =>
      entry.canCast && entry.spell.effectType === 'teleport' && (entry.spell.teleportRange ?? 0) > 0
  )

  if (phaseDoor) {
    return { type: 'cast', spellId: phaseDoor.spell.id }
  }

  return null
}

/**
 * Check if we should cast a debuff spell
 *
 * Useful for:
 * - Slowing dangerous enemies
 * - Weakening strong melee monsters
 *
 * @returns GameAction to cast a debuff, or null
 */
export function getDebuffSpellAction(
  game: GameState,
  _config: PersonalityConfig,
  visibleMonsters: Monster[],
  tacticsLevel: number = 3
): GameAction | null {
  // Gate behind tactics L1 (debuffs)
  if (tacticsLevel < 1) return null

  const character = game.character

  if (visibleMonsters.length === 0) return null

  // Get available debuff spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const debuffSpells = available.filter(
    (entry) => entry.canCast && entry.spell.effectType === 'debuff'
  )

  if (debuffSpells.length === 0) return null

  // Priority 1: Slow FAST or HASTED monsters - breaks escape loops for squishies
  // Check effective speed (includes haste buff) OR explicit haste buff presence
  // Skip if already slowed with enough duration for kite cycle (DD cooldown = 4 turns)
  const MIN_SLOW_DURATION = 4
  const fastMonsters = visibleMonsters.filter((m) => {
    if (!m.isAwake) return false
    const existingSlow = m.debuffs.find((d) => d.type === 'slow')
    if (existingSlow && existingSlow.turnsRemaining >= MIN_SLOW_DURATION) return false
    const isHasted = m.buffs.some((b) => b.type === 'haste')
    const effectiveSpeed = getMonsterEffectiveSpeed(m)
    return effectiveSpeed > 110 || isHasted
  })
  if (fastMonsters.length > 0) {
    const slowSpell = debuffSpells.find((entry) => entry.spell.debuff?.type === 'slow')
    if (slowSpell) {
      // Target the fastest one (by effective speed)
      const fastest = fastMonsters.reduce((a, b) =>
        getMonsterEffectiveSpeed(a) > getMonsterEffectiveSpeed(b) ? a : b
      )
      return { type: 'cast', spellId: slowSpell.spell.id, targetId: fastest.id }
    }
  }

  // Priority 2: Slow TANKY monsters (HP > 50% of ours)
  // Skip if already slowed with enough duration for kite cycle
  const sortedByHp = [...visibleMonsters].sort((a, b) => b.hp - a.hp)
  const tankiestMonster = sortedByHp[0]

  if (!tankiestMonster) return null

  const existingSlow = tankiestMonster.debuffs.find((d) => d.type === 'slow')
  const hasEnoughSlow = existingSlow && existingSlow.turnsRemaining >= MIN_SLOW_DURATION
  const isTanky = tankiestMonster.hp > character.maxHp * 0.5

  if (isTanky && !hasEnoughSlow) {
    const slowSpell = debuffSpells.find((entry) => entry.spell.debuff?.type === 'slow')
    if (slowSpell) {
      return { type: 'cast', spellId: slowSpell.spell.id, targetId: tankiestMonster.id }
    }
  }

  // Priority 3: Weaken tanky monsters (if slow not available or already slowed)
  if (isTanky) {
    const weakenSpell = debuffSpells.find((entry) => entry.spell.debuff?.type === 'weaken')
    if (weakenSpell) {
      return { type: 'cast', spellId: weakenSpell.spell.id, targetId: tankiestMonster.id }
    }
  }

  return null
}

/**
 * Smart debuff action for DANGER tier
 *
 * Only slow monsters that are truly dangerous and worth the mana:
 * 1. Fast (effective speed > 110) OR hasted - the escape loop problem
 * 2. High damage relative to our HP (can kill in <= 4 hits after armor)
 * 3. NOT easily killable (HP > 2x our best spell damage)
 * 4. Only if we have mana left for escape after casting
 *
 * This follows Angband borg's "defense before damage" pattern for mages,
 * but with smart filtering to avoid wasting turns on weak targets.
 *
 * @returns GameAction to cast slow, or null
 */
export function getSmartDebuffAction(
  game: GameState,
  visibleMonsters: Monster[],
  tacticsLevel: number = 3
): GameAction | null {
  // Gate behind tactics L3 (smart debuffs)
  if (tacticsLevel < 3) return null

  const character = game.character

  if (visibleMonsters.length === 0) return null

  const available = getCastableSpells(character, game.turn)

  // Find slow spell
  const slowSpell = available.find(
    (entry) =>
      entry.canCast && entry.spell.effectType === 'debuff' && entry.spell.debuff?.type === 'slow'
  )
  if (!slowSpell) return null

  // Reserve mana for escape - phase door costs ~8-15 mana
  const ESCAPE_MANA_RESERVE = 20
  const manaAfterCast = character.mp - slowSpell.spell.manaCost
  if (manaAfterCast < ESCAPE_MANA_RESERVE) return null

  // Estimate our best spell damage (for "easily killable" check)
  const damageSpells = available.filter(
    (entry) =>
      entry.canCast &&
      (entry.spell.effectType === 'damage' || entry.spell.effectType === 'lifedrain')
  )
  const bestDamageSpell = damageSpells.sort((a, b) => b.spell.level - a.spell.level)[0]
  const estimatedSpellDamage = bestDamageSpell ? bestDamageSpell.spell.level * 3 + 10 : 0

  // Find monsters worth slowing: fast/hasted AND high damage AND not easily killed
  const worthSlowing = visibleMonsters.filter((m) => {
    // Must be awake
    if (!m.isAwake) return false

    // Must not already be slowed
    if (m.debuffs.some((d) => d.type === 'slow')) return false

    // Must be FAST (effective speed > 110) OR HASTED - the escape loop problem
    const isHasted = m.buffs.some((b) => b.type === 'haste')
    const effectiveSpeed = getMonsterEffectiveSpeed(m)
    if (effectiveSpeed <= 110 && !isHasted) return false

    // Calculate expected damage per turn after armor
    const rawDamage = m.template.attacks.reduce((sum, atk) => sum + getDiceAverage(atk.dice), 0)
    const effectiveDamage = estimateDamageAfterArmor(rawDamage, character)

    // Must be HIGH DAMAGE: can kill us in 4 or fewer hits
    const hitsToKill = effectiveDamage > 0 ? character.hp / effectiveDamage : Infinity
    if (hitsToKill > 4) return false

    // Must NOT be easily killable (HP > 2x our spell damage)
    // If we can blast it in 2 turns, no point slowing
    if (m.hp <= estimatedSpellDamage * 2) return false

    return true
  })

  if (worthSlowing.length === 0) return null

  // Target the most dangerous one (effective speed * damage)
  const target = worthSlowing.reduce((a, b) => {
    const aDamage = a.template.attacks.reduce((sum, atk) => sum + getDiceAverage(atk.dice), 0)
    const bDamage = b.template.attacks.reduce((sum, atk) => sum + getDiceAverage(atk.dice), 0)
    const aDanger = getMonsterEffectiveSpeed(a) * aDamage
    const bDanger = getMonsterEffectiveSpeed(b) * bDamage
    return aDanger > bDanger ? a : b
  })

  return { type: 'cast', spellId: slowSpell.spell.id, targetId: target.id }
}

// ============================================================================
// TELEPORT OTHER SPELL
// ============================================================================

/**
 * Get Teleport Other spell action for banishing dangerous monsters
 *
 * Angband-inspired crowd control: teleport away a single dangerous threat
 * when we're not surrounded (so we have escape routes)
 *
 * Conditions:
 * - NOT surrounded (1 or fewer adjacent monsters)
 * - Facing a dangerous threat (unique OR can kill us in <= 4 hits while HP < 50%)
 * - Have mana reserve for escape after casting (15 mana)
 *
 * @returns GameAction to cast teleport_other, or null
 */
export function getTeleportOtherAction(
  game: GameState,
  visibleMonsters: Monster[]
): GameAction | null {
  const character = game.character

  if (visibleMonsters.length === 0) return null

  // Get available spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const teleportOtherSpell = available.find(
    (entry) => entry.canCast && entry.spell.id === 'teleport_other'
  )

  if (!teleportOtherSpell) return null

  // Check mana reserve - need 15 mana for escape after casting
  const ESCAPE_MANA_RESERVE = 15
  const manaAfterCast = character.mp - teleportOtherSpell.spell.manaCost
  if (manaAfterCast < ESCAPE_MANA_RESERVE) return null

  // Don't use when surrounded (teleporting one away won't help)
  const adjacentCount = countAdjacentMonsters(game, character.position)
  if (adjacentCount > 1) return null

  // Find dangerous monsters worth banishing
  const dangerous = visibleMonsters.filter((m) => {
    if (!m.isAwake) return false

    // Unique monsters are always worth banishing
    if (m.template.flags?.includes('UNIQUE') || m.template.flags?.includes('BOSS')) {
      return true
    }

    // Check if monster can kill us in <= 4 hits while we're below 50% HP
    if (character.hp / character.maxHp >= 0.5) return false

    const rawDamage = m.template.attacks.reduce((sum, atk) => sum + getDiceAverage(atk.dice), 0)
    const effectiveDamage = estimateDamageAfterArmor(rawDamage, character)
    const hitsToKill = effectiveDamage > 0 ? character.hp / effectiveDamage : Infinity

    return hitsToKill <= 4
  })

  if (dangerous.length === 0) return null

  // Target the most dangerous: prioritize by threat/distance ratio
  // Closer dangerous monsters are more urgent
  const target = dangerous.reduce((a, b) => {
    const distA =
      Math.abs(a.position.x - character.position.x) + Math.abs(a.position.y - character.position.y)
    const distB =
      Math.abs(b.position.x - character.position.x) + Math.abs(b.position.y - character.position.y)

    // Threat = damage potential / distance (closer = more threatening)
    const damageA = a.template.attacks.reduce((sum, atk) => sum + getDiceAverage(atk.dice), 0)
    const damageB = b.template.attacks.reduce((sum, atk) => sum + getDiceAverage(atk.dice), 0)

    // Prioritize uniques over regular monsters
    const uniqueBonus = (m: Monster) =>
      m.template.flags?.includes('UNIQUE') || m.template.flags?.includes('BOSS') ? 100 : 0

    const threatA = (damageA + uniqueBonus(a)) / Math.max(1, distA)
    const threatB = (damageB + uniqueBonus(b)) / Math.max(1, distB)

    return threatA > threatB ? a : b
  })

  return { type: 'cast', spellId: 'teleport_other', targetId: target.id }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if character is currently in danger
 */
function isInDanger(game: GameState, config: PersonalityConfig): boolean {
  const hpRatio = game.character.hp / game.character.maxHp
  const cautionThreshold = config.caution / 100
  const adjacentCount = countAdjacentMonsters(game, game.character.position)

  return hpRatio < cautionThreshold || adjacentCount >= 2
}

/**
 * Get the best available spell for a given purpose
 */
export function getBestSpellForPurpose(
  game: GameState,
  purpose: 'damage' | 'heal' | 'escape' | 'buff'
): SpellTemplate | null {
  const available = getCastableSpells(game.character, game.turn)

  const matching = available.filter((entry) => {
    if (!entry.canCast) return false
    switch (purpose) {
      case 'damage':
        return (
          entry.spell.effectType === 'damage' ||
          entry.spell.effectType === 'aoe_damage' ||
          entry.spell.effectType === 'lifedrain'
        )
      case 'heal':
        return entry.spell.effectType === 'heal'
      case 'escape':
        return entry.spell.effectType === 'teleport'
      case 'buff':
        return entry.spell.effectType === 'buff'
      default:
        return false
    }
  })

  if (matching.length === 0) return null

  // Sort by level (higher = better)
  matching.sort((a, b) => b.spell.level - a.spell.level)
  return matching[0]?.spell ?? null
}

/**
 * Check if character can cast any damage spell right now
 * Used to determine if casters should get KITE goals
 */
export function hasCastableDamageSpell(game: GameState): boolean {
  const available = getCastableSpells(game.character, game.turn)
  return available.some(
    (entry) =>
      entry.canCast &&
      (entry.spell.effectType === 'damage' ||
        entry.spell.effectType === 'aoe_damage' ||
        entry.spell.effectType === 'lifedrain')
  )
}

// ============================================================================
// SHADOW STEP (Rogue offensive teleport)
// ============================================================================

/**
 * Check if Rogue should cast Shadow Step for burst damage
 *
 * Shadow Step teleports adjacent to a target and grants Sneak Attack (2.5x damage).
 * Use strategically:
 * - Only for Rogues
 * - Target bosses/uniques (worth the cooldown)
 * - Only when not already adjacent (would waste the teleport)
 * - Only when HP > 40% (don't engage when hurt)
 * - Only when we have Sneak Attack opportunity (no existing buff)
 *
 * @returns GameAction to cast shadow_step with target, or null
 */
export function getShadowStepAction(
  game: GameState,
  visibleMonsters: Monster[]
): GameAction | null {
  const character = game.character

  // Only Rogues have Shadow Step
  if (character.classId !== 'rogue') return null

  // Don't use when already have Sneak Attack buff (waste of cooldown)
  const hasSneakAttack = character.statusEffects.some((e) => e.type === 'sneak_attack')
  if (hasSneakAttack) return null

  // Don't engage when hurt (< 40% HP)
  const hpRatio = character.hp / character.maxHp
  if (hpRatio < 0.4) return null

  // Get Shadow Step spell (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const shadowStepSpell = available.find(
    (entry) => entry.canCast && entry.spell.id === 'shadow_step'
  )
  if (!shadowStepSpell) return null

  // Find worthy targets - bosses always, or high-threat monsters
  const worthyTargets = visibleMonsters.filter((m) => {
    if (!m.isAwake) return false

    // Must not already be adjacent
    const dx = Math.abs(m.position.x - character.position.x)
    const dy = Math.abs(m.position.y - character.position.y)
    if (dx <= 1 && dy <= 1) return false

    // Bosses/uniques are always worth the cooldown
    const isBoss = m.template.flags?.includes('UNIQUE') || m.template.flags?.includes('BOSS')
    if (isBoss) return true

    // High-threat monsters worth bursting (HP > 50% of ours OR high minDepth)
    const isHighThreat = m.hp > character.maxHp * 0.5 || m.template.minDepth >= character.depth - 5

    return isHighThreat
  })

  if (worthyTargets.length === 0) return null

  // Target priority: bosses first, then highest threat (minDepth)
  const sortedTargets = [...worthyTargets].sort((a, b) => {
    const aIsBoss = a.template.flags?.includes('UNIQUE') || a.template.flags?.includes('BOSS')
    const bIsBoss = b.template.flags?.includes('UNIQUE') || b.template.flags?.includes('BOSS')
    if (aIsBoss && !bIsBoss) return -1
    if (bIsBoss && !aIsBoss) return 1
    return b.template.minDepth - a.template.minDepth
  })
  const target = sortedTargets[0]!

  return { type: 'cast', spellId: 'shadow_step', targetId: target.id }
}

// ============================================================================
// ROOT/STUN SPELLS (for kiting)
// ============================================================================

/**
 * Check if we should cast root_shot to stun an enemy for kiting
 *
 * Used by Rangers to root enemies and back off
 */
export function getRootShotAction(game: GameState, adjacentMonster: Monster): GameAction | null {
  const character = game.character

  // Get available spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)

  // Look for root_shot specifically (damage spell with 100% slow = stun)
  const rootShot = available.find((entry) => entry.canCast && entry.spell.id === 'root_shot')

  if (rootShot) {
    // Check if monster is already rooted/slowed
    const isAlreadySlowed = adjacentMonster.debuffs.some(
      (d) => d.type === 'slow' && d.turnsRemaining > 1
    )
    if (!isAlreadySlowed) {
      return { type: 'cast', spellId: 'root_shot', targetId: adjacentMonster.id }
    }
  }

  return null
}

// ============================================================================
// SUMMON SPELLS
// ============================================================================

/**
 * Check if we should cast a summon spell
 *
 * Priorities:
 * - Ranger: Summon wolf immediately if no wolf companion (proactive)
 * - Necromancer: Summon skeleton proactively or when enemies visible
 *
 * @returns GameAction to cast summon spell, or null
 */
export function getSummonSpellAction(
  game: GameState,
  _config: PersonalityConfig,
  _visibleMonsters: Monster[]
): GameAction | null {
  const character = game.character

  // Get available summon spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const summonSpells = available.filter(
    (entry) => entry.canCast && entry.spell.effectType === 'summon'
  )

  if (summonSpells.length === 0) return null

  // Check existing minions
  const existingMinions = game.minions.filter((m) => m.hp > 0)

  // For permanent pets (wolf): summon IMMEDIATELY if missing, heal if damaged
  // This is high priority - we want the wolf out at all times
  const wolfSpell = summonSpells.find((entry) => entry.spell.id === 'summon_wolf')
  if (wolfSpell) {
    const wolf = existingMinions.find((m) => m.type === 'wolf')
    if (!wolf) {
      // No wolf - summon one immediately (even without enemies)
      return { type: 'cast', spellId: 'summon_wolf' }
    }
    // Wolf exists but damaged - heal it when below 50%
    if (wolf.hp < wolf.maxHp * 0.5 && character.mp >= character.maxMp * 0.3) {
      return { type: 'cast', spellId: 'summon_wolf' }
    }
  }

  // For permanent pets (skeleton): maintain up to 2
  const skeletonSpell = summonSpells.find((entry) => entry.spell.id === 'summon_skeleton')
  if (skeletonSpell) {
    const skeletons = existingMinions.filter((m) => m.type === 'skeleton')
    if (skeletons.length < 2) {
      // Missing skeleton(s) — resummon
      return { type: 'cast', spellId: 'summon_skeleton' }
    }
    // Both alive — heal the most damaged if below 50%
    const mostDamaged = skeletons.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b))
    if (mostDamaged.hp < mostDamaged.maxHp * 0.5 && character.mp >= character.maxMp * 0.3) {
      return { type: 'cast', spellId: 'summon_skeleton' }
    }
  }

  return null
}

/**
 * Check if bot has any active minions
 */
export function hasActiveMinions(game: GameState): boolean {
  return game.minions.some((m) => m.hp > 0)
}

/**
 * Check if bot should use summons based on class
 */
export function classShouldSummon(classId: string): boolean {
  // Druid doesn't have summon spells - they use shapeshifting instead
  return classId === 'ranger' || classId === 'necromancer'
}

// ============================================================================
// LIGHT ORB SPELL
// ============================================================================

/**
 * Get vision buff spell action (Light Orb or Shadow Sight)
 *
 * Cast when:
 * - Character is mage, archmage, or necromancer
 * - Has light_orb or shadow_sight spell available
 * - Not already buffed with enhanced_light
 * - Not in town (full visibility anyway)
 *
 * @returns GameAction to cast vision buff, or null
 */
export function getLightOrbSpellAction(game: GameState): GameAction | null {
  const character = game.character

  // Only caster classes have vision buffs
  const visionSpellId =
    character.classId === 'mage' || character.classId === 'archmage'
      ? 'light_orb'
      : character.classId === 'necromancer'
        ? 'shadow_sight'
        : null

  if (!visionSpellId) {
    return null
  }

  // Town is fully lit - don't waste mana
  if (character.depth === 0) {
    return null
  }

  // Already have enhanced light buff?
  const hasEnhancedLight = character.statusEffects.some((e) => e.type === 'enhanced_light')
  if (hasEnhancedLight) {
    return null
  }

  // Get available spells (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const visionSpell = available.find((entry) => entry.canCast && entry.spell.id === visionSpellId)

  if (visionSpell) {
    return { type: 'cast', spellId: visionSpellId }
  }

  return null
}

// ============================================================================
// DIMENSION DOOR KITING
// ============================================================================

/**
 * Get Dimension Door kite action for tactical caster repositioning.
 *
 * Used when:
 * - Monster within 2 tiles (closing in)
 * - Have DD spell available and off cooldown
 * - Have damage spell ready (for follow-up cast after DD)
 *
 * Target selection:
 * - Find position at max FOV distance from threat
 * - Position is in opposite direction from nearest threat
 * - Position must keep threat in new FOV after teleport (can continue casting)
 *
 * @returns GameAction to cast dimension_door with destination, or null
 */
export function getDimensionDoorKiteAction(
  game: GameState,
  visibleMonsters: Monster[],
  kitingLevel: number = 3
): GameAction | null {
  // Gate behind kiting L3 (advanced caster technique)
  if (kitingLevel < 3) return null

  const character = game.character

  // Only for caster classes (no bow = caster, bow = archer who uses physical kiting)
  if (character.equipment.bow) return null

  if (visibleMonsters.length === 0) return null

  // Check if DD is available (getCastableSpells handles golem restriction)
  const available = getCastableSpells(character, game.turn)
  const ddSpell = available.find((entry) => entry.canCast && entry.spell.id === 'dimension_door')
  if (!ddSpell) return null

  // Check if we have a damage spell ready (for follow-up kiting)
  const hasDamageSpell = available.some(
    (entry) =>
      entry.canCast &&
      (entry.spell.effectType === 'damage' ||
        entry.spell.effectType === 'lifedrain' ||
        entry.spell.effectType === 'aoe_damage')
  )
  if (!hasDamageSpell) return null

  // Find nearest threat
  const pos = character.position
  const nearest = findClosestMonster(visibleMonsters, pos)
  if (!nearest) return null

  // Only DD kite when threat is close (within 2 tiles)
  if (nearest.distance > 2) return null

  // Calculate current FOV radius (DD range is dynamic)
  const fovRadius = calculateLightRadius(character, character.depth)

  // Find best DD destination
  const destination = findDDKiteDestination(game, pos, nearest.monster.position, fovRadius)
  if (!destination) return null

  // Return cast action with destination encoded as "x,y"
  return {
    type: 'cast',
    spellId: 'dimension_door',
    targetId: `${destination.x},${destination.y}`,
  }
}

/**
 * Find optimal DD destination for kiting.
 *
 * Algorithm:
 * 1. Calculate escape vector (opposite from threat)
 * 2. Search tiles at max FOV range in escape direction (cone ±60°)
 * 3. Verify: walkable, visible, LOS from current pos
 * 4. Score positions: prefer max distance + threat stays in new FOV
 */
function findDDKiteDestination(
  game: GameState,
  currentPos: Point,
  threatPos: Point,
  maxRange: number
): Point | null {
  // Calculate escape direction (away from threat)
  const dx = currentPos.x - threatPos.x
  const dy = currentPos.y - threatPos.y
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
  const escapeDirX = dx / dist
  const escapeDirY = dy / dist

  let bestPos: Point | null = null
  let bestScore = -Infinity

  // Search in a cone opposite the threat (±60° from escape direction)
  for (let angle = -60; angle <= 60; angle += 15) {
    // Rotate escape direction by angle
    const rad = (angle * Math.PI) / 180
    const dirX = escapeDirX * Math.cos(rad) - escapeDirY * Math.sin(rad)
    const dirY = escapeDirX * Math.sin(rad) + escapeDirY * Math.cos(rad)

    // Try positions at various distances (prefer max range)
    for (let r = maxRange; r >= Math.max(2, maxRange - 2); r--) {
      const destX = Math.round(currentPos.x + dirX * r)
      const destY = Math.round(currentPos.y + dirY * r)
      const dest: Point = { x: destX, y: destY }

      // Skip if same as current position
      if (destX === currentPos.x && destY === currentPos.y) continue

      // Verify tile is valid
      const tile = getTile(game.currentLevel, destX, destY)
      if (!tile || !tile.visible || !isWalkable(tile)) continue

      // Verify LOS from current position
      if (!hasLineOfSight(currentPos, dest, game.currentLevel)) continue

      // Check no monster at destination
      if (isMonsterAt(game.monsters, { x: destX, y: destY })) continue

      // Score: prefer further distance
      let score = r * 10

      // Bonus if threat will still be visible from new position (can continue casting)
      const threatDistFromDest = chebyshevDistance(dest, threatPos)
      if (threatDistFromDest <= maxRange) {
        // Threat stays in FOV - can continue casting
        score += 50

        // Prefer keeping threat at optimal casting range (3-5 tiles)
        if (threatDistFromDest >= 3 && threatDistFromDest <= 5) {
          score += 20
        }
      }

      if (score > bestScore) {
        bestScore = score
        bestPos = dest
      }
    }
  }

  return bestPos
}
