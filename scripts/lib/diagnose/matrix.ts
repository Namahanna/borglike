/**
 * Matrix Mode
 *
 * Runs a cartesian product of class/race/personality/upgrade/capability
 * configurations through the shared worker pool. Each combination gets
 * a full batch run; results are collected per-cell for comparison.
 */

import { cpus } from 'os'
import { getOrCreatePool, aggregateBatchResults } from './runner'
import type { WorkerInput } from './runner'
import { BASELINE_CLASSES, BASELINE_RACES } from './baseline'
import type { BatchResult, DiagnoseResult } from './types'
import type { BalanceOverrides } from '@game/types'

// ============================================================================
// TYPES
// ============================================================================

/** A single axis of variation in the matrix */
export type MatrixAxis = 'class' | 'race' | 'personality' | 'upgrades' | 'capabilities'

/** Configuration for a matrix run */
export interface MatrixConfig {
  classes: string[]
  races: string[]
  personalities: string[]
  upgradeTiers: string[]
  capabilityTiers: string[]
  runs: number
  maxTurns: number
  startSeed?: number
  threads: number
  boosters: string
  maxUpgrades: boolean
  balance?: Partial<BalanceOverrides>
  /** Custom header label (default: "MATRIX TEST") */
  headerLabel?: string
  /** When true, zip upgradeTiers and capabilityTiers instead of crossing them.
   *  e.g., [none,mid,full] × [none,mid,full] → 3 cells (none/none, mid/mid, full/full)
   *  instead of 9. Both arrays must have the same length. */
  pairedProgression?: boolean
}

/** One cell in the matrix (a single config combination) */
export interface MatrixCell {
  classId: string
  raceId: string
  personality: string
  upgrades: string
  capabilities: string
}

/** Result for one cell */
export interface MatrixCellResult {
  cell: MatrixCell
  label: string
  avgDepth: number
  maxDepth: number
  cbRate: number
  avgKills: number
  morgothKills: number
  avgTurns: number
  victoryCount: number
  batchResult: BatchResult
}

/** Full matrix result */
export interface MatrixResult {
  config: MatrixConfig
  cells: MatrixCellResult[]
  varyingAxes: MatrixAxis[]
  totalRuns: number
  totalTime: number
}

// ============================================================================
// CORE
// ============================================================================

/** Compute the cartesian product of all matrix axes (or zip progression tiers). */
function buildCells(config: MatrixConfig): MatrixCell[] {
  const cells: MatrixCell[] = []

  // When paired, zip upgrade and capability tiers together
  if (config.pairedProgression) {
    const tierPairs = config.upgradeTiers.map((upg, i) => ({
      upgrades: upg,
      capabilities: config.capabilityTiers[i] ?? upg,
    }))
    for (const classId of config.classes) {
      for (const raceId of config.races) {
        for (const personality of config.personalities) {
          for (const { upgrades, capabilities } of tierPairs) {
            cells.push({ classId, raceId, personality, upgrades, capabilities })
          }
        }
      }
    }
    return cells
  }

  // Default: full cartesian product
  for (const classId of config.classes) {
    for (const raceId of config.races) {
      for (const personality of config.personalities) {
        for (const upgrades of config.upgradeTiers) {
          for (const capabilities of config.capabilityTiers) {
            cells.push({ classId, raceId, personality, upgrades, capabilities })
          }
        }
      }
    }
  }
  return cells
}

/** Determine which axes have more than one value. */
function findVaryingAxes(config: MatrixConfig): MatrixAxis[] {
  const axes: MatrixAxis[] = []
  if (config.classes.length > 1) axes.push('class')
  if (config.races.length > 1) axes.push('race')
  if (config.personalities.length > 1) axes.push('personality')
  if (config.upgradeTiers.length > 1) axes.push('upgrades')
  if (config.capabilityTiers.length > 1) axes.push('capabilities')
  return axes
}

/** Build a subfolder/label from a cell, only including varying dimensions. */
export function buildCellLabel(cell: MatrixCell, varyingAxes: MatrixAxis[]): string {
  const parts: string[] = []
  if (varyingAxes.includes('class')) parts.push(cell.classId)
  if (varyingAxes.includes('race')) parts.push(cell.raceId)
  if (varyingAxes.includes('personality')) parts.push(cell.personality)
  if (varyingAxes.includes('upgrades')) parts.push(`upg_${cell.upgrades}`)
  if (varyingAxes.includes('capabilities')) parts.push(`cap_${cell.capabilities}`)
  return parts.join('-') || 'default'
}

