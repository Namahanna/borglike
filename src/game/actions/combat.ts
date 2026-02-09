/**
 * Combat Action Handlers for Borglike
 *
 * Handles player attack actions (melee and ranged).
 */

import type { GameState, ActionResult, Monster } from '../types'
import {
  meleeAttack,
  applyDamage,
  formatMultiAttackMessage,
  multiRangedAttack,
  canRangedAttack,
  calculateLifesteal,
} from '../combat'
import { gainXP } from '../character'
import { getRaceById } from '../data/races'
import { DEFAULT_BONUSES, applyXPBonus } from '../upgrade-effects'
import { awardMonsterGold } from '../features'
import { addTaggedMessage, BASE_ENERGY_COST } from './helpers'
import { getKnowledgeBonuses } from '../knowledge-effects'
import { VICTORY_BOSS_NAME } from '../data/index'

// ============================================================================
// MELEE COMBAT
// ============================================================================

/**
 * Handle attack action
 *
 * Find monster by ID, resolve combat, apply damage, award XP
 */
export function handleAttack(game: GameState, targetId: string): ActionResult {
  const monster = game.monsters.find((m) => m.id === targetId)

  if (!monster) {
    return { success: false, message: 'No target found.', energyCost: 0 }
  }

  // Compute knowledge bonuses from bestiary (or override for testing)
  const knowledgeBonuses = getKnowledgeBonuses(
    monster.template.name,
    game.bestiary,
    game.balance.bestiaryBonusPercent,
    game.upgradeBonuses?.bestiaryCapPercent
  )

  // Resolve multi-attack with knowledge bonuses and armor penetration
  // Number of attacks scales with level, STR, and class cap
  const attackResult = meleeAttack(
    game.character,
    monster,
    knowledgeBonuses,
    game.balance.armorPenetration,
    game.upgradeBonuses?.armorPenPercent ?? 0
  )

  // Adrenaline Rush: +damage% when below 20% HP
  const adrenalinePercent = game.boosterBonuses?.adrenalineRushPercent ?? 0
  if (adrenalinePercent > 0 && game.character.hp < game.character.maxHp * 0.2) {
    attackResult.totalDamage = Math.floor(attackResult.totalDamage * (1 + adrenalinePercent / 100))
  }

  const message = formatMultiAttackMessage(`the ${monster.template.name}`, attackResult)
  addTaggedMessage(game, message, 'combat', { tags: ['combat.hit'], importance: 2 })

  // Track melee combat accuracy
  game.stats.meleeHits += attackResult.hits
  game.stats.meleeMisses += attackResult.attackCount - attackResult.hits
  game.stats.criticalHits += attackResult.criticals

  if (attackResult.hits > 0) {
    // Apply total damage to monster
    applyDamage(monster, attackResult.totalDamage)
    game.stats.damageDealt += attackResult.totalDamage
    game.stats.damageBySource.melee += attackResult.totalDamage

    // SNEAK ATTACK: Consume buff and show message
    const sneakAttackIndex = game.character.statusEffects.findIndex(
      (e) => e.type === 'sneak_attack'
    )
    if (sneakAttackIndex >= 0) {
      game.character.statusEffects.splice(sneakAttackIndex, 1)
      addTaggedMessage(game, 'Sneak Attack!', 'good', { tags: ['combat.hit'], importance: 2 })
    }

    // COMBAT_REGEN: Lifesteal healing (Blackguard)
    const lifesteal = calculateLifesteal(game.character, attackResult.totalDamage)
    if (lifesteal > 0) {
      game.character.hp = Math.min(game.character.hp + lifesteal, game.character.maxHp)
      game.stats.healingBySource.lifesteal += lifesteal
      addTaggedMessage(game, `You drain ${lifesteal} HP!`, 'good', {
        tags: ['combat.hit'],
        importance: 2,
      })
    }

    if (attackResult.killed) {
      handleMonsterKill(game, monster)
    }
  }

  return { success: true, energyCost: BASE_ENERGY_COST }
}

// ============================================================================
// RANGED COMBAT
// ============================================================================

/**
 * Handle ranged attack action
 *
 * Find monster by ID, validate range, resolve ranged combat, apply damage, award XP
 */
