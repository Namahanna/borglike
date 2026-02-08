/**
 * Upgrade Sensitivity Testing
 *
 * Measures per-upgrade impact on bot performance by running with each upgrade
 * excluded and comparing to baseline. Supports multiple classes in a single
 * pool-based run (same pattern as matrix mode).
 */

import { cpus } from 'os'
import { getOrCreatePool, aggregateBatchResults } from './runner'
import type { WorkerInput } from './runner'
import type { DiagnoseResult } from './types'

/** Stat upgrades that affect bot combat performance (exclude QoL-only) */
export const SENSITIVITY_UPGRADES = [
  'vitality',
  'might',
  'resilience',
  'reflexes',
  'precision',
  'swiftness',
] as const

/** Display names for upgrades */
const UPGRADE_NAMES: Record<string, string> = {
  vitality: 'Vitality (+HP)',
  might: 'Might (+Dmg%)',
  resilience: 'Resilience (+Armor)',
  reflexes: 'Reflexes (+Dodge)',
  precision: 'Precision (+ArmorPen)',
  swiftness: 'Swiftness (+Speed)',
}

export interface SensitivityConfig {
  /** Runs per test (default: 50) */
  runs?: number
  /** Max turns per run (default: 50000) */
  turns?: number
  /** Starting seed (default: 1000) */
  seed?: number
  /** Worker threads (default: 20) */
  threads?: number
  /** Classes to test (default: ['warrior']) */
  classes?: string[]
  /** Race to test (default: human) */
  raceId?: string
  /** Personality (default: cautious) */
  personality?: string
}

export interface UpgradeImpact {
  upgradeId: string
  upgradeName: string
  excludedDepth: number
  depthDelta: number
  percentImpact: number
}

export interface SensitivityResult {
  classId: string
  baselineAvgDepth: number
  impacts: UpgradeImpact[]
}

export interface MultiSensitivityResult {
  results: SensitivityResult[]
  totalTime: number
}

const SENSITIVITY_DEFAULTS = {
  runs: 50,
  turns: 50000,
  seed: 1000,
  threads: 20,
}

/**
 * Run sensitivity test across one or more classes using the shared pool.
 *
 * All work items (classes x (baseline + exclusions) x runs) are submitted
 * to the pool at once for maximum parallelism. Each class gets 7 cells
 * (1 baseline + 6 upgrade exclusions).
 */
