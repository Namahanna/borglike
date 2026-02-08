/**
 * Bot Activation Decision Functions
 *
 * Wires artifact activations (AOE damage, haste) into the bot's tier-based
 * decision system. These are mana-free fallbacks that complement spell casting.
 */

import type { GameState, GameAction, Monster } from '../types'
import type { BotContext } from './types'
import { getEquippedActivations } from '../actions/activation'
import { getActivationById } from '../data/activations'
import { hasStatusEffect } from './items'

/**
 * Try to use an AOE damage activation (Fire Ball, Cold Ball) as mana-free fallback.
 *
 * - Gated by tactics >= 1
 * - Requires 2+ visible monsters (AOE only worthwhile with multi-target)
 * - Prefers highest baseDamage when multiple activations are ready
 */
export function getAOEActivationAction(
  game: GameState,
  context: BotContext,
  visibleMonsters: Monster[]
): GameAction | null {
  if (context.capabilities.tactics < 1) return null
  if (visibleMonsters.length < 2) return null

  const activations = getEquippedActivations(game.character, game.turn)
  const readyAOE = activations
    .filter((a) => {
      if (!a.ready) return false
      const template = getActivationById(a.activationId)
      return template?.effectType === 'aoe_damage'
    })
    .map((a) => ({
      ...a,
      baseDamage: getActivationById(a.activationId)?.baseDamage ?? 0,
    }))
    .sort((a, b) => b.baseDamage - a.baseDamage)

  const best = readyAOE[0]
  if (!best) return null

  return { type: 'activate', itemId: best.itemId }
}

/**
 * Try to use a haste activation (Boots of Feanor) for speed buff.
 *
 * - Gated by tactics >= 2
 * - Requires visible monsters (don't waste on exploration)
 * - Skips if already hasted
 */
export function getHasteActivationAction(
  game: GameState,
  context: BotContext,
  visibleMonsters: Monster[]
): GameAction | null {
  if (context.capabilities.tactics < 2) return null
  if (visibleMonsters.length === 0) return null
  if (hasStatusEffect(game.character, 'speed')) return null

  const activations = getEquippedActivations(game.character, game.turn)
  const readyHaste = activations.find((a) => {
    if (!a.ready) return false
    const template = getActivationById(a.activationId)
    return template?.effectType === 'haste'
  })

  if (!readyHaste) return null

  return { type: 'activate', itemId: readyHaste.itemId }
}
