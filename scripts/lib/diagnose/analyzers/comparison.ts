/**
 * Variant Comparator
 *
 * Generalized comparison tool for comparing bot behavior across different
 * variants (personalities, races, or classes). Runs batch diagnostics for
 * each variant and analyzes behavioral differences.
 */

import type { BotPersonality } from '@game/types'
import type { BatchResult } from '../types'
import { runBatchDiagnosisParallel } from '../runner'
import { createAllAnalyzers } from './index'

/** What dimension we're comparing */
export type CompareVariant = 'personality' | 'race'

/** Configuration for variant comparison */
export interface VariantCompareConfig {
  /** What we're comparing */
  variant: CompareVariant
  /** List of variant IDs to compare */
  ids: string[]
  /** Runs per variant */
  runsPerVariant: number
  /** Max turns per run */
  maxTurns: number
  /** Fixed race (when comparing personalities) */
  raceId: string
  /** Fixed class */
  classId: string
  /** Fixed personality (when comparing races) */
  personality: BotPersonality
  /** Number of worker threads (default: 8) */
  threads: number
  /** Starting seed for reproducibility */
  seed?: number
  /** Use max upgrade bonuses */
  maxUpgrades: boolean
  /** Upgrade preset: 'none', 'early', 'mid', 'late', 'full' */
  upgrades?: string
  /** Booster preset: 'none', 'class', or comma-separated IDs */
  boosters?: string
}

/** Default personalities to compare */
export const DEFAULT_PERSONALITIES = ['cautious', 'aggressive', 'greedy', 'speedrunner']

/** Default races to compare (all available) */
export const DEFAULT_RACES = [
  'human', 'dwarf', 'elf', 'half_elf', 'hobbit', 'gnome',
  'half_orc', 'half_troll', 'dunadan', 'high_elf', 'kobold',
]

const DEFAULT_PERSONALITY_CONFIG: VariantCompareConfig = {
  variant: 'personality',
  ids: DEFAULT_PERSONALITIES,
  runsPerVariant: 20,
  maxTurns: 2000,
  raceId: 'human',
  classId: 'warrior',
  personality: 'cautious',
  threads: 8,
  maxUpgrades: false,
}

const DEFAULT_RACE_CONFIG: VariantCompareConfig = {
  variant: 'race',
  ids: DEFAULT_RACES,
  runsPerVariant: 20,
  maxTurns: 5000,
  raceId: 'human',
  classId: 'warrior',
  personality: 'cautious',
  threads: 8,
  maxUpgrades: false,
}

/** Metrics for a single variant */
export interface VariantMetrics {
  /** Variant identifier (personality name or race ID) */
  variantId: string
  runs: number

  // Core metrics (baseline-style)
  avgDepth: number
  maxDepth: number
  avgKills: number
  avgTurns: number

  // Exploration
  avgExplorationAtExit: number
  stairsFoundRate: number

  // Combat
  avgDamageDealt: number
  avgDamageTaken: number
  combatRate: number
  retreatRate: number

  // Movement
  moveRate: number
  oscillationRate: number
  jitterRate: number

  // Goals
  goalCompletionRate: number
  goalSwitchRate: number

  // Stuck
  stuckRate: number
  waitRate: number

  // Outcomes
  deathRate: number
  circuitBreakerRate: number
}

/** Comparison result */
export interface VariantCompareResult {
  config: VariantCompareConfig
  metrics: VariantMetrics[]
  distinctiveness: {
    score: number
    details: string[]
  }
  recommendations: string[]
}

/**
 * Extract metrics from batch result
 */
