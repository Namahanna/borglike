/**
 * Analyzer Index
 *
 * Re-exports all analyzers and provides factory functions.
 *
 * ## Consolidated Analyzers (Domain-Aligned)
 *
 * These analyzers map to bot modules and provide configurable checks:
 *
 * - `goals` - Goal lifecycle, distance, completion (replaces: goal, goal-distance)
 * - `exploration` - Progress, frontier, movement patterns (replaces: exploration, frontier, movement, oscillation, jitter)
 * - `progression` - Farming, sweep, tether, descent (replaces: farming)
 * - `combat` - Engagement, damage, kills
 * - `stuck` - Stuck detection, twitch counter
 *
 * ## Utility Analyzers
 *
 * - `stats` - Run summary statistics
 * - `map` - Map visualization (optional, large output)
 * - `step-debug` - Per-step debugging
 */

// =============================================================================
// CONSOLIDATED ANALYZERS (use these)
// =============================================================================

// Goals - goal lifecycle, distance, completion
export { GoalsAnalyzer, createGoalsAnalyzer } from './goals'
export type { GoalsAnalyzerConfig, GoalsChecks } from './goals'

// Exploration - progress, frontier, movement patterns
export {
  ExplorationAnalyzer,
  createExplorationAnalyzer,
} from './exploration'
export type {
  ExplorationAnalyzerConfig,
  ExplorationChecks,
} from './exploration'

// Progression - farming, sweep, tether, descent
export { ProgressionAnalyzer, createProgressionAnalyzer } from './progression'
export type { ProgressionAnalyzerConfig, ProgressionChecks } from './progression'

// Combat - already well-aligned
export { CombatAnalyzer, createCombatAnalyzer } from './combat'
export type { CombatAnalyzerConfig } from './combat'

// Stuck - already well-aligned
export { StuckAnalyzer, createStuckAnalyzer } from './stuck'
export type { StuckAnalyzerConfig } from './stuck'

// =============================================================================
// UTILITY ANALYZERS
// =============================================================================

export { StatsAnalyzer, createStatsAnalyzer } from './stats'

export { MapVisualizer, createMapVisualizer, formatMapSnapshot, formatFullMapSnapshot } from './map'
export type { MapVisualizerConfig, MapSnapshot, FormatMapOptions } from './map'

export { StepDebugAnalyzer, createStepDebugAnalyzer } from './step-debug'
export type { StepDebugConfig } from './step-debug'

// Variant comparison (personalities, races)
export {
  compareVariants,
  formatVariantComparison,
  // Legacy aliases
  comparePersonalities,
  formatPersonalityComparison,
  DEFAULT_PERSONALITIES,
  DEFAULT_RACES,
} from './comparison'
export type {
  CompareVariant,
  VariantCompareConfig,
  VariantMetrics,
  VariantCompareResult,
  // Legacy aliases
  PersonalityCompareConfig,
  PersonalityMetrics,
  PersonalityCompareResult,
} from './comparison'

// =============================================================================
// LEGACY ANALYZERS (deprecated - use consolidated versions)
// =============================================================================

// These are still exported for backwards compatibility but should be migrated
// to the consolidated analyzers above.

/** @deprecated Use GoalsAnalyzer instead */
export { GoalAnalyzer, createGoalAnalyzer } from './goal'
export type { GoalAnalyzerConfig } from './goal'

/** @deprecated Use GoalsAnalyzer instead */
export { GoalDistanceAnalyzer, createGoalDistanceAnalyzer } from './goal-distance'
export type { GoalDistanceAnalyzerConfig } from './goal-distance'

/** @deprecated Use ExplorationAnalyzer instead */
export { FrontierAnalyzer, createFrontierAnalyzer } from './frontier'
export type { FrontierAnalyzerConfig } from './frontier'

/** @deprecated Use ExplorationAnalyzer instead */
export { MovementAnalyzer, createMovementAnalyzer } from './movement'
export type { MovementAnalyzerConfig } from './movement'

/** @deprecated Use ExplorationAnalyzer instead */
export { OscillationAnalyzer, createOscillationAnalyzer } from './oscillation'
export type { OscillationAnalyzerConfig } from './oscillation'

/** @deprecated Use ExplorationAnalyzer instead */
export { JitterAnalyzer, createJitterAnalyzer } from './jitter'
export type { JitterAnalyzerConfig } from './jitter'

/** @deprecated Use ProgressionAnalyzer instead */
export { FarmingAnalyzer, createFarmingAnalyzer } from './farming'
export type { FarmingAnalyzerConfig } from './farming'

