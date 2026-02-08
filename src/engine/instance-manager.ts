/**
 * Instance Manager
 *
 * Manages multiple concurrent game instances, connecting the game engine
 * to the UI stores.
 */

import { useRunsStore, type DisplayItem } from '@/stores/runs'
import { useProgressionStore } from '@/stores/progression'
import { useSettingsStore } from '@/stores/settings'
import { useFeedStore } from '@/stores/feed'
import { useEngineStateStore } from '@/stores/engine-state'
import {
  computeUpgradeBonuses,
  computeBoosterBonuses,
  createGameRunner,
  getTile,
  getDepthReadiness,
  type RunResult,
  type GameState,
  type BotPersonality,
  type Item,
  type BotState,
  type EquipSlot,
} from '@/game'
import { randomInt } from '@game/rng'
import { getRaceById, getClassById } from '@game/data'
import { handleRunCompletionSync } from '@/core/run-completion-service'
import {
  runFullCatchUp,
  skipCatchUp as skipCatchUpEngine,
  isCatchUpActive,
  SMALL_GAP_MS,
  MAX_CATCHUP_MS,
  type CatchUpSlot,
} from '@/engine/catch-up'
import type { RunRequest } from '@/types'
import type { MinionType } from '@/game'

interface GameInstance {
  runId: string
  slot: number
  runner: ReturnType<typeof createGameRunner>
  intervalId: number | null
  tickRate: number
}

const instances = new Map<string, GameInstance>()

// Track pending auto-restart timeouts by slot (to cancel on manual stop)
const autoRestartTimeouts = new Map<number, ReturnType<typeof setTimeout>>()

// Slots where the loadout editor is open — suppresses auto-restart
const configuringSlots = new Set<number>()

// Background / pause tracking
let lastTickTime = performance.now()
let hiddenAt: number | null = null

// Map race/class display names to IDs
const RACE_IDS: Record<string, string> = {
  Human: 'human',
  Elf: 'elf',
  Dwarf: 'dwarf',
  Hobbit: 'hobbit',
  Gnome: 'gnome',
  'Half-Elf': 'half_elf',
  'Half-Orc': 'half_orc',
  Dunadan: 'dunadan',
  'High-Elf': 'high_elf',
  Kobold: 'kobold',
  'Dark Elf': 'dark_elf',
  Troll: 'troll',
  Vampire: 'vampire',
  Spectre: 'spectre',
}

const CLASS_IDS: Record<string, string> = {
  Warrior: 'warrior',
  Mage: 'mage',
  Priest: 'priest',
  Rogue: 'rogue',
  Ranger: 'ranger',
  Paladin: 'paladin',
  Druid: 'druid',
  Blackguard: 'blackguard',
  Necromancer: 'necromancer',
  Berserker: 'berserker',
  Archmage: 'archmage',
}

// Item display character by type
const ITEM_CHARS: Record<string, string> = {
  weapon: ')',
  armor: '[',
  shield: ']',
  helm: '^',
  gloves: '{',
  boots: '}',
  ring: '=',
  amulet: '"',
  light: '*',
  potion: '!',
  scroll: '?',
}

// Item color by tier
const TIER_COLORS: Record<number, number> = {
  1: 0x94a3b8, // gray (common)
  2: 0x22c55e, // green (uncommon)
  3: 0x3b82f6, // blue (rare)
  4: 0xa855f7, // purple (epic)
}

// Artifact color
const ARTIFACT_COLOR = 0xf59e0b // amber

// Monster colors (matching Angband color names to hex)
const MONSTER_COLORS: Record<string, number> = {
  white: 0xffffff,
  red: 0xef4444,
  green: 0x22c55e,
  blue: 0x3b82f6,
  yellow: 0xeab308,
  orange: 0xf97316,
  purple: 0x8b5cf6,
  violet: 0xa78bfa,
  umber: 0x92400e,
  lightUmber: 0xd97706,
  slate: 0x64748b,
  lightDark: 0x374151,
  lightRed: 0xf87171,
  lightGreen: 0x4ade80,
  lightBlue: 0x60a5fa,
  lightPurple: 0xc084fc,
  lightSlate: 0x94a3b8,
  black: 0x1f2937,
}

// Minion display characters
const MINION_CHARS: Record<MinionType, string> = {
  wolf: 'C', // Canine
  skeleton: 's', // skeleton
  bear: 'q', // quadruped
}

