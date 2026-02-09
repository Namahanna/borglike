/**
 * Lightweight Bot Profiler
 *
 * Import and call profile() to measure function execution time.
 * Call reportProfile() at the end to see results.
 *
 * Usage:
 *   import { profile, reportProfile } from './profiler'
 *   const result = profile('myFunc', () => myFunc(args))
 *
 * Enable with: PROFILE_BOT=1 environment variable
 */

// Type declaration for Node.js process
declare const process: { env: Record<string, string | undefined> } | undefined

const enabled = typeof process !== 'undefined' && process?.env?.PROFILE_BOT === '1'

interface Timing {
  total: number
  calls: number
  min: number
  max: number
}

const timings: Map<string, Timing> = new Map()

/**
 * Profile a function call. Returns the function's result.
 * No-op if PROFILE_BOT is not set.
 */
export function profile<T>(name: string, fn: () => T): T {
  if (!enabled) return fn()

  const start = performance.now()
  const result = fn()
  const elapsed = performance.now() - start

  let timing = timings.get(name)
  if (!timing) {
    timing = { total: 0, calls: 0, min: Infinity, max: 0 }
    timings.set(name, timing)
  }
  timing.total += elapsed
  timing.calls++
  timing.min = Math.min(timing.min, elapsed)
  timing.max = Math.max(timing.max, elapsed)

  return result
}

/**
 * Start a named timer (for async or multi-statement blocks)
 */
export function profileStart(_name: string): number {
  if (!enabled) return 0
  return performance.now()
}

/**
 * End a named timer started with profileStart
 */
export function profileEnd(name: string, start: number): void {
  if (!enabled || start === 0) return
  const elapsed = performance.now() - start

  let timing = timings.get(name)
  if (!timing) {
    timing = { total: 0, calls: 0, min: Infinity, max: 0 }
    timings.set(name, timing)
  }
  timing.total += elapsed
  timing.calls++
  timing.min = Math.min(timing.min, elapsed)
  timing.max = Math.max(timing.max, elapsed)
}

/**
 * Report profiling results to console
 */
export function reportProfile(): void {
  if (!enabled || timings.size === 0) return

  const sorted = [...timings.entries()].sort((a, b) => b[1].total - a[1].total)
  const totalTime = sorted.reduce((sum, [, t]) => sum + t.total, 0)

  console.log('\n=== BOT PROFILE ===')
  console.log(`Total tracked: ${totalTime.toFixed(1)}ms\n`)

  for (const [name, t] of sorted) {
    const pct = ((t.total / totalTime) * 100).toFixed(1)
    const avg = ((t.total / t.calls) * 1000).toFixed(1)
    console.log(
      `${pct.padStart(5)}%  ${t.total.toFixed(1).padStart(8)}ms  ` +
        `${t.calls.toString().padStart(7)} calls  ` +
        `${avg.padStart(7)}µs avg  ` +
        `[${t.min.toFixed(2)}-${t.max.toFixed(2)}ms]  ${name}`
    )
  }
}

/**
 * Reset all timings
 */
export function resetProfile(): void {
  timings.clear()
}

/**
 * Check if profiling is enabled
 */
export function isProfilingEnabled(): boolean {
  return enabled
}