export function handleRangedAttack(game: GameState, targetId: string): ActionResult {
  const monster = game.monsters.find((m) => m.id === targetId)

  if (!monster) {
    return { success: false, message: 'No target found.', energyCost: 0 }
  }

  // Check if we can perform ranged attack
  if (!canRangedAttack(game.character, monster.position)) {
    // Check specific failure reasons
    const bow = game.character.equipment.bow
    if (!bow) {
      return { success: false, message: 'You have no bow equipped.', energyCost: 0 }
    }

    const dx = Math.abs(monster.position.x - game.character.position.x)
    const dy = Math.abs(monster.position.y - game.character.position.y)
    const distance = Math.max(dx, dy)

    if (distance < 2) {
      return {
        success: false,
        message: 'Target is too close for ranged attack.',
        energyCost: 0,
      }
    }

    const range = bow.template.range ?? 8
    if (distance > range) {
      return { success: false, message: 'Target is out of range.', energyCost: 0 }
    }

    return { success: false, message: 'Cannot perform ranged attack.', energyCost: 0 }
  }

  // Calculate distance
  const dx = Math.abs(monster.position.x - game.character.position.x)
  const dy = Math.abs(monster.position.y - game.character.position.y)
  const distance = Math.max(dx, dy)

  // Compute knowledge bonuses from bestiary (or override for testing)
  const knowledgeBonuses = getKnowledgeBonuses(
    monster.template.name,
    game.bestiary,
    game.balance.bestiaryBonusPercent,
    game.upgradeBonuses?.bestiaryCapPercent
  )

  // Resolve multi-shot ranged attack with knowledge bonuses and armor penetration
  // FAST_SHOT: Rangers get +1 shot per 3 levels
  const attackResult = multiRangedAttack(
    game.character,
    monster,
    distance,
    knowledgeBonuses,
    game.balance.armorPenetration,
    game.upgradeBonuses?.armorPenPercent ?? 0
  )

  // Adrenaline Rush: +damage% when below 20% HP
  const adrenalinePercent = game.boosterBonuses?.adrenalineRushPercent ?? 0
  if (adrenalinePercent > 0 && game.character.hp < game.character.maxHp * 0.2) {
    attackResult.totalDamage = Math.floor(attackResult.totalDamage * (1 + adrenalinePercent / 100))
  }

  const message = formatMultiAttackMessage(`the ${monster.template.name}`, attackResult, 'arrow')
  addTaggedMessage(game, message, 'combat', { tags: ['combat.hit'], importance: 2 })

  // Track ranged combat accuracy
  game.stats.rangedHits += attackResult.hits
  game.stats.rangedMisses += attackResult.attackCount - attackResult.hits
  game.stats.criticalHits += attackResult.criticals

  if (attackResult.hits > 0) {
    // Apply total damage to monster
    applyDamage(monster, attackResult.totalDamage)
    game.stats.damageDealt += attackResult.totalDamage
    game.stats.damageBySource.ranged += attackResult.totalDamage

    if (attackResult.killed) {
      handleMonsterKill(game, monster)
    }
  }

  return { success: true, energyCost: BASE_ENERGY_COST }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Handle monster death - award XP, gold, check victory, track unique kills
 *
 * This is the single source of truth for monster kill handling.
 * All kill paths (melee, ranged, spells) should call this function.
 */
export function handleMonsterKill(game: GameState, monster: Monster): void {
  // Remove monster from game
  const monsterIndex = game.monsters.findIndex((m) => m.id === monster.id)
  if (monsterIndex >= 0) {
    game.monsters.splice(monsterIndex, 1)
  }

  // Track unique kills
  if (monster.template.flags.includes('UNIQUE')) {
    game.uniqueState.killed.add(monster.template.name)
  }

  // Award XP with upgrade bonus and balance rate
  const bonuses = game.upgradeBonuses ?? DEFAULT_BONUSES
  const baseXP = monster.template.experience
  let upgradedXP = applyXPBonus(baseXP, bonuses)

  // RACIAL: XP bonuses from race abilities (ability-driven, not hardcoded to raceId)
  const race = getRaceById(game.character.raceId)
  const raceAbilityIds = race?.abilities.map((a) => a.id) ?? []
  if (raceAbilityIds.includes('versatile')) {
    upgradedXP = Math.floor(upgradedXP * 1.1) // +10% XP
  } else if (raceAbilityIds.includes('quick_learner')) {
    upgradedXP = Math.floor(upgradedXP * 1.05) // +5% XP
  }

  const xpToAward = Math.floor((upgradedXP * game.balance.xpRatePercent) / 100)
  const { leveledUp, newLevel } = gainXP(game.character, xpToAward, game.balance.levelupHpPercent)
  game.stats.kills++

  // Track monster kill by name for bestiary
  const monsterName = monster.template.name
  game.stats.monsterKills[monsterName] = (game.stats.monsterKills[monsterName] || 0) + 1

  // Award gold from monster
  awardMonsterGold(game, monster.template)

  if (leveledUp && newLevel) {
    addTaggedMessage(game, `You have reached level ${newLevel}!`, 'good', {
      tags: ['progress'],
      importance: 5,
    })
  }

  // Check for victory (killed Morgoth)
  if (monster.template.flags.includes('UNIQUE') && monster.template.name === VICTORY_BOSS_NAME) {
    game.isVictory = true
  }
}
