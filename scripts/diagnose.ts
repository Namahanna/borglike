#!/usr/bin/env npx tsx
/**
 * Bot Diagnostic CLI
 *
 * Unified diagnostic toolkit for investigating bot behavior issues.
 *
 * Usage:
 *   pnpm diagnose [mode] [options]
 *
 * Modes:
 *   deep [seed]     - Deep dive on a single seed with full turn log and map
 *   quick [seed]    - Quick check on a single seed (summary only)
 *   batch [runs]    - Run multiple seeds and aggregate results
 *   find            - Find problematic seeds
 *   compare         - Compare behavior across personalities
 *   baseline        - Run full baseline test across all classes (100 runs, 30k turns)
 *   help            - Show this help message
 *
 * Options:
 *   --seed=N        - Specific seed to test
 *   --runs=N        - Number of runs for batch mode (default: 50)
 *   --turns=N       - Max turns per run (default: 20000)
 *   --race=ID       - Race ID (default: human)
 *   --class=ID      - Class ID (default: warrior)
 *   --personality=P - Bot personality (default: cautious)
 *   --analyzers=A,B - Comma-separated analyzer names (default: all)
 *   --map           - Include map visualization (for deep mode)
 *   --from=N        - Start of turn range for output (deep mode)
 *   --to=N          - End of turn range for output (deep mode)
 *   --log-only      - Only show turn log, skip analyzer output (deep mode)
 *
 * Examples:
 *   pnpm diagnose deep 1768965560201
 *   pnpm diagnose quick --seed=12345
 *   pnpm diagnose batch --runs=100 --personality=aggressive
 *   pnpm diagnose find --runs=500
 *   pnpm diagnose compare --runs=20
 */

import {
  runDiagnosis,
  runBatchDiagnosisParallel,
  runDeepDiagnosis,
  createAllAnalyzers,
  createAllAnalyzersWithMap,
  createAnalyzers,
  formatResult,
  formatBatchResult,
  formatTurnLog,
  formatMapSnapshot,
  compareVariants,
  formatVariantComparison,
  MapVisualizer,
  runBaseline,
  runBaselineRaces,
  runSensitivityTest,
  formatBaselineResults,
  formatBaselineRaceResults,
  formatSensitivityResults,
  formatMultiSensitivityResults,
  formatFindResults,
  destroyPool,
  runMatrix,
  formatMatrixSummary,
  BASELINE_CLASSES,
  BASELINE_RACES,
  ALL_CAPABILITY_TIERS,
  ALL_UPGRADE_TIERS,
  ALL_PERSONALITIES,
} from './lib/diagnose'
import { DEFAULT_OUTPUT_DIR, generateFileName, writeOutputFiles, shouldWriteFiles } from './lib/diagnose/file-output'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CompareVariant } from './lib/diagnose'
import type { AnalyzerName } from './lib/diagnose'
import type { BotPersonality } from '@game/types'

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

interface Args {
  mode: 'deep' | 'quick' | 'batch' | 'find' | 'compare' | 'baseline' | 'baseline-races' | 'sensitivity' | 'matrix' | 'help'
  seed?: number
  runs: number
  turns: number
  race: string
  classId: string
  personality: BotPersonality
  analyzers: AnalyzerName[]
  includeMap: boolean
  /** Show full map (all tiles revealed) */
  fullMap: boolean
  /** Start of turn range for output (deep mode) */
  from?: number
  /** End of turn range for output (deep mode) */
  to?: number
  /** Only show turn log, skip analyzer output (deep mode) */
  logOnly: boolean
  /** Number of worker threads for parallel batch runs */
  threads: number
  /** Use max upgrade bonuses */
  maxUpgrades: boolean
  /** Upgrade IDs to exclude when maxUpgrades is true (for isolation testing) */
  excludeUpgrades: string[]
  /** Randomize race/class/personality per run */
  randomize: boolean
  /** Compare races instead of personalities (for compare mode) */
  compareRaces: boolean
  /** Specific races to compare (comma-separated, or empty for defaults) */
  raceList: string[]
  /** Bot capabilities spec: 'none', 'full', or comma-separated upgrade IDs */
  capabilities: string
  /** Upgrade preset: 'none', 'early', 'mid', 'late', 'full' */
  upgrades: string
  /** Booster preset: 'none', 'class', or comma-separated booster IDs */
  boosters: string
  // Balance overrides (Tier 1)
  monsterHp: number
  monsterDamage: number
  startPotions: number
  potionRate: number
  regen: number
  armorPen: number
  // Balance overrides (Tier 2)
  enchantRate: number
  itemRate: number
  levelupHp: number
  // Balance overrides (Tier 3)
  xpRate: number
  upgradePower: number
  // Knowledge system
  bestiary: number
  // HP scaling
  hpFraction: number
  // Output control
  /** Force stdout output (no file writing) */
  forceStdout: boolean
  /** Custom output directory */
  outputDir?: string
  // Matrix mode
  /** Classes for matrix mode */
  matrixClasses: string[]
  /** Races for matrix mode */
  matrixRaces: string[]
  /** Personalities for matrix mode */
  matrixPersonalities: string[]
  /** Capability tiers for matrix mode */
  capTiers: string[]
  /** Upgrade tiers for matrix mode */
  upgradeTiers: string[]
  /** Paired progression tiers (sets both upgrades and capabilities) */
  progressionTiers: string[]
  /** Whether the user explicitly passed --threads */
  userSetThreads: boolean
}