function extractMetrics(variantId: string, batch: BatchResult): VariantMetrics {
  const m = batch.aggregateMetrics
  const get = (key: string) => m[key]?.avg ?? 0
  const getMax = (key: string) => m[key]?.max ?? 0

  // Count outcomes
  let deaths = 0
  let circuitBreakers = 0
  for (const run of batch.problemRuns) {
    if (run.endReason === 'death') deaths++
    if (run.endReason === 'circuit_breaker') circuitBreakers++
  }

  // Calculate avg turns from all runs (not just problem runs)
  const avgTurns = get('worker-metrics.totalTurns') || (
    batch.problemRuns.length > 0
      ? batch.problemRuns.reduce((s, r) => s + r.finalState.turn, 0) / batch.problemRuns.length
      : 0
  )

  return {
    variantId,
    runs: batch.totalRuns,

    avgDepth: get('exploration.maxDepth') || get('worker-metrics.maxDepth'),
    maxDepth: getMax('exploration.maxDepth') || getMax('worker-metrics.maxDepth'),
    avgKills: get('combat.totalKills') || get('worker-metrics.kills'),
    avgTurns,

    avgExplorationAtExit: get('exploration.avgExplorationAtExit'),
    stairsFoundRate: get('exploration.stairsFoundRate'),

    avgDamageDealt: get('combat.totalDamageDealt'),
    avgDamageTaken: get('combat.totalDamageTaken'),
    combatRate: get('combat.combatRate'),
    retreatRate: get('combat.retreatRate'),

    moveRate: get('movement.moveRate'),
    oscillationRate: get('movement.oscillationRate'),
    jitterRate: get('jitter.jitterRate'),

    goalCompletionRate: get('pathing.completionRate'),
    goalSwitchRate: get('goal.switchRate'),

    stuckRate: get('stuck.stuckEpisodes') / Math.max(1, batch.totalRuns),
    waitRate: get('stuck.waitRate'),

    deathRate: (deaths / batch.totalRuns) * 100,
    circuitBreakerRate: (circuitBreakers / batch.totalRuns) * 100,
  }
}

/**
 * Calculate how distinct variants are from each other
 */
function calculateDistinctiveness(metrics: VariantMetrics[]): {
  score: number
  details: string[]
} {
  if (metrics.length < 2) {
    return { score: 100, details: ['Only one variant tested'] }
  }

  const details: string[] = []
  let totalVariance = 0
  let checkedMetrics = 0

  // Key metrics that should differ between variants
  const keyMetrics: (keyof VariantMetrics)[] = [
    'avgDepth',
    'avgKills',
    'avgExplorationAtExit',
    'combatRate',
    'retreatRate',
    'goalSwitchRate',
    'stuckRate',
  ]

  for (const metricName of keyMetrics) {
    const values = metrics.map((m) => m[metricName] as number)
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    const coefficientOfVariation = avg > 0 ? (stdDev / avg) * 100 : 0

    if (coefficientOfVariation > 20) {
      details.push(`✓ ${metricName}: Good variance (CV=${coefficientOfVariation.toFixed(1)}%)`)
    } else if (coefficientOfVariation > 10) {
      details.push(`~ ${metricName}: Moderate variance (CV=${coefficientOfVariation.toFixed(1)}%)`)
    } else {
      details.push(`✗ ${metricName}: Low variance (CV=${coefficientOfVariation.toFixed(1)}%)`)
    }

    totalVariance += Math.min(coefficientOfVariation, 50) // Cap contribution
    checkedMetrics++
  }

  // Score: 0-100 based on average coefficient of variation
  const avgVariance = totalVariance / checkedMetrics
  const score = Math.min(100, avgVariance * 2) // Scale up

  return { score, details }
}

/**
 * Generate recommendations based on personality comparison
 */
function generatePersonalityRecommendations(metrics: VariantMetrics[]): string[] {
  const recommendations: string[] = []

  // Find by variant ID
  const aggressive = metrics.find((m) => m.variantId === 'aggressive')
  const cautious = metrics.find((m) => m.variantId === 'cautious')
  const speedrunner = metrics.find((m) => m.variantId === 'speedrunner')
  const greedy = metrics.find((m) => m.variantId === 'greedy')

  if (aggressive && cautious) {
    if (aggressive.avgKills < cautious.avgKills) {
      recommendations.push(
        `Aggressive has fewer kills (${aggressive.avgKills.toFixed(1)}) than cautious (${cautious.avgKills.toFixed(1)}). Consider increasing aggression.`
      )
    }

    if (aggressive.retreatRate > cautious.retreatRate) {
      recommendations.push(
        `Aggressive retreats more often (${aggressive.retreatRate.toFixed(1)}%) than cautious (${cautious.retreatRate.toFixed(1)}%). Check retreat thresholds.`
      )
    }

    if (cautious.avgDepth > aggressive.avgDepth) {
      recommendations.push(
        `Cautious reaches deeper (${cautious.avgDepth.toFixed(1)}) than aggressive (${aggressive.avgDepth.toFixed(1)}). Aggressive may be too reckless.`
      )
    }
  }

  if (speedrunner) {
    if (speedrunner.avgExplorationAtExit > 50) {
      recommendations.push(
        `Speedrunner explores too much (${speedrunner.avgExplorationAtExit.toFixed(1)}%). Should descend faster.`
      )
    }
  }

  if (greedy && cautious) {
    if (greedy.avgKills < cautious.avgKills * 0.5) {
      recommendations.push(
        `Greedy may be avoiding combat too much. Consider balancing item pursuit with survival.`
      )
    }
  }

  // General stuck issues
  const byStuck = [...metrics].sort((a, b) => b.stuckRate - a.stuckRate)
  const worstStuck = byStuck[0]
  if (worstStuck && worstStuck.stuckRate > 0.5) {
    recommendations.push(
      `${worstStuck.variantId} has high stuck rate (${worstStuck.stuckRate.toFixed(2)}). Investigate pathfinding.`
    )
  }

  if (recommendations.length === 0) {
    recommendations.push('All personalities appear to be behaving distinctly. No issues detected.')
  }

  return recommendations
}

