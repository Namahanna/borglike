/**
 * Progression Domain
 *
 * Manages dungeon descent: readiness checks, unique blockers, and Morgoth hunt.
 * Delegates farming/tether/sweep logic to farming.ts.
 *
 * Key concepts:
 * - Descent readiness: Check consumable/level requirements before going deeper
 * - Unique blockers: Hunt uniques that block descent to next depth
 * - Morgoth hunt: Endgame boss at depth 50, special flip-respawn logic
 *
 * Architecture:
 * - Queries: getDescentBlocker(), shouldAscendToFarm()
 * - Goal creators: getDescendGoal(), getMorgothHuntGoal()
 * - Main dispatcher: getProgressionGoal()
 */

import type { Point, GameState, Character } from '../types'
import type { UpgradeBonuses } from '../upgrade-effects'
import { MAX_DEPTH } from '../types'
import type { BotState, BotGoal, BotContext } from './types'
import { SQUISHY_CLASSES, getEffectiveCapabilities, seenGridAdd } from './types'
import { profile } from './profiler'
import {
  getExplorationProgress,
  isLabyrinthLevel,
  getLabyrinthExplorationThreshold,
  findExplorationTarget,
} from './exploration'
import { getDepthReadiness, getUniqueBlocker, isUnderLeveled } from './preparation'
import { monsters as MONSTERS, VICTORY_BOSS_NAME } from '../data/monsters'
import {
  handleActiveFarmingLoop,
  initiateFarmingLoop,
  getSweepGoal,
  getFlipNavigationGoal,
} from './farming'

// Re-export farming functions that other modules need
export { initializeSweepDirection } from './farming'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get floor tile count for the current level (cached per level).
 * Floor tiles = all non-wall tiles (floor, doors, stairs, etc.)
 */
function getLevelFloorCount(context: BotContext): number {
  const { game, botState } = context

  // Return cached value if available
  if (botState.cachedLevelFloorCount > 0) {
    return botState.cachedLevelFloorCount
  }

  // Compute floor count
  const level = game.currentLevel
  let count = 0
  for (const row of level.tiles) {
    for (const tile of row) {
      if (tile.type !== 'wall') {
        count++
      }
    }
  }

  // Cache for future calls this level
  botState.cachedLevelFloorCount = count
  return count
}

// ============================================================================
// QUERIES - Readiness
// ============================================================================

/**
 * Get the reason descent is blocked, or null if ready.
 */
export function getDescentBlocker(
  character: Character,
  caution: number,
  preparednessLevel: number = 3,
  depthGateOffset: number = 0
): string | null {
  const nextDepth = character.depth + 1
  if (nextDepth > MAX_DEPTH) return 'At max depth'
  return getDepthReadiness(
    character,
    character.inventory,
    nextDepth,
    caution,
    preparednessLevel,
    depthGateOffset
  )
}

/**
 * Check if should ascend to farm easier content (under-leveled).
 */
export function shouldAscendToFarm(
  character: { level: number; depth: number; classId?: string; upgradeBonuses?: UpgradeBonuses },
  knownStairsUp: Point | null,
  depthGateOffset: number = 0
): boolean {
  if (!knownStairsUp) return false
  if (character.depth <= 1) return false
  return isUnderLeveled(
    character.level,
    character.depth,
    character.classId,
    character.upgradeBonuses,
    depthGateOffset
  )
}

// ============================================================================
// GOAL CREATORS - Descent
// ============================================================================

/**
 * Get DESCEND goal if exploration/patience threshold met.
 * Does NOT check consumable readiness - caller must ensure ready.
 */
export function getDescendGoal(context: BotContext): BotGoal | null {
  const { game, config, botState } = context
  const character = game.character
  const nextDepth = character.depth + 1

  // Need to know where stairs are to actually descend
  if (!botState.knownStairsDown) return null

  // Check unique blockers (2+ living uniques blocks descent)
  const uniqueBlocker = getUniqueBlocker(character.depth, nextDepth, game.uniqueState, MONSTERS)
  if (uniqueBlocker) {
    return null // Should hunt unique instead
  }

  // Check if ready to descend (exploration or patience)
  const explorationProgress = getExplorationProgress(game)

  // Labyrinths use lower exploration threshold
  const explorationThreshold = isLabyrinthLevel(game)
    ? getLabyrinthExplorationThreshold(config.exploration)
    : config.exploration

  const shouldDescend =
    explorationProgress >= explorationThreshold || botState.turnsOnLevel >= config.patience

  if (!shouldDescend) return null

  return {
    type: 'DESCEND',
    target: botState.knownStairsDown,
    targetId: null,
    reason: `Descending (${explorationProgress}% explored)`,
    startTurn: game.turn,
  }
}

/**
 * Get DESCEND goal to return to unique hunt depth after level flip.
 */
export function getReturnToUniqueHuntGoal(context: BotContext): BotGoal | null {
  const { game, botState } = context

  if (!botState.huntingUniqueBlocker || botState.uniqueHuntFlipDepth === null) {
    return null
  }

  if (game.character.depth === 0) return null

  return getFlipNavigationGoal(
    context,
    botState.uniqueHuntFlipDepth,
    MAX_DEPTH,
    `Returning to depth ${botState.uniqueHuntFlipDepth} to hunt ${botState.huntingUniqueBlocker}`
  )
}

// ============================================================================
// MORGOTH HUNT
// ============================================================================

