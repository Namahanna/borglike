/**
 * Game Module Exports
 *
 * Re-exports all game systems for easy importing.
 */

// Types
export * from './types'

// Data
export * from './data/index'

// Core Systems
export {
  createCharacter,
  gainXP,
  equipItem,
  unequipItem,
  calculateStats,
  calculateCombatStats,
} from './character'
export {
  generateLevel,
  getTile,
  setTile,
  isWalkable,
  isOpaque,
  findOpenPosition,
  findOpenPositions,
  getAdjacentPositions,
  distance,
  manhattanDistance,
  computeFOV,
  setAllTilesVisible,
  findPath,
} from './dungeon'
export {
  attack,
  applyDamage,
  isCharacter,
  isMonster,
  formatAttackMessage,
  formatAttackMessageFromEntities,
  getAttackerStats,
  getDefenderStats,
} from './combat'
export {
  spawnMonster,
  spawnMonstersForLevel,
  canSeePlayer,
  wakeNearbyMonsters,
  decideAction as decideMonsterAction,
  findMoveTowardPlayer,
  findRandomMove,
  updateMonsterEnergy,
  resetMonsterEnergy,
  canMonsterAct,
  processMonsterTurns,
} from './monster-ai'

// Items
export {
  createItem,
  createArtifact,
  createGroundItem,
  spawnItemsForLevel,
  getItemsAtPosition,
  findGroundItemById,
  removeGroundItem,
  dropItemOnGround,
  getItemDisplayName,
  getItemGlyph,
  getItemColor,
  createHealingPotions,
  createTeleportScrolls,
  createStartingEquipment,
  createRandomPotion,
} from './items'
// Note: GroundItem is exported from './types'

// Game Loop
export { createGame, processTurn, addMessage, BASE_ENERGY_COST } from './game-loop'

// Action Handlers
export {
  handleMove,
  handleAttack,
  handleRangedAttack,
  handleDescend,
  handleAscend,
  handlePickup,
  handleUse,
  handleEquip,
  handleDrop,
  handleUnequip,
  handleWait,
  handleUseFountain,
  handleUseAltar,
  handleShopBuy,
  handleShopSell,
  handleCast,
  handleReturnPortal,
  handleUseHealer,
} from './actions'

// Status Effects
export {
  addStatusEffect,
  tickStatusEffects,
  addTempResistance,
  tickTempResistances,
  processPoison,
  checkSecondWind,
} from './status-effects'

// Level Cache
export {
  touchLevelCache,
  evictOldLevels,
  getCachedLevel,
  cacheLevel,
  LEVEL_CACHE_MAX_SIZE,
} from './level-cache'

// Features
export {
  useFountain,
  useAltar,
  buyFromMerchant,
  sellToMerchant,
  findAdjacentMerchant,
  isOnFountain,
  isOnAltar,
  getFountainAt,
  getAltarAt,
  awardMonsterGold,
  createGoldPile,
  pickupGold,
  initializeFountain,
  initializeAltar,
  initializeMerchant,
  // Trap functions
  initializeTrap,
  checkTrapDetection,
  triggerTrap,
  getRevealedTrapAt,
  getTrapAt,
} from './features'

// Bot AI
export {
  buildBotContext,
  runBotTick,
  getBotStatus,
  createBotState,
  getPersonalityConfig,
  getDepthReadiness,
} from './bot'

// Bot AI Types
export type { BotState, BotGoal, PersonalityConfig } from './bot'

// Game Runner
export {
  createGameRunner,
  calculateEssence,
  runBatchGames,
  quickRun,
  type RunnerConfig,
  type RunResult,
  type BatchResult,
} from './game-runner'

// Upgrade Effects
export {
  computeUpgradeBonuses,
  applyDamageBonus,
  applyGoldBonus,
  mergeWithBoosterBonuses,
} from './upgrade-effects'
export type { CombinedBonuses } from './upgrade-effects'

// Booster Effects
export { computeBoosterBonuses, DEFAULT_BOOSTER_BONUSES } from './booster-effects'
export type { BoosterBonuses } from './booster-effects'

// Knowledge Effects
export {
  getKnowledgeBonus,
  getKnowledgeBonuses,
  DEFAULT_KNOWLEDGE_BONUSES,
} from './knowledge-effects'
export type { KnowledgeBonuses } from './knowledge-effects'

// Booster Data
export {
  boosters,
  boostersByCategory,
  getBoosterById,
  canUnlockBooster,
  getBoostersDependingOn,
} from './data/boosters'
export type { BoosterDefinition, BoosterCategory, BoosterEffect } from './data/boosters'

// Spell Resolution
export {
  castSpell,
  canCast,
  getKnownSpells,
  knowsSpell,
  isOnCooldown,
  getCooldownRemaining,
  getAvailableSpells,
  calculateSpellPower,
  selectAOETargets,
  findTarget,
  getNearestVisibleMonster,
  findTeleportDestination,
} from './spell-resolution'
