/**
 * Bot Context Building
 *
 * Functions to build BotContext and provide status/danger queries.
 */

import type { GameState, BotPersonality, Point, AltarState } from '../types'
import type {
  BotCapabilities,
  BotToggles,
  SweepLevelRange,
  SurfLevelRange,
} from '../../types/progression'
import { FULL_BOT_CAPABILITIES, DEFAULT_BOT_TOGGLES } from '../../types/progression'
import { getDefaultSweepLevelRange, getDefaultSurfLevelRange } from './types'

import type { BotContext, BotState, PersonalityConfig } from './types'
import { createSeenGrid } from './types'
import { getTile, countExploredTiles } from '../dungeon'
import { getPersonalityConfig } from './personality'
import { getClassProfile } from './class-profiles'
import { profile } from './profiler'
import { getCachedExploredCount } from './exploration'

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Create minimal bot state for context when not provided
 */
function createMinimalBotState(): BotState {
  return {
    recentPositions: [],
    currentGoal: null,
    goalTarget: null,
    levelEnterTurn: 0,
    turnsOnLevel: 0,
    currentDepth: 1,
    knownStairsDown: null,
    knownStairsUp: null,
    cachedFlow: null,
    cachedDanger: null,
    cachedSafetyFlow: null,
    twitchCounter: 0,
    lastProgressTurn: 0,
    fleeCooldownUntil: 0,
    // Town tracking
    isInTown: false,
    townEntryTurn: 0,
    healerVisited: false,
    // Multi-shop tracking
    shopsVisitedForSelling: new Set(),
    shopsVisitedForBuying: new Set(),
    visitedDungeonMerchants: new Set(),
    // Consumable tier management
    consumablesToSell: new Set(),
    // Town needs tracking
    townNeeds: { tp: 0, healing: 0, escape: 0 },
    // Corridor exploration
    corridorFollowingMode: false,
    corridorFacing: null,
    // Exploration blacklist
    blacklistedTargets: new Map(),
    // Item blacklist (items that caused danger)
    dangerousItemBlacklist: new Map(),
    // Farming loop state
    farmingMode: false,
    farmBlockedDepth: 0,
    farmGoldTarget: 0,
    farmStartTurn: 0,
    // Tethered exploration
    tetheredOrigin: null,
    tetheredRadius: 0,
    tetheredFlipCount: 0,
    lastFlipTurn: 0,
    seenThisVisit: createSeenGrid(80, 40),
    // Sweep exploration (casters)
    sweepMode: false,
    sweepDirection: null,
    sweepStartTurn: 0,
    sweepExhausted: false,
    // Sweep flip state (yo-yo into blocked depth)
    sweepFlipActive: false,
    sweepFlipTargetDepth: null,
    sweepFlipVisitedBlocked: false,
    // Kite duration tracking
    kiteTargetId: null,
    kiteTargetStartTurn: 0,
    // Unique hunt level flip
    huntingUniqueBlocker: null,
    uniqueHuntFlipDepth: null,
    // Morgoth hunt level flip
    morgothFlipActive: false,
    morgothFlipTargetDepth: null,
    // HP tracking
    previousHp: 0,
    hpHistory: [],
    hpRate: 0,
    // Performance caches
    cachedExplorationFlow: null,
    cachedSweepFlow: null,
    lastExploredCount: 0,
    cachedLevelFloorCount: 0,
    // Danger retreat
    dangerBlockedDescent: false,
    // Diagnostic tracking
    lastTownPortalReason: null,
  }
}

/**
 * Build bot context for decision making
 */
export function buildBotContext(
  game: GameState,
  personality: BotPersonality,
  botState?: BotState,
  capabilities?: BotCapabilities,
  toggles?: BotToggles,
  sweepLevelRange?: SweepLevelRange,
  surfLevelRange?: SurfLevelRange,
  personalityConfig?: PersonalityConfig,
  depthGateOffset?: number
): BotContext {
  // Resolve personality config: custom uses provided config, presets use lookup
  const config =
    personality === 'custom' && personalityConfig
      ? personalityConfig
      : getPersonalityConfig(personality)

  // Default to full capabilities for backwards compatibility
  const effectiveCapabilities = capabilities ?? FULL_BOT_CAPABILITIES
  const effectiveToggles = toggles ?? DEFAULT_BOT_TOGGLES
  // Default sweep/surf ranges based on class
  const effectiveSweepRange = sweepLevelRange ?? getDefaultSweepLevelRange(game.character.classId)
  const effectiveSurfRange = surfLevelRange ?? getDefaultSurfLevelRange()

  // Get class-aware information
  const classId = game.character.classId
  const classProfile = getClassProfile(classId)
  const effectiveConfig = computeEffectiveConfig(config, classProfile)

  // Find visible monsters
  const visibleMonsters = profile('ctx.monsters', () =>
    game.monsters.filter((m) => {
      const tile = getTile(game.currentLevel, m.position.x, m.position.y)
      return tile?.visible ?? false
    })
  )

  // Find visible items
  const visibleItems = profile('ctx.items', () =>
    game.items.filter((item) => {
      const tile = getTile(game.currentLevel, item.position.x, item.position.y)
      return tile?.visible ?? false
    })
  )

  // Find visible altars (from Map values)
  const visibleAltars: AltarState[] = profile('ctx.altars', () => {
    const result: AltarState[] = []
    for (const altar of game.altars.values()) {
      const tile = getTile(game.currentLevel, altar.position.x, altar.position.y)
      if (tile?.visible) {
        result.push(altar)
      }
    }
    return result
  })

  // Find visible merchants
  const visibleMerchants = profile('ctx.merchants', () =>
    game.merchants.filter((merchant) => {
      const tile = getTile(game.currentLevel, merchant.position.x, merchant.position.y)
      return tile?.visible ?? false
    })
  )

  // Find known stairs
  const knownStairs = findKnownStairs(game)

  // Find unexplored tiles - returns sentinel (only .length === 0 is checked)
  const unexploredTiles = profile('ctx.unexplored', () =>
    botState ? getCachedUnexploredTiles(game, botState) : [{ x: 0, y: 0 }]
  )

  return {
    game,
    personality,
    config,
    classId,
    classProfile,
    effectiveConfig,
    capabilities: effectiveCapabilities,
    toggles: effectiveToggles,
    sweepLevelRange: effectiveSweepRange,
    surfLevelRange: effectiveSurfRange,
    depthGateOffset: depthGateOffset ?? 0,
    visibleMonsters,
    visibleItems,
    visibleAltars,
    visibleMerchants,
    knownStairs,
    unexploredTiles,
    botState: botState ?? createMinimalBotState(),
  }
}

