/**
 * Bot AI Type Definitions
 *
 * All bot-specific types in one place for easy importing.
 */

import type {
  Point,
  GameState,
  Monster,
  GroundItem,
  BotPersonality,
  Direction,
  AltarState,
  MerchantState,
} from '../types'
import type {
  BotCapabilities,
  BotToggles,
  SweepLevelRange,
  SurfLevelRange,
} from '@/types/progression'
import type { ClassBehaviorProfile } from './class-profiles'
import type { FlowGrid } from './flow'

// ============================================================================
// GOAL TYPES
// ============================================================================

/** Bot goal types */
export type GoalType =
  | 'KILL'
  | 'TAKE'
  | 'DESCEND'
  | 'FLEE'
  | 'EXPLORE'
  | 'RECOVER'
  | 'WAIT'
  | 'KITE'
  | 'HUNT_UNIQUE' // Hunt unique monsters blocking descent
  | 'USE_ALTAR' // Use dungeon altars (gold sink)
  | 'VISIT_MERCHANT' // Visit dungeon merchants
  // Town-related goals (order: sell → heal → buy)
  | 'SELL_TO_MERCHANT' // Sell loot first to get gold
  | 'VISIT_HEALER' // Heal with gold from selling
  | 'BUY_FROM_MERCHANT' // Buy consumables after healing
  | 'RETURN_PORTAL' // Return through portal
  | 'EXIT_TOWN' // Use dungeon entrance (fallback)
  // Farming loop goals (when descent blocked by consumable requirements)
  | 'FARM' // Farm current level for gold/XP
  | 'ASCEND_TO_FARM' // Go up to easier levels when under-leveled
  | 'TOWN_TRIP' // Use town portal when ready for shopping

/** A bot's current goal */
export interface BotGoal {
  type: GoalType
  target: Point | null // Where we're going (null for WAIT/RECOVER)
  targetId: string | null // Monster/item ID if applicable
  reason: string // For debugging
  startTurn: number // When goal was set
}

// ============================================================================
// FLOW TYPES
// ============================================================================

// Re-export FlowGrid for external consumers
export type { FlowGrid }

/** Flow computation result */
export interface FlowResult {
  goal: Point
  costs: FlowGrid
  computedAt: number // Turn when computed
}

/** Danger grid: flat Int16Array indexed by y * width + x */
export interface DangerGrid {
  data: Int16Array
  width: number
  height: number
}

/** @deprecated Alias for DangerGrid (was Map<string, number>) */
export type DangerMap = DangerGrid

// ============================================================================
// SEEN GRID (typed-array replacement for Set<string> seenThisVisit)
// ============================================================================

/** Tiles seen this visit — Uint8Array indexed by y * width + x */
export interface SeenGrid {
  data: Uint8Array
  width: number
  count: number
}

/** Create a SeenGrid for the given level dimensions */
export function createSeenGrid(width: number, height: number): SeenGrid {
  return { data: new Uint8Array(width * height), width, count: 0 }
}

/** Check if tile has been seen this visit */
export function seenGridHas(grid: SeenGrid, x: number, y: number): boolean {
  return grid.data[y * grid.width + x] !== 0
}

/** Mark tile as seen this visit */
export function seenGridAdd(grid: SeenGrid, x: number, y: number): void {
  const idx = y * grid.width + x
  if (grid.data[idx] === 0) {
    grid.data[idx] = 1
    grid.count++
  }
}

/** Clear all seen tiles (level change / flip) */
export function seenGridClear(grid: SeenGrid): void {
  grid.data.fill(0)
  grid.count = 0
}

/** Cached danger computation */
export interface DangerResult {
  dangers: DangerGrid
  maxDanger: number
  computedAt: number // Turn when computed
}

/** Result of safety flow computation (inverted Dijkstra) */
export interface SafetyFlowResult {
  /** Target position to flee toward (null if surrounded) */
  target: Point | null
  /** Turn when computed */
  computedAt: number
}

