/**
 * Inventory Action Handlers for Borglike
 *
 * Handles item pickup, equip, drop, and unequip actions.
 */

import type { GameState, ActionResult, EquipSlot, GroundItem } from '../types'
import { equipItem } from '../character'
import { pickupGold } from '../features'
import { addTaggedMessage, BASE_ENERGY_COST } from './helpers'

// ============================================================================
// PICKUP
// ============================================================================

/**
 * Handle item pickup
 */
export function handlePickup(game: GameState, itemId: string): ActionResult {
  const itemIndex = game.items.findIndex(
    (i) =>
      i.id === itemId &&
      i.position.x === game.character.position.x &&
      i.position.y === game.character.position.y
  )

  if (itemIndex < 0) {
    // Check if any item is at current position
    const itemAtPosition = game.items.find(
      (i) =>
        i.position.x === game.character.position.x && i.position.y === game.character.position.y
    )

    if (itemAtPosition) {
      return handlePickup(game, itemAtPosition.id)
    }

    return { success: false, message: 'There is nothing here to pick up.', energyCost: 0 }
  }

  const item = game.items[itemIndex]
  if (!item) {
    return { success: false, message: 'Item not found.', energyCost: 0 }
  }
  game.items.splice(itemIndex, 1)

  // Handle gold items specially
  if (item.goldValue !== undefined) {
    pickupGold(game, item)
    return { success: true, energyCost: BASE_ENERGY_COST }
  }

  // Add to inventory (strip position data)
  game.character.inventory.push(item)
  game.stats.itemsFound++

  // Track item discovery for catalog
  const itemName = item.artifact?.name ?? item.template.name
  if (!game.stats.itemsDiscovered[itemName]) {
    game.stats.itemsDiscovered[itemName] = {
      depth: game.character.depth,
      isArtifact: !!item.artifact,
    }
  }

  addTaggedMessage(game, `You pick up ${item.template.name}.`, 'item', {
    tags: ['loot.item'],
    importance: 2,
  })

  return { success: true, energyCost: BASE_ENERGY_COST }
}

// ============================================================================
// EQUIP
// ============================================================================

/**
 * Handle item equip
 */
export function handleEquip(game: GameState, itemId: string): ActionResult {
  const itemIndex = game.character.inventory.findIndex((i) => i.id === itemId)

  if (itemIndex < 0) {
    return { success: false, message: 'You do not have that item.', energyCost: 0 }
  }

  const item = game.character.inventory[itemIndex]
  if (!item) {
    return { success: false, message: 'Item not found.', energyCost: 0 }
  }

  // Check if item is equippable
  if (!item.template.slot) {
    return { success: false, message: 'You cannot equip that item.', energyCost: 0 }
  }

  const result = equipItem(game.character, item)

  if (result.success) {
    addTaggedMessage(game, `You equip ${item.template.name}.`, 'item', {
      tags: ['loot.item'],
      importance: 2,
    })
    if (result.unequipped) {
      addTaggedMessage(game, `You unequip ${result.unequipped.template.name}.`, 'item', {
        tags: ['loot.item'],
        importance: 2,
      })
    }
    return { success: true, energyCost: BASE_ENERGY_COST }
  }

  return { success: false, message: 'You cannot equip that item.', energyCost: 0 }
}

// ============================================================================
// DROP
// ============================================================================

/**
 * Handle item drop
 */
export function handleDrop(game: GameState, itemId: string): ActionResult {
  const itemIndex = game.character.inventory.findIndex((i) => i.id === itemId)

  if (itemIndex < 0) {
    return { success: false, message: 'You do not have that item.', energyCost: 0 }
  }

  const item = game.character.inventory[itemIndex]
  if (!item) {
    return { success: false, message: 'Item not found.', energyCost: 0 }
  }
  game.character.inventory.splice(itemIndex, 1)

  // Create ground item with position
  const droppedItem: GroundItem = {
    id: item.id,
    template: item.template,
    enchantment: item.enchantment,
    artifact: item.artifact,
    position: { ...game.character.position },
  }

  // Add to ground items
  game.items.push(droppedItem)

  addTaggedMessage(game, `You drop ${item.template.name}.`, 'item', {
    tags: ['loot.item'],
    importance: 2,
  })

  return { success: true, energyCost: BASE_ENERGY_COST }
}

// ============================================================================
// UNEQUIP
// ============================================================================

/**
 * Handle unequip action
 */
export function handleUnequip(game: GameState, slot: EquipSlot): ActionResult {
  const item = game.character.equipment[slot]

  if (!item) {
    return { success: false, message: 'Nothing is equipped in that slot.', energyCost: 0 }
  }

  // Move to inventory
  delete game.character.equipment[slot]
  game.character.inventory.push(item)

  addTaggedMessage(game, `You unequip ${item.template.name}.`, 'item', {
    tags: ['loot.item'],
    importance: 2,
  })

  return { success: true, energyCost: BASE_ENERGY_COST }
}
