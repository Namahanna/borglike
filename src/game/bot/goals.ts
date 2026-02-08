/**
 * Goal Selection and Priority System
 *
 * Implements smart goal selection with clear priority ordering
 * and goal persistence to prevent thrashing.
 */

// Type declaration for Node.js process (used for debug logging in scripts)
declare const process: { env: Record<string, string | undefined> } | undefined

import type { BotState, BotGoal, BotContext, GoalType, DangerMap } from './types'
import { getEffectiveCapabilities } from './types'
import type { GameState } from '../types'
import { isAdjacent } from '../types'
import { getTile } from '../dungeon'
import { getLocalDanger } from './danger'
import { findAdjacentMonster, hasRangedWeapon } from './combat'
import { isInTown, HEALER_POSITION, DUNGEON_ENTRANCE_POSITION, TOWN_SHOP_POSITIONS } from '../town'
import { type TownShopId } from '../data/town'

// Import goal functions from domain modules
import { getFleeGoal, getRecoverGoal } from './survival-retreat'
import { getKiteGoal, getKillGoal } from './combat'
import { getTakeGoal, findBestItem } from './items'
import { getExploreGoal } from './exploration'
import { getUseAltarGoal, getVisitMerchantGoal } from './merchant'
import {
  getProgressionGoal,
  getReturnToUniqueHuntGoal,
  getMorgothHuntGoal,
  getMorgothFlipReturnGoal,
} from './progression'
import {
  getEffectiveGold,
  getHuntUniqueGoal,
  countTownPortals,
  countHealingPotions,
  countEscapeScrolls,
} from './preparation'
import { profile } from './profiler'

// Re-export for external use
export { findBestItem, getHuntUniqueGoal }

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum turns before forced goal re-evaluation */
const GOAL_REEVALUATE_INTERVAL = 10

/** Re-evaluation interval for exploration - longer to prevent ping-ponging
 * The exploration scoring system handles adapting to new discoveries via persistence bonus */
const EXPLORE_REEVALUATE_INTERVAL = 15

/** Priority order for goals (higher = more important) */
const GOAL_PRIORITY: Record<GoalType, number> = {
  FLEE: 100,
  KITE: 90, // Higher than RECOVER, ranged classes prefer kiting
  // Town goals (order: sell → heal → buy → return)
  SELL_TO_MERCHANT: 88, // Sell loot first to get gold
  VISIT_HEALER: 85, // Heal with gold from selling
  BUY_FROM_MERCHANT: 82, // Buy consumables after healing
  RETURN_PORTAL: 70, // Return through portal
  EXIT_TOWN: 65, // Fallback if no portal
  RECOVER: 80,
  HUNT_UNIQUE: 75, // Below RECOVER, above KILL - hunt uniques blocking descent
  // Farming loop goals (when descent blocked by consumable requirements)
  FARM: 72, // Below RECOVER, above KILL - farm when safe
  KILL: 70,
  TOWN_TRIP: 68, // Below KILL - finish fights first, then town
  ASCEND_TO_FARM: 66, // Below KILL/FARM - try current level first
  USE_ALTAR: 55, // Use altars when safe (gold sink)
  VISIT_MERCHANT: 52, // Visit dungeon merchants when safe
  TAKE: 50,
  DESCEND: 40,
  EXPLORE: 30,
  WAIT: 0,
}

// ============================================================================
// MAIN GOAL SELECTION
// ============================================================================

/**
 * Select the best goal based on current situation
 *
 * Priority order:
 * 1. FLEE - HP < caution AND danger high
 * 2. RECOVER - HP < 50% AND no enemies AND can heal
 * 3. KILL - Adjacent enemy OR aggressive with target
 * 4. TAKE - Valuable item within reach
 * 5. DESCEND - Explored enough OR patience exceeded
 * 6. EXPLORE - Find unexplored areas
 * 7. WAIT - Nothing else possible
 */