// Minion colors (friendly tones to distinguish from hostile monsters)
const MINION_COLORS: Record<MinionType, number> = {
  wolf: 0x22c55e, // green (friendly)
  skeleton: 0x94a3b8, // slate gray
  bear: 0x92400e, // umber
}

/**
 * Convert a game Item to a DisplayItem for the UI
 */
function toDisplayItem(item: Item): DisplayItem {
  const isArtifact = item.artifact !== null
  return {
    id: item.id,
    name: item.artifact?.name ?? item.template.name,
    char: ITEM_CHARS[item.template.type] ?? '*',
    color: isArtifact ? ARTIFACT_COLOR : (TIER_COLORS[item.template.tier] ?? 0x94a3b8),
    enchantment: item.enchantment,
    isArtifact,
    tier: item.template.tier,
  }
}

/**
 * Start a new run in the given slot
 */
export function startRun(slot: number, config?: Partial<RunRequest>): string {
  const runs = useRunsStore()
  const progression = useProgressionStore()

  // Check if slot is available
  if (slot >= progression.maxRunSlots) {
    throw new Error(`Slot ${slot} is locked`)
  }

  // Check if slot already has a run
  const existingRun = runs.getRunBySlot(slot)
  if (existingRun && existingRun.state !== 'dead') {
    throw new Error(`Slot ${slot} already has an active run`)
  }

  // Remove dead run if exists
  if (existingRun) {
    runs.removeRun(existingRun.id)
  }

  // Get available races/classes from progression (random pool)
  const availableRaces = progression.availableRaces
  const availableClasses = progression.availableClasses

  // Create run config with defaults — resolve 'Random' to actual pick from pool
  const settings = useSettingsStore()
  const raceName =
    !config?.race || config.race === 'Random'
      ? availableRaces[randomInt(0, availableRaces.length - 1)] || 'Human'
      : config.race
  const className =
    !config?.class || config.class === 'Random'
      ? availableClasses[randomInt(0, availableClasses.length - 1)] || 'Warrior'
      : config.class
  const personality: BotPersonality =
    (config?.personality as BotPersonality) || settings.settings.defaultPersonality

  const runConfig: RunRequest = {
    race: raceName,
    class: className,
    personality,
  }

  // Create the run in the store
  const runId = runs.createRun(slot, runConfig)

  // Get upgrade bonuses and booster bonuses
  const bonuses = computeUpgradeBonuses(progression.upgradeLevels)
  const boosterIds = progression.getActiveBoosterIds()
  const boosterBonuses = computeBoosterBonuses(boosterIds)

  // Get bestiary data for knowledge bonuses
  const bestiary = progression.bestiary

  // Get max depth ever for merchant scaling
  const maxDepthEver = progression.globalStats.maxDepthEver

  // Get per-slot config and global bot capabilities
  const slotConfig = progression.getSlotConfig(slot)
  const globalCaps = progression.botCapabilities

  // Build effective capabilities with active levels (player can select lower levels)
  const activeSweep = Math.min(slotConfig.activeSweepLevel ?? globalCaps.sweep, globalCaps.sweep)
  const activeSurf = Math.min(slotConfig.activeSurfLevel ?? globalCaps.surf, globalCaps.surf)
  const effectiveCapabilities = {
    ...globalCaps,
    sweep: activeSweep,
    surf: activeSurf,
  }

  // Create the actual game runner
  const runner = createGameRunner({
    raceId: RACE_IDS[raceName] || 'human',
    classId: CLASS_IDS[className] || 'warrior',
    botPersonality: personality,
    upgradeBonuses: bonuses,
    boosterBonuses,
    boosterIds,
    bestiary,
    maxDepthEver,
    maxTurns: 0, // Unlimited
    // Per-slot bot training unlocks (uses active levels for sweep/surf)
    botCapabilities: effectiveCapabilities,
    botToggles: slotConfig.toggles,
    // Per-slot level ranges and custom personality
    sweepLevelRange: slotConfig.sweepLevelRange,
    surfLevelRange: slotConfig.surfLevelRange,
    botPersonalityConfig:
      slotConfig.personality === 'custom' ? slotConfig.customPersonality : undefined,
    depthGateOffset: slotConfig.depthGateOffset,
  })

  // Create instance
  const instance: GameInstance = {
    runId,
    slot,
    runner,
    intervalId: null,
    tickRate: 100,
  }

  instances.set(runId, instance)

  // Initialize run state from game
  const game = runner.getState()
  const botState = runner.getBotState()
  updateRunFromGame(runId, game, botState)
  renderGameToGrid(runId, game)

  // Mark as running
  const runData = runs.getRun(runId)
  if (runData) {
    runData.state = 'running'
  }

  // Start the game loop (unless paused or catching up)
  const engineState = useEngineStateStore()
  if (!engineState.isPaused && !isCatchUpActive()) {
    startGameLoop(runId)
  }

  return runId
}