/**
 * Generate recommendations based on race comparison
 */
function generateRaceRecommendations(metrics: VariantMetrics[]): string[] {
  const recommendations: string[] = []

  // Sort by depth
  const byDepth = [...metrics].sort((a, b) => b.avgDepth - a.avgDepth)
  const best = byDepth[0]
  const worst = byDepth[byDepth.length - 1]

  if (best && worst && best.avgDepth - worst.avgDepth > 5) {
    recommendations.push(
      `Large depth gap: ${best.variantId} (${best.avgDepth.toFixed(1)}) vs ${worst.variantId} (${worst.avgDepth.toFixed(1)}). Consider race balance.`
    )
  }

  // Check for high CB rates
  const highCB = metrics.filter((m) => m.circuitBreakerRate > 10)
  for (const m of highCB) {
    recommendations.push(
      `${m.variantId} has high CB rate (${m.circuitBreakerRate.toFixed(0)}%). May have pathfinding issues.`
    )
  }

  // Check for races that die too much
  const highDeath = metrics.filter((m) => m.deathRate > 80)
  for (const m of highDeath) {
    if (!highCB.includes(m)) {
      recommendations.push(
        `${m.variantId} has high death rate (${m.deathRate.toFixed(0)}%). May be too fragile.`
      )
    }
  }

  // General stuck issues
  const byStuck = [...metrics].sort((a, b) => b.stuckRate - a.stuckRate)
  const worstStuck = byStuck[0]
  if (worstStuck && worstStuck.stuckRate > 0.5) {
    recommendations.push(
      `${worstStuck.variantId} has high stuck rate (${worstStuck.stuckRate.toFixed(2)}). Investigate pathfinding.`
    )
  }

  if (recommendations.length === 0) {
    recommendations.push('All races performing within expected ranges. No issues detected.')
  }

  return recommendations
}

/**
 * Run variant comparison (async, threaded)
 */
export async function compareVariants(
  config: Partial<VariantCompareConfig> & { variant: CompareVariant }
): Promise<VariantCompareResult> {
  const defaults = config.variant === 'race' ? DEFAULT_RACE_CONFIG : DEFAULT_PERSONALITY_CONFIG
  // Filter out undefined values to preserve defaults
  const definedConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined)
  )
  const cfg: VariantCompareConfig = { ...defaults, ...definedConfig } as VariantCompareConfig
  const allMetrics: VariantMetrics[] = []

  const plural = cfg.variant === 'race' ? 'races' : 'personalities'
  console.log(`Comparing ${cfg.ids.length} ${plural} (${cfg.threads} threads)...`)

  for (const variantId of cfg.ids) {
    const variantStart = Date.now()
    process.stdout.write(`\n${variantId.padEnd(12)} `)

    const batchConfig = {
      raceId: cfg.variant === 'race' ? variantId : cfg.raceId,
      classId: cfg.classId,
      personality: cfg.variant === 'personality' ? (variantId as BotPersonality) : cfg.personality,
      maxTurns: cfg.maxTurns,
      runs: cfg.runsPerVariant,
      startSeed: cfg.seed,
      threads: cfg.threads,
      maxUpgrades: cfg.maxUpgrades,
      upgrades: cfg.upgrades,
      boosters: cfg.boosters,
      analyzers: createAllAnalyzers(),
      onProgress: (completed: number, total: number) => {
        const pct = Math.floor((completed / total) * 20)
        process.stdout.write(
          `\r${variantId.padEnd(12)} [${'█'.repeat(pct)}${'░'.repeat(20 - pct)}] ${completed}/${total}`
        )
      },
    }

    const batch = await runBatchDiagnosisParallel(batchConfig)
    const metrics = extractMetrics(variantId, batch)
    allMetrics.push(metrics)

    const elapsed = ((Date.now() - variantStart) / 1000).toFixed(1)
    process.stdout.write(`\r${variantId.padEnd(12)} [${'█'.repeat(20)}] done (${elapsed}s) depth=${metrics.avgDepth.toFixed(1)} kills=${metrics.avgKills.toFixed(0)}\n`)
  }

  const distinctiveness = calculateDistinctiveness(allMetrics)
  const recommendations =
    cfg.variant === 'race'
      ? generateRaceRecommendations(allMetrics)
      : generatePersonalityRecommendations(allMetrics)

  return {
    config: cfg,
    metrics: allMetrics,
    distinctiveness,
    recommendations,
  }
}