export function selectGoal(
  context: BotContext,
  botState: BotState,
  dangers: DangerMap,
  dangerThreshold: number
): BotGoal | null {
  const { game } = context
  const turn = game.turn
  const pos = game.character.position

  // DANGER RETREAT: If DESCEND was blocked by danger (cautious), retreat up
  // This prevents oscillation between cautious avoidance and bullrush fallback
  if (botState.dangerBlockedDescent) {
    botState.dangerBlockedDescent = false // Clear flag - consumed
    const stairsUp = botState.knownStairsUp

    // If we have stairs up and not at depth 1, retreat
    if (stairsUp && game.character.depth > 1) {
      return {
        type: 'ASCEND_TO_FARM',
        target: stairsUp,
        targetId: null,
        reason: 'Descent blocked by danger - retreating to safer depth',
        startTurn: turn,
      }
    }
    // At depth 1 or no stairs up - fall through to normal goal selection
  }

  // Check if current goal is still valid and high priority
  const currentGoal = botState.currentGoal
  if (
    currentGoal &&
    profile('goal.isValid', () => isGoalStillValid(currentGoal, context, botState))
  ) {
    // Check if we should keep the current goal
    const currentPriority = GOAL_PRIORITY[currentGoal.type]
    const turnsSinceGoalStart = turn - currentGoal.startTurn

    // Don't thrash - keep goal unless:
    // 1. A higher priority need arises
    // 2. We've been on this goal too long
    // Use shorter interval for EXPLORE to adapt to newly discovered areas
    const reevalInterval =
      currentGoal.type === 'EXPLORE' ? EXPLORE_REEVALUATE_INTERVAL : GOAL_REEVALUATE_INTERVAL

    // Debug logging
    if (typeof process !== 'undefined' && process.env.DEBUG_GOALS) {
      console.log(
        `[GOALS] turn=${turn} currentGoal=${currentGoal.type}@(${currentGoal.target?.x},${currentGoal.target?.y}) startTurn=${currentGoal.startTurn} turnsSince=${turnsSinceGoalStart} reevalInterval=${reevalInterval}`
      )
    }

    if (turnsSinceGoalStart < reevalInterval) {
      // Check for higher priority override
      const overrideGoal = profile('goal.override', () =>
        checkHighPriorityOverride(context, botState, dangers, dangerThreshold, currentPriority)
      )
      if (overrideGoal) {
        return overrideGoal
      }
      // Keep current goal
      return currentGoal
    }
  }

  // Full goal evaluation
  const localDanger = getLocalDanger(dangers, pos)
  const hpRatio = game.character.hp / game.character.maxHp
  const { classProfile } = context

  // 0. TOWN GOALS - If in town, handle town-specific behavior
  if (isInTown(game)) {
    const townGoal = selectTownGoal(context, botState, hpRatio)
    if (townGoal) return townGoal
  }

  // 1. FLEE - HP critical and in danger (skip for Berserker)
  if (!classProfile.neverRetreats) {
    const fleeGoal = profile('goal.flee', () => getFleeGoal(context, dangers, botState.hpRate))
    if (fleeGoal) return fleeGoal
  }

  // 1.5 KITE - Ranged classes maintain distance and attack from range
  // Works for bow users (rangers) AND ranged casters (mage, archmage, necromancer)
  if (classProfile.prefersRanged) {
    const kiteGoal = profile('goal.kite', () => getKiteGoal(context))
    if (kiteGoal) return kiteGoal
  }

  // 2. RECOVER - Low HP but safe
  const recoverGoal = profile('goal.recover', () =>
    getRecoverGoal(context, dangerThreshold, localDanger, hpRatio)
  )
  if (recoverGoal) return recoverGoal

  // 2.3 RETURN_TO_UNIQUE_HUNT - Return to depth after level flip for unique hunting
  const returnToHuntGoal = getReturnToUniqueHuntGoal(context)
  if (returnToHuntGoal) return returnToHuntGoal

  // 2.4 MORGOTH_FLIP_RETURN - Return to depth 50 during Morgoth hunt flip
  const morgothReturnGoal = getMorgothFlipReturnGoal(context)
  if (morgothReturnGoal) return morgothReturnGoal

  // 2.5 HUNT_UNIQUE - Hunt uniques blocking descent (priority over regular KILL)
  const huntUniqueGoal = profile('goal.huntUnique', () => getHuntUniqueGoal(context))
  if (huntUniqueGoal) return huntUniqueGoal

  // 2.6 MORGOTH_HUNT - Hunt Morgoth at depth 50 (triggers flip when stuck)
  const morgothHuntGoal = getMorgothHuntGoal(context)
  if (morgothHuntGoal) return morgothHuntGoal

  // 3. KILL - Adjacent monster or hunting
  const killGoal = profile('goal.kill', () => getKillGoal(context, hpRatio))
  if (killGoal) return killGoal

  // 4. TAKE - Valuable item nearby
  const takeGoal = profile('goal.take', () => getTakeGoal(context, dangers, dangerThreshold))
  if (takeGoal) return takeGoal

  // 4.5 USE_ALTAR - Use dungeon altars when safe (gold sink)
  const altarGoal = getUseAltarGoal(context, dangerThreshold, localDanger)
  if (altarGoal) return altarGoal

  // 4.6 VISIT_MERCHANT - Visit dungeon merchants when safe
  const merchantGoal = getVisitMerchantGoal(context, dangerThreshold, localDanger)
  if (merchantGoal) return merchantGoal

  // 5. DESCEND - Ready to go down (may trigger FARM, ASCEND_TO_FARM, TOWN_TRIP)
  const descendGoal = profile('goal.descend', () => getProgressionGoal(context))
  if (descendGoal) return descendGoal

  // 6. EXPLORE - Default
  const exploreGoal = profile('goal.explore', () => getExploreGoal(context))
  if (exploreGoal) return exploreGoal

  // 7. WAIT - Nothing possible
  return {
    type: 'WAIT',
    target: pos,
    targetId: null,
    reason: 'No valid goals',
    startTurn: turn,
  }
}

