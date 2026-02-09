/**
 * Monster Spell Casting
 *
 * Handles monster spell/breath attacks including:
 * - Breath weapons (damage = HP/3, element-typed)
 * - Bolt spells (5d8 + depth scaling)
 * - Utility spells (HEAL, BLINK, HASTE, SUMMON)
 * - Debuff spells (BLIND, SLOW, CONFUSE, SCARE, HOLD, BRAIN_SMASH)
 */

import type {
  GameState,
  Monster,
  Character,
  MonsterSpell,
  Element,
  StatusEffectType,
} from './types'
import { STATUS_DURATIONS } from './types'
import { rollDice } from './dice'
import { random, randomInt } from './rng'
import { addStatusEffect, hasProtectionFrom } from './status-effects'
import { findOpenPosition } from './dungeon'
import { spawnMonster } from './monster-ai'
import { getSpawnableMonsters } from './data/monsters'
import { resolveDefense } from './combat'
import { getKnowledgeBonuses } from './knowledge-effects'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Map monster spell prefixes to element types */
const SPELL_ELEMENT_MAP: Record<string, Element> = {
  BR_FIRE: 'FIRE',
  BR_COLD: 'COLD',
  BR_ELEC: 'ELEC',
  BR_ACID: 'ACID',
  BR_POISON: 'POISON',
  BR_DARK: 'DARK',
  BO_FIRE: 'FIRE',
  BO_COLD: 'COLD',
  BO_ELEC: 'ELEC',
  BO_ACID: 'ACID',
}

/** Display names for elements */
const ELEMENT_NAMES: Record<Element, string> = {
  FIRE: 'fire',
  COLD: 'cold',
  ELEC: 'lightning',
  ACID: 'acid',
  POISON: 'poison',
  DARK: 'darkness',
}

// ============================================================================
// TYPES
// ============================================================================

/** Result of casting a monster spell */
export interface SpellResult {
  success: boolean
  damage: number
  statusInflicted: StatusEffectType | 'poison' | null
  message: string
  /** For summon spells - the spawned monster */
  summonedMonster?: Monster
}

// ============================================================================
// MAIN SPELL EXECUTION
// ============================================================================

/**
 * Check if a monster should cast a spell this turn
 *
 * @param monster - The monster to check
 * @returns True if the monster decides to cast
 */
export function shouldCastSpell(monster: Monster): boolean {
  const spells = monster.template.spells
  if (!spells || spells.list.length === 0) return false

  // 1-in-freq chance to cast
  return randomInt(1, spells.freq) === 1
}

/**
 * Execute a monster spell
 *
 * Randomly selects from available spells and executes.
 *
 * @param game - Game state
 * @param monster - The casting monster
 * @returns Result of the spell
 */
export function executeMonsterSpell(game: GameState, monster: Monster): SpellResult {
  const spells = monster.template.spells
  if (!spells || spells.list.length === 0) {
    return { success: false, damage: 0, statusInflicted: null, message: '' }
  }

  // Pick a random spell from the list
  const spell = spells.list[randomInt(0, spells.list.length - 1)]!

  return executeSpell(game, monster, spell)
}

/**
 * Execute a specific spell
 */
function executeSpell(game: GameState, monster: Monster, spell: MonsterSpell): SpellResult {
  const character = game.character

  // Breath weapons
  if (spell.startsWith('BR_')) {
    return executeBreathWeapon(game, monster, character, spell)
  }

  // Bolt spells
  if (spell.startsWith('BO_')) {
    return executeBoltSpell(game, monster, character, spell)
  }

  // Utility spells
  switch (spell) {
    case 'HEAL':
      return executeHeal(monster)
    case 'BLINK':
      return executeBlink(game, monster)
    case 'HASTE':
      return executeHaste(monster)
    case 'SUMMON':
      return executeSummon(game, monster)
  }

  // Debuff spells
  switch (spell) {
    case 'BLIND':
      return executeDebuff(character, 'blind', `${monster.template.name} blinds you!`)
    case 'SLOW':
      return executeDebuff(character, 'slowed', `${monster.template.name} slows you!`)
    case 'CONFUSE':
      return executeDebuff(character, 'confused', `${monster.template.name} confuses you!`)
    case 'SCARE':
      return executeDebuff(character, 'terrified', `${monster.template.name} terrifies you!`)
    case 'HOLD':
      return executeDebuff(character, 'paralyzed', `${monster.template.name} paralyzes you!`)
    case 'BRAIN_SMASH':
      return executeBrainSmash(monster, character)
  }

  return { success: false, damage: 0, statusInflicted: null, message: '' }
}

