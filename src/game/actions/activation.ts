/**
 * Activation Action Handler for Borglike
 *
 * Handles artifact and racial ability activations.
 * Reuses spell resolution patterns for damage/buff effects.
 */

import type { GameState, ActionResult, Monster, Character } from '../types'
import {
  getActivationById,
  parseArtifactActivation,
  getRandomBreathElement,
  calculateBreathDamage,
  type ActivationTemplate,
} from '../data/activations'
import { applyDamage } from '../combat'
import { handleMonsterKill } from './combat'
import { addStatusEffect } from '../status-effects'
import { getTile } from '../dungeon'
import { addTaggedMessage, BASE_ENERGY_COST } from './helpers'
import { incrementStat, trackAbilityUsage } from '../stats-helpers'

// ============================================================================
// COOLDOWN HELPERS
// ============================================================================

/**
 * Check if an activation is ready to use
 */
export function canActivate(
  character: Character,
  activationId: string,
  currentTurn: number
): boolean {
  const activation = getActivationById(activationId)
  if (!activation) return false

  const cooldownUntil = character.activationCooldowns[activationId] ?? 0
  return currentTurn >= cooldownUntil
}

/**
 * Get remaining cooldown turns for an activation
 */
export function getActivationCooldown(
  character: Character,
  activationId: string,
  currentTurn: number
): number {
  const cooldownUntil = character.activationCooldowns[activationId] ?? 0
  return Math.max(0, cooldownUntil - currentTurn)
}

/**
 * Check if character can use racial ability
 */
export function canUseRacialAbility(character: Character, currentTurn: number): boolean {
  if (character.raceId !== 'draconian') return false

  const activation = getActivationById('draconian_breath')
  if (!activation) return false

  // Check rest interval
  const lastUse = character.racialAbilityLastUse
  const interval = activation.restInterval ?? 50
  if (currentTurn - lastUse < interval) return false

  // Check HP cost
  const hpCost = activation.hpCost ?? 0
  if (character.hp <= hpCost) return false

  return true
}

/**
 * Get remaining rest interval for racial ability
 */
export function getRacialAbilityCooldown(character: Character, currentTurn: number): number {
  if (character.raceId !== 'draconian') return 0

  const activation = getActivationById('draconian_breath')
  if (!activation) return 0

  const lastUse = character.racialAbilityLastUse
  const interval = activation.restInterval ?? 50
  return Math.max(0, interval - (currentTurn - lastUse))
}

// ============================================================================
// ARTIFACT ACTIVATION
// ============================================================================

/**
 * Handle artifact activation from equipped item
 *
 * @param game - Current game state
 * @param itemId - ID of equipped item with activation
 * @param targetId - Optional target monster ID
 * @returns ActionResult
 */
export function handleActivate(game: GameState, itemId: string, targetId?: string): ActionResult {
  const character = game.character

  // Find the equipped item with this ID
  const equippedItem = Object.values(character.equipment).find((item) => item?.id === itemId)
  if (!equippedItem) {
    return {
      success: false,
      message: 'Item not equipped.',
      energyCost: 0,
    }
  }

  // Check if item is an artifact with activation
  if (!equippedItem.artifact?.abilities) {
    return {
      success: false,
      message: 'This item has no activatable ability.',
      energyCost: 0,
    }
  }

  // Find the activation ability
  const activationIds = equippedItem.artifact.abilities
    .map(parseArtifactActivation)
    .filter((id): id is string => id !== null)

  if (activationIds.length === 0) {
    return {
      success: false,
      message: 'This item has no activatable ability.',
      energyCost: 0,
    }
  }

  // Use the first activation (items typically have only one)
  const activationId = activationIds[0]!
  const activation = getActivationById(activationId)
  if (!activation) {
    return {
      success: false,
      message: 'Unknown activation.',
      energyCost: 0,
    }
  }

  // Check cooldown
  if (!canActivate(character, activationId, game.turn)) {
    const remaining = getActivationCooldown(character, activationId, game.turn)
    return {
      success: false,
      message: `${activation.name} is on cooldown (${remaining} turns).`,
      energyCost: 0,
    }
  }

  // Check MP cost if any
  if (activation.mpCost && character.mp < activation.mpCost) {
    return {
      success: false,
      message: `Not enough mana for ${activation.name}.`,
      energyCost: 0,
    }
  }

  // Pay costs
  if (activation.mpCost) {
    character.mp -= activation.mpCost
  }
  if (activation.hpCost) {
    character.hp -= activation.hpCost
  }

  // Set cooldown
  const cooldown = activation.cooldown ?? 50
  character.activationCooldowns[activationId] = game.turn + cooldown

  // Track usage
  game.stats.abilitiesUsed++

  // Execute effect
  return executeActivation(game, activation, targetId)
}