const ALL_ANALYZERS: AnalyzerName[] = [
  'stuck',
  'movement',
  'pathing',
  'exploration',
  'combat',
  'goal',
  'jitter',
  'goal-distance',
  'oscillation',
  'frontier',
  'stats',
  'step-debug',
]

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const result: Args = {
    mode: 'help',
    runs: 50,
    turns: 20000,
    race: 'human',
    classId: 'warrior',
    personality: 'cautious',
    analyzers: ALL_ANALYZERS,
    includeMap: false,
    fullMap: false,
    logOnly: false,
    threads: 8,
    maxUpgrades: false,
    excludeUpgrades: [],
    randomize: false,
    compareRaces: false,
    raceList: [],
    capabilities: 'full',
    upgrades: 'full',
    boosters: 'class',
    // Balance defaults (100 = normal)
    monsterHp: 100,
    monsterDamage: 100,
    startPotions: 3,
    potionRate: 100,
    regen: 0,
    armorPen: 0,
    enchantRate: 100,
    itemRate: 100,
    levelupHp: 100,
    xpRate: 100,
    upgradePower: 100,
    bestiary: 0,
    hpFraction: 70,
    forceStdout: false,
    // Matrix defaults
    matrixClasses: [],
    matrixRaces: [],
    matrixPersonalities: [],
    capTiers: [],
    upgradeTiers: [],
    progressionTiers: [],
    userSetThreads: false,
  }

  // Parse mode (first positional arg)
  const mode = args[0]
  if (
    mode === 'deep' ||
    mode === 'quick' ||
    mode === 'batch' ||
    mode === 'find' ||
    mode === 'compare' ||
    mode === 'baseline' ||
    mode === 'baseline-races' ||
    mode === 'sensitivity' ||
    mode === 'matrix' ||
    mode === 'help'
  ) {
    result.mode = mode
  } else if (mode && !mode.startsWith('--')) {
    // Assume it's a seed for deep mode
    result.mode = 'deep'
    result.seed = parseInt(mode, 10)
  }

  // Check for seed as second positional arg
  if (args[1] && !args[1].startsWith('--')) {
    result.seed = parseInt(args[1], 10)
  }

  // Parse named options
  for (const arg of args) {
    if (arg.startsWith('--seed=')) {
      result.seed = parseInt(arg.slice(7), 10)
    } else if (arg.startsWith('--runs=')) {
      result.runs = parseInt(arg.slice(7), 10)
    } else if (arg.startsWith('--turns=')) {
      result.turns = parseInt(arg.slice(8), 10)
    } else if (arg.startsWith('--race=')) {
      result.race = arg.slice(7)
    } else if (arg.startsWith('--class=')) {
      result.classId = arg.slice(8)
    } else if (arg.startsWith('--personality=')) {
      result.personality = arg.slice(14) as BotPersonality
    } else if (arg.startsWith('--analyzers=')) {
      const names = arg.slice(12).split(',')
      result.analyzers = names.filter((n) =>
        [...ALL_ANALYZERS, 'map'].includes(n)
      ) as AnalyzerName[]
    } else if (arg === '--map') {
      result.includeMap = true
    } else if (arg === '--full-map') {
      result.includeMap = true
      result.fullMap = true
    } else if (arg.startsWith('--from=')) {
      result.from = parseInt(arg.slice(7), 10)
    } else if (arg.startsWith('--to=')) {
      result.to = parseInt(arg.slice(5), 10)
    } else if (arg === '--log-only') {
      result.logOnly = true
    } else if (arg.startsWith('--threads=')) {
      result.threads = parseInt(arg.slice(10), 10)
      result.userSetThreads = true
    } else if (arg === '--max-upgrades') {
      result.maxUpgrades = true
    } else if (arg.startsWith('--exclude-upgrade=')) {
      result.excludeUpgrades = arg.slice(18).split(',').filter(Boolean)
    } else if (arg === '--randomize') {
      result.randomize = true
    } else if (arg === '--races') {
      result.compareRaces = true
    } else if (arg.startsWith('--races=')) {
      const val = arg.slice(8)
      if (result.mode === 'matrix') {
        result.matrixRaces = val === 'all' ? [...BASELINE_RACES] : val.split(',').filter(Boolean)
      } else {
        result.compareRaces = true
        result.raceList = val.split(',').filter(Boolean)
      }
    // Matrix mode options
    } else if (arg.startsWith('--classes=')) {
      const val = arg.slice(10)
      result.matrixClasses = val === 'all' ? [...BASELINE_CLASSES] : val.split(',').filter(Boolean)
    } else if (arg.startsWith('--personalities=')) {
      const val = arg.slice(16)
      result.matrixPersonalities = val === 'all' ? [...ALL_PERSONALITIES] : val.split(',').filter(Boolean)
    } else if (arg.startsWith('--cap-tiers=')) {
      const val = arg.slice(12)
      result.capTiers = val === 'all' ? [...ALL_CAPABILITY_TIERS] : val.split(',').filter(Boolean)
    } else if (arg.startsWith('--upgrade-tiers=')) {
      const val = arg.slice(16)
      result.upgradeTiers = val === 'all' ? [...ALL_UPGRADE_TIERS] : val.split(',').filter(Boolean)
    } else if (arg.startsWith('--progression=')) {
      const val = arg.slice(14)
      result.progressionTiers = val === 'all' ? [...ALL_UPGRADE_TIERS] : val.split(',').filter(Boolean)
      result.progressionTiers = arg.slice(14).split(',').filter(Boolean)
    } else if (arg.startsWith('--capabilities=')) {
      result.capabilities = arg.slice(15)
    } else if (arg.startsWith('--upgrades=')) {
      result.upgrades = arg.slice(11)
    } else if (arg.startsWith('--boosters=')) {
      result.boosters = arg.slice(11)
    // Balance overrides (Tier 1)
    } else if (arg.startsWith('--monster-hp=')) {
      result.monsterHp = parseInt(arg.slice(13), 10)
    } else if (arg.startsWith('--monster-damage=')) {
      result.monsterDamage = parseInt(arg.slice(17), 10)
    } else if (arg.startsWith('--start-potions=')) {
      result.startPotions = parseInt(arg.slice(16), 10)
    } else if (arg.startsWith('--potion-rate=')) {
      result.potionRate = parseInt(arg.slice(14), 10)
    } else if (arg.startsWith('--regen=')) {
      result.regen = parseInt(arg.slice(8), 10)
    } else if (arg.startsWith('--armor-pen=')) {
      result.armorPen = parseInt(arg.slice(12), 10)
    // Balance overrides (Tier 2)
    } else if (arg.startsWith('--enchant-rate=')) {
      result.enchantRate = parseInt(arg.slice(15), 10)
    } else if (arg.startsWith('--item-rate=')) {
      result.itemRate = parseInt(arg.slice(12), 10)
    } else if (arg.startsWith('--levelup-hp=')) {
      result.levelupHp = parseInt(arg.slice(13), 10)
    // Balance overrides (Tier 3)
    } else if (arg.startsWith('--xp-rate=')) {
      result.xpRate = parseInt(arg.slice(10), 10)
    } else if (arg.startsWith('--upgrade-power=')) {
      result.upgradePower = parseInt(arg.slice(16), 10)
    } else if (arg.startsWith('--bestiary=')) {
      result.bestiary = parseInt(arg.slice(11), 10)
    } else if (arg.startsWith('--hp-fraction=')) {
      result.hpFraction = parseInt(arg.slice(14), 10)
    // Output control
    } else if (arg === '--stdout') {
      result.forceStdout = true
    } else if (arg.startsWith('--output=')) {
      result.outputDir = arg.slice(9)
    }
  }

  return result
}

