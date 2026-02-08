/**
 * Monster Combat Resolution
 *
 * Handles resolving monster attacks against the player character.
 * Each monster can have 1-4 attacks per round with various effects.
 */

import type { Monster, Character, MonsterAttack, AttackEffect, StatusEffectType } from './types'
import { STATUS_DURATIONS } from './types'
import { rollDice, getDiceAverage } from './dice'
import { random } from './rng'
import {
  addStatusEffect,
  applyPoison,
  hasProtectionFrom,
  hasEquipmentAbility,
} from './status-effects'
import { getRaceById } from './data/races'
import { resolveDefense } from './combat'
import type { KnowledgeBonuses } from './knowledge-effects'

// ============================================================================
// TYPES
// ============================================================================

/** Result of a single attack */
export interface AttackHitResult {
  hit: boolean
  damage: number
  method: string
  effect: AttackEffect
  statusInflicted: StatusEffectType | 'poison' | null
}

/** Result of all attacks in a round */
export interface MonsterAttackResult {
  totalDamage: number
  hits: AttackHitResult[]
  statusEffectsInflicted: Array<StatusEffectType | 'poison'>
}

// ============================================================================
// MAIN RESOLUTION FUNCTION
// ============================================================================

/**
 * Resolve all monster attacks against the character
 *
 * For each attack in monster.template.attacks:
 * 1. Roll to hit (speed-based accuracy vs evasion)
 * 2. Roll damage dice
 * 3. Apply armor reduction
 * 4. Apply element resistance if elemental
 * 5. Try to inflict status (33% base chance - WIS bonus)
 *
 * @param monster - The attacking monster
 * @param character - The defending character
 * @returns Combined result of all attacks
 */
export function resolveMonsterAttacks(
  monster: Monster,
  character: Character,
  knowledgeBonuses?: KnowledgeBonuses
): MonsterAttackResult {
  const template = monster.template
  const attacks = template.attacks

  // All monsters should have attacks defined — bail with zero damage if somehow missing
  if (!attacks || attacks.length === 0) {
    console.warn(`Monster ${monster.template.name} has no attacks defined`)
    return { totalDamage: 0, hits: [], statusEffectsInflicted: [] }
  }

  const hits: AttackHitResult[] = []
  let totalDamage = 0
  const statusEffectsInflicted: Array<StatusEffectType | 'poison'> = []

  for (const attack of attacks) {
    const result = resolveSingleAttack(monster, character, attack, knowledgeBonuses)
    hits.push(result)

    if (result.hit) {
      totalDamage += result.damage

      if (result.statusInflicted) {
        statusEffectsInflicted.push(result.statusInflicted)
      }
    }
  }

  return {
    totalDamage,
    hits,
    statusEffectsInflicted,
  }
}

/**
 * Resolve a single attack
 */
function resolveSingleAttack(
  monster: Monster,
  character: Character,
  attack: MonsterAttack,
  knowledgeBonuses?: KnowledgeBonuses
): AttackHitResult {
  // Roll to hit
  const hitChance = calculateHitChance(monster, character)
  const hit = random() < hitChance

  if (!hit) {
    return {
      hit: false,
      damage: 0,
      method: attack.method,
      effect: attack.effect,
      statusInflicted: null,
    }
  }

  // Roll damage
  const rawDamage = rollDice(attack.dice)

  // Resolve defense (armor, resistance, PFE, knowledge, min damage)
  const element = attack.effect.type === 'ELEMENTAL' ? attack.effect.element : undefined
  const { finalDamage } = resolveDefense(character, {
    rawDamage,
    element,
    attackerMonster: monster,
    knowledgeBonuses,
  })
  const damage = finalDamage

  // Try to inflict status effect
  let statusInflicted: StatusEffectType | 'poison' | null = null
  if (attack.effect.type !== 'HURT' && attack.effect.type !== 'ELEMENTAL') {
    statusInflicted = tryInflictStatus(character, attack.effect)
  } else if (attack.effect.type === 'ELEMENTAL' && attack.effect.element === 'POISON') {
    // Poison elemental attacks can inflict poison status
    statusInflicted = tryInflictPoison(character)
  }

  return {
    hit: true,
    damage,
    method: attack.method,
    effect: attack.effect,
    statusInflicted,
  }
}