// High threshold for Morgoth flip - want thorough sweep before triggering respawn
// Depth 50 is exempt from circuit breaker so bot has time to explore fully
const MORGOTH_FLIP_EXPLORATION_THRESHOLD = 0.8

/**
 * Get navigation goal to return to a target depth (for flips).
 * Uses shared getFlipNavigationGoal from farming.ts with MAX_DEPTH as upper bound.
 */
function getLevelFlipReturnGoal(
  context: BotContext,
  targetDepth: number,
  reason: string
): BotGoal | null {
  if (context.game.character.depth === 0) return null
  return getFlipNavigationGoal(context, targetDepth, MAX_DEPTH, reason)
}

export function getMorgothFlipReturnGoal(context: BotContext): BotGoal | null {
  const { botState } = context

  if (!botState.morgothFlipActive || botState.morgothFlipTargetDepth === null) {
    return null
  }

  return getLevelFlipReturnGoal(
    context,
    botState.morgothFlipTargetDepth,
    'Returning to depth 50 to hunt Morgoth'
  )
}

export function getMorgothHuntGoal(context: BotContext): BotGoal | null {
  const { game, botState, visibleMonsters } = context
  const character = game.character

  if (character.depth !== MAX_DEPTH) return null

  const morgothVisible = visibleMonsters.some(
    (m) => m.template.name === VICTORY_BOSS_NAME && m.hp > 0
  )
  if (morgothVisible) {
    botState.morgothFlipActive = false
    botState.morgothFlipTargetDepth = null
    return null
  }

  const totalFloor = getLevelFloorCount(context)
  const seenThisVisitRate = totalFloor > 0 ? botState.seenThisVisit.count / totalFloor : 0

  // Sweep the level to build seenThisVisit before triggering flip
  // This handles returning from town portal (seenThisVisit cleared) and post-flip exploration
  if (seenThisVisitRate < MORGOTH_FLIP_EXPLORATION_THRESHOLD) {
    // Find tiles that are explored but not seen this visit
    const sweepTarget = findExplorationTarget(game, botState, true)
    if (sweepTarget) {
      return {
        type: 'EXPLORE',
        target: sweepTarget,
        targetId: null,
        reason: `Sweeping D50 to find Morgoth (${Math.round(seenThisVisitRate * 100)}% seen)`,
        startTurn: game.turn,
      }
    }
    // No sweep target found - clear flip state and fall through
    if (botState.morgothFlipActive) {
      botState.morgothFlipActive = false
      botState.morgothFlipTargetDepth = null
    }
    return null
  }

  // Sweep complete - if flip active, continue ascending to trigger respawn
  if (botState.morgothFlipActive && botState.morgothFlipTargetDepth === MAX_DEPTH) {
    const stairsUp = botState.knownStairsUp ?? game.currentLevel.stairsUp
    if (stairsUp) {
      return {
        type: 'ASCEND_TO_FARM',
        target: stairsUp,
        targetId: null,
        reason: 'Level flip to find Morgoth (continuing)',
        startTurn: game.turn,
      }
    }
    botState.morgothFlipActive = false
    botState.morgothFlipTargetDepth = null
    return null
  }

  const stairsUp = botState.knownStairsUp ?? game.currentLevel.stairsUp
  if (!stairsUp) return null

  botState.morgothFlipActive = true
  botState.morgothFlipTargetDepth = MAX_DEPTH

  return {
    type: 'ASCEND_TO_FARM',
    target: stairsUp,
    targetId: null,
    reason: `Level flip to find Morgoth (${Math.round(seenThisVisitRate * 100)}% seen)`,
    startTurn: game.turn,
  }
}

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

export function getProgressionGoal(context: BotContext): BotGoal | null {
  const { game, botState, effectiveConfig } = context
  const character = game.character
  const nextDepth = character.depth + 1
  const effective = getEffectiveCapabilities(context)

  if (botState.farmingMode && botState.farmBlockedDepth > 0) {
    const farmingGoal = profile('prog.activeFarm', () => handleActiveFarmingLoop(context))
    if (farmingGoal) return farmingGoal
  }

  // GATE: Preparedness check only if capability level > 0
  // Face-rush mode (L0) skips consumable requirements entirely
  if (effective.preparedness > 0) {
    const readinessIssue = profile('prog.depthReadiness', () =>
      getDepthReadiness(
        character,
        character.inventory,
        nextDepth,
        effectiveConfig.caution,
        effective.preparedness,
        context.depthGateOffset
      )
    )
    if (readinessIssue) {
      const farmingGoal = profile('prog.initFarm', () => initiateFarmingLoop(context))
      if (farmingGoal) return farmingGoal
    }
  }

  if (botState.sweepMode && SQUISHY_CLASSES.has(character.classId)) {
    const sweepGoal = getSweepGoal(context)
    if (sweepGoal) return sweepGoal
  }

  const descendGoal = profile('prog.getDescendGoal', () => getDescendGoal(context))
  return descendGoal
}

// ============================================================================
// VISIBLE TILE RECORDING
// ============================================================================

export function recordVisibleTiles(game: GameState, botState: BotState): void {
  const level = game.currentLevel
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue
    for (let x = 0; x < level.width; x++) {
      const tile = row[x]
      if (tile?.visible) {
        seenGridAdd(botState.seenThisVisit, x, y)
      }
    }
  }
}