export async function runSensitivityTest(config: SensitivityConfig = {}): Promise<MultiSensitivityResult> {
  const runs = config.runs ?? SENSITIVITY_DEFAULTS.runs
  const turns = config.turns ?? SENSITIVITY_DEFAULTS.turns
  const seed = config.seed ?? SENSITIVITY_DEFAULTS.seed
  const threads = config.threads ?? SENSITIVITY_DEFAULTS.threads
  const classes = config.classes ?? ['warrior']
  const raceId = config.raceId ?? 'human'
  const personality = (config.personality ?? 'cautious') as any
  const threadCount = Math.min(threads, cpus().length)
  const startTime = Date.now()

  // Each class has (1 baseline + N exclusions) configs
  const configsPerClass = 1 + SENSITIVITY_UPGRADES.length
  const totalCells = classes.length * configsPerClass
  const totalWork = totalCells * runs

  console.log(`\n${'='.repeat(60)}`)
  console.log('UPGRADE SENSITIVITY TEST')
  console.log('='.repeat(60))
  console.log(`Classes: ${classes.join(', ')}`)
  console.log(`Cells: ${totalCells} (${classes.length} class${classes.length > 1 ? 'es' : ''} x ${configsPerClass} configs)`)
  console.log(`Runs: ${totalWork} total (${runs}/cell), ${turns} turns, ${threadCount} threads`)
  console.log('='.repeat(60))

  // Build all work items: classes x configs x runs
  // Config index 0 = baseline, 1..N = exclusion of SENSITIVITY_UPGRADES[i-1]
  interface TaggedWork { classIdx: number; configIdx: number; item: WorkerInput }
  const allWork: TaggedWork[] = []

  for (let ci = 0; ci < classes.length; ci++) {
    const classId = classes[ci]!
    for (let cfgIdx = 0; cfgIdx < configsPerClass; cfgIdx++) {
      const excludeUpgrades = cfgIdx === 0 ? [] : [SENSITIVITY_UPGRADES[cfgIdx - 1]!]
      for (let ri = 0; ri < runs; ri++) {
        allWork.push({
          classIdx: ci,
          configIdx: cfgIdx,
          item: {
            seed: seed + ri,
            config: {
              raceId,
              classId,
              personality,
              maxTurns: turns,
              maxUpgrades: true,
              excludeUpgrades,
              balance: {
                bestiaryBonusPercent: 25,
              },
            },
          },
        })
      }
    }
  }

  // Track per-cell results: [classIdx][configIdx] -> DiagnoseResult[]
  const cellResults: DiagnoseResult[][][] = classes.map(() =>
    Array.from({ length: configsPerClass }, () => [])
  )
  const cellDone: boolean[][] = classes.map(() =>
    Array.from({ length: configsPerClass }, () => false)
  )

  // Progress tracking
  let totalCompleted = 0
  let cellsFinished = 0
  const isTTY = process.stdout.isTTY ?? false
  const progressStep = Math.max(1, Math.floor(totalWork / 20))
  let lastProgressAt = 0

  const writeProgressBar = () => {
    if (!isTTY) return
    if (totalCompleted - lastProgressAt < progressStep && totalCompleted < totalWork) return
    lastProgressAt = totalCompleted
    const pct = Math.floor((totalCompleted / totalWork) * 30)
    process.stdout.write(
      `\r[${'█'.repeat(pct)}${'░'.repeat(30 - pct)}] ${totalCompleted}/${totalWork} (${cellsFinished}/${totalCells} cells)`
    )
  }
  writeProgressBar()

  // Submit all work to the shared pool
  const pool = await getOrCreatePool(threadCount)

  const promises = allWork.map(async ({ classIdx, configIdx, item }) => {
    const result: DiagnoseResult = await pool.run(item)
    cellResults[classIdx]![configIdx]!.push(result)
    totalCompleted++

    // Cell finished — print completion line
    if (!cellDone[classIdx]![configIdx] && cellResults[classIdx]![configIdx]!.length === runs) {
      cellDone[classIdx]![configIdx] = true
      cellsFinished++

      const classId = classes[classIdx]!
      const configLabel = configIdx === 0
        ? `${classId}/baseline`
        : `${classId}/-${SENSITIVITY_UPGRADES[configIdx - 1]}`

      const batchResult = aggregateBatchResults(cellResults[classIdx]![configIdx]!, { runs } as any)
      const depth = batchResult.aggregateMetrics['worker-metrics.maxDepth']?.avg ?? 0

      const line = `${configLabel.padEnd(25)} depth=${depth.toFixed(1)}`
      if (isTTY) {
        process.stdout.write(`\r${' '.repeat(80)}\r${line}\n`)
      } else {
        process.stdout.write(`${line}\n`)
      }
    }
    writeProgressBar()
  })

  await Promise.all(promises)

  // Clear progress bar
  if (isTTY) process.stdout.write('\r' + ' '.repeat(80) + '\r')

  // Aggregate results per class
  const results: SensitivityResult[] = classes.map((classId, ci) => {
    const baselineBatch = aggregateBatchResults(cellResults[ci]![0]!, { runs } as any)
    const baselineDepth = baselineBatch.aggregateMetrics['worker-metrics.maxDepth']?.avg ?? 0

    const impacts: UpgradeImpact[] = SENSITIVITY_UPGRADES.map((upgradeId, ui) => {
      const exBatch = aggregateBatchResults(cellResults[ci]![ui + 1]!, { runs } as any)
      const excludedDepth = exBatch.aggregateMetrics['worker-metrics.maxDepth']?.avg ?? 0
      const depthDelta = excludedDepth - baselineDepth
      const percentImpact = baselineDepth > 0 ? (depthDelta / baselineDepth) * 100 : 0

      return {
        upgradeId,
        upgradeName: UPGRADE_NAMES[upgradeId] ?? upgradeId,
        excludedDepth,
        depthDelta,
        percentImpact,
      }
    })

    // Sort by impact (most negative first = most important upgrade)
    impacts.sort((a, b) => a.depthDelta - b.depthDelta)

    return { classId, baselineAvgDepth: baselineDepth, impacts }
  })

  return {
    results,
    totalTime: (Date.now() - startTime) / 1000,
  }
}
