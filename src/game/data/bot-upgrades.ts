/**
 * Bot Training Upgrade Definitions
 *
 * Per-slot upgrades that unlock bot capabilities.
 * Costs are essence-based, paid from the global essence pool.
 */

import type { BotCapabilities } from '../../types/progression'

export type BotUpgradeId =
  | 'farming'
  | 'tactics_1'
  | 'tactics_2'
  | 'tactics_3'
  | 'town_1'
  | 'town_2'
  | 'town_3'
  | 'preparedness_1'
  | 'preparedness_2'
  | 'preparedness_3'
  | 'sweep_1'
  | 'sweep_2'
  | 'sweep_3'
  | 'surf_1'
  | 'surf_2'
  | 'surf_3'
  | 'kiting_1'
  | 'kiting_2'
  | 'kiting_3'
  | 'targeting_1'
  | 'targeting_2'
  | 'targeting_3'
  | 'retreat_1'
  | 'retreat_2'
  | 'retreat_3'

export interface BotUpgradeDefinition {
  id: BotUpgradeId
  name: string
  description: string
  cost: number // Computed from chain config for graded, explicit for toggles
  requires?: BotUpgradeId // Prerequisite upgrade
  category: 'toggle' | 'graded'
  // For graded upgrades - which field and what level it grants
  targetField?: GradedCapabilityField
  targetLevel?: number
}

// Chain cost configuration: cost = floor(baseCost * costScaling^tierIndex)
interface ChainCostConfig {
  baseCost: number
  costScaling: number
}

function chainCost(config: ChainCostConfig, tier: number): number {
  return Math.floor(config.baseCost * Math.pow(config.costScaling, tier - 1))
}

// =============================================================================
// CHAIN COST CONFIGS
// =============================================================================

const CHAIN_COSTS = {
  tactics: { baseCost: 200, costScaling: 1.8 },
  town: { baseCost: 100, costScaling: 1.5 },
  preparedness: { baseCost: 150, costScaling: 1.8 },
  sweep: { baseCost: 150, costScaling: 1.8 },
  surf: { baseCost: 200, costScaling: 1.8 },
  kiting: { baseCost: 250, costScaling: 2.0 },
  targeting: { baseCost: 200, costScaling: 1.8 },
  retreat: { baseCost: 250, costScaling: 1.8 },
}

// =============================================================================
// TOGGLE UPGRADES (ON/OFF capabilities)
// =============================================================================

const farmingUpgrade: BotUpgradeDefinition = {
  id: 'farming',
  name: 'Resource Farming',
  description: 'Farms gold/XP when under-leveled for descent',
  cost: 200,
  category: 'toggle',
}

// =============================================================================
// TACTICS UPGRADES (combat spell usage)
// =============================================================================

const tactics1: BotUpgradeDefinition = {
  id: 'tactics_1',
  name: 'Tactics I',
  description: 'Use debuff spells (slow, weaken)',
  cost: chainCost(CHAIN_COSTS.tactics, 1),
  category: 'graded',
  targetField: 'tactics',
  targetLevel: 1,
}

const tactics2: BotUpgradeDefinition = {
  id: 'tactics_2',
  name: 'Tactics II',
  description: 'Use pre-combat buffs and buff spells',
  cost: chainCost(CHAIN_COSTS.tactics, 2),
  requires: 'tactics_1',
  category: 'graded',
  targetField: 'tactics',
  targetLevel: 2,
}

const tactics3: BotUpgradeDefinition = {
  id: 'tactics_3',
  name: 'Tactics III',
  description: 'Smart debuff targeting (threat analysis)',
  cost: chainCost(CHAIN_COSTS.tactics, 3),
  requires: 'tactics_2',
  category: 'graded',
  targetField: 'tactics',
  targetLevel: 3,
}

// =============================================================================
// TOWN UPGRADES (town access capabilities)
// =============================================================================

const town1: BotUpgradeDefinition = {
  id: 'town_1',
  name: 'Town I',
  description: 'Use town portal scrolls (escape & return)',
  cost: chainCost(CHAIN_COSTS.town, 1),
  category: 'graded',
  targetField: 'town',
  targetLevel: 1,
}