/**
 * Stop a running game instance
 */
export function stopRun(runId: string): void {
  const instance = instances.get(runId)
  if (!instance) {
    instances.delete(runId)
    return
  }

  // Cancel any pending auto-restart timeout for this slot
  const pendingTimeout = autoRestartTimeouts.get(instance.slot)
  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    autoRestartTimeouts.delete(instance.slot)
  }

  if (instance.intervalId) {
    clearInterval(instance.intervalId)
    instance.intervalId = null
  }
  if (instance.runner) {
    instance.runner.stop()
  }
  instances.delete(runId)
}

/**
 * Kill a running game instance (awards essence like normal death)
 */
export function killRun(runId: string): void {
  const instance = instances.get(runId)
  if (!instance) return

  const runs = useRunsStore()
  const run = runs.getRun(runId)
  if (!run || run.state === 'dead') return

  // Stop the game loop
  if (instance.intervalId) {
    clearInterval(instance.intervalId)
    instance.intervalId = null
  }

  // Get the result and trigger normal end handling
  const result = instance.runner.getResult()
  void handleGameEnd(runId, result, run.config, run.slot)
}

/**
 * Update run store stats from game state
 */
function updateRunFromGame(runId: string, game: GameState, botState?: BotState): void {
  const runs = useRunsStore()

  runs.handleEvent(runId, { type: 'hp', current: game.character.hp, max: game.character.maxHp })
  runs.handleEvent(runId, { type: 'mp', current: game.character.mp, max: game.character.maxMp })
  runs.handleEvent(runId, { type: 'depth', level: game.character.depth })
  runs.handleEvent(runId, { type: 'gold', total: game.character.gold })
  runs.handleEvent(runId, { type: 'xp', current: game.character.xp })
  runs.handleEvent(runId, { type: 'tick', turn: game.turn })

  // Update kills from stats
  const run = runs.getRun(runId)
  if (run) {
    run.kills = game.stats.kills

    // Sync level
    run.level = game.character.level

    // Sync core stats (STR, DEX, etc.)
    run.stats = {
      str: game.character.stats.str,
      int: game.character.stats.int,
      wis: game.character.stats.wis,
      dex: game.character.stats.dex,
      con: game.character.stats.con,
    }

    // Sync combat stats
    run.combat = {
      armor: game.character.combat.armor,
      accuracy: game.character.combat.accuracy,
      evasion: game.character.combat.evasion,
      meleeDamage: game.character.combat.meleeDamage,
      speed: game.character.combat.speed,
    }

    // Sync resistances (only non-zero values)
    run.resistances = {}
    for (const [type, value] of Object.entries(game.character.resistances)) {
      if (value !== 0) {
        run.resistances[type] = value
      }
    }

    // Sync status effects
    run.statusEffects = game.character.statusEffects.map((effect) => ({
      type: effect.type,
      turnsRemaining: effect.turnsRemaining,
      value: effect.value,
    }))

    // Sync equipment
    run.equipment = {}
    for (const [slot, item] of Object.entries(game.character.equipment)) {
      if (item) {
        run.equipment[slot as EquipSlot] = toDisplayItem(item)
      }
    }

    // Sync inventory
    run.inventory = game.character.inventory.map(toDisplayItem)

    // AI introspection (minimal)
    if (botState?.currentGoal) {
      run.botGoal = `${botState.currentGoal.type} - ${botState.currentGoal.reason}`
    } else {
      run.botGoal = undefined
    }

    // Check depth blocker for next depth
    const nextDepth = game.character.depth + 1
    run.depthBlocker =
      getDepthReadiness(game.character, game.character.inventory, nextDepth) ?? undefined
  }
}

// Viewport dimensions
const VIEWPORT_WIDTH = 80
const VIEWPORT_HEIGHT = 24

/**
 * Calculate viewport offset to center on player
 */
