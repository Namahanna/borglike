/**
 * useKillHoldButton - Composable for hold-to-confirm kill button
 *
 * Provides smooth RAF-based progress animation for hold-to-kill pattern.
 */

import { ref, onUnmounted } from 'vue'

interface UseKillHoldOptions {
  /** How long to hold before triggering (ms) */
  duration?: number
  /** Callback when hold completes */
  onComplete: () => void
}

export function useKillHoldButton(options: UseKillHoldOptions) {
  const { duration = 1000, onComplete } = options

  const progress = ref(0)
  let holdStart: number | null = null
  let rafId: number | null = null

  function updateProgress() {
    if (holdStart === null) return

    const elapsed = Date.now() - holdStart
    progress.value = Math.min(100, (elapsed / duration) * 100)

    if (elapsed >= duration) {
      onComplete()
      cancel()
    } else {
      rafId = requestAnimationFrame(updateProgress)
    }
  }

  function start() {
    holdStart = Date.now()
    rafId = requestAnimationFrame(updateProgress)
  }

  function cancel() {
    holdStart = null
    progress.value = 0
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  onUnmounted(() => {
    cancel()
  })

  return {
    progress,
    start,
    cancel,
  }
}