const town2: BotUpgradeDefinition = {
  id: 'town_2',
  name: 'Town II',
  description: 'Visit healer for HP restore',
  cost: chainCost(CHAIN_COSTS.town, 2),
  requires: 'town_1',
  category: 'graded',
  targetField: 'town',
  targetLevel: 2,
}

const town3: BotUpgradeDefinition = {
  id: 'town_3',
  name: 'Town III',
  description: 'Sell loot and buy from shops',
  cost: chainCost(CHAIN_COSTS.town, 3),
  requires: 'town_2',
  category: 'graded',
  targetField: 'town',
  targetLevel: 3,
}

// =============================================================================
// PREPAREDNESS UPGRADES (depth readiness checks)
// =============================================================================

const preparedness1: BotUpgradeDefinition = {
  id: 'preparedness_1',
  name: 'Preparedness I',
  description: 'Check basic consumable counts before descent',
  cost: chainCost(CHAIN_COSTS.preparedness, 1),
  category: 'graded',
  targetField: 'preparedness',
  targetLevel: 1,
}

const preparedness2: BotUpgradeDefinition = {
  id: 'preparedness_2',
  name: 'Preparedness II',
  description: 'Require appropriate potion tiers and level',
  cost: chainCost(CHAIN_COSTS.preparedness, 2),
  requires: 'preparedness_1',
  category: 'graded',
  targetField: 'preparedness',
  targetLevel: 2,
}

const preparedness3: BotUpgradeDefinition = {
  id: 'preparedness_3',
  name: 'Preparedness III',
  description: 'Full Morgoth preparation protocol',
  cost: chainCost(CHAIN_COSTS.preparedness, 3),
  requires: 'preparedness_2',
  category: 'graded',
  targetField: 'preparedness',
  targetLevel: 3,
}

// =============================================================================
// SWEEP UPGRADES (exploration thoroughness)
// =============================================================================

const sweep1: BotUpgradeDefinition = {
  id: 'sweep_1',
  name: 'Sweep I',
  description: 'Explore 60% of floor tiles before descent',
  cost: chainCost(CHAIN_COSTS.sweep, 1),
  category: 'graded',
  targetField: 'sweep',
  targetLevel: 1,
}

const sweep2: BotUpgradeDefinition = {
  id: 'sweep_2',
  name: 'Sweep II',
  description: 'Explore 75% of floor tiles before descent',
  cost: chainCost(CHAIN_COSTS.sweep, 2),
  requires: 'sweep_1',
  category: 'graded',
  targetField: 'sweep',
  targetLevel: 2,
}

const sweep3: BotUpgradeDefinition = {
  id: 'sweep_3',
  name: 'Sweep III',
  description: 'Explore 90% of floor tiles before descent',
  cost: chainCost(CHAIN_COSTS.sweep, 3),
  requires: 'sweep_2',
  category: 'graded',
  targetField: 'sweep',
  targetLevel: 3,
}

// =============================================================================
// SURF UPGRADES (tethered stair farming)
// =============================================================================

const surf1: BotUpgradeDefinition = {
  id: 'surf_1',
  name: 'Surf I',
  description: 'Farm within 5×5 area around stairs',
  cost: chainCost(CHAIN_COSTS.surf, 1),
  category: 'graded',
  targetField: 'surf',
  targetLevel: 1,
}

const surf2: BotUpgradeDefinition = {
  id: 'surf_2',
  name: 'Surf II',
  description: 'Farm within 9×9 area around stairs',
  cost: chainCost(CHAIN_COSTS.surf, 2),
  requires: 'surf_1',
  category: 'graded',
  targetField: 'surf',
  targetLevel: 2,
}

const surf3: BotUpgradeDefinition = {
  id: 'surf_3',
  name: 'Surf III',
  description: 'Farm within 21×21 area around stairs',
  cost: chainCost(CHAIN_COSTS.surf, 3),
  requires: 'surf_2',
  category: 'graded',
  targetField: 'surf',
  targetLevel: 3,
}

// =============================================================================
// KITING UPGRADES (ranged positioning)
// =============================================================================