// ============================================================================
// RACIAL ACTIVATION (DRACONIAN BREATH)
// ============================================================================

/**
 * Handle racial ability activation (Draconian breath weapon)
 *
 * @param game - Current game state
 * @param targetId - Optional target monster ID (unused for breath, hits area)
 * @returns ActionResult
 */
export function handleRacialActivation(game: GameState, _targetId?: string): ActionResult {
  const character = game.character

  // Only Draconians have racial activations
  if (character.raceId !== 'draconian') {
    return {
      success: false,
      message: 'Your race has no special abilities.',
      energyCost: 0,
    }
  }

  const activation = getActivationById('draconian_breath')
  if (!activation) {
    return {
      success: false,
      message: 'Unknown racial ability.',
      energyCost: 0,
    }
  }

  // Check rest interval
  if (!canUseRacialAbility(character, game.turn)) {
    const remaining = getRacialAbilityCooldown(character, game.turn)
    if (remaining > 0) {
      return {
        success: false,
        message: `Breath weapon needs rest (${remaining} turns).`,
        energyCost: 0,
      }
    }
    // HP too low
    return {
      success: false,
      message: 'Not enough HP to use breath weapon.',
      energyCost: 0,
    }
  }

  // Pay HP cost
  const hpCost = activation.hpCost ?? 5
  character.hp -= hpCost

  // Set last use turn
  character.racialAbilityLastUse = game.turn

  // Track usage
  game.stats.abilitiesUsed++

  // Execute breath weapon with random element
  return executeDraconianBreath(game, activation)
}

// ============================================================================
// EFFECT EXECUTION
// ============================================================================

/**
 * Execute an activation effect
 */
function executeActivation(
  game: GameState,
  activation: ActivationTemplate,
  targetId?: string
): ActionResult {
  switch (activation.effectType) {
    case 'aoe_damage':
      return executeAOEDamage(game, activation, targetId)

    case 'damage':
      return executeSingleDamage(game, activation, targetId)

    case 'haste':
      return executeHaste(game, activation)

    case 'illuminate':
      return executeIlluminate(game, activation)

    case 'debuff':
      return executeBlindMonsters(game, activation)

    case 'heal':
      return executeHeal(game, activation)

    case 'buff':
      return executeBuff(game, activation)

    case 'teleport':
      return executeTeleport(game, activation)

    default:
      addTaggedMessage(game, `You activate ${activation.name}.`, 'info', {
        tags: ['buff'],
        importance: 2,
      })
      return {
        success: true,
        message: `Activated ${activation.name}.`,
        energyCost: BASE_ENERGY_COST,
      }
  }
}

/**
 * Execute Draconian breath weapon with random element
 */