/** Build a BatchResult from per-cell raw results. */
function buildCellResult(
  cell: MatrixCell,
  label: string,
  rawResults: DiagnoseResult[],
  runs: number,
): MatrixCellResult {
  const batchResult = aggregateBatchResults(rawResults, { runs } as any)
  const depthMetrics = batchResult.aggregateMetrics['worker-metrics.maxDepth']
  const killMetrics = batchResult.aggregateMetrics['worker-metrics.kills']
  const turnMetrics = batchResult.aggregateMetrics['worker-metrics.totalTurns']
  return {
    cell,
    label,
    avgDepth: depthMetrics?.avg ?? 0,
    maxDepth: depthMetrics?.max ?? 0,
    cbRate: (batchResult.circuitBreakerCount / runs) * 100,
    avgKills: killMetrics?.avg ?? 0,
    morgothKills: batchResult.morgothKillCount,
    avgTurns: turnMetrics?.avg ?? 0,
    victoryCount: batchResult.victoryCount,
    batchResult,
  }
}

/**
 * Run the full matrix.
 *
 * All cells' work items are submitted to the pool at once — when slow runs
 * from one cell are still running, threads naturally pick up work from the
 * next cell. Progress is reported per-cell with a completion line as each
 * cell finishes.
 */
export async function runMatrix(config: MatrixConfig): Promise<MatrixResult> {
  const startTime = Date.now()
  const cells = buildCells(config)
  const varyingAxes = findVaryingAxes(config)
  const startSeed = config.startSeed ?? Date.now()
  const threadCount = Math.min(config.threads, cpus().length)

  const label = config.headerLabel ?? 'MATRIX TEST'
  console.log(`\n${'='.repeat(60)}`)
  console.log(label)
  console.log('='.repeat(60))

  // Describe dimensions
  const dimParts: string[] = []
  if (config.classes.length > 1) dimParts.push(`${config.classes.length} classes`)
  if (config.races.length > 1) dimParts.push(`${config.races.length} races`)
  if (config.personalities.length > 1) dimParts.push(`${config.personalities.length} personalities`)
  if (config.pairedProgression && config.upgradeTiers.length > 1) {
    dimParts.push(`${config.upgradeTiers.length} progression tiers`)
  } else {
    if (config.upgradeTiers.length > 1) dimParts.push(`${config.upgradeTiers.length} upgrade tiers`)
    if (config.capabilityTiers.length > 1) dimParts.push(`${config.capabilityTiers.length} cap tiers`)
  }
  const totalWork = cells.length * config.runs
  console.log(`Cells: ${cells.length} (${dimParts.join(' x ') || 'single config'})`)
  console.log(`Runs: ${totalWork} total (${config.runs}/cell), ${config.maxTurns} turns, ${threadCount} threads`)
  console.log('='.repeat(60))

  // Build labels and per-cell tracking
  const cellLabels = cells.map(c => buildCellLabel(c, varyingAxes))
  const maxLabelLen = Math.max(20, ...cellLabels.map(l => l.length + 2))
  const perCellResults: DiagnoseResult[][] = cells.map(() => [])
  const perCellDone: boolean[] = cells.map(() => false)

  // Flatten all work items across all cells, tagged with cell index
  interface TaggedWork { cellIdx: number; item: WorkerInput }
  const allWork: TaggedWork[] = []
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]!
    for (let ri = 0; ri < config.runs; ri++) {
      allWork.push({
        cellIdx: ci,
        item: {
          seed: startSeed + ri,
          config: {
            raceId: cell.raceId,
            classId: cell.classId,
            personality: cell.personality,
            maxTurns: config.maxTurns,
            maxUpgrades: config.maxUpgrades,
            balance: config.balance as any,
            capabilities: cell.capabilities,
            upgrades: cell.upgrades,
            boosters: config.boosters,
          },
        },
      })
    }
  }

  // Progress tracking
  let totalCompleted = 0
  let cellsFinished = 0
  const cellStartTimes: number[] = []
  const isTTY = process.stdout.isTTY ?? false

  // TTY: overwriting progress bar, throttled to ~5% increments
  const progressStep = Math.max(1, Math.floor(totalWork / 20))
  let lastProgressAt = 0
  const writeProgressBar = () => {
    if (!isTTY) return
    if (totalCompleted - lastProgressAt < progressStep && totalCompleted < totalWork) return
    lastProgressAt = totalCompleted
    const pct = Math.floor((totalCompleted / totalWork) * 30)
    process.stdout.write(
      `\r[${'█'.repeat(pct)}${'░'.repeat(30 - pct)}] ${totalCompleted}/${totalWork} (${cellsFinished}/${cells.length} cells)`
    )
  }
  writeProgressBar()

  // Submit all work to the shared pool
  const pool = await getOrCreatePool(threadCount)

  const promises = allWork.map(async ({ cellIdx, item }) => {
    if (!cellStartTimes[cellIdx]) cellStartTimes[cellIdx] = Date.now()

    const result: DiagnoseResult = await pool.run(item)
    perCellResults[cellIdx]!.push(result)
    totalCompleted++

    // Cell just finished — print completion line (always, TTY or not)
    if (!perCellDone[cellIdx] && perCellResults[cellIdx]!.length === config.runs) {
      perCellDone[cellIdx] = true
      cellsFinished++
      const elapsed = ((Date.now() - (cellStartTimes[cellIdx] ?? startTime)) / 1000).toFixed(1)
      const cellResult = buildCellResult(cells[cellIdx]!, cellLabels[cellIdx]!, perCellResults[cellIdx]!, config.runs)
      const line = `${cellLabels[cellIdx]!.padEnd(maxLabelLen)} depth=${cellResult.avgDepth.toFixed(1)} kills=${cellResult.avgKills.toFixed(0)} cb=${cellResult.cbRate.toFixed(0)}% (${elapsed}s)`
      if (isTTY) {
        // Clear progress bar, print cell line, redraw bar
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

  // Build final results (aggregate each cell)
  const results: MatrixCellResult[] = cells.map((cell, ci) =>
    buildCellResult(cell, cellLabels[ci]!, perCellResults[ci]!, config.runs)
  )

  return {
    config,
    cells: results,
    varyingAxes,
    totalRuns: totalWork,
    totalTime: (Date.now() - startTime) / 1000,
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

/** Map MatrixAxis to display header */
function axisHeader(axis: MatrixAxis): string {
  switch (axis) {
    case 'class': return 'Class'
    case 'race': return 'Race'
    case 'personality': return 'Personality'
    case 'upgrades': return 'Upgrades'
    case 'capabilities': return 'Caps'
  }
}

/** Get axis value from a cell */
function axisValue(cell: MatrixCell, axis: MatrixAxis): string {
  switch (axis) {
    case 'class': return cell.classId
    case 'race': return cell.raceId
    case 'personality': return cell.personality
    case 'upgrades': return cell.upgrades
    case 'capabilities': return cell.capabilities
  }
}

/** Format the matrix summary as a comparison table. */
export function formatMatrixSummary(result: MatrixResult): string {
  const lines: string[] = []
  lines.push(`\n${'='.repeat(60)}`)
  lines.push('MATRIX RESULTS')
  lines.push('='.repeat(60))
  lines.push(`Total cells: ${result.cells.length}, Total runs: ${result.totalRuns}`)
  lines.push(`Time: ${result.totalTime.toFixed(1)}s`)
  lines.push('')

  const axisHeaders = result.varyingAxes.map(axisHeader)
  const metricHeaders = ['Avg Depth', 'Max Depth', 'CB Rate', 'Kills', 'Morgoth', 'Turns']

  // Header
  lines.push(`| ${[...axisHeaders, ...metricHeaders].join(' | ')} |`)
  lines.push(`|${[...axisHeaders, ...metricHeaders].map(h => '-'.repeat(h.length + 2)).join('|')}|`)

  // Sort by avg depth descending
  const sorted = [...result.cells].sort((a, b) => b.avgDepth - a.avgDepth)

  for (const cell of sorted) {
    const axisVals = result.varyingAxes.map(a => axisValue(cell.cell, a))
    const metricVals = [
      cell.avgDepth.toFixed(1),
      String(cell.maxDepth),
      `${cell.cbRate.toFixed(0)}%`,
      cell.avgKills.toFixed(0),
      String(cell.morgothKills),
      cell.avgTurns.toFixed(0),
    ]
    lines.push(`| ${[...axisVals, ...metricVals].join(' | ')} |`)
  }

  lines.push('')
  lines.push(`Copy/paste for BALANCE.md:`)
  lines.push('```')
  lines.push(`| ${[...axisHeaders, ...metricHeaders].join(' | ')} |`)
  lines.push(`|${[...axisHeaders, ...metricHeaders].map(h => '-'.repeat(h.length + 2)).join('|')}|`)
  for (const cell of sorted) {
    const axisVals = result.varyingAxes.map(a => {
      const v = axisValue(cell.cell, a)
      return `**${v.charAt(0).toUpperCase() + v.slice(1)}**`
    })
    const metricVals = [
      cell.avgDepth.toFixed(1),
      String(cell.maxDepth),
      `${cell.cbRate.toFixed(0)}%`,
      cell.avgKills.toFixed(0),
      String(cell.morgothKills),
      cell.avgTurns.toFixed(0),
    ]
    lines.push(`| ${[...axisVals, ...metricVals].join(' | ')} |`)
  }
  lines.push('```')

  return lines.join('\n')
}

// ============================================================================
// CONSTANTS (re-exported for CLI arg resolution)
// ============================================================================

export { BASELINE_CLASSES, BASELINE_RACES }
export const ALL_CAPABILITY_TIERS = ['none', 'early', 'mid', 'late', 'full'] as const
export const ALL_UPGRADE_TIERS = ['none', 'early', 'mid', 'late', 'full'] as const
export const ALL_PERSONALITIES = ['cautious', 'aggressive', 'greedy', 'speedrunner'] as const