const kiting1: BotUpgradeDefinition = {
  id: 'kiting_1',
  name: 'Kiting I',
  description: 'Ranged stance — prefer ranged attacks over melee approach',
  cost: chainCost(CHAIN_COSTS.kiting, 1),
  category: 'graded',
  targetField: 'kiting',
  targetLevel: 1,
}

const kiting2: BotUpgradeDefinition = {
  id: 'kiting_2',
  name: 'Kiting II',
  description: 'Active kiting — maintain distance from enemies',
  cost: chainCost(CHAIN_COSTS.kiting, 2),
  requires: 'kiting_1',
  category: 'graded',
  targetField: 'kiting',
  targetLevel: 2,
}

const kiting3: BotUpgradeDefinition = {
  id: 'kiting_3',
  name: 'Kiting III',
  description: 'Optimal positioning — class-tuned engagement range',
  cost: chainCost(CHAIN_COSTS.kiting, 3),
  requires: 'kiting_2',
  category: 'graded',
  targetField: 'kiting',
  targetLevel: 3,
}

// =============================================================================
// TARGETING UPGRADES (target selection intelligence)
// =============================================================================

const targeting1: BotUpgradeDefinition = {
  id: 'targeting_1',
  name: 'Targeting I',
  description: 'Prioritize wounded targets over closest',
  cost: chainCost(CHAIN_COSTS.targeting, 1),
  category: 'graded',
  targetField: 'targeting',
  targetLevel: 1,
}

const targeting2: BotUpgradeDefinition = {
  id: 'targeting_2',
  name: 'Targeting II',
  description: 'Evaluate threat levels when selecting targets',
  cost: chainCost(CHAIN_COSTS.targeting, 2),
  requires: 'targeting_1',
  category: 'graded',
  targetField: 'targeting',
  targetLevel: 2,
}

const targeting3: BotUpgradeDefinition = {
  id: 'targeting_3',
  name: 'Targeting III',
  description: 'Class-aware optimal range and positioning',
  cost: chainCost(CHAIN_COSTS.targeting, 3),
  requires: 'targeting_2',
  category: 'graded',
  targetField: 'targeting',
  targetLevel: 3,
}

// =============================================================================
// RETREAT UPGRADES (retreat decision intelligence)
// =============================================================================

const retreat1: BotUpgradeDefinition = {
  id: 'retreat_1',
  name: 'Retreat I',
  description: 'Flee based on personality caution threshold',
  cost: chainCost(CHAIN_COSTS.retreat, 1),
  category: 'graded',
  targetField: 'retreat',
  targetLevel: 1,
}

const retreat2: BotUpgradeDefinition = {
  id: 'retreat_2',
  name: 'Retreat II',
  description: 'Recognize deadly status effect combinations',
  cost: chainCost(CHAIN_COSTS.retreat, 2),
  requires: 'retreat_1',
  category: 'graded',
  targetField: 'retreat',
  targetLevel: 2,
}

const retreat3: BotUpgradeDefinition = {
  id: 'retreat_3',
  name: 'Retreat III',
  description: 'Full combat evaluation and class-specific tactics',
  cost: chainCost(CHAIN_COSTS.retreat, 3),
  requires: 'retreat_2',
  category: 'graded',
  targetField: 'retreat',
  targetLevel: 3,
}

// =============================================================================
// EXPORTS
// =============================================================================

export const BOT_UPGRADES: BotUpgradeDefinition[] = [
  // Toggle upgrades
  farmingUpgrade,
  // Tactics upgrades (graded: debuffs → buffs → smart targeting)
  tactics1,
  tactics2,
  tactics3,
  // Town upgrades (graded: portal → healer → commerce)
  town1,
  town2,
  town3,
  // Preparedness upgrades
  preparedness1,
  preparedness2,
  preparedness3,
  // Sweep upgrades
  sweep1,
  sweep2,
  sweep3,
  // Surf upgrades
  surf1,
  surf2,
  surf3,
  // Kiting upgrades
  kiting1,
  kiting2,
  kiting3,
  // Targeting upgrades
  targeting1,
  targeting2,
  targeting3,
  // Retreat upgrades
  retreat1,
  retreat2,
  retreat3,
]

