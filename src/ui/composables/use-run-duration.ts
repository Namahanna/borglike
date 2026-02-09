/**
 * Reactive Run Duration
 *
 * Uses useNow for auto-updating time display.
 * Updates every second for live run timers.
 */

import { computed, type Ref } from 'vue'
import { useNow } from '@vueuse/core'

/**
 * Create a reactive duration string that updates every second
 *
 * @param startTime - Ref or getter for the start timestamp
 * @param endTime - Optional ref/getter for end timestamp (for completed runs)
 * @returns Reactive formatted duration string (e.g., "5:23")
 */
export function useRunDuration(
  startTime: Ref<number> | (() => number),
  endTime?: Ref<number | undefined> | (() => number | undefined)
) {
  // Update every second
  const now = useNow({ interval: 1000 })

  const duration = computed(() => {
    const start = typeof startTime === 'function' ? startTime() : startTime.value
    const end = endTime ? (typeof endTime === 'function' ? endTime() : endTime.value) : undefined

    // Use end time if available (completed run), otherwise use current time
    const elapsed = (end ?? now.value.getTime()) - start
    return formatDuration(elapsed)
  })

  return duration
}

/**
 * Format milliseconds as mm:ss or h:mm:ss
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