/** @deprecated Use ExplorationAnalyzer instead - this was the old exploration analyzer */
export {
  ExplorationAnalyzer as LegacyExplorationAnalyzer,
  createExplorationAnalyzer as createLegacyExplorationAnalyzer,
} from './exploration-legacy'
export type { ExplorationAnalyzerConfig as LegacyExplorationAnalyzerConfig } from './exploration-legacy'

/** @deprecated Use GoalsAnalyzer instead */
export { PathingAnalyzer, createPathingAnalyzer } from './pathing'
export type { PathingAnalyzerConfig } from './pathing'

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

import type { Analyzer } from '../types'
import { createGoalsAnalyzer } from './goals'
import { createExplorationAnalyzer } from './exploration'
import { createProgressionAnalyzer } from './progression'
import { createCombatAnalyzer } from './combat'
import { createStuckAnalyzer } from './stuck'
import { createStatsAnalyzer } from './stats'
import { createMapVisualizer } from './map'

/** All available analyzer names */
export type AnalyzerName =
  // Consolidated
  | 'goals'
  | 'exploration'
  | 'progression'
  | 'combat'
  | 'stuck'
  // Utility
  | 'stats'
  | 'map'
  | 'step-debug'
  // Legacy (deprecated)
  | 'goal'
  | 'goal-distance'
  | 'frontier'
  | 'movement'
  | 'oscillation'
  | 'jitter'
  | 'farming'
  | 'pathing'
  | 'legacy-exploration'

/** Create all standard analyzers (consolidated) */
export function createAllAnalyzers(): Analyzer[] {
  return [
    createGoalsAnalyzer(),
    createExplorationAnalyzer(),
    createProgressionAnalyzer(),
    createCombatAnalyzer(),
    createStuckAnalyzer(),
    createStatsAnalyzer(),
    // Note: MapVisualizer not included by default (produces large output)
  ]
}

export interface MapAnalyzerOptions {
  /** Capture both explored and full map in snapshots */
  captureBothMaps?: boolean
  /** Show full map by default (all tiles revealed) */
  showFullMap?: boolean
}

/** Create all analyzers including map visualizer */
export function createAllAnalyzersWithMap(options: MapAnalyzerOptions = {}): Analyzer[] {
  return [
    ...createAllAnalyzers(),
    createMapVisualizer({
      captureBothMaps: options.captureBothMaps ?? false,
      showFullMap: options.showFullMap ?? false,
    }),
  ]
}

// Import legacy factories for createAnalyzers compatibility
import { createGoalAnalyzer } from './goal'
import { createGoalDistanceAnalyzer } from './goal-distance'
import { createFrontierAnalyzer } from './frontier'
import { createMovementAnalyzer } from './movement'
import { createOscillationAnalyzer } from './oscillation'
import { createJitterAnalyzer } from './jitter'
import { createFarmingAnalyzer } from './farming'
import { createPathingAnalyzer } from './pathing'
import { createStepDebugAnalyzer } from './step-debug'
import { createExplorationAnalyzer as createLegacyExploration } from './exploration-legacy'

/** Create a subset of analyzers by name */
export function createAnalyzers(names: AnalyzerName[]): Analyzer[] {
  const factories: Record<AnalyzerName, () => Analyzer> = {
    // Consolidated
    goals: createGoalsAnalyzer,
    exploration: createExplorationAnalyzer,
    progression: createProgressionAnalyzer,
    combat: createCombatAnalyzer,
    stuck: createStuckAnalyzer,
    // Utility
    stats: createStatsAnalyzer,
    map: createMapVisualizer,
    'step-debug': createStepDebugAnalyzer,
    // Legacy (deprecated)
    goal: createGoalAnalyzer,
    'goal-distance': createGoalDistanceAnalyzer,
    frontier: createFrontierAnalyzer,
    movement: createMovementAnalyzer,
    oscillation: createOscillationAnalyzer,
    jitter: createJitterAnalyzer,
    farming: createFarmingAnalyzer,
    pathing: createPathingAnalyzer,
    'legacy-exploration': createLegacyExploration,
  }

  return names.map((name) => factories[name]())
}

/**
 * Create legacy analyzers (for backwards compatibility)
 * @deprecated Use createAllAnalyzers() instead
 */
export function createLegacyAnalyzers(): Analyzer[] {
  return [
    createStuckAnalyzer(),
    createMovementAnalyzer(),
    createPathingAnalyzer(),
    createLegacyExploration(),
    createCombatAnalyzer(),
    createGoalAnalyzer(),
    createJitterAnalyzer(),
    createGoalDistanceAnalyzer(),
    createOscillationAnalyzer(),
    createStatsAnalyzer(),
    createFrontierAnalyzer(),
    createFarmingAnalyzer(),
  ]
}