function executeDraconianBreath(game: GameState, activation: ActivationTemplate): ActionResult {
  const element = getRandomBreathElement()
  const damage = calculateBreathDamage(game.character.level)
  const radius = activation.aoeRadius ?? 3
  const maxTargets = activation.maxTargets ?? 6

  // Get visible monsters in range
  const charPos = game.character.position
  const targets = game.monsters.filter((m) => {
    if (m.hp <= 0) return false
    const tile = getTile(game.currentLevel, m.position.x, m.position.y)
    if (!tile?.visible) return false
    const dist = Math.abs(m.position.x - charPos.x) + Math.abs(m.position.y - charPos.y)
    return dist <= radius
  })

  if (targets.length === 0) {
    addTaggedMessage(game, `You breathe ${element}, but there are no targets.`, 'info', {
      tags: ['combat.hit'],
      importance: 2,
    })
    return {
      success: true,
      message: `Breathed ${element}, but no targets.`,
      energyCost: BASE_ENERGY_COST,
    }
  }

  // Sort by distance, take up to maxTargets
  targets.sort((a, b) => {
    const distA = Math.abs(a.position.x - charPos.x) + Math.abs(a.position.y - charPos.y)
    const distB = Math.abs(b.position.x - charPos.x) + Math.abs(b.position.y - charPos.y)
    return distA - distB
  })
  const hitTargets = targets.slice(0, maxTargets)

  let totalDamage = 0
  let killedCount = 0
  const targetIds: string[] = []
  const events: ActionResult['events'] = []

  for (const target of hitTargets) {
    const killed = applyDamage(target, damage)
    totalDamage += damage
    targetIds.push(target.id)

    events.push({
      type: 'attack',
      attackerId: game.character.id,
      defenderId: target.id,
      damage,
      killed,
    })

    if (killed) {
      handleMonsterKill(game, target)
      killedCount++
    }
  }

  game.stats.damageDealt += totalDamage
  incrementStat(game.stats.damageBySource.ability, activation.name, totalDamage)
  trackAbilityUsage(game.stats, activation.name, totalDamage)

  const elementName = element === 'nature' ? 'acid' : element
  const killedStr = killedCount > 0 ? ` ${killedCount} killed!` : ''
  const message = `You breathe ${elementName} at ${hitTargets.length} enemies for ${totalDamage} damage!${killedStr}`
  addTaggedMessage(game, message, 'combat', { tags: ['combat.hit'], importance: 2 })

  return {
    success: true,
    message,
    damage: totalDamage,
    targets: targetIds,
    events,
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute AOE damage activation (Fire Ball, Cold Ball)
 */
function executeAOEDamage(
  game: GameState,
  activation: ActivationTemplate,
  _targetId?: string
): ActionResult {
  const baseDamage = activation.baseDamage ?? 50
  const maxTargets = activation.maxTargets ?? 4
  const radius = activation.aoeRadius ?? 2

  // Get visible monsters in range
  const charPos = game.character.position
  const targets = game.monsters.filter((m) => {
    if (m.hp <= 0) return false
    const tile = getTile(game.currentLevel, m.position.x, m.position.y)
    if (!tile?.visible) return false
    const dist = Math.abs(m.position.x - charPos.x) + Math.abs(m.position.y - charPos.y)
    return dist <= radius + 4 // Activation range is a bit longer than spell AOE radius
  })

  if (targets.length === 0) {
    addTaggedMessage(game, `You activate ${activation.name}, but there are no targets.`, 'info', {
      tags: ['combat.hit'],
      importance: 2,
    })
    return {
      success: true,
      message: `${activation.name} - no targets.`,
      energyCost: BASE_ENERGY_COST,
    }
  }

  // Sort by distance, take up to maxTargets
  targets.sort((a, b) => {
    const distA = Math.abs(a.position.x - charPos.x) + Math.abs(a.position.y - charPos.y)
    const distB = Math.abs(b.position.x - charPos.x) + Math.abs(b.position.y - charPos.y)
    return distA - distB
  })
  const hitTargets = targets.slice(0, maxTargets)

  let totalDamage = 0
  let killedCount = 0
  const targetIds: string[] = []
  const events: ActionResult['events'] = []

  for (const target of hitTargets) {
    // TODO: Apply monster resistance when elemental depth is implemented
    const damage = baseDamage
    const killed = applyDamage(target, damage)
    totalDamage += damage
    targetIds.push(target.id)

    events.push({
      type: 'attack',
      attackerId: game.character.id,
      defenderId: target.id,
      damage,
      killed,
    })

    if (killed) {
      handleMonsterKill(game, target)
      killedCount++
    }
  }

  game.stats.damageDealt += totalDamage
  incrementStat(game.stats.damageBySource.ability, activation.name, totalDamage)
  trackAbilityUsage(game.stats, activation.name, totalDamage)

  const killedStr = killedCount > 0 ? ` ${killedCount} killed!` : ''
  const message = `${activation.name} hits ${hitTargets.length} enemies for ${totalDamage} damage!${killedStr}`
  addTaggedMessage(game, message, 'combat', { tags: ['combat.hit'], importance: 2 })

  return {
    success: true,
    message,
    damage: totalDamage,
    targets: targetIds,
    events,
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute single target damage
 */
function executeSingleDamage(
  game: GameState,
  activation: ActivationTemplate,
  targetId?: string
): ActionResult {
  const baseDamage = activation.baseDamage ?? 30

  // Find target
  let target: Monster | null = null
  if (targetId) {
    target = game.monsters.find((m) => m.id === targetId && m.hp > 0) ?? null
  } else {
    // Find nearest visible monster
    const charPos = game.character.position
    const visible = game.monsters.filter((m) => {
      if (m.hp <= 0) return false
      const tile = getTile(game.currentLevel, m.position.x, m.position.y)
      return tile?.visible
    })
    if (visible.length > 0) {
      visible.sort((a, b) => {
        const distA = Math.abs(a.position.x - charPos.x) + Math.abs(a.position.y - charPos.y)
        const distB = Math.abs(b.position.x - charPos.x) + Math.abs(b.position.y - charPos.y)
        return distA - distB
      })
      target = visible[0] ?? null
    }
  }

  if (!target) {
    addTaggedMessage(game, `You activate ${activation.name}, but there are no targets.`, 'info', {
      tags: ['combat.hit'],
      importance: 2,
    })
    return {
      success: true,
      message: `${activation.name} - no targets.`,
      energyCost: BASE_ENERGY_COST,
    }
  }

  const damage = baseDamage
  const killed = applyDamage(target, damage)
  game.stats.damageDealt += damage
  incrementStat(game.stats.damageBySource.ability, activation.name, damage)
  trackAbilityUsage(game.stats, activation.name, damage)

  if (killed) {
    handleMonsterKill(game, target)
  }

  const killedStr = killed ? ' It dies!' : ''
  const message = `${activation.name} hits ${target.template.name} for ${damage} damage!${killedStr}`
  addTaggedMessage(game, message, 'combat', { tags: ['combat.hit'], importance: 2 })

  return {
    success: true,
    message,
    damage,
    targets: [target.id],
    events: [
      {
        type: 'attack',
        attackerId: game.character.id,
        defenderId: target.id,
        damage,
        killed,
      },
    ],
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute haste buff (Boots of Feanor)
 */
function executeHaste(game: GameState, activation: ActivationTemplate): ActionResult {
  const buff = activation.buff
  if (!buff) {
    return {
      success: true,
      message: `You feel faster.`,
      energyCost: BASE_ENERGY_COST,
    }
  }

  addStatusEffect(game.character, {
    type: buff.type,
    turnsRemaining: buff.duration,
    value: buff.value,
  })

  const message = `You activate ${activation.name}! You feel incredibly fast!`
  addTaggedMessage(game, message, 'good', { tags: ['buff'], importance: 2 })

  return {
    success: true,
    message,
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute illuminate effect (Phial of Galadriel)
 */
function executeIlluminate(game: GameState, activation: ActivationTemplate): ActionResult {
  const radius = activation.illuminateRadius ?? 8
  const charPos = game.character.position
  const level = game.currentLevel

  let illuminatedCount = 0

  // Reveal tiles in radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = charPos.x + dx
      const y = charPos.y + dy
      if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue

      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist > radius) continue

      const tile = level.tiles[y]?.[x]
      if (tile && !tile.explored) {
        tile.explored = true
        const idx = y * level.width + x
        level.explored[idx] = 1
        level.exploredCount++
        if (level.passable[idx]) level.exploredPassableCount++
        illuminatedCount++
      }
    }
  }

  const message = `The ${activation.name} shines brightly, illuminating ${illuminatedCount} tiles!`
  addTaggedMessage(game, message, 'good', { tags: ['buff'], importance: 2 })

  return {
    success: true,
    message,
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute blind effect (Totila flail)
 */
function executeBlindMonsters(game: GameState, activation: ActivationTemplate): ActionResult {
  const maxTargets = activation.maxTargets ?? 4
  const radius = activation.aoeRadius ?? 5
  const charPos = game.character.position

  // Get nearby visible monsters
  const targets = game.monsters.filter((m) => {
    if (m.hp <= 0) return false
    const tile = getTile(game.currentLevel, m.position.x, m.position.y)
    if (!tile?.visible) return false
    const dist = Math.abs(m.position.x - charPos.x) + Math.abs(m.position.y - charPos.y)
    return dist <= radius
  })

  if (targets.length === 0) {
    addTaggedMessage(game, `You activate ${activation.name}, but there are no targets.`, 'info', {
      tags: ['combat.hit'],
      importance: 2,
    })
    return {
      success: true,
      message: `${activation.name} - no targets.`,
      energyCost: BASE_ENERGY_COST,
    }
  }

  // Sort by distance, take up to maxTargets
  targets.sort((a, b) => {
    const distA = Math.abs(a.position.x - charPos.x) + Math.abs(a.position.y - charPos.y)
    const distB = Math.abs(b.position.x - charPos.x) + Math.abs(b.position.y - charPos.y)
    return distA - distB
  })
  const hitTargets = targets.slice(0, maxTargets)

  // Apply blind debuff
  for (const target of hitTargets) {
    target.debuffs.push({
      type: 'blind',
      turnsRemaining: 5,
      value: 50,
    })
  }

  const message = `${activation.name} blinds ${hitTargets.length} monsters!`
  addTaggedMessage(game, message, 'good', { tags: ['combat.hit'], importance: 2 })

  return {
    success: true,
    message,
    targets: hitTargets.map((t) => t.id),
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute heal effect (if any activation has it)
 */
function executeHeal(game: GameState, activation: ActivationTemplate): ActionResult {
  const healAmount = activation.baseDamage ?? 50 // Reusing baseDamage for heal amount
  const oldHp = game.character.hp

  game.character.hp = Math.min(game.character.hp + healAmount, game.character.maxHp)
  const actualHeal = game.character.hp - oldHp

  const message = `${activation.name} heals you for ${actualHeal} HP!`
  addTaggedMessage(game, message, 'good', { tags: ['healing'], importance: 4 })

  return {
    success: true,
    message,
    healed: actualHeal,
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute buff effect
 */
function executeBuff(game: GameState, activation: ActivationTemplate): ActionResult {
  const buff = activation.buff
  if (!buff) {
    return {
      success: true,
      message: `You activate ${activation.name}.`,
      energyCost: BASE_ENERGY_COST,
    }
  }

  addStatusEffect(game.character, {
    type: buff.type,
    turnsRemaining: buff.duration,
    value: buff.value,
  })

  const message = `You activate ${activation.name}!`
  addTaggedMessage(game, message, 'good', { tags: ['buff'], importance: 2 })

  return {
    success: true,
    message,
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Execute teleport effect (if any activation has it)
 */
function executeTeleport(game: GameState, activation: ActivationTemplate): ActionResult {
  // Simple teleport to random position - can be expanded later
  addTaggedMessage(game, `You activate ${activation.name} and teleport!`, 'info', {
    tags: ['buff'],
    importance: 2,
  })

  return {
    success: true,
    message: 'You teleport!',
    energyCost: BASE_ENERGY_COST,
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all activations available on equipped items
 */
export function getEquippedActivations(
  character: Character,
  currentTurn: number
): { itemId: string; activationId: string; name: string; ready: boolean; cooldown: number }[] {
  const result: {
    itemId: string
    activationId: string
    name: string
    ready: boolean
    cooldown: number
  }[] = []

  for (const item of Object.values(character.equipment)) {
    if (!item?.artifact?.abilities) continue

    for (const ability of item.artifact.abilities) {
      const activationId = parseArtifactActivation(ability)
      if (!activationId) continue

      const activation = getActivationById(activationId)
      if (!activation) continue

      const ready = canActivate(character, activationId, currentTurn)
      const cooldown = getActivationCooldown(character, activationId, currentTurn)

      result.push({
        itemId: item.id,
        activationId,
        name: activation.name,
        ready,
        cooldown,
      })
    }
  }

  return result
}
