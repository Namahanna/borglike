/**
 * Dynamic Browser Title
 *
 * Updates the browser tab title based on game state.
 * Shows: run status, depth, essence count
 */

import { computed } from 'vue'
import { useTitle } from '@vueuse/core'
import { useRunsStore } from '@/stores/runs'
import { useProgressionStore } from '@/stores/progression'

const BASE_TITLE = 'Borglike'

export function useGameTitle() {
  const runs = useRunsStore()
  const progression = useProgressionStore()

  const dynamicTitle = computed(() => {
    const essence = progression.currency.essence
    const essenceStr = formatCompact(essence)

    // Check for focused run first
    const focused = runs.focusedRun
    if (focused) {
      const status = focused.state === 'dead' ? '☠' : ''
      return `${status}D${focused.depth} ${focused.config.class} | ${essenceStr}⬡ - ${BASE_TITLE}`
    }

    // Check for any active runs
    const activeRuns = runs.activeRuns.filter((r) => r.state === 'running')
    if (activeRuns.length > 0) {
      // Show highest depth among active runs
      const maxDepth = Math.max(...activeRuns.map((r) => r.depth))
      const runCount = activeRuns.length
      const runsLabel = runCount > 1 ? `${runCount} runs` : '1 run'
      return `D${maxDepth} (${runsLabel}) | ${essenceStr}⬡ - ${BASE_TITLE}`
    }

    // Check for dead runs awaiting dismissal
    const deadRuns = runs.activeRuns.filter((r) => r.state === 'dead')
    if (deadRuns.length > 0) {
      return `☠ ${deadRuns.length} ended | ${essenceStr}⬡ - ${BASE_TITLE}`
    }

    // No active runs - just show essence
    if (essence > 0) {
      return `${essenceStr}⬡ - ${BASE_TITLE}`
    }

    return BASE_TITLE
  })

  // Use VueUse's useTitle to reactively update document.title
  useTitle(dynamicTitle)

  return { dynamicTitle }
}

/**
 * Format large numbers compactly: 1234 -> 1.2k, 1234567 -> 1.2M
 */
function formatCompact(n: number): string {
  if (n < 1000) return n.toString()
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B'
}
