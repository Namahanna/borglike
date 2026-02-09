/**
 * Interaction Action Handlers for Borglike
 *
 * Handles feature interactions: fountains, altars, merchants, healer, spells, portals.
 */

import type { GameState, ActionResult, MessageTag } from '../types'
import { useFountain, useAltar, buyFromMerchant, sellToMerchant } from '../features'
import { castSpell } from '../spell-resolution'
import { returnFromTown, useHealer, isOnPortal, isInTown, enterTown } from '../town'
import { addTaggedMessage, BASE_ENERGY_COST } from './helpers'

// ============================================================================
// FEATURE INTERACTIONS
// ============================================================================

/**
 * Handle using a fountain
 */
export function handleUseFountain(game: GameState): ActionResult {
  const success = useFountain(game)
  return { success, energyCost: success ? BASE_ENERGY_COST : 0 }
}

/**
 * Handle using an altar
 */
export function handleUseAltar(game: GameState): ActionResult {
  const success = useAltar(game)
  return { success, energyCost: success ? BASE_ENERGY_COST : 0 }
}

// ============================================================================
// MERCHANT INTERACTIONS
// ============================================================================

/**
 * Handle buying from a merchant
 */
export function handleShopBuy(
  game: GameState,
  merchantIndex: number,
  itemIndex: number
): ActionResult {
  const success = buyFromMerchant(game, merchantIndex, itemIndex)
  return { success, energyCost: success ? BASE_ENERGY_COST : 0 }
}

/**
 * Handle selling to a merchant
 */
export function handleShopSell(
  game: GameState,
  merchantIndex: number,
  inventoryIndex: number
): ActionResult {
  const success = sellToMerchant(game, merchantIndex, inventoryIndex)
  return { success, energyCost: success ? BASE_ENERGY_COST : 0 }
}

// ============================================================================
// SPELL CASTING
// ============================================================================

/**
 * Handle spell casting
 */
export function handleCast(game: GameState, spellId: string, targetId?: string): ActionResult {
  // GOLEM RESTRICTION: Cannot cast spells
  if (game.character.raceId === 'golem') {
    return {
      success: false,
      message: 'Golems cannot cast spells.',
      energyCost: 0,
    }
  }

  const result = castSpell(game, spellId, targetId)

  if (result.message) {
    const messageType = result.success ? (result.damage ? 'combat' : 'good') : 'info'
    // Spell messages are tagged based on spell effect - combat spells are damage, healing spells are healing
    const tags: MessageTag[] = result.damage
      ? ['combat.hit']
      : result.healed
        ? ['healing']
        : ['buff']
    // Spell damage is routine combat spam like melee (importance 2)
    // Heals/buffs are less frequent and more noteworthy (importance 3)
    // Vision buffs (Light Orb, Shadow Sight) are constantly recast — treat as routine
    const ROUTINE_BUFF_SPELLS = new Set(['light_orb', 'shadow_sight'])
    const isRoutineBuff = !result.damage && !result.healed && ROUTINE_BUFF_SPELLS.has(spellId)
    addTaggedMessage(game, result.message, messageType, {
      tags,
      importance: result.damage || isRoutineBuff ? 2 : 3,
    })
  }

  return {
    success: result.success,
    message: result.message,
    energyCost: result.success ? BASE_ENERGY_COST : 0,
    damage: result.damage,
    healed: result.healed,
    targets: result.targets,
    events: result.events,
  }
}

// ============================================================================
// TOWN PORTAL
// ============================================================================

/**
 * Handle returning through town portal
 *
 * Player must be standing on a portal tile to use this.
 */
export function handleReturnPortal(game: GameState): ActionResult {
  // Check if standing on portal tile
  if (!isOnPortal(game)) {
    return { success: false, message: 'You are not on a portal.', energyCost: 0 }
  }

  // Check if portal exists
  if (!game.townPortal) {
    return { success: false, message: 'No active portal.', energyCost: 0 }
  }

  // If in town, return to dungeon
  if (isInTown(game)) {
    const result = returnFromTown(game)
    if (result.success) {
      addTaggedMessage(game, 'You return to the dungeon through the portal.', 'info', {
        tags: ['progress'],
        importance: 3,
      })
    }
    return result
  }

  // If in dungeon standing on portal, enter town
  // This case is handled by the town portal scroll in consumables.ts
  // But if player walks back onto the portal, they can use it
  enterTown(game)
  addTaggedMessage(game, 'You step through the portal to town.', 'info', {
    tags: ['progress'],
    importance: 3,
  })
  return { success: true, energyCost: BASE_ENERGY_COST }
}

// ============================================================================
// HEALER
// ============================================================================

/**
 * Handle using the healer in town
 *
 * Player must be adjacent to healer NPC.
 */
export function handleUseHealer(game: GameState): ActionResult {
  const result = useHealer(game)
  if (result.message) {
    addTaggedMessage(game, result.message, result.success ? 'good' : 'info', {
      tags: ['healing'],
      importance: 3,
    })
  }
  return result
}
