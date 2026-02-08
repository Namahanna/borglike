/**
 * Bot AI Tick Logic - Urgency-Gated Architecture
 *
 * Main decision-making loop using danger tiers to gate action priorities.
 * This ensures survival actions are checked appropriately based on threat level.
 *
 * Tier-based priority (Angband borg inspired):
 * - CRITICAL: escape > heal > desperate attack
 * - DANGER:   heal > attack > escape
 * - CAUTION:  attack > proactive heal
 * - SAFE:     normal flow (combat > items > movement)
 */

import type { GameState, GameAction, BotPersonality } from '../types'
import type {
  BotCapabilities,
  BotToggles,
  SweepLevelRange,
  SurfLevelRange,
} from '@/types/progression'
import { getTile, countExploredTiles } from '../dungeon'
import { canRangedAttack, getBowRange } from '../combat'

import type { BotState, BotGoal, BotContext, DangerResult, PersonalityConfig } from './types'
import { getDefaultSweepLevelRange } from './types'
import type { FlowGrid } from './flow'
import {
  createBotState,
  resetLevelState,
  recordPosition,
  setGoal,
  clearGoal,
  recordProgress,
  incrementTurn,
  cleanupBlacklist,
} from './state'
import {
  computeFlow,
  computeExplorationFlow,
  createFlowResult,
  isFlowValid,
  getFlowCost,
  MAX_FLOW_COST,
} from './flow'
import type { FlowAvoidance } from './flow'
import { selectStep } from './movement'
import { isSamePoint } from '../types'
import { buildBotContext } from './context'
import {
  computeDangerGrid,
  getScaledDangerThreshold,
  getDangerThreshold,
  getMonsterThreat,
} from './danger'
import {
  detectStuckLevel,
  getStuckResponse,
  handleWallFollowStrategy,
  handleClearHistoryStrategy,
  handleForceDescentStrategy,
  handleStopFleeingStrategy,
} from './stuck'
import { selectGoal, initializeTownNeeds, updateTownNeeds } from './goals'
import {
  invalidateFrontierCache,
  getFrontierPositions,
  getSweepFrontierPositions,
} from './exploration'
import { initializeSweepDirection, recordVisibleTiles } from './progression'
import { findAdjacentMonster, hasRangedWeapon, findKitePosition, shouldAvoidMelee } from './combat'
import { getDamageSpellAction } from './spells'
import { getCombatBuffAction, getPreCombatBuffAction } from './survival'
import { botSellItems, botBuySupplies } from './merchant'
import { profile } from './profiler'
import { selectActionByTier, calculateImmediateTier } from './tier-actions'

/**
 * Run one tick of bot decision making
 *
 * Uses urgency-gated phases: danger tier determines action priority ordering.
 */