function calculateViewport(
  playerX: number,
  playerY: number,
  levelWidth: number,
  levelHeight: number
): { offsetX: number; offsetY: number } {
  // Center viewport on player
  let offsetX = playerX - Math.floor(VIEWPORT_WIDTH / 2)
  let offsetY = playerY - Math.floor(VIEWPORT_HEIGHT / 2)

  // Clamp to level bounds
  offsetX = Math.max(0, Math.min(offsetX, levelWidth - VIEWPORT_WIDTH))
  offsetY = Math.max(0, Math.min(offsetY, levelHeight - VIEWPORT_HEIGHT))

  // Handle small levels
  if (levelWidth <= VIEWPORT_WIDTH) offsetX = 0
  if (levelHeight <= VIEWPORT_HEIGHT) offsetY = 0

  return { offsetX, offsetY }
}

// Grid cell type for local building
interface LocalGridCell {
  char: string
  color: number
}

// Create empty local grid (not reactive)
function createLocalGrid(): LocalGridCell[][] {
  const grid: LocalGridCell[][] = []
  for (let y = 0; y < VIEWPORT_HEIGHT; y++) {
    const row: LocalGridCell[] = []
    for (let x = 0; x < VIEWPORT_WIDTH; x++) {
      row.push({ char: ' ', color: 0xffffff })
    }
    grid.push(row)
  }
  return grid
}

// Set cell in local grid (bounds-checked)
function setLocalCell(
  grid: LocalGridCell[][],
  row: number,
  col: number,
  char: string,
  color: number
): void {
  if (row < 0 || row >= VIEWPORT_HEIGHT || col < 0 || col >= VIEWPORT_WIDTH) return
  const rowArray = grid[row]
  if (rowArray) rowArray[col] = { char, color }
}

/**
 * Render a collection of entities to the grid with common visibility and bounds checks.
 * Returns null from getDisplay to skip rendering an entity.
 */
function renderEntities<T>(
  grid: LocalGridCell[][],
  entities: Iterable<T>,
  level: GameState['currentLevel'],
  offsetX: number,
  offsetY: number,
  getPosition: (entity: T) => { x: number; y: number },
  getDisplay: (entity: T) => { char: string; color: number } | null
): void {
  for (const entity of entities) {
    const pos = getPosition(entity)
    const tile = getTile(level, pos.x, pos.y)
    if (!tile?.visible) continue

    const screenX = pos.x - offsetX
    const screenY = pos.y - offsetY
    if (screenX < 0 || screenX >= VIEWPORT_WIDTH || screenY < 0 || screenY >= VIEWPORT_HEIGHT)
      continue

    const display = getDisplay(entity)
    if (!display) continue

    setLocalCell(grid, screenY, screenX, display.char, display.color)
  }
}

/**
 * Render game state to the grid
 */