// ============================================================================
// HIT CALCULATION
// ============================================================================

/**
 * Calculate hit chance for a monster attack
 *
 * Base: 75% hit chance
 * + Monster speed bonus: (speed - 100) / 2 percent
 * - Character evasion: evasion / 4 percent
 * × (1 - dodgeChance%) from Reflexes upgrade
 * Clamped to 15-95%
 */
function calculateHitChance(monster: Monster, character: Character): number {
  const baseChance = 0.75

  // Speed bonus: faster monsters hit more often
  const speedBonus = (monster.template.speed - 100) / 200

  // Evasion penalty: agile characters dodge more
  const evasionPenalty = character.combat.evasion / 400

  let hitChance = baseChance + speedBonus - evasionPenalty

  // Dodge chance from Reflexes upgrade — reduces monster hit probability
  const dodgeChance = character.upgradeBonuses?.dodgeChancePercent ?? 0
  if (dodgeChance > 0) {
    hitChance *= 1 - dodgeChance / 100
  }

  // Clamp to 15-95%
  return Math.max(0.15, Math.min(0.95, hitChance))
}

// ============================================================================
// ELEMENTAL RESISTANCE
// ============================================================================

// ============================================================================
// STATUS EFFECTS
// ============================================================================

/**
 * Try to inflict a status effect from an attack
 *
 * Base chance: 33%
 * Modified by: -2% per WIS point above 10
 *
 * @returns The status type if inflicted, null otherwise
 */
function tryInflictStatus(character: Character, effect: AttackEffect): StatusEffectType | null {
  // Only status-inflicting effects
  if (effect.type === 'HURT' || effect.type === 'ELEMENTAL') {
    return null
  }

  // Get race for ability checks
  const race = getRaceById(character.raceId)
  const raceAbilityIds = race?.abilities.map((a) => a.id) ?? []

  // RACIAL: Gnome "Free Action" - immune to paralysis
  if (effect.type === 'PARALYZE' && raceAbilityIds.includes('free_act')) {
    return null
  }

  // RACIAL: Dwarf "Resist Blindness" - immune to blind
  if (effect.type === 'BLIND' && raceAbilityIds.includes('blind_resist')) {
    return null
  }

  // Sustain abilities block stat drain (racial or equipment)
  if (effect.type === 'DRAIN') {
    const hasRacialSustain = raceAbilityIds.some((id) =>
      ['sustain_dex', 'sustain_str', 'sustain_con'].includes(id)
    )
    const hasEquipSustain = ['Sustain STR', 'Sustain DEX', 'Sustain CON', 'Sustain WIS'].some((s) =>
      hasEquipmentAbility(character, s)
    )
    if (hasRacialSustain || hasEquipSustain) {
      return null
    }
  }

  // Base 33% chance, reduced by WIS
  const wisBonus = Math.max(0, character.stats.wis - 10) * 2
  const inflictChance = Math.max(5, 33 - wisBonus) / 100

  if (random() >= inflictChance) {
    return null
  }

  // Map effect to status type
  const statusMap: Record<string, StatusEffectType> = {
    PARALYZE: 'paralyzed',
    BLIND: 'blind',
    CONFUSE: 'confused',
    TERRIFY: 'terrified',
    SLOW: 'slowed',
    DRAIN: 'drained',
  }

  const statusType = statusMap[effect.type]
  if (!statusType) return null

  // EQUIPMENT PROTECTION: Check for protection abilities (Free Action, etc.)
  if (hasProtectionFrom(character, statusType)) {
    return null
  }

  // Get duration from constants
  const duration = (STATUS_DURATIONS as Record<string, number>)[statusType] ?? 3

  // Apply the status effect
  addStatusEffect(character, {
    type: statusType,
    turnsRemaining: duration,
    value: getStatusValue(statusType),
  })

  return statusType
}