export function runBotTick(
  game: GameState,
  personality: BotPersonality,
  existingState?: BotState,
  capabilities?: BotCapabilities,
  toggles?: BotToggles,
  sweepLevelRange?: SweepLevelRange,
  surfLevelRange?: SurfLevelRange,
  personalityConfig?: PersonalityConfig,
  depthGateOffset?: number
): GameAction {
  // Get or create bot state
  const botState = existingState ?? createBotState()

  // Check for level change
  if (game.character.depth !== botState.currentDepth) {
    const wasInFarmingMode = botState.farmingMode
    resetLevelState(botState, game.character.depth, game.turn)
    invalidateFrontierCache()

    // Initialize town needs when entering town
    if (game.character.depth === 0) {
      initializeTownNeeds(game, botState)
    }

    // Set known stairs immediately from level data on level transition
    // Both stairsUp and stairsDown positions are stored in the level
    if (game.character.depth > 0) {
      const stairsUp = game.currentLevel.stairsUp
      const stairsDown = game.currentLevel.stairsDown

      if (stairsUp) {
        botState.knownStairsUp = { x: stairsUp.x, y: stairsUp.y }
      }
      if (stairsDown) {
        botState.knownStairsDown = { x: stairsDown.x, y: stairsDown.y }
      }
    }

    // Initialize sweep mode on dungeon level change if conditions are met
    // Get effective sweep range (use provided or default based on class)
    const effectiveSweepRange = sweepLevelRange ?? getDefaultSweepLevelRange(game.character.classId)
    const effectiveToggles = toggles ?? {
      town: true,
      farming: true,
      preparedness: true,
      sweepEnabled: true,
    }
    const effectiveCapabilities = capabilities ?? {
      town: true,
      farming: true,
      preparedness: true,
      sweep: 3,
      surf: 3,
      kiting: 3,
      targeting: 3,
      retreat: 3,
    }
    const inDungeon = game.character.depth !== 0
    const charLevel = game.character.level

    // Sweep activates when: in dungeon, capability unlocked, toggle on, and level in range
    const sweepActive =
      inDungeon &&
      effectiveCapabilities.sweep >= 1 &&
      effectiveToggles.sweepEnabled &&
      effectiveSweepRange.start > 0 &&
      charLevel >= effectiveSweepRange.start &&
      charLevel < effectiveSweepRange.end

    if (sweepActive) {
      botState.sweepMode = true
      botState.sweepStartTurn = game.turn
      initializeSweepDirection(game, botState)
      // Don't set tetheredOrigin - sweep mode uses sweep exploration, not tether
    } else if (wasInFarmingMode && inDungeon) {
      // Set tethered origin for non-sweep farming mode
      // Origin = current position (where we entered the level)
      // The tether check in getAscendToFarmGoal will block flipping until exploration is done
      botState.tetheredOrigin = { x: game.character.position.x, y: game.character.position.y }
    }
  }

  // Increment turn counter
  incrementTurn(botState)

  // Clean up expired blacklist entries
  cleanupBlacklist(botState, game.turn)

  // Build context
  const context = profile('buildBotContext', () =>
    buildBotContext(
      game,
      personality,
      botState,
      capabilities,
      toggles,
      sweepLevelRange,
      surfLevelRange,
      personalityConfig,
      depthGateOffset
    )
  )

  // Update known stairs if visible
  updateKnownStairs(game, botState)

  // Record all currently visible tiles (for tethered exploration check)
  profile('recordVisibleTiles', () => recordVisibleTiles(game, botState))

  // Update HP tracking for DOT detection
  updateHPTracking(game, botState)

  // Compute danger grid
  const dangerResult = profile('computeDangerGrid', () => computeDangerGrid(game))
  botState.cachedDanger = dangerResult

  // Calculate immediate danger tier (adjacent threats only)
  const immediateTier = profile('calculateImmediateTier', () => calculateImmediateTier(game))

  // Urgency-gated action selection
  const action = profile('selectActionByTier', () =>
    selectActionByTier(game, context, botState, dangerResult, personality, immediateTier)
  )
  if (action) {
    return action
  }

  // Stuck recovery (dungeon only)
  if (game.character.depth > 0) {
    const stuckAction = profile('stuckRecovery', () => handleStuckRecovery(game, context, botState))
    if (stuckAction) return stuckAction
  }

  // Goal-based movement (explore/descend/town/farm)
  return profile('goalMovement', () => executeGoalMovement(game, context, botState, dangerResult))
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function updateKnownStairs(game: GameState, botState: BotState): void {
  const stairsDown = game.currentLevel.stairsDown
  if (stairsDown) {
    const tile = getTile(game.currentLevel, stairsDown.x, stairsDown.y)
    if (tile?.explored) {
      botState.knownStairsDown = stairsDown
    }
  }
}

function handleStuckRecovery(
  game: GameState,
  _context: BotContext,
  botState: BotState
): GameAction | null {
  const stuckLevel = detectStuckLevel(botState, game)
  if (stuckLevel === 0) return null

  const adjacentMonster = findAdjacentMonster(game)
  const isFleeing = botState.currentGoal?.type === 'FLEE'
  const stuckResponse = getStuckResponse(
    stuckLevel,
    adjacentMonster !== null,
    botState.knownStairsDown !== null,
    isFleeing
  )

  switch (stuckResponse) {
    case 'wall_follow':
      return handleWallFollowStrategy(game, botState)

    case 'clear_history':
      handleClearHistoryStrategy(botState, game.turn)
      return null

    case 'force_combat':
      // Handled by tier system now
      return null

    case 'force_descent':
      return handleForceDescentStrategy(game, botState)

    case 'stop_fleeing':
      return handleStopFleeingStrategy(game, botState, findAdjacentMonster)

    case 'wait':
      return { type: 'wait' }

    default:
      return null
  }
}

// ============================================================================
// GOAL MOVEMENT - QUERIES
// ============================================================================

/**
 * Check if bot has arrived at goal position.
 */
function isAtGoal(pos: { x: number; y: number }, goal: BotGoal): boolean {
  return goal.target !== null && isSamePoint(pos, goal.target)
}

/**
 * Check if EXPLORE goal should use sweep mode flow.
 * Sweep mode is set on level change based on configurable sweep level range.
 */
function shouldUseSweepFlow(_game: GameState, botState: BotState): boolean {
  // Sweep mode is already configured based on class defaults or user settings
  return botState.sweepMode
}

// ============================================================================
// GOAL MOVEMENT - FLOW COMPUTATION
// ============================================================================

/**
 * Compute flow map for goal-based movement.
 * Dispatches by goal type: EXPLORE (sweep vs frontier) vs single-target.
 * Returns null if no valid flow (e.g., no frontiers for exploration).
 */
function computeGoalFlow(
  game: GameState,
  botState: BotState,
  goal: BotGoal,
  avoidance: FlowAvoidance | null
): FlowGrid | null {
  if (goal.type === 'EXPLORE') {
    return computeExploreGoalFlow(game, botState, goal, avoidance)
  }
  return computeSingleTargetFlow(game, botState, goal, avoidance)
}

/**
 * Compute flow for EXPLORE goals.
 * Both sweep mode and normal exploration use multi-target Dijkstra.
 * Sweep: all tiles explored but not seen this visit.
 * Normal: all unexplored frontier tiles.
 */
function computeExploreGoalFlow(
  game: GameState,
  botState: BotState,
  _goal: BotGoal,
  avoidance: FlowAvoidance | null
): FlowGrid | null {
  // Sweep mode: multi-target Dijkstra to all sweep frontier tiles
  if (shouldUseSweepFlow(game, botState)) {
    // Check sweep cache validity FIRST (before expensive frontier scan)
    const seenCount = botState.seenThisVisit.count
    const cache = botState.cachedSweepFlow
    const cacheValid =
      cache &&
      cache.depth === game.character.depth &&
      cache.seenCount === seenCount &&
      cache.botPosition.x === game.character.position.x &&
      cache.botPosition.y === game.character.position.y &&
      game.turn - cache.computedAt < 5

    if (cacheValid) {
      // Check if cached sweep flow is reachable from current position
      const cachedCost = getFlowCost(cache.costs, game.character.position)
      if (cachedCost < MAX_FLOW_COST) {
        return cache.costs
      }
      // Cached sweep flow unreachable - fall through to normal exploration
      // (Don't recompute sweep if we can't reach those frontiers anyway)
    } else {
      // Cache invalid - need to compute sweep frontiers
      const sweepFrontiers = profile('getSweepFrontiers', () =>
        getSweepFrontierPositions(game, botState)
      )

      if (sweepFrontiers.length > 0) {
        // Compute fresh sweep flow
        const flowCosts = profile('flow.sweep', () =>
          computeExplorationFlow(game.currentLevel, sweepFrontiers, avoidance ?? undefined)
        )

        // Check if sweep flow is reachable from bot's position
        const sweepCost = getFlowCost(flowCosts, game.character.position)
        if (sweepCost < MAX_FLOW_COST) {
          // Sweep flow is reachable - cache and return
          botState.cachedSweepFlow = {
            costs: flowCosts,
            seenCount,
            computedAt: game.turn,
            depth: game.character.depth,
            botPosition: { ...game.character.position },
          }
          botState.cachedFlow = null // Don't use single-target cache for sweep
          return flowCosts
        }
        // Sweep flow unreachable - fall through to normal exploration
      }
      // No sweep frontiers or unreachable - fall through to normal exploration
    }
  }

  // Normal exploration: multi-target Dijkstra to all frontiers
  const frontiers = profile('getFrontierPositions', () => getFrontierPositions(game))
  if (frontiers.length === 0) {
    // No frontiers - exploration complete
    botState.currentGoal = null
    botState.goalTarget = null
    return null
  }

  // Check cache validity
  const exploredCount = countExploredTiles(game.currentLevel)
  const cache = botState.cachedExplorationFlow
  const cacheValid =
    cache &&
    cache.depth === game.character.depth &&
    cache.exploredCount === exploredCount &&
    game.turn - cache.computedAt < 5

  if (cacheValid) {
    return cache.costs
  }

  // Compute fresh exploration flow
  const flowCosts = profile('flow.exploration', () =>
    computeExplorationFlow(game.currentLevel, frontiers, avoidance ?? undefined)
  )
  botState.cachedExplorationFlow = {
    costs: flowCosts,
    frontierCount: frontiers.length,
    exploredCount,
    computedAt: game.turn,
    depth: game.character.depth,
  }
  botState.cachedFlow = null // Don't use single-target cache for EXPLORE
  return flowCosts
}

/**
 * Compute flow for single-target goals (KILL, DESCEND, TAKE, etc.).
 * Uses caching to avoid redundant computation.
 */
function computeSingleTargetFlow(
  game: GameState,
  botState: BotState,
  goal: BotGoal,
  avoidance: FlowAvoidance | null
): FlowGrid {
  const needsRecompute = !isFlowValid(botState.cachedFlow, goal.target, game.turn)
  if (!needsRecompute && botState.cachedFlow?.costs) {
    return botState.cachedFlow.costs
  }

  const flowCosts = profile('flow.singleTarget', () =>
    computeFlow(game.currentLevel, goal.target!, avoidance ?? undefined)
  )
  botState.cachedFlow = createFlowResult(goal.target!, flowCosts, game.turn)
  return flowCosts
}

/** Max path length to bullrush through danger for cautious DESCEND */
const CAUTIOUS_BULLRUSH_THRESHOLD = 6

/**
 * Ensure goal is reachable, trying without avoidance if blocked.
 * Returns updated flow map or null if truly unreachable.
 *
 * For cautious personalities with DESCEND blocked by danger:
 * - If path is short (<= CAUTIOUS_BULLRUSH_THRESHOLD), allow bullrush
 * - If path is long, set dangerBlockedDescent flag (triggers retreat)
 */
function ensureFlowReachable(
  game: GameState,
  botState: BotState,
  goal: BotGoal,
  flowCosts: FlowGrid,
  avoidance: FlowAvoidance | null,
  caution: number
): FlowGrid | null {
  const pos = game.character.position
  const currentCost = getFlowCost(flowCosts, pos)

  // Already reachable
  if (currentCost < MAX_FLOW_COST) {
    return flowCosts
  }

  // No avoidance to remove - truly unreachable
  if (!avoidance) {
    clearUnreachableGoal(botState)
    return null
  }

  // Try without avoidance first to check path length
  let fallbackFlow: FlowGrid
  if (goal.type === 'EXPLORE') {
    const frontiers = getFrontierPositions(game)
    // computeExplorationFlow returns an empty grid if no frontiers, so always call it
    fallbackFlow = computeExplorationFlow(game.currentLevel, frontiers)
  } else {
    fallbackFlow = computeFlow(game.currentLevel, goal.target!)
    botState.cachedFlow = createFlowResult(goal.target!, fallbackFlow, game.turn)
  }

  const fallbackCost = getFlowCost(fallbackFlow, pos)
  if (fallbackCost >= MAX_FLOW_COST) {
    clearUnreachableGoal(botState)
    return null
  }

  // Cautious DESCEND blocked by danger: retreat if path is long, bullrush if short
  // Short path = close to stairs, worth pushing through
  // Long path = far from stairs, retreat to safer depth
  if (goal.type === 'DESCEND' && caution >= 50 && game.character.depth > 1) {
    if (fallbackCost > CAUTIOUS_BULLRUSH_THRESHOLD) {
      botState.dangerBlockedDescent = true
      clearUnreachableGoal(botState)
      return null
    }
    // Short path - allow bullrush through danger
  }

  return fallbackFlow
}

/**
 * Clear goal state when goal is unreachable.
 */
function clearUnreachableGoal(botState: BotState): void {
  botState.currentGoal = null
  botState.goalTarget = null
  botState.cachedFlow = null
}

// ============================================================================
// GOAL MOVEMENT - ACTION GETTERS
// ============================================================================

/**
 * Get action when bot has arrived at goal position.
 * Returns null if not at goal.
 */
function getGoalArrivalAction(
  game: GameState,
  botState: BotState,
  goal: BotGoal,
  config: PersonalityConfig
): GameAction | null {
  if (!isAtGoal(game.character.position, goal)) {
    return null
  }

  recordProgress(botState, game.turn)
  updateTownState(botState, goal, game)
  return profile('goalMovement.executeGoal', () => executeGoalAction(goal, game, botState, config))
}

/**
 * Get tactical action for approaching KILL target.
 * Handles ranged attacks, kiting, and pre-combat buffs.
 * Returns null to fall through to normal movement.
 */
function getKillApproachAction(
  goal: BotGoal,
  game: GameState,
  context: BotContext,
  dangerResult: DangerResult
): GameAction | null {
  if (goal.type !== 'KILL' || !goal.targetId) {
    return null
  }

  const { classProfile, config, visibleMonsters, botState, capabilities } = context
  const tacticsLevel = capabilities.tactics
  const pos = game.character.position
  const targetMonster = game.monsters.find((m) => m.id === goal.targetId && m.hp > 0)

  if (!targetMonster) return null

  // Ranged class tactics
  if (classProfile.prefersRanged && hasRangedWeapon(game)) {
    const dx = Math.abs(targetMonster.position.x - pos.x)
    const dy = Math.abs(targetMonster.position.y - pos.y)
    const distance = Math.max(dx, dy)
    const bowRange = getBowRange(game.character)

    // At shooting range - ranged attack
    if (distance >= 2 && distance <= bowRange) {
      if (canRangedAttack(game.character, targetMonster.position)) {
        recordProgress(botState, game.turn)
        return { type: 'ranged_attack', targetId: targetMonster.id }
      }
    }

    // Adjacent - try to kite away (requires kiting L2+ for active repositioning)
    if (shouldAvoidMelee(classProfile, distance) && capabilities.kiting >= 2) {
      const optimalRange = capabilities.kiting >= 3 ? classProfile.engageDistance || 3 : 3
      const kiteDir = findKitePosition(game, targetMonster, optimalRange)
      if (kiteDir) {
        recordProgress(botState, game.turn)
        return { type: 'move', direction: kiteDir }
      }
    }
  }

  // Pre-combat buffs for dangerous targets (requires tactics capability)
  const threat = getMonsterThreat(targetMonster, game.character)
  const BUFF_THREAT_THRESHOLD = 100
  const isUnique = targetMonster.template.flags.includes('UNIQUE')
  const shouldBuffTarget = threat >= BUFF_THREAT_THRESHOLD || isUnique

  if (shouldBuffTarget) {
    const combatBuff = getCombatBuffAction(game, config, dangerResult.dangers, tacticsLevel)
    if (combatBuff) {
      recordProgress(botState, game.turn)
      return combatBuff
    }

    const preCombatBuff = getPreCombatBuffAction(game, config, visibleMonsters, tacticsLevel)
    if (preCombatBuff) {
      recordProgress(botState, game.turn)
      return preCombatBuff
    }
  }

  return null
}

// ============================================================================
// GOAL MOVEMENT - ORCHESTRATION
// ============================================================================

function executeGoalMovement(
  game: GameState,
  context: BotContext,
  botState: BotState,
  dangerResult: DangerResult
): GameAction {
  const { effectiveConfig } = context
  const pos = game.character.position
  const dangerThreshold = getDangerThreshold(effectiveConfig.aggression, effectiveConfig.caution)

  // 1. Select goal
  const goal = profile('selectGoal', () =>
    selectGoal(context, botState, dangerResult.dangers, dangerThreshold)
  )
  if (!goal?.target) {
    return { type: 'wait' }
  }
  setGoal(botState, goal)

  // 2. At goal? Execute
  const arrivalAction = getGoalArrivalAction(game, botState, goal, effectiveConfig)
  if (arrivalAction) return arrivalAction

  // 3. Build avoidance config (skip for FLEE — no danger avoidance when running)
  const avoidance: FlowAvoidance | null =
    goal.type === 'FLEE'
      ? null
      : {
          grid: dangerResult.dangers,
          threshold: getScaledDangerThreshold(dangerThreshold, game.character),
        }

  // 4. Compute flow
  const flowCosts = computeGoalFlow(game, botState, goal, avoidance)
  if (!flowCosts) {
    return { type: 'wait' }
  }

  // 5. Ensure reachable
  const reachableFlow = ensureFlowReachable(
    game,
    botState,
    goal,
    flowCosts,
    avoidance,
    effectiveConfig.caution
  )
  if (!reachableFlow) {
    return { type: 'wait' }
  }

  // 6. KILL approach tactics (ranged/kite/buff)
  const killAction = getKillApproachAction(goal, game, context, dangerResult)
  if (killAction) return killAction

  // 7. Step toward goal
  const direction = profile('goalMovement.selectStep', () =>
    selectStep(game, botState, reachableFlow)
  )
  recordPosition(botState, pos)

  // Record progress for productive goals (not FLEE/RECOVER)
  if (direction !== 'wait' && goal.type !== 'FLEE' && goal.type !== 'RECOVER') {
    recordProgress(botState, game.turn)
  }

  return { type: 'move', direction }
}

function updateTownState(botState: BotState, goal: BotGoal, _game: GameState): void {
  // Mark shop as visited based on goal type and targetId (shop ID)
  if (goal.type === 'SELL_TO_MERCHANT' && goal.targetId) {
    botState.shopsVisitedForSelling.add(goal.targetId)
  }
  if (goal.type === 'VISIT_HEALER') {
    botState.healerVisited = true
  }
  if (goal.type === 'BUY_FROM_MERCHANT' && goal.targetId) {
    botState.shopsVisitedForBuying.add(goal.targetId)
  }
}

function executeGoalAction(
  goal: BotGoal,
  game: GameState,
  botState: BotState,
  config: PersonalityConfig
): GameAction {
  switch (goal.type) {
    case 'DESCEND':
      // Goal system already verified readiness during goal selection
      // Don't re-check here - creates loops when goal eval uses different caution
      return { type: 'descend' }

    case 'TAKE': {
      const itemAtGoal = game.items.find((item) =>
        isSamePoint(item.position, game.character.position)
      )
      if (itemAtGoal) {
        return { type: 'pickup', itemId: itemAtGoal.id }
      }
      return { type: 'wait' }
    }

    case 'EXPLORE':
      return { type: 'wait' }

    case 'RECOVER':
      return { type: 'wait' }

    case 'KILL':
      return { type: 'wait' }

    case 'FLEE':
      return { type: 'wait' }

    case 'KITE': {
      if (goal.targetId) {
        const monster = game.monsters.find((m) => m.id === goal.targetId && m.hp > 0)
        if (monster) {
          // For bow users, use ranged attack
          if (canRangedAttack(game.character, monster.position)) {
            return { type: 'ranged_attack', targetId: monster.id }
          }
          // For casters without bow, cast damage spell
          const damageSpell = getDamageSpellAction(game, config, [monster])
          if (damageSpell) {
            return damageSpell
          }
        }
      }
      return { type: 'wait' }
    }

    case 'SELL_TO_MERCHANT':
      botSellItems(game, botState)
      return { type: 'wait' }

    case 'VISIT_HEALER':
      return { type: 'use_healer' }

    case 'BUY_FROM_MERCHANT':
      botBuySupplies(game, goal.targetId)
      // Update town needs to check if we successfully bought what we needed
      updateTownNeeds(game, botState)
      return { type: 'wait' }

    case 'RETURN_PORTAL':
      return { type: 'use_return_portal' }

    case 'EXIT_TOWN':
      return { type: 'descend' }

    case 'ASCEND_TO_FARM':
      return { type: 'ascend' }

    case 'TOWN_TRIP':
      // Use the town portal scroll (stored in targetId)
      if (goal.targetId) {
        return { type: 'use', itemId: goal.targetId }
      }
      return { type: 'wait' }

    case 'USE_ALTAR':
      return { type: 'use_altar' }

    case 'VISIT_MERCHANT':
      // Trade with dungeon merchant (same as town merchants)
      botSellItems(game, botState)
      botBuySupplies(game)
      // Mark merchant as visited so we don't re-target it
      if (goal.targetId) {
        botState.visitedDungeonMerchants.add(goal.targetId)
      }
      return { type: 'wait' }

    case 'HUNT_UNIQUE':
      // Reached unique position - wait for tier system to handle adjacent combat
      // (Monster may have moved; tier handlers will engage when adjacent)
      return { type: 'wait' }

    case 'FARM':
      // Reached farm target - clear goal to immediately re-evaluate
      // Tether sweep targets are just positions to reveal FOV, no need to wait
      // If there's a monster/item, tier system will handle on next tick
      clearGoal(botState)
      return { type: 'wait' }

    default:
      return { type: 'wait' }
  }
}

// ============================================================================
// HP TRACKING (DOT DETECTION)
// ============================================================================

/**
 * Track HP changes to detect DOT and invisible damage
 */
function updateHPTracking(game: GameState, botState: BotState): void {
  const currentHp = game.character.hp

  // Calculate rate from previous turn
  if (botState.previousHp > 0) {
    botState.hpRate = currentHp - botState.previousHp
  }

  // Update history (keep last 5 turns)
  botState.hpHistory.push(currentHp)
  if (botState.hpHistory.length > 5) {
    botState.hpHistory.shift()
  }

  botState.previousHp = currentHp
}