// ============================================================================
// GOAL VALIDATORS
// ============================================================================

/**
 * Check if current goal is still valid
 */
function isGoalStillValid(goal: BotGoal, context: BotContext, botState: BotState): boolean {
  const { game } = context

  // Morgoth flip return takes priority - invalidate current goal if flip is active
  // and we're not at the target depth (need to navigate back)
  if (
    botState.morgothFlipActive &&
    botState.morgothFlipTargetDepth !== null &&
    game.character.depth !== botState.morgothFlipTargetDepth
  ) {
    return false
  }

  switch (goal.type) {
    case 'FLEE':
      // Flee is valid while danger persists AND we haven't reached the target
      if (context.visibleMonsters.length === 0) return false
      // If we're at the flee target, goal is complete - need new evaluation
      {
        const fleePos = game.character.position
        if (goal.target && fleePos.x === goal.target.x && fleePos.y === goal.target.y) {
          return false
        }
        return true
      }

    case 'RECOVER':
      // Recover until full HP or enemies appear
      return game.character.hp < game.character.maxHp && context.visibleMonsters.length === 0

    case 'KILL': {
      // Kill is valid if target still exists AND is still visible/adjacent
      if (!goal.targetId) return false

      const targetMonster = game.monsters.find((m) => m.id === goal.targetId && m.hp > 0)
      if (!targetMonster) return false

      // Check if monster is still visible or adjacent
      // IMPORTANT: Query actual tile visibility, not context.visibleMonsters which can be stale after teleport
      const tile = getTile(game.currentLevel, targetMonster.position.x, targetMonster.position.y)
      const isVisible = tile?.visible ?? false
      const isAdjacentToPlayer = isAdjacent(game.character.position, targetMonster.position)

      // Invalidate if monster went out of sight and isn't adjacent
      if (!isVisible && !isAdjacentToPlayer) return false

      // Update target position if monster moved (keeps flow computation accurate)
      if (
        goal.target &&
        (goal.target.x !== targetMonster.position.x || goal.target.y !== targetMonster.position.y)
      ) {
        goal.target = { ...targetMonster.position }
        context.botState.cachedFlow = null // Invalidate stale flow
      }

      return true
    }

    case 'TAKE':
      // Take is valid if item still exists
      if (!goal.targetId) return false
      return game.items.some((item) => item.id === goal.targetId)

    case 'DESCEND':
      // Descend is valid if we know stairs location
      return botState.knownStairsDown !== null

    case 'EXPLORE':
      // Explore is valid if unexplored areas exist AND we haven't reached the target
      // Exception: sweep mode can explore even when no unexplored tiles (targets seen-before tiles)
      if (context.unexploredTiles.length === 0 && !botState.sweepMode) return false
      // If we're at the target, goal is complete - need new target
      {
        const pos = game.character.position
        if (goal.target && pos.x === goal.target.x && pos.y === goal.target.y) {
          return false
        }
        return true
      }

    case 'KITE':
      // Kite is valid if we have ranged capability (bow OR caster) and visible monsters
      // Must match getKiteGoal logic: bow users OR prefersRanged casters
      if (!hasRangedWeapon(game) && !context.classProfile.prefersRanged) return false
      if (context.visibleMonsters.length === 0) return false
      // If target monster is dead, need new target
      if (goal.targetId) {
        return game.monsters.some((m) => m.id === goal.targetId && m.hp > 0)
      }
      return true

    case 'WAIT':
      return false // Always re-evaluate

    // Town goals
    case 'SELL_TO_MERCHANT':
      // Valid while in town, have unvisited sell shops, and still have items to sell
      if (!isInTown(game)) return false
      // Check if we've visited all relevant shops for selling
      return selectShopForSelling(game, botState) !== null

    case 'VISIT_HEALER':
      // Valid while in town and not yet healed
      return isInTown(game) && !botState.healerVisited && game.character.hp < game.character.maxHp

    case 'BUY_FROM_MERCHANT':
      // Valid while in town and have unvisited buy shops
      if (!isInTown(game)) return false
      return selectShopForBuying(game, botState) !== null

    case 'RETURN_PORTAL':
      // Valid while in town and portal exists
      return isInTown(game) && game.townPortal !== null

    case 'EXIT_TOWN':
      // Valid while in town (fallback when no portal)
      return isInTown(game)

    case 'HUNT_UNIQUE': {
      // Hunt unique is valid if target unique still exists and is alive
      if (!goal.targetId) return false
      const targetUnique = game.monsters.find((m) => m.id === goal.targetId && m.hp > 0)
      if (!targetUnique) return false
      // Update target position if monster moved
      if (
        goal.target &&
        (goal.target.x !== targetUnique.position.x || goal.target.y !== targetUnique.position.y)
      ) {
        goal.target = { ...targetUnique.position }
        context.botState.cachedFlow = null // Invalidate stale flow
      }
      return true
    }

    case 'USE_ALTAR':
      // Altar goals are short-lived - always re-evaluate
      return false

    case 'VISIT_MERCHANT':
      // Merchant goals are short-lived - always re-evaluate
      return false

    case 'FARM': {
      // Farm is valid while we need gold and there are targets
      if (!botState.farmingMode) return false
      const character = game.character
      // Check if we've reached gold target (including equipment sell value)
      if (getEffectiveGold(character) >= botState.farmGoldTarget) {
        botState.farmingMode = false
        return false
      }
      // Check if target still exists (monster or item)
      if (goal.targetId) {
        const monsterExists = game.monsters.some((m) => m.id === goal.targetId && m.hp > 0)
        const itemExists = game.items.some((i) => i.id === goal.targetId)
        if (!monsterExists && !itemExists) return false
      }
      return true
    }

    case 'ASCEND_TO_FARM': {
      // Ascend is valid until we actually ascend (depth changes)
      // Don't invalidate when AT stairs - that's when we execute the ascend action
      if (game.character.depth <= 1) return false
      const stairsUp = botState.knownStairsUp
      if (!stairsUp) return false
      // Goal is stale if target doesn't match current knownStairsUp
      if (goal.target && (goal.target.x !== stairsUp.x || goal.target.y !== stairsUp.y)) {
        return false
      }
      // Goal remains valid at stairs - getGoalArrivalAction will trigger ascend
      return true
    }

    case 'TOWN_TRIP':
      // Town trip is valid until we use the portal (enter town)
      return game.character.depth > 0 && !game.townPortal

    default:
      return false
  }
}