/**
 * Format comparison result as baseline-style table
 */
export function formatVariantComparison(result: VariantCompareResult): string {
  const lines: string[] = []
  const variantLabel = result.config.variant === 'race' ? 'Race' : 'Personality'

  lines.push('='.repeat(80))
  lines.push(`${variantLabel.toUpperCase()} COMPARISON`)
  lines.push('='.repeat(80))
  lines.push('')
  lines.push(`Parameters: ${result.config.runsPerVariant} runs, ${result.config.maxTurns} turns`)
  if (result.config.variant === 'personality') {
    lines.push(`Race: ${result.config.raceId}, Class: ${result.config.classId}`)
  } else {
    lines.push(`Class: ${result.config.classId}, Personality: ${result.config.personality}`)
  }
  lines.push('')

  // Sort by avg depth descending (like baseline)
  const sorted = [...result.metrics].sort((a, b) => b.avgDepth - a.avgDepth)

  // Baseline-style table
  lines.push(`| ${variantLabel} | Avg Depth | Max Depth | CB Rate | Kills | Retreat% | Status |`)
  lines.push('|' + '-'.repeat(variantLabel.length + 2) + '|-----------|-----------|---------|-------|----------|--------|')

  for (const m of sorted) {
    const status = m.avgDepth >= 30 ? '✅ Endgame' : m.avgDepth >= 10 ? '⚠️ Mid' : '❌ Early'
    const name = m.variantId.charAt(0).toUpperCase() + m.variantId.slice(1)
    lines.push(
      `| **${name.padEnd(variantLabel.length - 2)}** | ${m.avgDepth.toFixed(1).padStart(9)} | ${m.maxDepth.toString().padStart(9)} | ${m.circuitBreakerRate.toFixed(0).padStart(5)}%  | ${m.avgKills.toFixed(0).padStart(5)} | ${m.retreatRate.toFixed(1).padStart(7)}% | ${status} |`
    )
  }

  lines.push('')

  // Extended metrics table
  lines.push('### Extended Metrics')
  lines.push('')
  lines.push(`| ${variantLabel} | Combat% | Explore% | Move% | Stuck | Wait% |`)
  lines.push('|' + '-'.repeat(variantLabel.length + 2) + '|---------|----------|-------|-------|-------|')

  for (const m of sorted) {
    const name = m.variantId.charAt(0).toUpperCase() + m.variantId.slice(1)
    lines.push(
      `| ${name.padEnd(variantLabel.length)} | ${m.combatRate.toFixed(1).padStart(6)}% | ${m.avgExplorationAtExit.toFixed(1).padStart(7)}% | ${m.moveRate.toFixed(1).padStart(4)}% | ${m.stuckRate.toFixed(2).padStart(5)} | ${m.waitRate.toFixed(1).padStart(4)}% |`
    )
  }

  lines.push('')
  lines.push('### Distinctiveness')
  lines.push('-'.repeat(40))
  lines.push(`Score: ${result.distinctiveness.score.toFixed(1)}/100`)
  lines.push('')
  for (const detail of result.distinctiveness.details) {
    lines.push(`  ${detail}`)
  }

  lines.push('')
  lines.push('### Recommendations')
  lines.push('-'.repeat(40))
  for (const rec of result.recommendations) {
    lines.push(`  • ${rec}`)
  }

  return lines.join('\n')
}

// Legacy exports for backwards compatibility
export {
  compareVariants as comparePersonalities,
  formatVariantComparison as formatPersonalityComparison,
}
export type { VariantCompareConfig as PersonalityCompareConfig }
export type { VariantMetrics as PersonalityMetrics }
export type { VariantCompareResult as PersonalityCompareResult }