function renderGameToGrid(runId: string, game: GameState): void {
  const runs = useRunsStore()
  const level = game.currentLevel
  const playerPos = game.character.position

  // Calculate viewport centered on player
  const { offsetX, offsetY } = calculateViewport(
    playerPos.x,
    playerPos.y,
    level.width,
    level.height
  )

  // Build grid locally (not reactive - avoids 1920 individual store mutations)
  const grid = createLocalGrid()

  // Render tiles (only explored ones, with visibility)
  for (let screenY = 0; screenY < VIEWPORT_HEIGHT; screenY++) {
    for (let screenX = 0; screenX < VIEWPORT_WIDTH; screenX++) {
      const worldX = screenX + offsetX
      const worldY = screenY + offsetY

      const tile = getTile(level, worldX, worldY)
      if (!tile) continue

      // Skip unexplored tiles
      if (!tile.explored) continue

      // Get character and color based on tile type and visibility
      let char = ' '
      let color = 0x64748b // dim gray

      switch (tile.type) {
        case 'wall':
          char = '#'
          color = tile.visible ? 0x94a3b8 : 0x475569
          break
        case 'floor':
          char = '.'
          color = tile.visible ? 0x64748b : 0x334155
          break
        case 'door_closed':
          char = '+'
          color = tile.visible ? 0xf59e0b : 0x92400e
          break
        case 'door_open':
          char = '/'
          color = tile.visible ? 0xf59e0b : 0x92400e
          break
        case 'stairs_down':
          char = '>'
          color = tile.visible ? 0x06b6d4 : 0x0e7490
          break
        case 'stairs_up':
          char = '<'
          color = tile.visible ? 0x06b6d4 : 0x0e7490
          break
        // Town-related tiles
        case 'portal':
          char = 'O'
          color = tile.visible ? 0xa855f7 : 0x7e22ce // purple
          break
        case 'dungeon_entrance':
          char = '>'
          color = tile.visible ? 0x06b6d4 : 0x0e7490 // cyan (like stairs)
          break
        case 'healer':
          char = '.'
          color = tile.visible ? 0x64748b : 0x334155 // floor (healer NPC rendered separately)
          break
        // Town decorative tiles
        case 'cobblestone':
          char = ','
          color = tile.visible ? 0x78716c : 0x44403c // warm stone gray
          break
        case 'town_door':
          char = '+'
          color = tile.visible ? 0xd97706 : 0x92400e // amber (shop entrance)
          break
        case 'rubble':
          char = ':'
          color = tile.visible ? 0x57534e : 0x292524 // dark stone
          break
        case 'town_fountain':
          char = '~'
          color = tile.visible ? 0x38bdf8 : 0x0369a1 // sky blue water
          break
      }

      setLocalCell(grid, screenY, screenX, char, color)
    }
  }

  // Render fountains
  renderEntities(
    grid,
    game.fountains.values(),
    level,
    offsetX,
    offsetY,
    (f) => f.position,
    (f) => ({ char: f.usesRemaining > 0 ? '≈' : '~', color: f.template.color })
  )

  // Render altars
  renderEntities(
    grid,
    game.altars.values(),
    level,
    offsetX,
    offsetY,
    (a) => a.position,
    (a) => ({ char: '_', color: a.template.color })
  )

  // Render merchants
  renderEntities(
    grid,
    game.merchants,
    level,
    offsetX,
    offsetY,
    (m) => m.position,
    () => ({ char: 'P', color: 0xf59e0b }) // amber
  )

  // Render healer NPC (wrap single entity in array)
  if (game.healer) {
    renderEntities(
      grid,
      [game.healer],
      level,
      offsetX,
      offsetY,
      (h) => h.position,
      () => ({ char: 'H', color: 0x22c55e }) // green
    )
  }

  // Render revealed traps (filter in getDisplay)
  renderEntities(
    grid,
    game.traps.values(),
    level,
    offsetX,
    offsetY,
    (t) => t.position,
    (t) => (!t.revealed || t.triggered ? null : { char: '^', color: t.template.color })
  )

  // Render items
  renderEntities(
    grid,
    game.items,
    level,
    offsetX,
    offsetY,
    (i) => i.position,
    (item) => {
      if (item.goldValue) return { char: '$', color: 0xfbbf24 }
      if (item.template.type === 'potion') return { char: '!', color: 0x8b5cf6 }
      if (item.template.type === 'scroll') return { char: '?', color: 0xffffff }
      if (item.template.slot === 'weapon') return { char: ')', color: 0x64748b }
      if (item.template.slot === 'body') return { char: '[', color: 0x22c55e }
      return { char: '*', color: 0xf59e0b }
    }
  )

  // Render monsters
  renderEntities(
    grid,
    game.monsters,
    level,
    offsetX,
    offsetY,
    (m) => m.position,
    (m) => ({ char: m.template.char, color: MONSTER_COLORS[m.template.color] ?? 0xef4444 })
  )

  // Render minions
  renderEntities(
    grid,
    game.minions,
    level,
    offsetX,
    offsetY,
    (m) => m.position,
    (m) => ({ char: MINION_CHARS[m.type], color: MINION_COLORS[m.type] })
  )

  // Render player (convert world to screen coordinates)
  const playerScreenX = playerPos.x - offsetX
  const playerScreenY = playerPos.y - offsetY
  let cursorX = 0
  let cursorY = 0
  if (
    playerScreenX >= 0 &&
    playerScreenX < VIEWPORT_WIDTH &&
    playerScreenY >= 0 &&
    playerScreenY < VIEWPORT_HEIGHT
  ) {
    setLocalCell(grid, playerScreenY, playerScreenX, '@', 0x22c55e)
    cursorX = playerScreenX
    cursorY = playerScreenY
  }

  // Assign entire grid to store in one operation (triggers single reactive update)
  runs.setGrid(runId, grid, cursorX, cursorY)
}

/**
 * Start the game loop for a run
 */