// ============================================================================
// HELP
// ============================================================================

function showHelp(): void {
  console.log(`
Bot Diagnostic CLI
==================

Unified toolkit for investigating bot behavior issues.

USAGE:
  pnpm diagnose [mode] [options]

MODES:
  deep [seed]     Deep dive on a single seed with full turn log
  quick [seed]    Quick check on a single seed (summary only)
  batch           Run multiple seeds and aggregate results
  find            Find problematic seeds automatically
  compare         Compare behavior across all personalities
  baseline        Run full baseline across all 11 classes (100 runs, 50k turns)
  baseline-races  Run full baseline across all 11 races (100 runs, 50k turns)
  sensitivity     Test per-upgrade impact on performance (supports --classes)
  matrix          Run cartesian product of classes/races/tiers (shared pool)
  help            Show this help message

OPTIONS:
  --seed=N        Specific seed to test (default: random)
  --runs=N        Number of runs for batch/find/compare modes (default: 50)
  --turns=N       Max turns per run (default: 20000)
  --threads=N     Worker threads (default: 8, matrix default: 20)
  --race=ID       Race ID (default: human)
  --class=ID      Class ID (default: warrior)
  --personality=P Bot personality (default: cautious)
                  Options: cautious, aggressive, greedy, speedrunner
  --analyzers=A,B Comma-separated analyzer names (default: all)
  --map           Include map visualization (explored tiles only)
  --full-map      Include full map visualization (all tiles revealed)
  --from=N        Start of turn range for output (deep mode only)
  --to=N          End of turn range for output (deep mode only)
  --log-only      Only show turn log, skip analyzer output (deep mode)
  --max-upgrades  Apply all upgrades at max level (legacy, prefer --upgrades=full)
  --upgrades=X    Upgrade preset (default: full)
                  Presets: none, early, mid, late, full
  --boosters=X    Booster preset (default: class)
                  Presets: none, class (primary stat + CON)
                  Or comma-separated IDs: str_superior,con_superior
  --capabilities=X Bot capabilities (default: full)
                  Presets: none, early, mid, late, full
                  Or comma-separated IDs: town,farming,sweep_1,targeting_2,retreat_3,etc.
  --randomize     Randomize race/class/personality per run (batch mode)
  --races         Compare races instead of personalities (compare mode)
  --races=a,b,c   Compare specific races (e.g., --races=human,dwarf,elf)
  --stdout        Force stdout output (skip file writing)
  --output=DIR    Custom output directory (default: /tmp/borglike-diagnose)

MATRIX OPTIONS:
  --classes=X     Comma-separated class IDs or 'all' (default: --class value)
  --races=X       Comma-separated race IDs or 'all' (in matrix mode)
  --personalities=X  Comma-separated or 'all' (default: --personality value)
  --cap-tiers=X   Capability tiers to iterate (e.g., none,early,mid,late,full)
  --upgrade-tiers=X  Upgrade tiers to iterate (e.g., none,early,mid,late,full)
  --progression=X Paired tiers: sets BOTH upgrades AND capabilities to same values

OUTPUT:
  Most modes write results to /tmp/borglike-diagnose/ as .txt + .json files.
  Progress bars stay on stdout; final results go to files.
  quick mode defaults to stdout (use --output=DIR to override).
  Use --stdout to force all output to stdout (old behavior).

EXAMPLES:
  # Deep dive on a specific problematic seed with explored map
  pnpm diagnose deep 1768965560201 --map

  # Deep dive with full map (all tiles revealed) for dungeon layout analysis
  pnpm diagnose deep 1768965560201 --full-map

  # Deep dive showing only turns 500-600
  pnpm diagnose deep 1768965560201 --from=500 --to=600

  # Quick check with custom config
  pnpm diagnose quick --seed=12345 --class=mage

  # Batch analysis across 100 runs
  pnpm diagnose batch --runs=100

  # Find problematic seeds for aggressive personality
  pnpm diagnose find --runs=500 --personality=aggressive

  # Compare all personalities
  pnpm diagnose compare --runs=20

  # Compare races
  pnpm diagnose compare --races --runs=20 --class=warrior

  # Compare specific races
  pnpm diagnose compare --races=human,dwarf,elf,half_orc --runs=20

  # Run race baseline (all 11 races)
  pnpm diagnose baseline-races --seed=1000

  # Test upgrade sensitivity (single class)
  pnpm diagnose sensitivity --seed=1000 --class=warrior

  # Test upgrade sensitivity (all classes, single pool)
  pnpm diagnose sensitivity --classes=all --seed=1000

  # Test with mid-game capabilities
  pnpm diagnose batch --runs=50 --capabilities=mid --class=warrior

  # Matrix: cross-class race testing (replaces 9 parallel processes)
  pnpm diagnose matrix --classes=warrior,mage,ranger --races=all --runs=50 --turns=50000

  # Matrix: capability progression for one class
  pnpm diagnose matrix --class=warrior --upgrades=mid --cap-tiers=none,early,mid,late,full

  # Matrix: paired progression (upgrade + capability at same tier)
  pnpm diagnose matrix --class=warrior --progression=none,early,mid,late,full

  # Matrix: all classes (equivalent to baseline, single pool)
  pnpm diagnose matrix --classes=all --runs=100 --turns=50000

ANALYZERS:
  stuck       - Detects repeated actions, waits, twitch counter issues
  movement    - Detects oscillation (A-B-A-B patterns), move rate
  pathing     - Tracks path efficiency, unreachable targets, goal completion
  exploration - Tracks stairs discovery, exploration progress per level
  combat      - Tracks damage, kills, retreats, death causes
  goal        - Tracks goal lifecycle, persistence, type distribution
  jitter      - Detects bot confined to small area (bounding box analysis)
  frontier    - Frontier reachability, door blocking, goal generation failures
  stats       - Worker metrics aggregation (used internally for batch runs)
  map         - Captures dungeon map snapshots (use --map flag for deep mode)
`)
}