/** Toggle upgrade IDs for type narrowing */
export const TOGGLE_UPGRADE_IDS = ['farming'] as const
export type ToggleUpgradeId = (typeof TOGGLE_UPGRADE_IDS)[number]

export function getBotUpgradeById(id: BotUpgradeId): BotUpgradeDefinition | undefined {
  return BOT_UPGRADES.find((u) => u.id === id)
}

/** Map toggle upgrade IDs to their capability field names */
export function getToggleCapabilityField(id: ToggleUpgradeId): keyof BotCapabilities {
  switch (id) {
    case 'farming':
      return 'farming'
  }
}

/** Check if a toggle upgrade is unlocked */
function isToggleUnlocked(id: ToggleUpgradeId, capabilities: BotCapabilities): boolean {
  const field = getToggleCapabilityField(id)
  return capabilities[field] as boolean
}

/** Check if a graded upgrade level is unlocked */
function isGradedUnlocked(
  field: GradedCapabilityField,
  level: number,
  capabilities: BotCapabilities
): boolean {
  return capabilities[field] >= level
}

/** Check if prerequisite is met */
function isPrerequisiteMet(upgrade: BotUpgradeDefinition, capabilities: BotCapabilities): boolean {
  if (!upgrade.requires) return true

  const prereq = getBotUpgradeById(upgrade.requires)
  if (!prereq) return false

  if (prereq.category === 'toggle') {
    return isToggleUnlocked(prereq.id as ToggleUpgradeId, capabilities)
  }

  if (prereq.targetField && prereq.targetLevel) {
    return isGradedUnlocked(prereq.targetField, prereq.targetLevel, capabilities)
  }

  return false
}

/** Check if an upgrade is already purchased */
function isAlreadyPurchased(upgrade: BotUpgradeDefinition, capabilities: BotCapabilities): boolean {
  if (upgrade.category === 'toggle') {
    return isToggleUnlocked(upgrade.id as ToggleUpgradeId, capabilities)
  }

  if (upgrade.targetField && upgrade.targetLevel) {
    return isGradedUnlocked(upgrade.targetField, upgrade.targetLevel, capabilities)
  }

  return false
}

/** Check if an upgrade can be purchased given current capabilities and essence */
export function canPurchaseBotUpgrade(
  id: BotUpgradeId,
  capabilities: BotCapabilities,
  essence: number
): boolean {
  const upgrade = getBotUpgradeById(id)
  if (!upgrade) return false

  // Check cost
  if (essence < upgrade.cost) return false

  // Check if already purchased
  if (isAlreadyPurchased(upgrade, capabilities)) return false

  // Check prerequisite
  if (!isPrerequisiteMet(upgrade, capabilities)) return false

  return true
}

/** Graded capability field names */
export type GradedCapabilityField =
  | 'tactics'
  | 'town'
  | 'preparedness'
  | 'sweep'
  | 'surf'
  | 'kiting'
  | 'targeting'
  | 'retreat'

/** Get the next purchasable upgrade for a graded field, or null if maxed */
export function getNextGradedUpgrade(
  field: GradedCapabilityField,
  capabilities: BotCapabilities
): BotUpgradeDefinition | null {
  const currentLevel = capabilities[field]
  const nextLevel = currentLevel + 1

  if (nextLevel > 3) return null

  const upgradeId = `${field}_${nextLevel}` as BotUpgradeId
  return getBotUpgradeById(upgradeId) ?? null
}

/** Apply a purchased upgrade to capabilities (returns new capabilities) */
export function applyBotUpgrade(id: BotUpgradeId, capabilities: BotCapabilities): BotCapabilities {
  const upgrade = getBotUpgradeById(id)
  if (!upgrade) return capabilities

  const newCapabilities = { ...capabilities }

  if (upgrade.category === 'toggle') {
    const field = getToggleCapabilityField(upgrade.id as ToggleUpgradeId)
    ;(newCapabilities as Record<string, boolean | number>)[field] = true
  } else if (upgrade.targetField && upgrade.targetLevel) {
    newCapabilities[upgrade.targetField] = upgrade.targetLevel
  }

  return newCapabilities
}