function startGameLoop(runId: string): void {
  const instance = instances.get(runId)
  if (!instance) return

  const tick = () => {
    const now = performance.now()
    const runs = useRunsStore()
    const run = runs.getRun(runId)

    if (!run || run.state === 'dead') {
      stopRun(runId)
      return
    }

    // Check turbo mode for speed (apply turbo upgrade bonus)
    const progression = useProgressionStore()
    const bonuses = computeUpgradeBonuses(progression.upgradeLevels)
    const baseTurboTick = 50
    const turboTick = Math.max(5, Math.floor(baseTurboTick / (1 + bonuses.turboSpeedPercent / 100)))
    const newTickRate = run.turbo ? turboTick : 100
    if (instance.tickRate !== newTickRate) {
      instance.tickRate = newTickRate
      if (instance.intervalId) {
        clearInterval(instance.intervalId)
      }
      instance.intervalId = window.setInterval(tick, newTickRate) as unknown as number
      lastTickTime = now
      return
    }

    // Small-gap inline catch-up: if elapsed > threshold but no full catch-up active,
    // batch extra steps to compensate for brief throttling
    const elapsed = now - lastTickTime
    if (elapsed > instance.tickRate * 3 && !isCatchUpActive() && elapsed < SMALL_GAP_MS) {
      const missedTicks = Math.min(50, Math.floor(elapsed / instance.tickRate) - 1)
      for (let i = 0; i < missedTicks; i++) {
        if (!instance.runner.isActive()) break
        instance.runner.step()
      }
    }
    lastTickTime = now

    // Run one game step
    if (!instance.runner.isActive()) {
      // Game ended
      const result = instance.runner.getResult()
      void handleGameEnd(runId, result, run.config, run.slot)
      return
    }

    // Process turn
    instance.runner.step()
    const game = instance.runner.getState()
    const botState = instance.runner.getBotState()

    // Update UI
    updateRunFromGame(runId, game, botState)
    renderGameToGrid(runId, game)

    // Process new messages for feed
    const feed = useFeedStore()
    feed.processMessages(runId, run.slot, game.messages)
  }

  instance.intervalId = window.setInterval(tick, instance.tickRate) as unknown as number
}

/**
 * Handle game end (sync path) -- does everything except awaiting IndexedDB save.
 * Returns the deferred save promise for the caller to flush later.
 */
function handleGameEndSync(runId: string, result: RunResult, slot: number): Promise<void> {
  const runs = useRunsStore()
  const feed = useFeedStore()

  // Mark run as dead
  runs.handleEvent(runId, { type: 'death' })

  // Clear feed tracking for this run
  feed.clearRunTracking(runId)

  const { completion, savePromise } = handleRunCompletionSync(result)

  // Store the completion result for the UI (RunSummary component)
  const run = runs.getRun(runId)
  if (run) {
    runs.setRunStats(runId, completion.runStats)
  }

  // Stop the instance (clears interval, removes from map)
  stopRun(runId)

  // Record completion for catch-up overlay ticker
  if (isCatchUpActive()) {
    const engineState = useEngineStateStore()
    const char = result.game.character
    engineState.recordCompletion({
      slot,
      race: getRaceById(char.raceId)?.name ?? char.raceId,
      class: getClassById(char.classId)?.name ?? char.classId,
      depth: result.maxDepth,
      essence: completion.essenceEarned,
      victory: completion.isVictory,
    })
  } else {
    checkAutoRestart(slot)
  }

  return savePromise
}

/**
 * Handle game end (awaits persistence)
 */
async function handleGameEnd(
  runId: string,
  result: RunResult,
  _config: RunRequest,
  slot: number
): Promise<void> {
  const savePromise = handleGameEndSync(runId, result, slot)
  await savePromise
}

/**
 * Check if auto-restart is enabled and start a new run if so
 */
function checkAutoRestart(slot: number): void {
  const progression = useProgressionStore()
  const settings = useSettingsStore()

  const bonuses = computeUpgradeBonuses(progression.upgradeLevels)
  if (!bonuses.hasAutoRestart) return
  if (!settings.settings.autoRestart) return
  if (configuringSlots.has(slot)) return

  // Cancel any existing timeout for this slot (prevents duplicates)
  const existingTimeout = autoRestartTimeouts.get(slot)
  if (existingTimeout) {
    clearTimeout(existingTimeout)
  }

  // Load the saved slot config (includes race, class, personality, boosters)
  const slotConfig = progression.getSlotConfig(slot)

  const timeoutId = setTimeout(() => {
    // Clean up tracking when timeout executes
    autoRestartTimeouts.delete(slot)

    const runs = useRunsStore()
    const existingRun = runs.getRunBySlot(slot)
    if (existingRun && existingRun.state !== 'dead') return

    if (existingRun) {
      runs.removeRun(existingRun.id)
    }

    // Set active boosters from saved slot config
    progression.setActiveBooster(0, slotConfig.boosters[0])
    progression.setActiveBooster(1, slotConfig.boosters[1])

    startRun(slot, {
      race: slotConfig.race,
      class: slotConfig.class,
      personality: slotConfig.personality,
    })
  }, 1500)

  // Track the timeout so it can be cancelled if needed
  autoRestartTimeouts.set(slot, timeoutId)
}