/** Cached exploration flow (multi-goal BFS) */
export interface ExplorationFlowCache {
  /** The computed flow costs */
  costs: FlowGrid
  /** Frontier count when computed (for invalidation) */
  frontierCount: number
  /** Explored tile count when computed */
  exploredCount: number
  /** Turn when computed */
  computedAt: number
  /** Depth where computed */
  depth: number
}

/** Cached sweep flow (multi-goal BFS for caster sweep mode) */
export interface SweepFlowCache {
  /** The computed flow costs */
  costs: FlowGrid
  /** seenThisVisit.size when computed (for invalidation) */
  seenCount: number
  /** Turn when computed */
  computedAt: number
  /** Depth where computed */
  depth: number
  /** Bot position when computed (for invalidation on movement) */
  botPosition: Point
}

// ============================================================================
// DANGER TIER TYPES (Angband-inspired 4-tier system)
// ============================================================================

/** Four-tier danger classification */
export type DangerTier = 'SAFE' | 'CAUTION' | 'DANGER' | 'CRITICAL'

/** Phase door safety evaluation result */
export interface PhaseDoorSafety {
  /** Is it safe enough to use phase door? */
  isSafe: boolean
  /** Ratio of safe landing zones (0-1) */
  safeRatio: number
  /** Average danger at potential landing spots */
  avgDanger: number
}

// ============================================================================
// BOT STATE
// ============================================================================

/** Persistent bot state for a single run */
export interface BotState {
  // Step history (anti-oscillation) - last 25 positions
  recentPositions: Point[]

  // Goal tracking
  currentGoal: BotGoal | null
  goalTarget: Point | null // Required by game-runner.ts

  // Level tracking
  levelEnterTurn: number
  turnsOnLevel: number
  currentDepth: number

  // Knowledge cache
  knownStairsDown: Point | null
  knownStairsUp: Point | null

  // Cached flow (invalidated on goal change)
  cachedFlow: FlowResult | null

  // Cached danger (recomputed each turn monsters change)
  cachedDanger: DangerResult | null

  // Cached safety flow for flee behavior (inverted Dijkstra)
  cachedSafetyFlow: SafetyFlowResult | null

  // Stuck detection (Phase 3 prep)
  twitchCounter: number
  lastProgressTurn: number

  // Flee cooldown (turn until which fleeing is disabled)
  fleeCooldownUntil: number

  // Town tracking
  isInTown: boolean
  townEntryTurn: number
  healerVisited: boolean

  // Multi-shop tracking (per-shop visited state)
  shopsVisitedForSelling: Set<string> // Shop IDs where we sold items
  shopsVisitedForBuying: Set<string> // Shop IDs where we bought items
  visitedDungeonMerchants: Set<string> // Dungeon merchant IDs visited this level

  // Consumable tier management
  /** Item IDs of consumables to sell when picking up tier upgrades */
  consumablesToSell: Set<string>

  // Town needs tracking (shopping completion - tracks what we need, not what we visited)
  /** Number of each supply type still needed during town visit */
  townNeeds: {
    tp: number // Town Portal scrolls needed
    healing: number // Healing potions needed
    escape: number // Escape scrolls needed
  }

  // Labyrinth/corridor exploration mode
  /** Whether we're actively following a corridor (for labyrinth exploration) */
  corridorFollowingMode: boolean
  /** Direction we're facing while corridor-following (for consistent movement) */
  corridorFacing: Direction | null

  // Exploration blacklist (unreachable targets)
  /** Targets that couldn't be reached - blacklisted until turn expires */
  blacklistedTargets: Map<string, number> // "x,y" -> expiry turn

  // Item blacklist (items that caused danger)
  /** Items that triggered flee due to high danger area - avoid re-targeting */
  dangerousItemBlacklist: Map<string, number> // Item ID -> expiry turn

  // Farming loop state (depth preparation system)
  /** Whether bot is in farming mode (blocked from descent, farming for gold/XP) */
  farmingMode: boolean
  /** The depth we're trying to reach but can't (triggers farming) */
  farmBlockedDepth: number
  /** Gold target to reach before town trip */
  farmGoldTarget: number
  /** Turn when farming started (for timeout detection) */
  farmStartTurn: number

