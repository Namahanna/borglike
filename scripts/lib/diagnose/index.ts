/**
 * Diagnostic Toolkit
 *
 * A modular framework for diagnosing bot behavior issues.
 *
 * Usage:
 *   import { runDiagnosis, createAllAnalyzers, formatResult } from './lib/diagnose'
 *
 *   const result = runDiagnosis({
 *     seed: 12345,
 *     analyzers: createAllAnalyzers(),
 *   })
 *   console.log(formatResult(result))
 */

// Core runner
export { runDiagnosis, runBatchDiagnosis, runBatchDiagnosisParallel, runDeepDiagnosis, aggregateBatchResults, getOrCreatePool, parseCapabilities, CAPABILITY_PRESETS, destroyPool } from './runner'
export type { TurnLogEntry, ParallelBatchConfig, WorkerInput } from './runner'

// Modes
export { runBaseline, runBaselineRaces, BASELINE_CLASSES, BASELINE_RACES, BASELINE_DEFAULTS } from './baseline'
export type { BaselineConfig, BaselineResult, BaselineRacesConfig, BaselineRaceResult } from './baseline'

// Matrix mode
export { runMatrix, formatMatrixSummary, buildCellLabel, ALL_CAPABILITY_TIERS, ALL_UPGRADE_TIERS, ALL_PERSONALITIES } from './matrix'
export type { MatrixConfig, MatrixCell, MatrixCellResult, MatrixResult, MatrixAxis } from './matrix'

// Sensitivity testing
export { runSensitivityTest, SENSITIVITY_UPGRADES } from './sensitivity'
export type { SensitivityConfig, SensitivityResult, MultiSensitivityResult, UpgradeImpact } from './sensitivity'

// Types
export type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  DiagnoseConfig,
  DiagnoseResult,
  BatchConfig,
  BatchResult,
  TurnContext,
  PostTurnContext,
  EndReason,
  MovementPattern,
  TimestampedPosition,
} from './types'

// Analyzers
export {
  // Factory functions
  createAllAnalyzers,
  createAllAnalyzersWithMap,
  createAnalyzers,
  // Core analyzers
  StuckAnalyzer,
  createStuckAnalyzer,
  MovementAnalyzer,
  createMovementAnalyzer,
  PathingAnalyzer,
  createPathingAnalyzer,
  ExplorationAnalyzer,
  createExplorationAnalyzer,
  CombatAnalyzer,
  createCombatAnalyzer,
  // New analyzers
  MapVisualizer,
  createMapVisualizer,
  formatMapSnapshot,
  formatFullMapSnapshot,
  GoalAnalyzer,
  createGoalAnalyzer,
  JitterAnalyzer,
  createJitterAnalyzer,
  // Variant comparison (personalities, races)
  compareVariants,
  formatVariantComparison,
  comparePersonalities,
  formatPersonalityComparison,
  DEFAULT_PERSONALITIES,
  DEFAULT_RACES,
} from './analyzers'

export type {
  AnalyzerName,
  MapAnalyzerOptions,
  StuckAnalyzerConfig,
  MovementAnalyzerConfig,
  PathingAnalyzerConfig,
  ExplorationAnalyzerConfig,
  CombatAnalyzerConfig,
  MapVisualizerConfig,
  MapSnapshot,
  FormatMapOptions,
  GoalAnalyzerConfig,
  JitterAnalyzerConfig,
  // Variant comparison types
  CompareVariant,
  VariantCompareConfig,
  VariantMetrics,
  VariantCompareResult,
  // Legacy aliases
  PersonalityCompareConfig,
  PersonalityMetrics,
  PersonalityCompareResult,
} from './analyzers'

// Output formatting
export {
  formatResult,
  formatAnalyzerResult,
  formatTurnLog,
  formatBatchResult,
  formatIssues,
  formatOneLiner,
  formatBaselineResults,
  formatBaselineRaceResults,
  formatSensitivityResults,
  formatMultiSensitivityResults,
  formatFindResults,
} from './output'
export type { TurnLogOptions } from './output'

// File output
export { DEFAULT_OUTPUT_DIR, generateFileName, writeOutputFiles, shouldWriteFiles } from './file-output'
export type { DiagnoseOutputEnvelope } from './file-output'
