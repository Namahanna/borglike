/**
 * Survival Logic - Barrel Export
 *
 * Re-exports all survival-related functionality from sub-modules:
 * - survival-retreat.ts: Retreat decisions, escape routes, HP monitoring, teleport/phase door
 * - survival-consumables.ts: Consumable usage (healing, buffs, utility)
 */

// ============================================================================
// RETREAT, ESCAPE & TELEPORT
// ============================================================================

export {
  // Types
  type RetreatEvaluation,
  type EscapeRoute,
  type TownPortalDecision,
  // Retreat decisions
  shouldRetreat,
  isCriticalHP,
  needsHealing,
  // Escape routes
  findBestEscapeRoute,
  findEscapeDirection,
  // HP monitoring
  getHPStatus,
  getHitsTillDeath,
  // Class-aware retreat
  shouldClassRetreat,
  // Town portal
  shouldUseTownPortal,
  // Phase door safety
  evaluatePhaseDoorSafety,
  shouldEscapeOverHeal,
} from './survival-retreat'

// ============================================================================
// CONSUMABLES
// ============================================================================

export {
  // Survival consumables
  getSurvivalConsumableAction,
  // Pre-combat buffs
  getPreCombatBuffAction,
  // Combat buffs
  getCombatBuffAction,
  // Utility consumables
  getUtilityConsumableAction,
  // Stuck exploration (detect stairs, mapping, teleport level)
  getStuckExplorationAction,
} from './survival-consumables'