  // Tethered exploration (prevents yo-yo stairs without exploring)
  /** Position we're tethered to (stairs we just used) */
  tetheredOrigin: Point | null
  /** Exploration radius required before next flip (2=5x5, 4=9x9, 0=can flip) */
  tetheredRadius: number
  /** How many flips in current farming cycle (0→2→4→flip→reset) */
  tetheredFlipCount: number
  /** Turn when last level flip occurred (for minimum interval enforcement) */
  lastFlipTurn: number
  /** Tiles seen via FOV on THIS level visit - reset on level change */
  seenThisVisit: SeenGrid

  // Sweep exploration state (for casters in early game)
  /** Whether bot is in sweep exploration mode (covering whole level) */
  sweepMode: boolean
  /** Preferred compass direction for consistent sweep movement */
  sweepDirection: Direction | null
  /** Turn when sweep started (for timeout tracking) */
  sweepStartTurn: number
  /** Whether sweep has been exhausted on this level (timed out or unreachable tiles) */
  sweepExhausted: boolean

  // Sweep flip state (yo-yo descent into blocked depth to trigger level regen)
  /** Whether we're in a sweep flip (descended into blocked, ascending back) */
  sweepFlipActive: boolean
  /** Depth to return to after descending into blocked depth */
  sweepFlipTargetDepth: number | null
  /** Whether we've actually descended into the blocked depth during this flip */
  sweepFlipVisitedBlocked: boolean

  // Unique hunt level flip (when unique blocks descent but isn't on current level)
  /** Name of unique we're hunting that blocks descent */
  huntingUniqueBlocker: string | null
  /** Depth to return to for hunting the unique */
  uniqueHuntFlipDepth: number | null

  // Morgoth hunt level flip (separate from unique blocking - Morgoth IS the endgame)
  /** Whether we're in a Morgoth hunt flip (ascend to 49, descend back to 50) */
  morgothFlipActive: boolean
  /** Target depth to return to (always MAX_DEPTH when active) */
  morgothFlipTargetDepth: number | null

  // HP tracking for DOT detection
  /** HP value from previous turn */
  previousHp: number
  /** HP history (last 5 turns) */
  hpHistory: number[]
  /** Detected HP loss rate (HP/turn, negative = losing) */
  hpRate: number

  // Performance caches
  /** Cached exploration flow (multi-goal BFS to all frontiers) */
  cachedExplorationFlow: ExplorationFlowCache | null
  /** Cached sweep flow (multi-goal BFS for caster sweep mode) */
  cachedSweepFlow: SweepFlowCache | null
  /** Cached unexplored tile count (for invalidation detection) */
  lastExploredCount: number
  /** Cached floor tile count for current level (non-wall tiles) */
  cachedLevelFloorCount: number

  // Kite duration tracking (prevent infinite kiting of unkillable monsters)
  /** Monster ID we've been kiting (persists across goal re-evaluations) */
  kiteTargetId: string | null
  /** Turn when we started kiting this specific target */
  kiteTargetStartTurn: number

  // Danger retreat state (cautious personality)
  /** DESCEND blocked by danger, cautious bot should retreat (ascend) instead of bullrush */
  dangerBlockedDescent: boolean

  // Diagnostic tracking (for analyzer consumption)
  /** Last town portal usage reason (set when TP used, cleared on town exit) */
  lastTownPortalReason: string | null
}

// ============================================================================
// CONTEXT & PERSONALITY
// ============================================================================

/** Bot decision context (built each tick) */
export interface BotContext {
  game: GameState
  personality: BotPersonality
  config: PersonalityConfig

  // Class-aware fields
  classId: string
  classProfile: ClassBehaviorProfile
  effectiveConfig: PersonalityConfig // personality + class modifiers

  // Bot capabilities (per-slot training unlocks)
  capabilities: BotCapabilities
  toggles: BotToggles