// ============================================================================
// BREATH WEAPONS
// ============================================================================

/**
 * Execute a breath weapon attack
 *
 * Damage = monster HP / 3, capped by element type.
 * Defense resolution: resistance, PFE, knowledge (no armor — spells bypass AC).
 */
function executeBreathWeapon(
  game: GameState,
  monster: Monster,
  character: Character,
  spell: MonsterSpell
): SpellResult {
  const element = SPELL_ELEMENT_MAP[spell]
  if (!element) {
    return { success: false, damage: 0, statusInflicted: null, message: '' }
  }

  // Base damage = HP/3, capped
  const baseDamage = Math.floor(monster.hp / 3)
  const caps: Record<Element, number> = {
    FIRE: 200,
    COLD: 200,
    ELEC: 150,
    ACID: 200,
    POISON: 100,
    DARK: 150,
  }
  const rawDamage = Math.min(baseDamage, caps[element])

  const knowledgeBonuses = getKnowledgeBonuses(
    monster.template.name,
    game.bestiary,
    game.balance.bestiaryBonusPercent,
    game.upgradeBonuses?.bestiaryCapPercent
  )
  const { finalDamage } = resolveDefense(character, {
    rawDamage,
    element,
    skipArmor: true,
    attackerMonster: monster,
    knowledgeBonuses,
  })

  const message = `${monster.template.name} breathes ${ELEMENT_NAMES[element]} for ${finalDamage} damage!`

  return {
    success: true,
    damage: finalDamage,
    statusInflicted: null,
    message,
  }
}

// ============================================================================
// BOLT SPELLS
// ============================================================================

/**
 * Execute a bolt spell
 *
 * Damage = 5d8 + depth scaling
 * Defense resolution: resistance, PFE, knowledge (no armor — spells bypass AC).
 */
function executeBoltSpell(
  game: GameState,
  monster: Monster,
  character: Character,
  spell: MonsterSpell
): SpellResult {
  const element = SPELL_ELEMENT_MAP[spell]
  if (!element) {
    return { success: false, damage: 0, statusInflicted: null, message: '' }
  }

  // Base damage 5d8 + depth scaling
  const rawDamage = rollDice('5d8') + Math.floor(character.depth / 2)

  const knowledgeBonuses = getKnowledgeBonuses(
    monster.template.name,
    game.bestiary,
    game.balance.bestiaryBonusPercent,
    game.upgradeBonuses?.bestiaryCapPercent
  )
  const { finalDamage } = resolveDefense(character, {
    rawDamage,
    element,
    skipArmor: true,
    attackerMonster: monster,
    knowledgeBonuses,
  })

  const message = `${monster.template.name} casts a ${ELEMENT_NAMES[element]} bolt for ${finalDamage} damage!`

  return {
    success: true,
    damage: finalDamage,
    statusInflicted: null,
    message,
  }
}

// ============================================================================
// UTILITY SPELLS
// ============================================================================

/**
 * Monster heals itself (30% HP)
 */
function executeHeal(monster: Monster): SpellResult {
  const healAmount = Math.floor(monster.maxHp * 0.3)
  monster.hp = Math.min(monster.hp + healAmount, monster.maxHp)

  return {
    success: true,
    damage: 0,
    statusInflicted: null,
    message: `${monster.template.name} heals itself!`,
  }
}

/**
 * Monster blinks (short-range teleport)
 */
function executeBlink(game: GameState, monster: Monster): SpellResult {
  // Find a new position within 10 tiles
  const attempts = 20
  for (let i = 0; i < attempts; i++) {
    const newPos = findOpenPosition(game.currentLevel)
    const dx = Math.abs(newPos.x - monster.position.x)
    const dy = Math.abs(newPos.y - monster.position.y)
    const dist = Math.max(dx, dy)

    if (dist <= 10 && dist > 2) {
      monster.position = newPos
      return {
        success: true,
        damage: 0,
        statusInflicted: null,
        message: `${monster.template.name} blinks!`,
      }
    }
  }

  return {
    success: false,
    damage: 0,
    statusInflicted: null,
    message: '',
  }
}

