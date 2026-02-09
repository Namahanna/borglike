/**
 * Bot AI Module
 *
 * Provides auto-player functionality for Borglike.
 * This module implements reliable movement with danger avoidance,
 * goal-based decision making, combat engagement, item evaluation,
 * smart exploration, personality-driven behavior, and anti-stuck recovery.
 */

// ============================================================================
// CORE
// ============================================================================

// Main tick loop
export { runBotTick } from './tick'

// State management
export { createBotState, resetLevelState } from './state'

// Context building
export { buildBotContext, getBotStatus } from './context'

// ============================================================================
// TYPES
// ============================================================================

export type {
  BotState,
  BotGoal,
  BotContext,
  PersonalityConfig,
  DangerTier,
  PhaseDoorSafety,
} from './types'

// ============================================================================
// DANGER & AVOIDANCE
// ============================================================================

export {
  calculateAvoidance,
  getDangerTier,
  getImmediateDanger,
  getImmediateDangerTier,
} from './danger'

// ============================================================================
// PERSONALITY SYSTEM
// ============================================================================

export {
  PERSONALITIES,
  getPersonalityConfig,
  getPersonalityTypes,
  isValidPersonality,
  createCustomPersonality,
  blendPersonalities,
  modifyPersonality,
  validatePersonality,
  describePersonality,
  summarizePersonality,
  comparePersonalities,
  predictCombatBehavior,
  predictExplorationBehavior,
  getItemDetourDistance,
  getEffectiveDangerThreshold,
  getPersonalityDebugInfo,
  PARAMETER_INFO,
} from './personality'

export type { ParameterInfo } from './personality'

// ============================================================================
// ITEMS
// ============================================================================

export {
  evaluateItem,
  shouldPickup,
  shouldEquip,
  compareEquipment,
  calculateEquipmentScore,
  findEquipmentUpgrades,
  prioritizeItems,
  findHealingPotion,
  findEscapeScroll,
  findPhaseDoorScroll,
  findFullTeleportScroll,
  findSpeedPotion,
  findBuffPotion,
  findResistancePotion,
  findNeutralizePoison,
  findBlessingScroll,
  findProtectionScroll,
  findMappingScroll,
  findEnchantScroll,
  hasStatusEffect,
  hasTempResistance,
} from './items'

export type { ItemEvaluation, EquipmentComparison } from './items'

// ============================================================================
// SURVIVAL
// ============================================================================

export {
  getSurvivalConsumableAction,
  getCombatBuffAction,
  getPreCombatBuffAction,
  getUtilityConsumableAction,
  shouldRetreat,
  needsHealing,
  isCriticalHP,
  findBestEscapeRoute,
  getHPStatus,
  getHitsTillDeath,
  evaluatePhaseDoorSafety,
  shouldEscapeOverHeal,
} from './survival'

export type { RetreatEvaluation, EscapeRoute } from './survival'

// ============================================================================
// EXPLORATION
// ============================================================================

export {
  findFrontierTiles,
  findExplorationTarget,
  getExplorationStats,
  getExplorationProgress,
  shouldStopExploring,
  findExplorationClusters,
  findBestCluster,
  getExplorationDebugInfo,
} from './exploration'

export type { FrontierTile, ExplorationCluster, ExplorationStats } from './exploration'

// ============================================================================
// PREPARATION (depth readiness)
// ============================================================================

export { getDepthReadiness } from './preparation'

// ============================================================================
// SHAPESHIFT (druid forms)
// ============================================================================

export {
  isShapeshifterClass,
  isInBearForm,
  isInRavenForm,
  isInAnyForm,
  canEnterBearForm,
  canEnterRavenForm,
  shouldEnterBearForm,
  shouldEnterRavenForm,
  shouldExitCurrentForm,
  getShapeshiftAction,
  getDruidTierAction,
} from './shapeshift'
