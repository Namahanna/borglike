/**
 * Steal Action Handler for Borglike
 *
 * STEAL: Rogue ability to pickpocket gold from adjacent monsters.
 */

import type { GameState, ActionResult, Monster } from '../types'
import { isAdjacent } from '../types'
import { random, randomInt } from '../rng'
import { addTaggedMessage, BASE_ENERGY_COST } from './helpers'

// ============================================================================
// STEAL ACTION
// ============================================================================

/**
 * Check if a character can attempt to steal
 *
 * Requirements:
 * - Character class is Rogue
 * - Target monster exists and is adjacent
 */
export function canSteal(game: GameState, monster: Monster): boolean {
  // Only Rogues can steal
  if (game.character.classId !== 'rogue') return false

  // Must be adjacent
  return isAdjacent(game.character.position, monster.position)
}

/**
 * Handle steal action - attempt to pickpocket gold from a monster
 *
 * Success chance: 30% + DEX/2 + level*2 - monster_level*3
 * Success: Award gold based on monster level
 * Failure: Monster becomes aware and may retaliate
 *
 * @param game - Current game state
 * @param targetId - ID of the monster to steal from
 * @returns ActionResult with success/failure and message
 */
export function handleSteal(game: GameState, targetId: string): ActionResult {
  const monster = game.monsters.find((m) => m.id === targetId && m.hp > 0)

  if (!monster) {
    return { success: false, message: 'No target found.', energyCost: 0 }
  }

  // Only Rogues can steal
  if (game.character.classId !== 'rogue') {
    return { success: false, message: 'Only Rogues can steal.', energyCost: 0 }
  }

  // Must be adjacent
  if (!isAdjacent(game.character.position, monster.position)) {
    return { success: false, message: 'Target is too far away.', energyCost: 0 }
  }

  // Calculate success chance
  // Base 30% + DEX/2 + level*2 - monster_depth*3
  const baseChance = 30
  const dexBonus = Math.floor(game.character.stats.dex / 2)
  const levelBonus = game.character.level * 2
  const monsterDepth = monster.template.minDepth ?? 1
  const monsterPenalty = monsterDepth * 3

  const chance = Math.min(80, Math.max(10, baseChance + dexBonus + levelBonus - monsterPenalty))

  // Roll for success
  const roll = random() * 100

  if (roll < chance) {
    // Success - award gold based on monster depth
    const goldAmount = randomInt(5, 15) * Math.max(1, monsterDepth)
    game.character.gold += goldAmount
    game.stats.goldCollected += goldAmount
    game.stats.abilitiesUsed++

    addTaggedMessage(
      game,
      `You steal ${goldAmount} gold from the ${monster.template.name}!`,
      'good',
      {
        tags: ['loot.gold'],
        importance: 3,
      }
    )

    return {
      success: true,
      message: `Stole ${goldAmount} gold!`,
      energyCost: BASE_ENERGY_COST,
    }
  } else {
    // Failure - monster wakes up and becomes hostile
    monster.isAwake = true

    addTaggedMessage(game, `The ${monster.template.name} catches you stealing!`, 'danger', {
      tags: ['damage.taken'],
      importance: 3,
    })

    return {
      success: true, // Action was taken, just failed
      message: 'Caught!',
      energyCost: BASE_ENERGY_COST,
    }
  }
}