/**
 * Check if a higher priority goal should override current
 */
function checkHighPriorityOverride(
  context: BotContext,
  _botState: BotState,
  dangers: DangerMap,
  dangerThreshold: number,
  currentPriority: number
): BotGoal | null {
  const { game } = context

  // No combat overrides in town - town goals handle everything
  if (isInTown(game)) {
    return null
  }

  const pos = game.character.position
  const localDanger = getLocalDanger(dangers, pos)
  const hpRatio = game.character.hp / game.character.maxHp

  // Check FLEE (priority 100)
  if (currentPriority < GOAL_PRIORITY.FLEE) {
    const fleeGoal = getFleeGoal(context, dangers, context.botState.hpRate)
    if (fleeGoal) return fleeGoal
  }

  // Check KITE for ranged classes (priority 90)
  // Critical for ranged classes to engage at range instead of facechecking
  if (currentPriority < GOAL_PRIORITY.KITE) {
    const { classProfile } = context
    if (classProfile.prefersRanged) {
      const kiteGoal = getKiteGoal(context)
      if (kiteGoal) return kiteGoal
    }
  }

  // Check RECOVER (priority 80)
  if (currentPriority < GOAL_PRIORITY.RECOVER) {
    const recoverGoal = getRecoverGoal(context, dangerThreshold, localDanger, hpRatio)
    if (recoverGoal) return recoverGoal
  }

  // Check KILL for adjacent monsters (priority 70)
  if (currentPriority < GOAL_PRIORITY.KILL) {
    const adjacentMonster = findAdjacentMonster(game)
    if (adjacentMonster) {
      return {
        type: 'KILL',
        target: adjacentMonster.position,
        targetId: adjacentMonster.id,
        reason: 'Adjacent monster',
        startTurn: game.turn,
      }
    }
  }

  // Check MORGOTH_HUNT at depth 50 (priority 35, above EXPLORE)
  // This ensures Morgoth sweep can interrupt stale EXPLORE goals at endgame
  // but doesn't interrupt combat (KILL) or other higher priority actions
  if (currentPriority < 35 && game.character.depth === 50) {
    const morgothGoal = getMorgothHuntGoal(context)
    if (morgothGoal) return morgothGoal
  }

  return null
}

