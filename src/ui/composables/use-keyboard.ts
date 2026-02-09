import { onMounted, onUnmounted } from 'vue'
import { useRunsStore } from '@/stores/runs'
import { useProgressionStore } from '@/stores/progression'
import { useEngineStateStore } from '@/stores/engine-state'
import { togglePause } from '@/engine/instance-manager'

/**
 * Keyboard shortcuts for game management:
 * - 1-4: Focus/expand slot (if unlocked)
 * - Escape: Return to grid view
 * - T: Toggle turbo on focused run
 * - Space: Start run in first empty slot
 */
export function useKeyboard() {
  const runs = useRunsStore()
  const progression = useProgressionStore()
  const engineState = useEngineStateStore()

  function handleKeyDown(event: KeyboardEvent) {
    // Ignore if typing in an input
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return
    }

    const key = event.key

    // Number keys 1-4: Focus slot
    if (key >= '1' && key <= '4') {
      const slot = parseInt(key) - 1
      if (slot < progression.maxRunSlots) {
        runs.toggleFocus(slot)
      }
      event.preventDefault()
      return
    }

    // Escape: Return to grid view
    if (key === 'Escape') {
      if (runs.focusedSlot !== null) {
        runs.clearFocus()
        event.preventDefault()
      }
      return
    }

    // T: Toggle turbo on focused run
    if (key === 't' || key === 'T') {
      if (runs.focusedSlot !== null) {
        const run = runs.getRunBySlot(runs.focusedSlot)
        if (run) {
          runs.toggleTurbo(run.id)
          event.preventDefault()
        }
      }
      return
    }

    // G: Return to grid (same as Escape)
    if (key === 'g' || key === 'G') {
      if (runs.focusedSlot !== null) {
        runs.clearFocus()
        event.preventDefault()
      }
      return
    }

    // P: Toggle pause
    if (key === 'p' || key === 'P') {
      if (!engineState.isCatchingUp) {
        togglePause()
        event.preventDefault()
      }
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}