/** Mark a slot as being configured (suppresses auto-restart) */
export function setSlotConfiguring(slot: number, configuring: boolean): void {
  if (configuring) {
    configuringSlots.add(slot)
    // Cancel any pending auto-restart for this slot
    const pending = autoRestartTimeouts.get(slot)
    if (pending) {
      clearTimeout(pending)
      autoRestartTimeouts.delete(slot)
    }
  } else {
    configuringSlots.delete(slot)
  }
}

/**
 * Get all active instances
 */
export function getActiveInstances(): string[] {
  return Array.from(instances.keys())
}

/**
 * Check if a slot has an active instance
 */
export function isSlotActive(slot: number): boolean {
  const runs = useRunsStore()
  const run = runs.getRunBySlot(slot)
  return run !== undefined && run.state !== 'dead'
}

// ============================================================================
// PAUSE SYSTEM
// ============================================================================

/** Clear all intervals without removing instances */
function clearAllIntervals(): void {
  for (const instance of instances.values()) {
    if (instance.intervalId) {
      clearInterval(instance.intervalId)
      instance.intervalId = null
    }
  }
}

/** Restart intervals for all active instances */
function restartAllIntervals(): void {
  for (const [runId] of instances) {
    const instance = instances.get(runId)
    if (instance && !instance.intervalId) {
      startGameLoop(runId)
    }
  }
}

export function pauseAllInstances(): void {
  const engineState = useEngineStateStore()
  clearAllIntervals()
  engineState.setPaused(true)
}

export function resumeAllInstances(): void {
  const engineState = useEngineStateStore()
  engineState.setPaused(false)
  lastTickTime = performance.now()
  restartAllIntervals()
}

export function togglePause(): void {
  const engineState = useEngineStateStore()
  if (engineState.isPaused) {
    resumeAllInstances()
  } else {
    pauseAllInstances()
  }
}

export { skipCatchUpEngine as skipCatchUp }

// ============================================================================
// CATCH-UP: create a run during catch-up (no game loop started)
// ============================================================================

/**
 * Create a new run for catch-up -- same as startRun but skips startGameLoop().
 * Returns the runner's step function or null if the slot can't be started.
 */
function createRunForCatchUp(
  slot: number
): { runId: string; runner: ReturnType<typeof createGameRunner> } | null {
  const runs = useRunsStore()
  const progression = useProgressionStore()
  const settings = useSettingsStore()

  if (slot >= progression.maxRunSlots) return null

  const existingRun = runs.getRunBySlot(slot)
  if (existingRun && existingRun.state !== 'dead') return null
  if (existingRun) runs.removeRun(existingRun.id)

  const slotConfig = progression.getSlotConfig(slot)
  const availRaces = progression.availableRaces
  const availClasses = progression.availableClasses
  const raceName =
    !slotConfig.race || slotConfig.race === 'Random'
      ? availRaces[randomInt(0, availRaces.length - 1)] || 'Human'
      : slotConfig.race
  const className =
    !slotConfig.class || slotConfig.class === 'Random'
      ? availClasses[randomInt(0, availClasses.length - 1)] || 'Warrior'
      : slotConfig.class
  const personality: BotPersonality =
    (slotConfig.personality as BotPersonality) || settings.settings.defaultPersonality

  // Set boosters from slot config
  progression.setActiveBooster(0, slotConfig.boosters[0])
  progression.setActiveBooster(1, slotConfig.boosters[1])

  const runConfig: RunRequest = { race: raceName, class: className, personality }
  const runId = runs.createRun(slot, runConfig)

  const bonuses = computeUpgradeBonuses(progression.upgradeLevels)
  const boosterIds = progression.getActiveBoosterIds()
  const boosterBonuses = computeBoosterBonuses(boosterIds)
  const bestiary = progression.bestiary
  const maxDepthEver = progression.globalStats.maxDepthEver
  const globalCaps = progression.botCapabilities
  const activeSweep = Math.min(slotConfig.activeSweepLevel ?? globalCaps.sweep, globalCaps.sweep)
  const activeSurf = Math.min(slotConfig.activeSurfLevel ?? globalCaps.surf, globalCaps.surf)
  const effectiveCapabilities = { ...globalCaps, sweep: activeSweep, surf: activeSurf }

  const runner = createGameRunner({
    raceId: RACE_IDS[raceName] || 'human',
    classId: CLASS_IDS[className] || 'warrior',
    botPersonality: personality,
    upgradeBonuses: bonuses,
    boosterBonuses,
    boosterIds,
    bestiary,
    maxDepthEver,
    maxTurns: 0,
    botCapabilities: effectiveCapabilities,
    botToggles: slotConfig.toggles,
    sweepLevelRange: slotConfig.sweepLevelRange,
    surfLevelRange: slotConfig.surfLevelRange,
    botPersonalityConfig:
      slotConfig.personality === 'custom' ? slotConfig.customPersonality : undefined,
    depthGateOffset: slotConfig.depthGateOffset,
  })

  const instance: GameInstance = { runId, slot, runner, intervalId: null, tickRate: 100 }
  instances.set(runId, instance)

  const game = runner.getState()
  const botState = runner.getBotState()
  updateRunFromGame(runId, game, botState)
  renderGameToGrid(runId, game)

  const runData = runs.getRun(runId)
  if (runData) runData.state = 'running'

  return { runId, runner }
}

