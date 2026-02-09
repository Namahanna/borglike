/**
 * Catch-Up Engine
 *
 * Batch-runs game steps to compensate for time lost when the browser tab was
 * backgrounded. Imported by instance-manager.ts.
 */

import { useEngineStateStore } from '@/stores/engine-state'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Gaps below this are handled inline in tick() -- no overlay */
export const SMALL_GAP_MS = 5_000
/** Maximum catch-up window (1 hour) */
export const MAX_CATCHUP_MS = 3_600_000
/** Target wall-clock time per batch (overlay doesn't need 60fps) */
const BATCH_TARGET_MS = 50
/** Starting ticks per batch, adapts dynamically */
const INITIAL_BATCH_SIZE = 200

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let skipRequested = false
let catchUpActive = false

/** MessageChannel-based yield — avoids setTimeout's 4ms minimum delay */
function yieldToBrowser(callback: () => void): void {
  const { port1, port2 } = new MessageChannel()
  port1.onmessage = () => {
    port1.close()
    callback()
  }
  port2.postMessage(null)
  port2.close()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatchUpSlot {
  slot: number
  tickRate: number
  /** Call to advance the game by one step. Returns false if the run ended. */
  step: () => boolean
  /** Called when the run dies during catch-up. Returns a new step() if auto-restart created a new run, or null. */
  onDeath: () => (() => boolean) | null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isCatchUpActive(): boolean {
  return catchUpActive
}

export function skipCatchUp(): void {
  skipRequested = true
}

/**
 * Run a full catch-up for all active slots.
 *
 * @param gapMs - The time gap to simulate (already capped by caller)
 * @param slots - Active slot descriptors with step/death callbacks
 * @param onFinished - Called when catch-up is done (caller restarts intervals, does final UI update)
 */
export async function runFullCatchUp(
  gapMs: number,
  slots: CatchUpSlot[],
  onFinished: (deferredSaves: Promise<void>[]) => void
): Promise<void> {
  if (catchUpActive) return
  catchUpActive = true
  skipRequested = false

  const engineState = useEngineStateStore()
  const cappedGap = Math.min(gapMs, MAX_CATCHUP_MS)

  // Calculate ticks per slot
  const slotWork = slots.map((s) => ({
    ...s,
    ticksTotal: Math.floor(cappedGap / s.tickRate),
    ticksDone: 0,
    done: false,
    currentStep: s.step,
  }))

  // Initialize store progress
  engineState.startCatchUp(
    slotWork.map((s) => ({ slot: s.slot, ticksTotal: s.ticksTotal })),
    cappedGap
  )

  const deferredSaves: Promise<void>[] = []
  let batchSize = INITIAL_BATCH_SIZE

  // Catch-up profiling
  const prof = {
    wallStart: performance.now(),
    totalComputeMs: 0,
    totalTickCount: 0,
    batchCount: 0,
    deathCount: 0,
    deathMs: 0,
    maxBatchMs: 0,
    maxBatchSize: 0,
    peakBatchSize: 0,
  }

  await new Promise<void>((resolve) => {
    function batch() {
      if (skipRequested) {
        // Mark all slots done
        for (const sw of slotWork) {
          if (!sw.done) {
            sw.done = true
            engineState.markSlotDone(sw.slot)
          }
        }
        resolve()
        return
      }

      const batchStart = performance.now()
      let batchTicks = 0

      // Round-robin: run batchSize ticks across all active slots
      for (const sw of slotWork) {
        if (sw.done) continue

        const ticksThisBatch = Math.min(batchSize, sw.ticksTotal - sw.ticksDone)
        for (let i = 0; i < ticksThisBatch; i++) {
          const alive = sw.currentStep()
          sw.ticksDone++
          batchTicks++

          if (!alive) {
            // Run died -- trigger death handling
            const deathStart = performance.now()
            engineState.recordSlotDeath(sw.slot)
            const newStep = sw.onDeath()
            prof.deathMs += performance.now() - deathStart
            prof.deathCount++
            if (newStep) {
              // Auto-restart created a new run, continue with remaining ticks
              sw.currentStep = newStep
            } else {
              // No restart -- this slot is finished
              sw.done = true
              engineState.markSlotDone(sw.slot)
              break
            }
          }

          if (sw.ticksDone >= sw.ticksTotal) {
            sw.done = true
            engineState.markSlotDone(sw.slot)
            break
          }
        }

        engineState.updateSlotProgress(sw.slot, sw.ticksDone)
      }

      const batchElapsed = performance.now() - batchStart
      prof.totalComputeMs += batchElapsed
      prof.totalTickCount += batchTicks
      prof.batchCount++
      if (batchElapsed > prof.maxBatchMs) prof.maxBatchMs = batchElapsed
      if (batchTicks > prof.maxBatchSize) prof.maxBatchSize = batchTicks
      if (batchSize > prof.peakBatchSize) prof.peakBatchSize = batchSize

      // Check if all done
      if (slotWork.every((s) => s.done)) {
        resolve()
        return
      }

      // Adaptive batch sizing
      if (batchElapsed < BATCH_TARGET_MS * 0.8) {
        batchSize = Math.ceil(batchSize * 1.5)
      } else if (batchElapsed > BATCH_TARGET_MS * 1.25) {
        batchSize = Math.max(10, Math.floor(batchSize * 0.7))
      }

      // Yield to browser via MessageChannel (~0.1ms vs setTimeout's ~4ms)
      yieldToBrowser(batch)
    }

    yieldToBrowser(batch)
  })

  // Log profiling summary
  const wallMs = performance.now() - prof.wallStart
  const yieldMs = wallMs - prof.totalComputeMs
  const msPerTick = prof.totalTickCount > 0 ? prof.totalComputeMs / prof.totalTickCount : 0
  console.log(
    `[catch-up] wall=${wallMs.toFixed(0)}ms compute=${prof.totalComputeMs.toFixed(0)}ms ` +
      `yield=${yieldMs.toFixed(0)}ms (${((yieldMs / wallMs) * 100).toFixed(0)}%) | ` +
      `ticks=${prof.totalTickCount} ms/tick=${msPerTick.toFixed(3)} | ` +
      `batches=${prof.batchCount} peakBatch=${prof.peakBatchSize} maxBatchMs=${prof.maxBatchMs.toFixed(1)} | ` +
      `deaths=${prof.deathCount} deathMs=${prof.deathMs.toFixed(0)}`
  )

  catchUpActive = false
  onFinished(deferredSaves)
}
