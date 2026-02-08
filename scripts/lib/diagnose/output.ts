/**
 * Output Formatting Utilities
 *
 * Formats diagnostic results for agent consumption.
 * Optimized for clarity and parseability.
 */

import type {
  DiagnoseResult,
  BatchResult,
  AnalyzerResult,
  DiagnosticIssue,
} from './types'
import type { TurnLogEntry } from './runner'
import type { BaselineResult, BaselineRaceResult } from './baseline'
import type { SensitivityResult, MultiSensitivityResult } from './sensitivity'
import { SENSITIVITY_UPGRADES } from './sensitivity'

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function line(char: string, length: number = 60): string {
  return char.repeat(length)
}

function header(title: string): string {
  return `\n${line('=')} \n${title}\n${line('=')}`
}

function section(title: string): string {
  return `\n${title}\n${line('-', title.length)}`
}

// ============================================================================
// SINGLE RUN OUTPUT
// ============================================================================

/** Format a single diagnostic result */
export function formatResult(result: DiagnoseResult): string {
  const lines: string[] = []

  // Header
  lines.push(header(`DIAGNOSTIC RESULT: seed=${result.seed}`))

  // Configuration
  lines.push(section('Configuration'))
  lines.push(`  Race/Class: ${result.config.raceId}/${result.config.classId}`)
  lines.push(`  Personality: ${result.config.personality}`)
  lines.push(`  Max turns: ${result.config.maxTurns}`)

  // Final state
  lines.push(section('Final State'))
  lines.push(`  End reason: ${result.endReason}`)
  lines.push(`  Turn: ${result.finalState.turn}`)
  lines.push(`  Depth: ${result.finalState.depth}`)
  lines.push(`  Level: ${result.finalState.level} (${result.finalState.xp} XP)`)
  lines.push(`  HP: ${result.finalState.hp}/${result.finalState.maxHp}`)
  lines.push(`  Kills: ${result.finalState.kills}`)
  lines.push(`  Gold: ${result.finalState.gold}`)
  lines.push(`  Position: (${result.finalState.position.x}, ${result.finalState.position.y})`)

  // Issues summary
  if (result.allIssues.length > 0) {
    lines.push(section(`Issues (${result.allIssues.length})`))
    for (const issue of result.allIssues) {
      const prefix = issue.severity === 'error' ? '[ERROR]' : '[WARN]'
      const turnStr = issue.turn !== undefined ? ` (turn ${issue.turn})` : ''
      lines.push(`  ${prefix} ${issue.message}${turnStr}`)
    }
  } else {
    lines.push(section('Issues'))
    lines.push('  None detected')
  }

  // Analyzer results
  for (const ar of result.analyzerResults) {
    lines.push(formatAnalyzerResult(ar))
  }

  return lines.join('\n')
}