// ============================================================================
// VISIBILITY CHANGE: detect background gaps and trigger catch-up
// ============================================================================

function handleVisibilityChange(): void {
  if (document.hidden) {
    hiddenAt = performance.now()
    return
  }

  // Tab became visible
  if (hiddenAt === null) return
  const now = performance.now()
  const gapMs = Math.min(now - hiddenAt, MAX_CATCHUP_MS)
  hiddenAt = null

  // Nothing to catch up if no instances exist
  if (instances.size === 0) return

  const engineState = useEngineStateStore()
  if (engineState.isPaused) return
  if (isCatchUpActive()) return

  if (gapMs < SMALL_GAP_MS) {
    // Small gap -- inline catch-up handled by tick() automatically
    lastTickTime = now
    return
  }

  // Large gap -- full catch-up with overlay
  void startLargeCatchUp(gapMs)
}

async function startLargeCatchUp(gapMs: number): Promise<void> {
  const progression = useProgressionStore()
  const settings = useSettingsStore()
  const deferredSaves: Promise<void>[] = []

  // Pause all intervals during catch-up
  clearAllIntervals()

  // Build slot descriptors
  const slots: CatchUpSlot[] = []
  for (const instance of instances.values()) {
    const slot = instance.slot
    let currentRunner = instance.runner
    let currentRunId = instance.runId

    slots.push({
      slot,
      tickRate: instance.tickRate,
      step: () => {
        if (!currentRunner.isActive()) return false
        currentRunner.step()
        return true
      },
      onDeath: () => {
        // Handle death synchronously, collect save promise
        const result = currentRunner.getResult()
        const runs = useRunsStore()
        const run = runs.getRun(currentRunId)
        if (run) {
          const saveP = handleGameEndSync(currentRunId, result, slot)
          deferredSaves.push(saveP)
        }

        // Check auto-restart
        const bonuses = computeUpgradeBonuses(progression.upgradeLevels)
        if (!bonuses.hasAutoRestart || !settings.settings.autoRestart) return null

        const newRun = createRunForCatchUp(slot)
        if (!newRun) return null

        currentRunner = newRun.runner
        currentRunId = newRun.runId

        // Update the instance map reference
        const inst = instances.get(newRun.runId)
        if (inst) inst.tickRate = instance.tickRate

        return () => {
          if (!currentRunner.isActive()) return false
          currentRunner.step()
          return true
        }
      },
    })
  }

  await runFullCatchUp(gapMs, slots, (catchUpSaves) => {
    deferredSaves.push(...catchUpSaves)
  })

  // Final UI update for all active instances
  for (const inst of instances.values()) {
    const game = inst.runner.getState()
    const botState = inst.runner.getBotState()
    updateRunFromGame(inst.runId, game, botState)
    renderGameToGrid(inst.runId, game)
  }

  // Flush deferred saves
  await Promise.allSettled(deferredSaves)

  const engineState = useEngineStateStore()
  engineState.endCatchUp()
  lastTickTime = performance.now()

  // Restart all intervals
  restartAllIntervals()
}

// Register visibility listener
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange)
}