/**
 * Compute effective config by blending personality with class modifiers
 */
function computeEffectiveConfig(
  config: PersonalityConfig,
  profile: { aggressionMod: number; cautionMod: number }
): PersonalityConfig {
  return {
    aggression: clamp(config.aggression + profile.aggressionMod, 0, 100),
    greed: config.greed,
    caution: clamp(config.caution + profile.cautionMod, 0, 100),
    exploration: config.exploration,
    patience: config.patience,
  }
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Find explored stairs down position
 */
function findKnownStairs(game: GameState): Point | null {
  const level = game.currentLevel

  // Check if stairs down location is explored
  if (level.stairsDown) {
    const tile = getTile(level, level.stairsDown.x, level.stairsDown.y)
    if (tile?.explored) {
      return level.stairsDown
    }
  }

  return null
}

/** How often to revalidate unexplored cache (in turns) */
const UNEXPLORED_REVALIDATE_INTERVAL = 50

/** Cache for unexplored state */
let unexploredCache: {
  depth: number
  turn: number
  exploredCount: number
} | null = null

/**
 * Invalidate the unexplored cache.
 * MUST be called at the start of each diagnostic run to prevent stale cache
 * from persisting across runs (module-level cache survives between games).
 */
export function invalidateUnexploredCache(): void {
  unexploredCache = null
}

/**
 * Get unexplored tiles indicator.
 * Returns sentinel array - only `.length === 0` matters to callers.
 * Uses shared explored count from frontier cache to avoid redundant scans.
 */
function getCachedUnexploredTiles(game: GameState, botState: BotState): Point[] {
  const level = game.currentLevel
  const currentDepth = game.character.depth
  const currentTurn = game.turn
  const totalTiles = level.width * level.height

  // Fast path: if same depth and within interval, return cached sentinel
  if (
    unexploredCache &&
    unexploredCache.depth === currentDepth &&
    currentTurn - unexploredCache.turn < UNEXPLORED_REVALIDATE_INTERVAL
  ) {
    const hasUnexplored = unexploredCache.exploredCount < totalTiles * 0.95
    return hasUnexplored ? [{ x: 0, y: 0 }] : []
  }

  // Need to revalidate - try to get count from frontier cache (avoids full scan)
  let exploredCount = getCachedExploredCount(currentDepth)

  // Fallback: count explored tiles (only when frontier cache is cold)
  if (exploredCount === null) {
    exploredCount = countExploredTiles(level)
  }

  // Update cache
  unexploredCache = {
    depth: currentDepth,
    turn: currentTurn,
    exploredCount,
  }
  botState.lastExploredCount = exploredCount

  // Return sentinel based on explored ratio
  const hasUnexplored = exploredCount < totalTiles * 0.95
  return hasUnexplored ? [{ x: 0, y: 0 }] : []
}

// ============================================================================
// STATUS & DANGER
// ============================================================================

/**
 * Get bot status string for debugging
 */
export function getBotStatus(context: BotContext): string {
  const { game, botState } = context
  const pos = game.character.position
  const goal = botState.currentGoal

  const parts = [
    `Pos: (${pos.x},${pos.y})`,
    `Depth: ${game.character.depth}`,
    `HP: ${game.character.hp}/${game.character.maxHp}`,
    `Goal: ${goal?.type ?? 'NONE'}`,
  ]

  if (goal?.target) {
    parts.push(`Target: (${goal.target.x},${goal.target.y})`)
  }

  parts.push(`Monsters: ${context.visibleMonsters.length}`)
  parts.push(`Items: ${context.visibleItems.length}`)
  parts.push(`Turns: ${botState.turnsOnLevel}`)

  return parts.join(' | ')
}
