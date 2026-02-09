/**
 * Action Handler Helpers for Borglike
 *
 * Shared utilities used by action handlers.
 */

import type { GameState, GameMessage, MessageTag, MessageImportance } from '../types'
import type { ItemTemplate } from '../data/items'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base energy cost for actions (100 = 1 turn) */
export const BASE_ENERGY_COST = 100

// ============================================================================
// MESSAGE HELPERS
// ============================================================================

/** Options for tagged messages */
export interface MessageOptions {
  tags?: MessageTag[]
  importance?: MessageImportance
}

/**
 * Add a message to the game log (legacy signature for gradual migration)
 */
export function addMessage(game: GameState, text: string, type: GameMessage['type']): void {
  addTaggedMessage(game, text, type)
}

/**
 * Add a tagged message to the game log
 * @param game - Game state
 * @param text - Message text
 * @param type - Legacy message type (for backwards compat / styling)
 * @param options - Tags and importance for filtering
 */
export function addTaggedMessage(
  game: GameState,
  text: string,
  type: GameMessage['type'],
  options?: MessageOptions
): void {
  game.messages.push({
    turn: game.turn,
    text,
    type,
    tags: options?.tags,
    importance: options?.importance,
  })

  // Keep only last 100 messages
  if (game.messages.length > 100) {
    game.messages.shift()
  }
}

// ============================================================================
// HEALING HELPERS
// ============================================================================

/**
 * Get heal amount from potion template
 * Uses structured healBase + healPerLevel * level formula
 */
export function getHealAmount(template: ItemTemplate, level: number): number {
  return (template.healBase ?? 0) + (template.healPerLevel ?? 0) * level
}
