/**
 * Action Handlers for Borglike
 *
 * Central export point for all player action handlers.
 */

// ============================================================================
// HELPERS
// ============================================================================

export { addMessage, addTaggedMessage, BASE_ENERGY_COST, getHealAmount } from './helpers'

// ============================================================================
// MOVEMENT
// ============================================================================

export { handleMove, handleWait, handleDescend, handleAscend } from './movement'

// ============================================================================
// COMBAT
// ============================================================================

export { handleAttack, handleRangedAttack } from './combat'

// ============================================================================
// STEAL (Rogue ability)
// ============================================================================

export { handleSteal, canSteal } from './steal'

// ============================================================================
// SHAPESHIFT (Druid/Necromancer ability)
// ============================================================================

export { handleShapeshift, canTransform, getActiveForm, getUsableForms } from './shapeshift'

// ============================================================================
// ACTIVATIONS (Artifact/Racial abilities)
// ============================================================================

export {
  handleActivate,
  handleRacialActivation,
  canActivate,
  getActivationCooldown,
  canUseRacialAbility,
  getRacialAbilityCooldown,
  getEquippedActivations,
} from './activation'

// ============================================================================
// INVENTORY
// ============================================================================

export { handlePickup, handleEquip, handleDrop, handleUnequip } from './inventory'

// ============================================================================
// CONSUMABLES
// ============================================================================

export { handleUse } from './consumables'

// ============================================================================
// INTERACTIONS
// ============================================================================

export {
  handleUseFountain,
  handleUseAltar,
  handleShopBuy,
  handleShopSell,
  handleCast,
  handleReturnPortal,
  handleUseHealer,
} from './interaction'
