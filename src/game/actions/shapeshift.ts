/**
 * Shapeshift Action Handler for Borglike
 *
 * SHAPESHIFTING: Druid and Necromancer can transform into alternate forms
 * that provide stat modifiers and special abilities.
 */

import type { GameState, ActionResult } from '../types'
import { getFormById, getAvailableForms, canShapeshift } from '../data/forms'
import { recalculateCombatStats } from '../character'
import { addTaggedMessage, BASE_ENERGY_COST } from './helpers'

// ============================================================================
// SHAPESHIFT ACTION
// ============================================================================

/**
 * Handle shapeshift action - toggle or switch forms
 *
 * If the character is already in the requested form, they revert to normal.
 * If they're in a different form or normal, they shift to the new form.
 *
 * @param game - Current game state
 * @param formId - ID of the form to shift into
 * @returns ActionResult with success/failure and message
 */
export function handleShapeshift(game: GameState, formId: string): ActionResult {
  const character = game.character

  // Check if class can shapeshift at all
  if (!canShapeshift(character.classId)) {
    return {
      success: false,
      message: 'Your class cannot shapeshift.',
      energyCost: 0,
    }
  }

  // Get the requested form
  const form = getFormById(formId)
  if (!form) {
    return {
      success: false,
      message: 'Unknown form.',
      energyCost: 0,
    }
  }

  // Check if form belongs to this class
  if (form.classId !== character.classId) {
    return {
      success: false,
      message: `${form.name} is not available to your class.`,
      energyCost: 0,
    }
  }

  // Check level requirement
  if (character.level < form.minLevel) {
    return {
      success: false,
      message: `You must be level ${form.minLevel} to use ${form.name}.`,
      energyCost: 0,
    }
  }

  // If already in this form, revert to normal
  if (character.activeFormId === formId) {
    character.activeFormId = null
    recalculateCombatStats(character)
    game.stats.abilitiesUsed++
    addTaggedMessage(game, `You revert to your normal form.`, 'info', {
      tags: ['buff'],
      importance: 3,
    })
    return {
      success: true,
      message: 'Reverted to normal form.',
      energyCost: BASE_ENERGY_COST,
    }
  }

  // Check mana cost (only for initial transformation, not for reverting)
  if (form.manaCost > 0 && character.mp < form.manaCost) {
    return {
      success: false,
      message: `Not enough mana. ${form.name} requires ${form.manaCost} MP.`,
      energyCost: 0,
    }
  }

  // Pay mana cost
  if (form.manaCost > 0) {
    character.mp -= form.manaCost
  }

  // Transform into the new form
  character.activeFormId = formId
  recalculateCombatStats(character)
  game.stats.abilitiesUsed++
  addTaggedMessage(game, `You transform into ${form.name}!`, 'good', {
    tags: ['buff'],
    importance: 3,
  })

  return {
    success: true,
    message: `Transformed into ${form.name}.`,
    energyCost: BASE_ENERGY_COST,
  }
}

/**
 * Check if character can transform into a specific form
 */
export function canTransform(game: GameState, formId: string): boolean {
  const character = game.character
  const form = getFormById(formId)

  if (!form) return false
  if (form.classId !== character.classId) return false
  if (character.level < form.minLevel) return false

  // If already in this form, can always revert (no mana cost)
  if (character.activeFormId === formId) return true

  // Check mana cost for new transformation
  if (form.manaCost > 0 && character.mp < form.manaCost) return false

  return true
}

/**
 * Get the current active form (if any)
 */
export function getActiveForm(game: GameState) {
  if (!game.character.activeFormId) return null
  return getFormById(game.character.activeFormId)
}

/**
 * Get all forms the character can currently use (meeting level and mana requirements)
 */
export function getUsableForms(game: GameState) {
  const character = game.character
  const availableForms = getAvailableForms(character.classId, character.level)

  return availableForms.filter((form) => {
    // If already in this form, can always revert
    if (character.activeFormId === form.id) return true
    // Otherwise check mana
    return form.manaCost <= character.mp
  })
}