// ============================================================================
// CLI-SPECIFIC HELPERS
// ============================================================================

/** Build a plain-object config snapshot from CLI args (for JSON envelope) */
function buildConfigSnapshot(args: Args): Record<string, unknown> {
  return {
    runs: args.runs,
    turns: args.turns,
    seed: args.seed,
    race: args.race,
    classId: args.classId,
    personality: args.personality,
    upgrades: args.upgrades,
    boosters: args.boosters,
    capabilities: args.capabilities,
    maxUpgrades: args.maxUpgrades,
  }
}

/** Route output to files or stdout based on mode and flags */
function outputResult(
  args: Args,
  mode: string,
  text: string,
  jsonData: unknown,
  nameParts: { classId?: string; race?: string; seed?: number; runs?: number },
): void {
  if (!shouldWriteFiles(mode, args.forceStdout)) {
    console.log(text)
    return
  }
  const dir = args.outputDir ?? DEFAULT_OUTPUT_DIR
  const baseName = generateFileName({ mode, ...nameParts })
  const envelope = {
    mode,
    timestamp: new Date().toISOString(),
    config: buildConfigSnapshot(args),
    result: jsonData,
  }
  const { txtPath, jsonPath } = writeOutputFiles({ dir, baseName, text, json: envelope })
  console.log(`\nOutput:\n  ${txtPath}\n  ${jsonPath}`)
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.mode === 'help') {
    showHelp()
    return
  }

  try {
  // Handle compare mode
  if (args.mode === 'compare') {
    const variant: CompareVariant = args.compareRaces ? 'race' : 'personality'
    const variantLabel = variant === 'race' ? 'race' : 'personality'
    console.log(`Running ${variantLabel} comparison...\n`)

    const result = await compareVariants({
      variant,
      ...(args.compareRaces && args.raceList.length > 0 ? { ids: args.raceList } : {}),
      runsPerVariant: args.runs,
      maxTurns: args.turns,
      raceId: args.race,
      classId: args.classId,
      personality: args.personality,
      threads: args.threads,
      seed: args.seed,
      maxUpgrades: args.maxUpgrades,
      upgrades: args.upgrades,
      boosters: args.boosters,
    })

    const text = formatVariantComparison(result)
    outputResult(args, 'compare', text, result, {
      classId: args.classId,
      race: args.race,
      runs: args.runs,
    })
    return
  }

  // Handle baseline mode
  if (args.mode === 'baseline') {
    const startTime = Date.now()
    const results = await runBaseline({
      runs: args.runs !== 50 ? args.runs : undefined,
      turns: args.turns !== 20000 ? args.turns : undefined,
      seed: args.seed,
      threads: args.threads !== 8 ? args.threads : undefined,
      race: args.race,
      personality: args.personality,
      maxUpgrades: args.maxUpgrades,
      upgrades: args.upgrades,
      boosters: args.boosters,
      capabilities: args.capabilities,
      monsterHp: args.monsterHp,
      monsterDamage: args.monsterDamage,
      startPotions: args.startPotions,
      potionRate: args.potionRate,
      regen: args.regen,
      armorPen: args.armorPen,
      enchantRate: args.enchantRate,
      itemRate: args.itemRate,
      levelupHp: args.levelupHp,
      xpRate: args.xpRate,
      upgradePower: args.upgradePower,
      bestiary: args.bestiary,
      hpFraction: args.hpFraction,
    })
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    const text = formatBaselineResults(results, { totalTime })
    outputResult(args, 'baseline', text, results, { race: args.race })
    return
  }

  // Handle baseline-races mode
  if (args.mode === 'baseline-races') {
    const startTime = Date.now()
    const results = await runBaselineRaces({
      runs: args.runs !== 50 ? args.runs : undefined,
      turns: args.turns !== 20000 ? args.turns : undefined,
      seed: args.seed,
      threads: args.threads !== 8 ? args.threads : undefined,
      classId: args.classId,
      personality: args.personality,
      maxUpgrades: args.maxUpgrades,
      upgrades: args.upgrades,
      boosters: args.boosters,
      capabilities: args.capabilities,
      monsterHp: args.monsterHp,
      monsterDamage: args.monsterDamage,
      startPotions: args.startPotions,
      potionRate: args.potionRate,
      regen: args.regen,
      armorPen: args.armorPen,
      enchantRate: args.enchantRate,
      itemRate: args.itemRate,
      levelupHp: args.levelupHp,
      xpRate: args.xpRate,
      upgradePower: args.upgradePower,
      bestiary: args.bestiary,
      hpFraction: args.hpFraction,
    })
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    const text = formatBaselineRaceResults(results, { totalTime })
    outputResult(args, 'baseline-races', text, results, { classId: args.classId })
    return
  }

  // Handle sensitivity mode
  if (args.mode === 'sensitivity') {
    // Resolve classes: --classes=X for multi, --class=X for single, default warrior
    const sensitivityClasses = args.matrixClasses.length > 0
      ? args.matrixClasses
      : [args.classId]

    // Sensitivity defaults to 20 threads, unless user explicitly set
    const sensitivityThreads = args.userSetThreads ? args.threads : 20

    const result = await runSensitivityTest({
      runs: args.runs !== 50 ? args.runs : undefined,
      turns: args.turns !== 20000 ? args.turns : undefined,
      seed: args.seed,
      threads: sensitivityThreads,
      classes: sensitivityClasses,
      raceId: args.race,
      personality: args.personality,
    })

    const text = formatMultiSensitivityResults(result)

    if (shouldWriteFiles('sensitivity', args.forceStdout)) {
      const dir = args.outputDir ?? DEFAULT_OUTPUT_DIR

      // Write per-class files
      for (const classResult of result.results) {
        const classText = formatSensitivityResults(classResult, {
          totalTime: result.totalTime.toFixed(1),
        })
        const baseName = generateFileName({ mode: 'sensitivity', classId: classResult.classId })
        writeOutputFiles({
          dir,
          baseName,
          text: classText,
          json: {
            mode: 'sensitivity',
            timestamp: new Date().toISOString(),
            config: { ...buildConfigSnapshot(args), classId: classResult.classId },
            result: classResult,
          },
        })
      }

      // Write combined summary if multi-class
      if (result.results.length > 1) {
        const summaryName = generateFileName({ mode: 'sensitivity', classId: 'all' })
        writeOutputFiles({
          dir,
          baseName: summaryName,
          text,
          json: {
            mode: 'sensitivity-multi',
            timestamp: new Date().toISOString(),
            config: buildConfigSnapshot(args),
            result,
          },
        })
      }

      console.log(`\nTotal time: ${result.totalTime.toFixed(1)}s`)
      console.log(`Output: ${dir}/`)
    } else {
      console.log(text)
    }
    return
  }

  // Handle matrix mode
  if (args.mode === 'matrix') {
    const startTime = Date.now()

    // Matrix defaults to 20 threads (filling a large pool), unless user explicitly set --threads
    const matrixThreads = args.userSetThreads ? args.threads : 20

    // Resolve tiers: --progression sets both, otherwise use individual flags
    let matrixUpgradeTiers = args.upgradeTiers.length > 0 ? args.upgradeTiers : [args.upgrades]
    let matrixCapTiers = args.capTiers.length > 0 ? args.capTiers : [args.capabilities]
    if (args.progressionTiers.length > 0) {
      matrixUpgradeTiers = args.progressionTiers
      matrixCapTiers = args.progressionTiers
    }

    // Build balance overrides
    const effectiveBestiary = args.bestiary > 0 ? args.bestiary : (args.maxUpgrades ? 25 : 0)
    const balance = {
      monsterHpPercent: args.monsterHp,
      monsterDamagePercent: args.monsterDamage,
      startingPotions: args.startPotions,
      potionRatePercent: args.potionRate,
      regenPer10Turns: args.regen,
      armorPenetration: args.armorPen,
      enchantRatePercent: args.enchantRate,
      itemRatePercent: args.itemRate,
      levelupHpPercent: args.levelupHp,
      xpRatePercent: args.xpRate,
      upgradePowerPercent: args.upgradePower,
      bestiaryBonusPercent: effectiveBestiary,
      baseHpFraction: args.hpFraction / 100,
    }

    const result = await runMatrix({
      classes: args.matrixClasses.length > 0 ? args.matrixClasses : [args.classId],
      races: args.matrixRaces.length > 0 ? args.matrixRaces : [args.race],
      personalities: args.matrixPersonalities.length > 0 ? args.matrixPersonalities : [args.personality],
      upgradeTiers: matrixUpgradeTiers,
      capabilityTiers: matrixCapTiers,
      runs: args.runs,
      maxTurns: args.turns,
      startSeed: args.seed,
      threads: matrixThreads,
      boosters: args.boosters,
      maxUpgrades: args.maxUpgrades,
      balance,
      pairedProgression: args.progressionTiers.length > 0,
    })

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    const summaryText = formatMatrixSummary(result)

    if (shouldWriteFiles('matrix', args.forceStdout)) {
      const dir = args.outputDir ?? DEFAULT_OUTPUT_DIR
      const now = new Date()
      const pad2 = (n: number) => String(n).padStart(2, '0')
      const timestamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
      const matrixDir = join(dir, `${timestamp}-matrix`)
      mkdirSync(matrixDir, { recursive: true })

      // Write per-cell results into subfolders
      for (const cellResult of result.cells) {
        const cellDir = join(matrixDir, cellResult.label)
        mkdirSync(cellDir, { recursive: true })
        const cellText = formatBatchResult(cellResult.batchResult)
        writeFileSync(join(cellDir, 'batch.txt'), cellText, 'utf-8')
        writeFileSync(join(cellDir, 'batch.json'), JSON.stringify({
          mode: 'matrix-cell',
          timestamp: new Date().toISOString(),
          cell: cellResult.cell,
          summary: {
            avgDepth: cellResult.avgDepth,
            maxDepth: cellResult.maxDepth,
            cbRate: cellResult.cbRate,
            avgKills: cellResult.avgKills,
            morgothKills: cellResult.morgothKills,
            avgTurns: cellResult.avgTurns,
            victoryCount: cellResult.victoryCount,
          },
          runs: cellResult.batchResult.runs,
          deathCauses: cellResult.batchResult.deathCauses,
        }, null, 2), 'utf-8')
      }

      // Write summary
      writeFileSync(join(matrixDir, 'summary.txt'), summaryText, 'utf-8')
      writeFileSync(join(matrixDir, 'summary.json'), JSON.stringify({
        mode: 'matrix',
        timestamp: new Date().toISOString(),
        config: {
          classes: result.config.classes,
          races: result.config.races,
          personalities: result.config.personalities,
          upgradeTiers: result.config.upgradeTiers,
          capabilityTiers: result.config.capabilityTiers,
          runs: result.config.runs,
          maxTurns: result.config.maxTurns,
          startSeed: result.config.startSeed,
          threads: result.config.threads,
        },
        varyingAxes: result.varyingAxes,
        totalRuns: result.totalRuns,
        totalTime: parseFloat(totalTime),
        cells: result.cells.map(c => ({
          cell: c.cell,
          label: c.label,
          avgDepth: c.avgDepth,
          maxDepth: c.maxDepth,
          cbRate: c.cbRate,
          avgKills: c.avgKills,
          morgothKills: c.morgothKills,
          avgTurns: c.avgTurns,
          victoryCount: c.victoryCount,
        })),
      }, null, 2), 'utf-8')

      console.log(`\nTotal time: ${totalTime}s`)
      console.log(`\nOutput: ${matrixDir}/`)
      console.log(`  summary.txt + summary.json`)
      console.log(`  ${result.cells.length} cell subfolders`)
    } else {
      console.log(summaryText)
      console.log(`\nTotal time: ${totalTime}s`)
    }
    return
  }

  // Build analyzers list
  const analyzers = args.includeMap
    ? createAllAnalyzersWithMap({
        showFullMap: args.fullMap,
        captureBothMaps: args.fullMap,
      })
    : args.analyzers.length === ALL_ANALYZERS.length
      ? createAllAnalyzers()
      : createAnalyzers(args.analyzers)

  // Build balance overrides from args
  const effectiveBestiary = args.bestiary > 0 ? args.bestiary : (args.maxUpgrades ? 25 : 0)
  const balance = {
    monsterHpPercent: args.monsterHp,
    monsterDamagePercent: args.monsterDamage,
    startingPotions: args.startPotions,
    potionRatePercent: args.potionRate,
    regenPer10Turns: args.regen,
    armorPenetration: args.armorPen,
    enchantRatePercent: args.enchantRate,
    itemRatePercent: args.itemRate,
    levelupHpPercent: args.levelupHp,
    xpRatePercent: args.xpRate,
    upgradePowerPercent: args.upgradePower,
    bestiaryBonusPercent: effectiveBestiary,
    baseHpFraction: args.hpFraction / 100,
  }

  const baseConfig = {
    raceId: args.race,
    classId: args.classId,
    personality: args.personality,
    maxTurns: args.turns,
    analyzers,
    maxUpgrades: args.maxUpgrades,
    excludeUpgrades: args.excludeUpgrades,
    upgrades: args.upgrades,
    boosters: args.boosters,
    randomize: args.randomize,
    balance,
    capabilities: args.capabilities,
  }

  switch (args.mode) {
    case 'deep': {
      const seed = args.seed ?? Date.now()
      console.log(`Running deep diagnosis on seed ${seed}...`)
      const result = runDeepDiagnosis({ ...baseConfig, seed })

      // Build text output
      const textParts: string[] = []
      if (!args.logOnly) {
        textParts.push(formatResult(result))
      } else {
        textParts.push(`Seed: ${result.seed} | End: ${result.endReason} | Turn: ${result.finalState.turn} | Depth: ${result.finalState.depth}`)
      }

      textParts.push(formatTurnLog(result.turnLog, {
        maxTurns: args.logOnly ? Infinity : 100,
        onlyFlagged: false,
        from: args.from,
        to: args.to,
      }))

      if (args.includeMap) {
        const mapAnalyzer = analyzers.find((a) => a.name === 'map') as MapVisualizer | undefined
        if (mapAnalyzer) {
          const lastMap = mapAnalyzer.getLastMap()
          if (lastMap) {
            textParts.push('\n' + formatMapSnapshot(lastMap, {
              showExplored: !args.fullMap,
              showFull: args.fullMap,
            }))
          }
        }
      }

      const text = textParts.join('\n')
      outputResult(args, 'deep', text, result, {
        classId: args.classId,
        race: args.race,
        seed,
      })
      break
    }

    case 'quick': {
      const seed = args.seed ?? Date.now()
      console.log(`Running quick diagnosis on seed ${seed}...`)
      const result = runDiagnosis({ ...baseConfig, seed })
      const text = formatResult(result)
      // Quick defaults to stdout (shouldWriteFiles returns false for 'quick')
      outputResult(args, 'quick', text, result, {
        classId: args.classId,
        race: args.race,
        seed,
      })
      break
    }

    case 'batch': {
      console.log(`Running batch diagnosis (${args.runs} runs, ${args.threads} threads)...`)
      const result = await runBatchDiagnosisParallel({
        ...baseConfig,
        runs: args.runs,
        startSeed: args.seed,
        threads: args.threads,
        onProgress: (completed, total) => {
          process.stdout.write(`\rProgress: ${completed}/${total}`)
        },
      })
      console.log('\n')

      const text = formatBatchResult(result)
      const depth = result.aggregateMetrics['worker-metrics.maxDepth']
      const kills = result.aggregateMetrics['worker-metrics.kills']
      const turns = result.aggregateMetrics['worker-metrics.totalTurns']
      const jsonData = {
        summary: {
          avgDepth: depth?.avg ?? 0,
          maxDepth: depth?.max ?? 0,
          cbRate: result.circuitBreakerCount / result.totalRuns,
          avgTurns: turns?.avg ?? 0,
          avgKills: kills?.avg ?? 0,
          morgothKills: result.morgothKillCount,
          victoryCount: result.victoryCount,
        },
        runs: result.runs,
        deathCauses: result.deathCauses,
        problemSeeds: result.problemRuns.map(r => r.seed),
        aggregateMetrics: result.aggregateMetrics,
      }
      outputResult(args, 'batch', text, jsonData, {
        classId: args.classId,
        race: args.race,
        runs: args.runs,
      })
      break
    }

    case 'find': {
      console.log(`Searching for problematic seeds (${args.runs} runs, ${args.threads} threads)...`)
      const result = await runBatchDiagnosisParallel({
        ...baseConfig,
        runs: args.runs,
        startSeed: args.seed,
        onlyProblems: true,
        threads: args.threads,
        onProgress: (completed, total) => {
          process.stdout.write(`\rProgress: ${completed}/${total}`)
        },
      })
      console.log('\n')

      const text = formatFindResults(result.problemRuns)
      const jsonData = {
        problemRuns: result.problemRuns.map(r => ({
          seed: r.seed,
          endReason: r.endReason,
          depth: r.finalState.depth,
          turn: r.finalState.turn,
          kills: r.finalState.kills,
          issueCount: r.allIssues.length,
        })),
      }
      outputResult(args, 'find', text, jsonData, {
        classId: args.classId,
        race: args.race,
        runs: args.runs,
      })
      break
    }
  }
  } finally {
    await destroyPool()
  }
}

main()
