import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface SlotCatchUpProgress {
  slot: number
  ticksCompleted: number
  ticksTotal: number
  done: boolean
  deathsDuringCatchUp: number
}

export interface CatchUpCompletion {
  slot: number
  race: string
  class: string
  depth: number
  essence: number
  victory: boolean
}

export const useEngineStateStore = defineStore('engine-state', () => {
  const isPaused = ref(false)
  const isCatchingUp = ref(false)
  const catchUpProgress = ref<SlotCatchUpProgress[]>([])
  const catchUpTargetMs = ref(0)
  const catchUpCompletions = ref<CatchUpCompletion[]>([])

  const overallProgress = computed(() => {
    const entries = catchUpProgress.value
    if (entries.length === 0) return 0
    let completed = 0
    let total = 0
    for (const entry of entries) {
      completed += entry.ticksCompleted
      total += entry.ticksTotal
    }
    return total === 0 ? 1 : completed / total
  })

  function setPaused(value: boolean) {
    isPaused.value = value
  }

  function startCatchUp(slots: { slot: number; ticksTotal: number }[], targetMs: number) {
    catchUpTargetMs.value = targetMs
    catchUpProgress.value = slots.map((s) => ({
      slot: s.slot,
      ticksCompleted: 0,
      ticksTotal: s.ticksTotal,
      done: false,
      deathsDuringCatchUp: 0,
    }))
    isCatchingUp.value = true
  }

  function updateSlotProgress(slot: number, ticksCompleted: number) {
    const entry = catchUpProgress.value.find((e) => e.slot === slot)
    if (entry) entry.ticksCompleted = ticksCompleted
  }

  function recordSlotDeath(slot: number) {
    const entry = catchUpProgress.value.find((e) => e.slot === slot)
    if (entry) entry.deathsDuringCatchUp++
  }

  function recordCompletion(completion: CatchUpCompletion) {
    catchUpCompletions.value.push(completion)
  }

  function markSlotDone(slot: number) {
    const entry = catchUpProgress.value.find((e) => e.slot === slot)
    if (entry) {
      entry.done = true
      entry.ticksCompleted = entry.ticksTotal
    }
  }

  function endCatchUp() {
    isCatchingUp.value = false
    catchUpProgress.value = []
    catchUpTargetMs.value = 0
    catchUpCompletions.value = []
  }

  return {
    isPaused,
    isCatchingUp,
    catchUpProgress,
    catchUpTargetMs,
    catchUpCompletions,
    overallProgress,
    setPaused,
    startCatchUp,
    updateSlotProgress,
    recordSlotDeath,
    recordCompletion,
    markSlotDone,
    endCatchUp,
  }
})