/**
 * Try to inflict poison from a poison elemental attack
 */
function tryInflictPoison(character: Character): 'poison' | null {
  // Check poison resistance
  const poisonResist = (character.resistances as Record<string, number | undefined>)['POISON'] ?? 0
  const tempPoisonResist = character.tempResistances.find((r) => r.type === 'POISON')
  const totalResist = poisonResist + (tempPoisonResist?.value ?? 0)

  // High resistance prevents poison
  if (random() * 100 < totalResist) {
    return null
  }

  // Base 33% chance, reduced by WIS
  const wisBonus = Math.max(0, character.stats.wis - 10) * 2
  const inflictChance = Math.max(5, 33 - wisBonus) / 100

  if (random() >= inflictChance) {
    return null
  }

  // Apply poison: 2% max HP per turn for 5 turns
  const damagePerTurn = Math.max(1, Math.floor(character.maxHp * 0.02))
  applyPoison(character, damagePerTurn, 5)

  return 'poison'
}

/**
 * Get the value for a status effect
 */
function getStatusValue(type: StatusEffectType): number {
  switch (type) {
    case 'slowed':
      return 50 // -50% speed
    case 'drained':
      return 20 // -20% all stats
    default:
      return 0
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the expected average damage from a monster's attacks
 * Used for threat calculation in bot AI
 */
export function getMonsterAverageDamage(monster: Monster): number {
  const template = monster.template
  const attacks = template.attacks

  if (!attacks || attacks.length === 0) {
    return 0
  }

  let totalAvg = 0
  for (const attack of attacks) {
    totalAvg += getDiceAverage(attack.dice)
  }
  return totalAvg
}

/**
 * Format attack message for display
 */
export function formatMonsterAttackMessage(
  monsterName: string,
  result: MonsterAttackResult
): string {
  if (result.totalDamage === 0 && result.hits.every((h) => !h.hit)) {
    return `The ${monsterName} misses!`
  }

  const parts: string[] = []

  // Describe hits
  const hitCount = result.hits.filter((h) => h.hit).length
  if (hitCount === 1) {
    const hit = result.hits.find((h) => h.hit)!
    parts.push(
      `The ${monsterName} ${formatAttackMethod(hit.method)}s you for ${result.totalDamage} damage!`
    )
  } else if (hitCount > 1) {
    parts.push(`The ${monsterName} attacks ${hitCount} times for ${result.totalDamage} damage!`)
  }

  // Describe status effects
  for (const status of result.statusEffectsInflicted) {
    parts.push(formatStatusInfliction(status))
  }

  return parts.join(' ')
}

function formatAttackMethod(method: string): string {
  switch (method) {
    case 'HIT':
      return 'hit'
    case 'BITE':
      return 'bite'
    case 'CLAW':
      return 'claw'
    case 'TOUCH':
      return 'touche'
    case 'STING':
      return 'sting'
    case 'CRUSH':
      return 'crushe'
    case 'GAZE':
      return 'gaze'
    case 'ENGULF':
      return 'engulf'
    default:
      return 'hit'
  }
}

function formatStatusInfliction(status: StatusEffectType | 'poison'): string {
  switch (status) {
    case 'poison':
      return 'You are poisoned!'
    case 'paralyzed':
      return 'You are paralyzed!'
    case 'blind':
      return 'You are blinded!'
    case 'confused':
      return 'You are confused!'
    case 'terrified':
      return 'You are terrified!'
    case 'slowed':
      return 'You feel sluggish!'
    case 'drained':
      return 'You feel drained!'
    default:
      return ''
  }
}
