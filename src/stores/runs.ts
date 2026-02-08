import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RunRequest, AngbandEvent } from '../types'
import type { EquipSlot } from '@game/types'
import type { RunStats } from '@/types/progression'
import { useSettingsStore } from './settings'

/** Core character stats */
export interface DisplayStats {
  str: number
  int: number
  wis: number
  dex: number
  con: number
}

/** Combat-derived stats */
export interface DisplayCombat {
  armor: number
  accuracy: number
  evasion: number
  meleeDamage: number
  speed: number
}

/** Active status effect */
export interface DisplayStatusEffect {
  type: string
  turnsRemaining: number
  value: number
}

/** Resistance values (0-100, negative = vulnerability) */
export type DisplayResistances = Partial<Record<string, number>>

export interface ActiveRun {
  id: string
  slot: number
  config: RunRequest
  state: 'starting' | 'running' | 'dead'
  turbo: boolean
  startTime: number

  // Live stats
  depth: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  gold: number
  xp: number
  kills: number
  turns: number

  // Character info
  level: number

  // Core stats (STR, DEX, etc.)
  stats: DisplayStats

  // Combat stats (AC, evasion, damage, speed)
  combat: DisplayCombat

  // Resistances (fire, cold, poison, etc.)
  resistances: DisplayResistances

  // Active status effects (heroism, speed, etc.)
  statusEffects: DisplayStatusEffect[]

  // Equipment & inventory
  equipment: Partial<Record<EquipSlot, DisplayItem>>
  inventory: DisplayItem[]

  // Grid state (80x24)
  grid: GridCell[][]
  cursorX: number
  cursorY: number

  // Final run stats (set when run ends)
  finalStats?: RunStats

  // AI introspection (minimal)
  botGoal?: string // e.g., "EXPLORE - 45% explored"
  depthBlocker?: string // e.g., "Need 3 healing potions (have 1)"
}

export interface GridCell {
  char: string
  color: number
}

export interface DisplayItem {
  id: string
  name: string
  char: string // ASCII display char: ), [, !, ?, etc.
  color: number // Hex color based on tier/artifact
  enchantment: number
  isArtifact: boolean
  tier: number
}


function createEmptyGrid(): GridCell[][] {
  return Array.from({ length: 24 }, () =>
    Array.from({ length: 80 }, () => ({ char: ' ', color: 0xffffff }))
  )
}

export const useRunsStore = defineStore('runs', () => {
  const runs = ref<Map<string, ActiveRun>>(new Map())
  const activeSlots = ref<(string | null)[]>([null, null, null, null])

  // Focus state: which slot is expanded to full view (null = grid view)
  const focusedSlot = ref<number | null>(null)

  const activeRuns = computed(() => Array.from(runs.value.values()))
  const runCount = computed(() => runs.value.size)
  const focusedRun = computed(() => {
    if (focusedSlot.value === null) return null
    return getRunBySlot(focusedSlot.value)
  })

  function createRun(slot: number, config: RunRequest): string {
    const id = `run-${Date.now()}-${slot}`
    const settings = useSettingsStore()

    const run: ActiveRun = {
      id,
      slot,
      config,
      state: 'starting',
      turbo: settings.settings.turboByDefault,
      startTime: Date.now(),
      depth: 0,
      hp: 0,
      maxHp: 0,
      mp: 0,
      maxMp: 0,
      gold: 0,
      xp: 0,
      kills: 0,
      turns: 0,
      level: 1,
      stats: { str: 10, int: 10, wis: 10, dex: 10, con: 10 },
      combat: { armor: 0, accuracy: 0, evasion: 0, meleeDamage: 0, speed: 100 },
      resistances: {},
      statusEffects: [],
      equipment: {},
      inventory: [],
      grid: createEmptyGrid(),
      cursorX: 0,
      cursorY: 0,
    }

    runs.value.set(id, run)
    activeSlots.value[slot] = id

    return id
  }

  function removeRun(id: string) {
    const run = runs.value.get(id)
    if (run) {
      activeSlots.value[run.slot] = null
      runs.value.delete(id)
    }
  }

  function getRun(id: string): ActiveRun | undefined {
    return runs.value.get(id)
  }

  function getRunBySlot(slot: number): ActiveRun | undefined {
    const id = activeSlots.value[slot]
    return id ? runs.value.get(id) : undefined
  }

  function handleEvent(runId: string, event: AngbandEvent) {
    const run = runs.value.get(runId)
    if (!run) return

    switch (event.type) {
      case 'depth':
        run.depth = event.level
        break
      case 'hp':
        run.hp = event.current
        run.maxHp = event.max
        break
      case 'mp':
        run.mp = event.current
        run.maxMp = event.max
        break
      case 'gold':
        run.gold = event.total
        break
      case 'xp':
        run.xp = event.current
        break
      case 'kill':
        run.kills++
        break
      case 'tick':
        run.turns = event.turn
        break
      case 'death':
        run.state = 'dead'
        break
    }
  }

  function updateCell(runId: string, row: number, col: number, char: string, color: number) {
    const run = runs.value.get(runId)
    if (!run) return
    if (row < 0 || row >= 24 || col < 0 || col >= 80) return
    const gridRow = run.grid[row]
    if (gridRow) {
      gridRow[col] = { char, color }
    }
  }

  function setCursor(runId: string, row: number, col: number) {
    const run = runs.value.get(runId)
    if (!run) return
    run.cursorX = col
    run.cursorY = row
  }

  function clearGrid(runId: string) {
    const run = runs.value.get(runId)
    if (!run) return
    run.grid = createEmptyGrid()
  }

  // Optimized: set entire grid at once (avoids 1920 individual reactive updates)
  function setGrid(runId: string, grid: GridCell[][], cursorX: number, cursorY: number) {
    const run = runs.value.get(runId)
    if (!run) return
    run.grid = grid
    run.cursorX = cursorX
    run.cursorY = cursorY
  }

  // Focus management
  function setFocusedSlot(slot: number | null) {
    focusedSlot.value = slot
  }

  function toggleFocus(slot: number) {
    if (focusedSlot.value === slot) {
      focusedSlot.value = null
    } else {
      focusedSlot.value = slot
    }
  }

  function clearFocus() {
    focusedSlot.value = null
  }

  // Toggle turbo mode for a run
  function toggleTurbo(runId: string) {
    const run = runs.value.get(runId)
    if (run) {
      run.turbo = !run.turbo
    }
  }

  // Set final run stats (called when run ends)
  function setRunStats(runId: string, stats: RunStats) {
    const run = runs.value.get(runId)
    if (run) {
      run.finalStats = stats
    }
  }

  return {
    runs,
    activeSlots,
    activeRuns,
    runCount,
    focusedSlot,
    focusedRun,
    createRun,
    removeRun,
    getRun,
    getRunBySlot,
    handleEvent,
    updateCell,
    setCursor,
    clearGrid,
    setGrid,
    setFocusedSlot,
    toggleFocus,
    clearFocus,
    toggleTurbo,
    setRunStats,
  }
})