// ============================================================================
// TOWN GOAL SELECTION
// ============================================================================

/**
 * Select the appropriate shop for selling based on inventory contents
 *
 * Priority:
 * 1. Has weapons/bows? → town_weapons (better sell multiplier)
 * 2. Has armor? → town_armory
 * 3. Anything else? → town_general
 */
function selectShopForSelling(game: GameState, botState: BotState): TownShopId | null {
  const inventory = game.character.inventory
  const sellableItems = inventory.filter(
    (item) => item.template.type !== 'potion' && item.template.type !== 'scroll'
  )

  // No items to sell
  if (sellableItems.length === 0) return null

  // Check what types of items we have
  const hasWeapons = sellableItems.some(
    (item) => item.template.type === 'weapon' || item.template.type === 'bow'
  )
  const hasArmor = sellableItems.some((item) =>
    ['armor', 'shield', 'helm', 'gloves', 'boots'].includes(item.template.type)
  )

  // Visit appropriate shops in order of value
  if (hasWeapons && !botState.shopsVisitedForSelling.has('town_weapons')) {
    return 'town_weapons'
  }
  if (hasArmor && !botState.shopsVisitedForSelling.has('town_armory')) {
    return 'town_armory'
  }
  if (!botState.shopsVisitedForSelling.has('town_general')) {
    return 'town_general'
  }

  return null
}

/**
 * Initialize town needs at the start of a town visit.
 * Called when entering town to track what we need to buy.
 */
export function initializeTownNeeds(game: GameState, botState: BotState): void {
  const inventory = game.character.inventory
  botState.townNeeds = {
    tp: Math.max(0, 2 - countTownPortals(inventory)),
    healing: Math.max(0, 3 - countHealingPotions(inventory)),
    escape: Math.max(0, 2 - countEscapeScrolls(inventory)),
  }
}

/**
 * Update town needs after a purchase attempt.
 * Called after botBuySupplies() to check actual inventory state.
 */
export function updateTownNeeds(game: GameState, botState: BotState): void {
  const inventory = game.character.inventory
  botState.townNeeds = {
    tp: Math.max(0, 2 - countTownPortals(inventory)),
    healing: Math.max(0, 3 - countHealingPotions(inventory)),
    escape: Math.max(0, 2 - countEscapeScrolls(inventory)),
  }
}

/** Minimum gold needed to buy from each shop type */
const SHOP_MIN_GOLD: Record<TownShopId, number> = {
  town_magic: 110, // TP scroll ~110g
  town_alchemy: 90, // Basic healing potion ~90g
  town_weapons: 200, // Weapons are expensive
  town_armory: 200, // Armor is expensive
  town_general: 50, // General supplies cheaper
}

/**
 * Select the appropriate shop for buying based on character needs.
 *
 * Combines needs-based and visit-based tracking:
 * - Checks what we still need
 * - Checks if we can afford anything at the shop
 * - Only visits each shop once per town visit (shop may not have items in stock)
 *
 * Priority:
 * 1. Need Town Portal? → town_magic (if can afford AND not visited)
 * 2. Need healing potions? → town_alchemy (if can afford AND not visited)
 * 3. Need escape scrolls? → town_magic (if can afford AND not visited for escapes)
 */