/**
 * Monster hastens itself (+50% speed for 10 turns)
 */
function executeHaste(monster: Monster): SpellResult {
  // Check if already hasted
  const existingHaste = monster.buffs.find((b) => b.type === 'haste')
  if (existingHaste) {
    // Refresh duration
    existingHaste.turnsRemaining = 10
    return {
      success: true,
      damage: 0,
      statusInflicted: null,
      message: '', // Silent refresh
    }
  }

  // Apply haste buff: +50% speed for 10 turns
  monster.buffs.push({
    type: 'haste',
    turnsRemaining: 10,
    value: 50, // +50% speed
  })

  return {
    success: true,
    damage: 0,
    statusInflicted: null,
    message: `${monster.template.name} speeds up!`,
  }
}

/**
 * Monster summons allies
 */
function executeSummon(game: GameState, monster: Monster): SpellResult {
  // Get monsters that can spawn at this depth (but weaker than summoner)
  const depth = game.character.depth
  const candidates = getSpawnableMonsters(Math.max(1, depth - 5)).filter(
    (t) => t.hp < monster.template.hp * 0.7 && !t.flags.includes('UNIQUE')
  )

  if (candidates.length === 0) {
    return {
      success: false,
      damage: 0,
      statusInflicted: null,
      message: '',
    }
  }

  // Find spawn position adjacent to monster
  const pos = findOpenPosition(game.currentLevel)
  if (!pos) {
    return {
      success: false,
      damage: 0,
      statusInflicted: null,
      message: '',
    }
  }

  // Spawn 1-2 monsters
  const summonCount = randomInt(1, 2)
  for (let i = 0; i < summonCount; i++) {
    const template = candidates[randomInt(0, candidates.length - 1)]!
    const summon = spawnMonster(template, pos)
    summon.isAwake = true // Summoned monsters are immediately awake
    game.monsters.push(summon)
  }

  return {
    success: true,
    damage: 0,
    statusInflicted: null,
    message: `${monster.template.name} summons allies!`,
  }
}

// ============================================================================
// DEBUFF SPELLS
// ============================================================================

/**
 * Execute a debuff spell against the character
 */
function executeDebuff(
  character: Character,
  statusType: StatusEffectType,
  message: string
): SpellResult {
  // Save vs WIS
  const saveChance = Math.min(75, 30 + character.stats.wis * 2)
  if (random() * 100 < saveChance) {
    return {
      success: false,
      damage: 0,
      statusInflicted: null,
      message: 'You resist!',
    }
  }

  // EQUIPMENT PROTECTION: Check for protection abilities (Free Action, etc.)
  if (hasProtectionFrom(character, statusType)) {
    return {
      success: false,
      damage: 0,
      statusInflicted: null,
      message: 'You are protected!',
    }
  }

  // Apply status
  const duration = STATUS_DURATIONS[statusType] ?? 3
  const value = statusType === 'slowed' ? 50 : statusType === 'drained' ? 20 : 0

  addStatusEffect(character, {
    type: statusType,
    turnsRemaining: duration,
    value,
  })

  return {
    success: true,
    damage: 0,
    statusInflicted: statusType,
    message,
  }
}

/**
 * Brain Smash - powerful mental attack
 * Deals damage AND can inflict confusion
 */
function executeBrainSmash(monster: Monster, character: Character): SpellResult {
  // Save vs WIS for reduced effect
  const saveChance = Math.min(50, 20 + character.stats.wis * 2)
  const saved = random() * 100 < saveChance

  // Damage: 4d8 base
  let damage = rollDice('4d8')
  if (saved) {
    damage = Math.floor(damage / 2)
  }

  // Try to confuse (unless saved or protected)
  let statusInflicted: StatusEffectType | null = null
  if (!saved && random() < 0.5 && !hasProtectionFrom(character, 'confused')) {
    addStatusEffect(character, {
      type: 'confused',
      turnsRemaining: STATUS_DURATIONS['confused'] ?? 3,
      value: 0,
    })
    statusInflicted = 'confused'
  }

  const message =
    `${monster.template.name} blasts your mind for ${damage} damage!` +
    (statusInflicted ? ' You are confused!' : '')

  return {
    success: true,
    damage,
    statusInflicted,
    message,
  }
}