/** Format a single analyzer result */
export function formatAnalyzerResult(result: AnalyzerResult): string {
  const lines: string[] = []

  lines.push(section(`Analyzer: ${result.name}`))

  // Metrics
  for (const [key, value] of Object.entries(result.metrics)) {
    const formatted = typeof value === 'number' && !Number.isInteger(value)
      ? value.toFixed(1)
      : String(value)
    lines.push(`  ${key}: ${formatted}`)
  }

  // Details
  if (result.details && result.details.length > 0) {
    lines.push('')
    for (const detail of result.details) {
      lines.push(`  ${detail}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// DEEP DIVE OUTPUT
// ============================================================================

/** Options for formatting turn log */
export interface TurnLogOptions {
  /** Maximum turns to display (default: 50, ignored if from/to specified) */
  maxTurns?: number
  /** Only show turns with flags */
  onlyFlagged?: boolean
  /** Start of turn range (inclusive) */
  from?: number
  /** End of turn range (inclusive) */
  to?: number
}

/** Format turn log for deep dive mode */
export function formatTurnLog(
  turnLog: TurnLogEntry[],
  options: TurnLogOptions = {}
): string {
  const { maxTurns = 50, onlyFlagged = false, from, to } = options
  const lines: string[] = []

  // Determine if we're using range mode
  const useRange = from !== undefined || to !== undefined
  const rangeFrom = from ?? 0
  const rangeTo = to ?? Infinity

  if (useRange) {
    lines.push(section(`Turn Log (turns ${rangeFrom}-${to ?? 'end'})`))
  } else {
    lines.push(section('Turn Log'))
  }

  let count = 0
  for (const entry of turnLog) {
    // Skip turns outside the range
    if (useRange) {
      if (entry.turn < rangeFrom) continue
      if (entry.turn > rangeTo) break
    } else {
      // Original maxTurns behavior when not using range
      if (count >= maxTurns) {
        lines.push(`  ... (${turnLog.length - count} more turns)`)
        break
      }
    }

    if (onlyFlagged && entry.flags.length === 0) continue

    const flagStr = entry.flags.length > 0 ? ` [${entry.flags.join(', ')}]` : ''
    const goalStr = entry.goal ? ` goal=${entry.goal}` : ''
    const mpStr = entry.maxMp > 0 ? ` MP=${entry.mp}/${entry.maxMp}` : ''

    lines.push(
      `  Turn ${String(entry.turn).padStart(4)}: ` +
        `pos=(${entry.position.x},${entry.position.y}) ` +
        `HP=${entry.hp}${mpStr} ` +
        `depth=${entry.depth} ` +
        `action=${entry.action}${goalStr}${flagStr}`
    )

    count++
  }

  if (count === 0) {
    lines.push('  No turns in specified range')
  }

  return lines.join('\n')
}

// ============================================================================
// BATCH OUTPUT
// ============================================================================

/** Format batch results */
export function formatBatchResult(result: BatchResult): string {
  const lines: string[] = []

  lines.push(header('BATCH DIAGNOSTIC RESULT'))

  // Key metrics summary (easy to compare)
  const depth = result.aggregateMetrics['worker-metrics.maxDepth']
  const kills = result.aggregateMetrics['worker-metrics.kills']
  const turns = result.aggregateMetrics['worker-metrics.totalTurns']

  // Count end reasons
  const circuitBreakers = result.problemRuns.filter(r => r.endReason === 'circuit_breaker').length

  lines.push(section('Key Metrics'))
  lines.push(`  Depth:  avg=${depth?.avg.toFixed(1) ?? '?'}  max=${depth?.max.toFixed(0) ?? '?'}`)
  lines.push(`  Kills:  avg=${kills?.avg.toFixed(1) ?? '?'}  max=${kills?.max.toFixed(0) ?? '?'}`)
  lines.push(`  Turns:  avg=${turns?.avg.toFixed(0) ?? '?'}`)
  lines.push(`  Runs:   ${result.totalRuns} total, ${circuitBreakers} circuit breakers (${(circuitBreakers/result.totalRuns*100).toFixed(0)}%)`)

  // Victory and Morgoth tracking
  if (result.victoryCount > 0 || result.morgothKillCount > 0) {
    lines.push(`  VICTORIES: ${result.victoryCount} (${(result.victoryCount/result.totalRuns*100).toFixed(0)}%)`)
    lines.push(`  Morgoth kills: ${result.morgothKillCount}`)
  }

  // Death causes
  if (result.deathCauses && result.deathCauses.length > 0) {
    lines.push(section('Top Killers'))
    for (const dc of result.deathCauses.slice(0, 10)) {
      const pct = (dc.count / result.totalRuns * 100).toFixed(0)
      lines.push(`  ${dc.count}x (${pct}%) ${dc.monster}`)
    }
  }

  // Aggregate metrics
  lines.push(section('Aggregate Metrics'))
  for (const [key, stats] of Object.entries(result.aggregateMetrics)) {
    lines.push(`  ${key}:`)
    lines.push(`    min=${stats.min.toFixed(1)} max=${stats.max.toFixed(1)} avg=${stats.avg.toFixed(1)}`)
  }

  // Common issues
  if (result.aggregateIssues.length > 0) {
    lines.push(section('Common Issues'))
    for (const issue of result.aggregateIssues.slice(0, 10)) {
      lines.push(`  ${issue.count}x: ${issue.message}`)
    }
  }

  // End reason breakdown
  const endReasonCounts = new Map<string, number>()
  for (const run of result.problemRuns) {
    endReasonCounts.set(run.endReason, (endReasonCounts.get(run.endReason) ?? 0) + 1)
  }
  if (endReasonCounts.size > 0) {
    lines.push(section('End Reasons'))
    for (const [reason, count] of [...endReasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = (count / result.totalRuns * 100).toFixed(0)
      lines.push(`  ${reason}: ${count} (${pct}%)`)
    }
  }

  // Circuit breaker seeds (actual problems, not deaths)
  const cbRuns = result.problemRuns.filter(r => r.endReason === 'circuit_breaker')
  if (cbRuns.length > 0) {
    lines.push(section('Circuit Breaker Seeds'))
    for (const run of cbRuns.slice(0, 10)) {
      const errorCount = run.allIssues.filter((i) => i.severity === 'error').length
      const warnCount = run.allIssues.filter((i) => i.severity === 'warning').length
      lines.push(`  seed=${run.seed}: ${errorCount} errors, ${warnCount} warnings, depth=${run.finalState.depth}`)
    }
    if (cbRuns.length > 10) {
      lines.push(`  ... (${cbRuns.length - 10} more)`)
    }
  }

  // Summary table (markdown format for easy copy-paste)
  const className = result.config.classId ?? 'warrior'
  const avgDepth = depth?.avg.toFixed(1) ?? '?'
  const maxDepthVal = depth?.max.toFixed(0) ?? '?'
  const cbRate = ((circuitBreakers / result.totalRuns) * 100).toFixed(0)
  const avgKills = kills?.avg.toFixed(0) ?? '?'
  const victories = result.victoryCount

  lines.push(section('Summary'))
  lines.push('| Class | Avg Depth | Max Depth | CB Rate | Kills | Victories |')
  lines.push('|-------|-----------|-----------|---------|-------|-----------|')
  lines.push(`| **${className.charAt(0).toUpperCase() + className.slice(1)}** | ${avgDepth} | ${maxDepthVal} | ${cbRate}% | ${avgKills} | ${victories} |`)

  return lines.join('\n')
}

// ============================================================================
// ISSUE FORMATTING
// ============================================================================

/** Format issues list */
export function formatIssues(issues: DiagnosticIssue[]): string {
  if (issues.length === 0) {
    return 'No issues detected.'
  }

  const lines: string[] = []
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  if (errors.length > 0) {
    lines.push(`ERRORS (${errors.length}):`)
    for (const issue of errors) {
      const turnStr = issue.turn !== undefined ? ` (turn ${issue.turn})` : ''
      lines.push(`  - ${issue.message}${turnStr}`)
    }
  }

  if (warnings.length > 0) {
    lines.push(`WARNINGS (${warnings.length}):`)
    for (const issue of warnings) {
      const turnStr = issue.turn !== undefined ? ` (turn ${issue.turn})` : ''
      lines.push(`  - ${issue.message}${turnStr}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// COMPACT OUTPUT (for batch/quick checks)
// ============================================================================

/** Format a single-line summary */
export function formatOneLiner(result: DiagnoseResult): string {
  const status = result.hasErrors ? 'FAIL' : result.hasWarnings ? 'WARN' : 'OK'
  return (
    `[${status}] seed=${result.seed} ` +
    `depth=${result.finalState.depth} ` +
    `turns=${result.finalState.turn} ` +
    `kills=${result.finalState.kills} ` +
    `end=${result.endReason} ` +
    `issues=${result.allIssues.length}`
  )
}

// ============================================================================
// BASELINE OUTPUT
// ============================================================================

/** Format baseline class results as text table */
export function formatBaselineResults(
  results: BaselineResult[],
  opts: { totalTime: string }
): string {
  const lines: string[] = []

  lines.push(`\n${'='.repeat(60)}`)
  lines.push('BASELINE RESULTS')
  lines.push('='.repeat(60))
  lines.push(`\n| Class | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Morgoth |`)
  lines.push('|-------|-----------|-----------|---------|-----------|-------|---------|')
  for (const r of results) {
    const status = r.avgDepth >= 30 ? '\u2705' : r.avgDepth >= 10 ? '\u26A0\uFE0F' : '\u274C'
    lines.push(
      `| ${status} ${r.classId.padEnd(10)} | ${r.avgDepth.toFixed(1).padStart(9)} | ${r.maxDepth.toString().padStart(9)} | ${r.cbRate.toFixed(0).padStart(5)}%  | ${r.avgTurns.toFixed(0).padStart(9)} | ${r.avgKills.toFixed(0).padStart(5)} | ${r.morgothKills.toString().padStart(7)} |`
    )
  }

  lines.push(`\nTotal time: ${opts.totalTime}s`)
  lines.push(`\nCopy/paste for BALANCE.md:`)
  lines.push('```')
  lines.push(`| Class | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Status |`)
  lines.push('|-------|-----------|-----------|---------|-----------|-------|--------|')
  for (const r of results) {
    const status = r.avgDepth >= 30 ? '\u2705 Endgame' : r.avgDepth >= 10 ? '\u26A0\uFE0F Mid' : '\u26A0\uFE0F Early'
    lines.push(
      `| **${r.classId.charAt(0).toUpperCase() + r.classId.slice(1)}** | ${r.avgDepth.toFixed(1)} | ${r.maxDepth} | ${r.cbRate.toFixed(0)}% | ${r.avgTurns.toFixed(0)} | ${r.avgKills.toFixed(0)} | ${status} |`
    )
  }
  lines.push('```')

  return lines.join('\n')
}

// ============================================================================
// BASELINE RACE OUTPUT
// ============================================================================

/** Format baseline race results as text table */
export function formatBaselineRaceResults(
  results: BaselineRaceResult[],
  opts: { totalTime: string }
): string {
  const lines: string[] = []

  lines.push(`\n${'='.repeat(60)}`)
  lines.push('RACE BASELINE RESULTS')
  lines.push('='.repeat(60))
  lines.push(`\n| Race | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Morgoth |`)
  lines.push('|------|-----------|-----------|---------|-----------|-------|---------|')
  for (const r of results) {
    const status = r.avgDepth >= 30 ? '\u2705' : r.avgDepth >= 10 ? '\u26A0\uFE0F' : '\u274C'
    const displayName = r.raceId.replace('_', '-')
    lines.push(
      `| ${status} ${displayName.padEnd(10)} | ${r.avgDepth.toFixed(1).padStart(9)} | ${r.maxDepth.toString().padStart(9)} | ${r.cbRate.toFixed(0).padStart(5)}%  | ${r.avgTurns.toFixed(0).padStart(9)} | ${r.avgKills.toFixed(0).padStart(5)} | ${r.morgothKills.toString().padStart(7)} |`
    )
  }

  lines.push(`\nTotal time: ${opts.totalTime}s`)
  lines.push(`\nCopy/paste for BALANCE.md:`)
  lines.push('```')
  lines.push(`| Race | Avg Depth | Max Depth | CB Rate | Turns | Kills | Status |`)
  lines.push('|------|-----------|-----------|---------|-------|-------|--------|')
  for (const r of results) {
    const status = r.avgDepth >= 30 ? '\u2705 Endgame' : r.avgDepth >= 10 ? '\u26A0\uFE0F Mid' : '\u26A0\uFE0F Early'
    const displayName = r.raceId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')
    lines.push(
      `| **${displayName}** | ${r.avgDepth.toFixed(1)} | ${r.maxDepth} | ${r.cbRate.toFixed(0)}% | ${r.avgTurns.toFixed(0)} | ${r.avgKills.toFixed(0)} | ${status} |`
    )
  }
  lines.push('```')

  return lines.join('\n')
}

// ============================================================================
// SENSITIVITY OUTPUT
// ============================================================================

/** Format sensitivity test results as text table */
export function formatSensitivityResults(
  result: SensitivityResult,
  opts: { totalTime: string }
): string {
  const lines: string[] = []

  lines.push(`\n${'='.repeat(60)}`)
  lines.push('SENSITIVITY RESULTS')
  lines.push('='.repeat(60))
  lines.push(`\nBaseline avg depth: ${result.baselineAvgDepth.toFixed(1)}`)
  lines.push(`\n| Upgrade | Baseline | Excluded | Delta | Impact |`)
  lines.push('|---------|----------|----------|-------|--------|')
  for (const impact of result.impacts) {
    const deltaStr = impact.depthDelta >= 0 ? `+${impact.depthDelta.toFixed(1)}` : impact.depthDelta.toFixed(1)
    const impactStr = impact.percentImpact >= 0 ? `+${impact.percentImpact.toFixed(1)}%` : `${impact.percentImpact.toFixed(1)}%`
    const importance = impact.percentImpact < -10 ? '\uD83D\uDD34' : impact.percentImpact < -5 ? '\uD83D\uDFE1' : '\uD83D\uDFE2'
    lines.push(
      `| ${importance} ${impact.upgradeName.padEnd(18)} | ${result.baselineAvgDepth.toFixed(1).padStart(8)} | ${impact.excludedDepth.toFixed(1).padStart(8)} | ${deltaStr.padStart(5)} | ${impactStr.padStart(6)} |`
    )
  }

  lines.push(`\nTotal time: ${opts.totalTime}s`)
  lines.push(`\n**Interpretation:**`)
  lines.push(`- \uD83D\uDD34 High impact (>10% loss): Critical upgrade, prioritize early`)
  lines.push(`- \uD83D\uDFE1 Medium impact (5-10%): Important but not blocking`)
  lines.push(`- \uD83D\uDFE2 Low impact (<5%): Nice-to-have, can defer`)

  lines.push(`\nCopy/paste for BALANCE.md:`)
  lines.push('```')
  lines.push(`| Upgrade | Baseline | Excluded | Delta | Impact |`)
  lines.push('|---------|----------|----------|-------|--------|')
  for (const impact of result.impacts) {
    const deltaStr = impact.depthDelta >= 0 ? `+${impact.depthDelta.toFixed(1)}` : impact.depthDelta.toFixed(1)
    const impactStr = impact.percentImpact >= 0 ? `+${impact.percentImpact.toFixed(1)}%` : `${impact.percentImpact.toFixed(1)}%`
    lines.push(
      `| ${impact.upgradeName} | ${result.baselineAvgDepth.toFixed(1)} | ${impact.excludedDepth.toFixed(1)} | ${deltaStr} | ${impactStr} |`
    )
  }
  lines.push('```')

  return lines.join('\n')
}

// ============================================================================
// MULTI-CLASS SENSITIVITY OUTPUT
// ============================================================================

/** Format multi-class sensitivity results with per-class tables and cross-class summary */
export function formatMultiSensitivityResults(result: MultiSensitivityResult): string {
  const lines: string[] = []
  const totalTime = result.totalTime.toFixed(1)

  // Per-class tables
  for (const classResult of result.results) {
    lines.push(formatSensitivityResults(classResult, { totalTime }))
  }

  // Cross-class summary (only if multiple classes)
  if (result.results.length > 1) {
    lines.push(`\n${'='.repeat(60)}`)
    lines.push('CROSS-CLASS SENSITIVITY SUMMARY')
    lines.push('='.repeat(60))

    const classNames = result.results.map(r => r.classId.charAt(0).toUpperCase() + r.classId.slice(1))

    // Header: | Upgrade | Class1 | Class2 | ... |
    lines.push(`\n| Upgrade | ${classNames.join(' | ')} |`)
    lines.push(`|---------|${classNames.map(n => '-'.repeat(n.length + 2)).join('|')}|`)

    // One row per upgrade (in canonical order, not sorted by impact)
    for (const upgradeId of SENSITIVITY_UPGRADES) {
      const cells = result.results.map(classResult => {
        const impact = classResult.impacts.find(i => i.upgradeId === upgradeId)
        if (!impact) return '?'
        const val = impact.percentImpact
        return val >= 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`
      })

      const upgradeName = result.results[0]!.impacts.find(i => i.upgradeId === upgradeId)?.upgradeName ?? upgradeId
      lines.push(`| ${upgradeName.padEnd(18)} | ${cells.map((c, i) => c.padStart(classNames[i]!.length)).join(' | ')} |`)
    }

    // Baseline row
    const baselines = result.results.map((r, i) => r.baselineAvgDepth.toFixed(1).padStart(classNames[i]!.length))
    lines.push(`| ${'**Baseline**'.padEnd(18)} | ${baselines.join(' | ')} |`)

    lines.push(`\nTotal time: ${totalTime}s`)

    // Copy/paste section
    lines.push(`\nCopy/paste for BALANCE.md:`)
    lines.push('```')
    lines.push(`| Upgrade | ${classNames.join(' | ')} |`)
    lines.push(`|---------|${classNames.map(n => '-'.repeat(n.length + 2)).join('|')}|`)
    for (const upgradeId of SENSITIVITY_UPGRADES) {
      const cells = result.results.map(classResult => {
        const impact = classResult.impacts.find(i => i.upgradeId === upgradeId)
        if (!impact) return '?'
        const val = impact.percentImpact
        return val >= 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`
      })
      const upgradeName = result.results[0]!.impacts.find(i => i.upgradeId === upgradeId)?.upgradeName ?? upgradeId
      lines.push(`| ${upgradeName} | ${cells.join(' | ')} |`)
    }
    lines.push(`| **Baseline** | ${result.results.map(r => r.baselineAvgDepth.toFixed(1)).join(' | ')} |`)
    lines.push('```')
  }

  return lines.join('\n')
}

// ============================================================================
// FIND MODE OUTPUT
// ============================================================================

/** Format problem runs found by find mode */
export function formatFindResults(problemRuns: DiagnoseResult[]): string {
  if (problemRuns.length === 0) {
    return 'No problematic runs found!'
  }

  const lines: string[] = []
  lines.push(`Found ${problemRuns.length} problematic runs:\n`)
  for (const run of problemRuns) {
    lines.push(formatOneLiner(run))
  }
  lines.push('\nRun with "deep <seed>" for detailed analysis.')
  return lines.join('\n')
}