function selectShopForBuying(game: GameState, botState: BotState): TownShopId | null {
  const gold = game.character.gold
  const needs = botState.townNeeds
  const visited = botState.shopsVisitedForBuying

  // Need Town Portal scrolls (critical safety)
  // town_magic sells both TP and escape scrolls
  if (needs.tp > 0 && gold >= SHOP_MIN_GOLD.town_magic && !visited.has('town_magic')) {
    return 'town_magic'
  }

  // Need healing potions
  if (needs.healing > 0 && gold >= SHOP_MIN_GOLD.town_alchemy && !visited.has('town_alchemy')) {
    return 'town_alchemy'
  }

  // Need escape scrolls - town_magic also sells these
  // Only visit if we haven't been there yet (would have bought TP too)
  if (needs.escape > 0 && gold >= SHOP_MIN_GOLD.town_magic && !visited.has('town_magic')) {
    return 'town_magic'
  }

  // Done shopping - all needs met, can't afford, or already visited all relevant shops
  return null
}

/**
 * Select the appropriate town goal based on current state
 *
 * Town behavior priority (economically optimal):
 * 1. SELL_TO_MERCHANT - Sell loot at appropriate shops
 * 2. VISIT_HEALER - Heal with gold from selling
 * 3. BUY_FROM_MERCHANT - Buy consumables from appropriate shops
 * 4. RETURN_PORTAL - Return through active portal
 * 5. EXIT_TOWN - Fallback: use dungeon entrance
 */
function selectTownGoal(context: BotContext, botState: BotState, hpRatio: number): BotGoal | null {
  const { game } = context
  const turn = game.turn

  // GATE: Check town capability level (0=none, 1=portal, 2=+healer, 3=+commerce)
  const effective = getEffectiveCapabilities(context)

  // Face-rush mode: no town capabilities at all - exit immediately
  if (effective.town === 0) {
    // Prefer portal if exists to preserve dungeon position
    if (game.townPortal) {
      return {
        type: 'RETURN_PORTAL',
        target: { ...game.townPortal.townPosition },
        targetId: null,
        reason: 'Face-rush mode - returning through portal',
        startTurn: turn,
      }
    }
    return {
      type: 'EXIT_TOWN',
      target: { ...DUNGEON_ENTRANCE_POSITION },
      targetId: null,
      reason: 'Face-rush mode - skipping town',
      startTurn: turn,
    }
  }

  // 1. Sell items first to get gold for healing (requires town level 3)
  if (effective.town >= 3) {
    const sellShop = selectShopForSelling(game, botState)
    if (sellShop) {
      const position = TOWN_SHOP_POSITIONS[sellShop]
      return {
        type: 'SELL_TO_MERCHANT',
        target: { ...position },
        targetId: sellShop,
        reason: `Selling loot at ${sellShop.replace('town_', '')}`,
        startTurn: turn,
      }
    }
  }

  // 2. Visit healer if HP is not full and haven't visited yet (requires town level 2)
  // healerVisited is set when we reach the healer, regardless of heal outcome
  // This prevents getting stuck if we can't afford a full heal
  if (effective.town >= 2 && !botState.healerVisited && hpRatio < 1.0) {
    return {
      type: 'VISIT_HEALER',
      target: { ...HEALER_POSITION },
      targetId: null,
      reason: `Going to healer (HP: ${Math.round(hpRatio * 100)}%)`,
      startTurn: turn,
    }
  }

  // 3. Buy from appropriate shops after healing (requires town level 3)
  if (effective.town >= 3) {
    const buyShop = selectShopForBuying(game, botState)
    if (buyShop) {
      const position = TOWN_SHOP_POSITIONS[buyShop]
      return {
        type: 'BUY_FROM_MERCHANT',
        target: { ...position },
        targetId: buyShop,
        reason: `Buying supplies at ${buyShop.replace('town_', '')}`,
        startTurn: turn,
      }
    }
  }

  // 4. Return through portal if one exists (requires townPortal for return)
  // Note: if we got here via portal, we have portal capability
  if (game.townPortal) {
    return {
      type: 'RETURN_PORTAL',
      target: { ...game.townPortal.townPosition },
      targetId: null,
      reason: `Returning through portal (${game.townPortal.turnsRemaining} turns left)`,
      startTurn: turn,
    }
  }

  // 5. Exit town via dungeon entrance (fallback - no portal active)
  return {
    type: 'EXIT_TOWN',
    target: { ...DUNGEON_ENTRANCE_POSITION },
    targetId: null,
    reason: 'Exiting town',
    startTurn: turn,
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { GOAL_PRIORITY, GOAL_REEVALUATE_INTERVAL }