  // Sweep/surf configuration (per-slot)
  sweepLevelRange: SweepLevelRange
  surfLevelRange: SurfLevelRange

  // Depth gate offset: player-controlled shift to class-based level requirements
  depthGateOffset: number

  // Derived data
  visibleMonsters: Monster[]
  visibleItems: GroundItem[]
  visibleAltars: AltarState[]
  visibleMerchants: MerchantState[]
  knownStairs: Point | null
  unexploredTiles: Point[]

  // Current state reference
  botState: BotState
}

/** Effective capability state (unlocked AND toggled on for ON/OFF, level for graded) */
export interface EffectiveCapabilities {
  farming: boolean
  tactics: number // 0=none, 1=debuffs, 2=+buffs, 3=+smart debuffs
  town: number // 0=none, 1=portal, 2=+healer, 3=+commerce
  preparedness: number
  sweep: number
  surf: number
  kiting: number
  targeting: number
  retreat: number
}

/** Get effective capabilities (capability unlocked AND toggled on) */
export function getEffectiveCapabilities(context: BotContext): EffectiveCapabilities {
  const { capabilities } = context
  return {
    farming: capabilities.farming && context.toggles.farming,
    tactics: capabilities.tactics, // Graded capability, no toggle
    town: capabilities.town,
    preparedness: capabilities.preparedness,
    sweep: capabilities.sweep,
    surf: capabilities.surf,
    kiting: capabilities.kiting,
    targeting: capabilities.targeting,
    retreat: capabilities.retreat,
  }
}

/** Personality configuration parameters (0-100 scale) */
export interface PersonalityConfig {
  aggression: number // How readily to engage (vs flee)
  greed: number // Detour distance for items
  caution: number // HP threshold for retreat (as %)
  exploration: number // How much to explore before descending
  patience: number // Turns before forcing descent
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Step history length for anti-oscillation */
export const STEP_HISTORY_LENGTH = 25

/** Cardinal directions for preference ordering */
export const CARDINAL_DIRECTIONS: readonly string[] = ['n', 's', 'e', 'w']

/** All 8 directions */
export const ALL_DIRECTIONS: readonly string[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

// ============================================================================
// CLASS CONSTANTS (shared across modules)
// ============================================================================

/**
 * Class tier for level requirements (Angband borg-inspired).
 *
 * - TANK: Warriors/melee - can handle 4 levels deeper than their level
 * - MEDIUM: Hybrid classes - need to match depth with level
 * - SQUISHY: Pure casters - need 5 levels above depth
 */
export type ClassTier = 'TANK' | 'MEDIUM' | 'SQUISHY'

/**
 * Get class tier for level requirement calculation.
 * Based on Angband borg's class-specific depth rules.
 */
export function getClassTier(classId: string): ClassTier {
  switch (classId) {
    // Tank: Strong melee, high HP - can go deep early
    case 'warrior':
    case 'berserker':
    case 'blackguard':
      return 'TANK'

    // Squishy: Pure casters - need to overlevel significantly
    case 'mage':
    case 'archmage':
    case 'necromancer':
      return 'SQUISHY'

    // Medium: Hybrids - need level to match depth
    case 'paladin':
    case 'priest':
    case 'druid':
    case 'ranger':
    case 'rogue':
    default:
      return 'MEDIUM'
  }
}

/** Caster classes that use sweep exploration instead of stair surfing */
export const SQUISHY_CLASSES = new Set(['mage', 'archmage', 'necromancer'])

/**
 * Get default sweep level range based on class tier.
 * SQUISHY classes sweep L1-10 by default, others have sweep disabled.
 */
export function getDefaultSweepLevelRange(classId: string): SweepLevelRange {
  if (SQUISHY_CLASSES.has(classId)) {
    return { start: 1, end: 10 } // Sweep L1-9, surf at L10+
  }
  return { start: 0, end: 0 } // Disabled
}

/** Get default surf level range (no restriction — always eligible). */
export function getDefaultSurfLevelRange(): SurfLevelRange {
  return { start: 0, end: 0 }
}
