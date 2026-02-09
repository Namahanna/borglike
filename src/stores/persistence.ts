/**
 * Persistence Layer for Borglike
 *
 * Uses IndexedDB to persist game progress between sessions.
 * Handles serialization of Sets and automatic saving.
 */

import { openDB, type IDBPDatabase, type DBSchema } from 'idb'
import { useProgressionStore, type UpgradeState } from './progression'
import { watch } from 'vue'
import LZString from 'lz-string'
import type {
  Currency,
  UnlockState,
  GlobalStats,
  RunStats,
  BestiaryEntry,
  ArmoryEntry,
  SlotConfig,
  BotCapabilities,
} from '@/types/progression'
import { startingRaces } from '@game/data/races'
import { startingClasses } from '@game/data/classes'

// ============================================================================
// VERSIONING
// ============================================================================

/** Save format version — sourced from package.json via Vite define */
const SAVE_VERSION = __APP_VERSION__

// ============================================================================
// VALIDATION
// ============================================================================

/** Validation error with path and severity */
interface ValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

/** Result of save data validation */
interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  repaired: boolean
}

/**
 * Recursively check for NaN values in an object
 */
function checkForNaN(obj: unknown, path: string, errors: ValidationError[]): void {
  if (obj === null || obj === undefined) return

  if (typeof obj === 'number' && Number.isNaN(obj)) {
    errors.push({ path: path || 'root', message: 'NaN value detected', severity: 'error' })
    return
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => checkForNaN(item, `${path}[${i}]`, errors))
    return
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      checkForNaN(value, path ? `${path}.${key}` : key, errors)
    }
  }
}

/**
 * Validate progression data structure and values
 * Auto-repairs obvious issues where safe (negative values, etc.)
 */
function validateProgressionData(data: ProgressionData): ValidationResult {
  const errors: ValidationError[] = []
  let repaired = false

  // Check for NaN values recursively
  checkForNaN(data, '', errors)

  // Validate required fields
  if (!data.version) {
    errors.push({ path: 'version', message: 'Missing version', severity: 'warning' })
    data.version = SAVE_VERSION
    repaired = true
  }

  if (!data.currency) {
    errors.push({ path: 'currency', message: 'Missing currency object', severity: 'error' })
  } else {
    // Auto-repair negative values
    if (typeof data.currency.essence === 'number' && data.currency.essence < 0) {
      errors.push({
        path: 'currency.essence',
        message: 'Negative essence repaired',
        severity: 'warning',
      })
      data.currency.essence = 0
      repaired = true
    }
    if (typeof data.currency.artifacts === 'number' && data.currency.artifacts < 0) {
      errors.push({
        path: 'currency.artifacts',
        message: 'Negative artifacts repaired',
        severity: 'warning',
      })
      data.currency.artifacts = 0
      repaired = true
    }
  }

  // Validate unlocks structure
  if (!data.unlocks) {
    errors.push({ path: 'unlocks', message: 'Missing unlocks object', severity: 'error' })
  } else {
    if (!Array.isArray(data.unlocks.races)) {
      errors.push({ path: 'unlocks.races', message: 'Invalid races unlock', severity: 'error' })
    }
    if (!Array.isArray(data.unlocks.classes)) {
      errors.push({ path: 'unlocks.classes', message: 'Invalid classes unlock', severity: 'error' })
    }
  }

  // Auto-repair negative prestige level
  if (typeof data.prestigeLevel === 'number' && data.prestigeLevel < 0) {
    errors.push({
      path: 'prestigeLevel',
      message: 'Negative prestige level repaired',
      severity: 'warning',
    })
    data.prestigeLevel = 0
    repaired = true
  }

  // Auto-repair negative lifetime essence
  if (typeof data.lifetimeEssence === 'number' && data.lifetimeEssence < 0) {
    errors.push({
      path: 'lifetimeEssence',
      message: 'Negative lifetime essence repaired',
      severity: 'warning',
    })
    data.lifetimeEssence = 0
    repaired = true
  }

  return {
    valid: errors.filter((e) => e.severity === 'error').length === 0,
    errors,
    repaired,
  }
}

// ============================================================================
// COMPRESSION
// ============================================================================

/** Marker prefix for compressed data in localStorage */
const COMPRESSION_MARKER = 'LZ:'

/** Export format magic header */
const EXPORT_MAGIC_V2 = 'BORGLIKE_V2_'

/**
 * Compress progression data for localStorage storage
 */
function compressForStorage(data: ProgressionData): string {
  const json = JSON.stringify(data)
  return COMPRESSION_MARKER + LZString.compressToUTF16(json)
}

/**
 * Decompress data from localStorage, handling both compressed and uncompressed formats
 */
function decompressFromStorage(stored: string): ProgressionData {
  // Handle compressed format
  if (stored.startsWith(COMPRESSION_MARKER)) {
    const compressed = stored.slice(COMPRESSION_MARKER.length)
    const json = LZString.decompressFromUTF16(compressed)
    if (!json) throw new Error('Failed to decompress localStorage backup')
    return JSON.parse(json) as ProgressionData
  }

  // Handle raw JSON format (v1 backward compatibility)
  return JSON.parse(stored) as ProgressionData
}

// ============================================================================
// DATABASE SCHEMA
// ============================================================================

/** Serializable version of UnlockState (Sets converted to arrays) */
interface SerializedUnlockState {
  races: string[]
  classes: string[]
  runSlots: number
  upgrades: string[]
  boosters: string[]
}

/** Serializable version of AchievementState */
interface SerializedAchievementState {
  unlocked: string[]
  collected: string[]
  progress: Record<string, number>
  // Note: newUnlocks is intentionally NOT persisted - it's session-only state
  // The indicator should only show for achievements earned in the current session
}

/** Serializable version of RunLoadout */
interface SerializedRunLoadout {
  boosters: [string | null, string | null]
}

/** Full progression data for storage */
interface ProgressionData {
  version: string
  currency: Currency
  unlocks: SerializedUnlockState
  globalStats: GlobalStats
  upgradeLevels: UpgradeState
  prestigeLevel: number
  lifetimeEssence: number
  totalVictories: number
  activeLoadout?: SerializedRunLoadout
  bestiary?: Record<string, BestiaryEntry>
  itemArmory?: Record<string, ArmoryEntry>
  slotConfigs?: SlotConfig[]
  botCapabilities?: BotCapabilities
  achievements?: SerializedAchievementState
  // Independent top runs storage (persisted separately from recent history)
  topRunsByDepth?: RunStats[]
  topRunsByEssence?: RunStats[]
  topRunsByKills?: RunStats[]
  // Win history - all victories
  winHistory?: RunStats[]
}

/** Backup slot identifiers */
type BackupSlotId = 'recent' | 'hourly' | 'manual'

/** Stored backup data */
interface BackupData {
  data: ProgressionData
  timestamp: number
}

/** Public backup info for UI */
export interface BackupSlot {
  id: BackupSlotId
  data: ProgressionData
  timestamp: number
}

/** Database schema for type safety */
interface BorglikeDB extends DBSchema {
  progression: {
    key: 'main'
    value: ProgressionData
  }
  runHistory: {
    key: number
    value: RunStats
    indexes: { 'by-time': number }
  }
  backups: {
    key: BackupSlotId
    value: BackupData
  }
}

const DB_NAME = 'borglike-progress'
const DB_VERSION = 2 // Bumped for backups store

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

let db: IDBPDatabase<BorglikeDB> | null = null

/**
 * Initialize the IndexedDB database
 */
export async function initDB(): Promise<IDBPDatabase<BorglikeDB>> {
  if (db) return db

  db = await openDB<BorglikeDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion) {
      // Create progression store
      if (!database.objectStoreNames.contains('progression')) {
        database.createObjectStore('progression')
      }

      // Create run history store with auto-increment
      if (!database.objectStoreNames.contains('runHistory')) {
        const runStore = database.createObjectStore('runHistory', {
          keyPath: undefined,
          autoIncrement: true,
        })
        runStore.createIndex('by-time', 'startTime')
      }

      // Version 2: Add backups store
      if (oldVersion < 2 && !database.objectStoreNames.contains('backups')) {
        database.createObjectStore('backups')
        console.info('[Persistence] Created backups store (DB v2)')
      }
    },
  })

  return db
}

/**
 * Close the database connection
 */
export function closeDB(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ============================================================================
// SERIALIZATION
// ============================================================================

/**
 * Convert Sets to arrays for JSON serialization
 */
function serializeUnlocks(unlocks: UnlockState): SerializedUnlockState {
  return {
    races: Array.from(unlocks.races),
    classes: Array.from(unlocks.classes),
    runSlots: unlocks.runSlots,
    upgrades: Array.from(unlocks.upgrades),
    boosters: Array.from(unlocks.boosters),
  }
}

/**
 * Convert arrays back to Sets after loading
 */
function deserializeUnlocks(data: SerializedUnlockState): UnlockState {
  return {
    races: new Set(data.races),
    classes: new Set(data.classes),
    runSlots: data.runSlots,
    upgrades: new Set(data.upgrades),
    boosters: new Set(data.boosters ?? []),
  }
}

/**
 * Convert AchievementState Sets to arrays for JSON serialization
 * Note: newUnlocks is intentionally NOT serialized - it's session-only state
 */
function serializeAchievements(state: {
  unlocked: Set<string>
  collected: Set<string>
  progress: Record<string, number>
  newUnlocks: Set<string>
}): SerializedAchievementState {
  return {
    unlocked: Array.from(state.unlocked),
    collected: Array.from(state.collected),
    progress: { ...state.progress },
  }
}

/**
 * Convert arrays back to Sets for AchievementState
 * Note: newUnlocks is always empty on restore - it's session-only state
 */
function deserializeAchievements(data: SerializedAchievementState): {
  unlocked: Set<string>
  collected: Set<string>
  progress: Record<string, number>
  newUnlocks: Set<string>
} {
  return {
    unlocked: new Set(data.unlocked),
    collected: new Set(data.collected ?? []),
    progress: data.progress ?? {},
    newUnlocks: new Set(), // Always start fresh - indicator is session-only
  }
}

// ============================================================================
// CENTRALIZED HELPERS
// ============================================================================

/**
 * Run migrations to ensure data integrity after loading
 * Imports starting races/classes from source of truth
 */
function runMigrations(): void {
  const progression = useProgressionStore()

  // Ensure all starting races are unlocked
  for (const race of startingRaces) {
    progression.unlocks.races.add(race.name)
  }

  // Ensure all starting classes are unlocked
  for (const cls of startingClasses) {
    progression.unlocks.classes.add(cls.name)
  }
}

/**
 * Serialize the current progression store state into a ProgressionData object
 * Single source of truth for all save/snapshot operations
 */
function serializeProgression(): ProgressionData {
  const progression = useProgressionStore()

  // Deep clone slotConfigs to strip Vue reactivity
  const serializedSlotConfigs = progression.slotConfigs.map((config) => ({
    race: config.race,
    class: config.class,
    personality: config.personality,
    boosters: [config.boosters[0], config.boosters[1]] as [string | null, string | null],
    toggles: { ...config.toggles },
    sweepLevelRange: { ...config.sweepLevelRange },
    surfLevelRange: config.surfLevelRange ? { ...config.surfLevelRange } : undefined,
    customPersonality: config.customPersonality ? { ...config.customPersonality } : undefined,
    activeSweepLevel: config.activeSweepLevel,
    activeSurfLevel: config.activeSurfLevel,
  }))

  // Deep clone bestiary to strip reactivity
  const serializedBestiary: Record<string, BestiaryEntry> = {}
  for (const [key, entry] of Object.entries(progression.bestiary)) {
    serializedBestiary[key] = {
      kills: entry.kills,
      firstKillTime: entry.firstKillTime,
      deaths: entry.deaths ?? 0,
      firstDeathTime: entry.firstDeathTime,
    }
  }

  // Deep clone item catalog to strip reactivity
  const serializedItemCatalog: Record<string, ArmoryEntry> = {}
  for (const [key, entry] of Object.entries(progression.itemArmory)) {
    serializedItemCatalog[key] = {
      firstFoundTime: entry.firstFoundTime,
      firstFoundDepth: entry.firstFoundDepth,
      isArtifact: entry.isArtifact,
    }
  }

  return {
    version: SAVE_VERSION,
    currency: { essence: progression.currency.essence, artifacts: progression.currency.artifacts },
    unlocks: serializeUnlocks(progression.unlocks),
    globalStats: { ...progression.globalStats },
    upgradeLevels: { ...progression.upgradeLevels },
    prestigeLevel: progression.prestigeLevel,
    lifetimeEssence: progression.lifetimeEssence,
    totalVictories: progression.totalVictories,
    activeLoadout: {
      boosters: [progression.activeLoadout.boosters[0], progression.activeLoadout.boosters[1]],
    },
    bestiary: serializedBestiary,
    itemArmory: serializedItemCatalog,
    slotConfigs: serializedSlotConfigs,
    botCapabilities: { ...progression.botCapabilities },
    achievements: serializeAchievements(progression.achievementState),
    // Independent top runs (persisted separately from recent history)
    topRunsByDepth: [...progression.topRunsByDepth],
    topRunsByEssence: [...progression.topRunsByEssence],
    topRunsByKills: [...progression.topRunsByKills],
    // Win history
    winHistory: [...progression.winHistory],
  }
}

/**
 * Restore progression store state from a ProgressionData object
 * Single source of truth for all load/restore operations
 */
function restoreProgressionFromData(data: ProgressionData): void {
  const progression = useProgressionStore()

  // Restore currency
  progression.currency.essence = data.currency.essence
  progression.currency.artifacts = data.currency.artifacts

  // Restore unlocks (deserialize Sets)
  const unlocks = deserializeUnlocks(data.unlocks)
  progression.unlocks.races = unlocks.races
  progression.unlocks.classes = unlocks.classes
  progression.unlocks.runSlots = unlocks.runSlots
  progression.unlocks.upgrades = unlocks.upgrades
  progression.unlocks.boosters = unlocks.boosters

  // Restore global stats
  Object.assign(progression.globalStats, data.globalStats)

  // Restore upgrade levels
  Object.assign(progression.upgradeLevels, data.upgradeLevels)

  // Restore prestige state
  progression.prestigeLevel = data.prestigeLevel ?? 0
  progression.lifetimeEssence = data.lifetimeEssence ?? 0
  progression.totalVictories = data.totalVictories ?? 0

  // Restore active loadout
  if (data.activeLoadout) {
    progression.activeLoadout.boosters = data.activeLoadout.boosters
  }

  // Restore bestiary (never resets, survives prestige)
  if (data.bestiary) {
    Object.assign(progression.bestiary, data.bestiary)
  }

  // Restore item catalog (never resets, survives prestige)
  if (data.itemArmory) {
    Object.assign(progression.itemArmory, data.itemArmory)
  }

  // Restore slot configs
  if (data.slotConfigs) {
    progression.slotConfigs.length = 0
    progression.slotConfigs.push(...data.slotConfigs)
  }

  // Restore global bot capabilities
  if (data.botCapabilities) {
    progression.botCapabilities = { ...data.botCapabilities }
  }

  // Restore achievements
  if (data.achievements) {
    const achievements = deserializeAchievements(data.achievements)
    progression.achievementState.unlocked = achievements.unlocked
    progression.achievementState.collected = achievements.collected
    progression.achievementState.progress = achievements.progress
    progression.achievementState.newUnlocks = achievements.newUnlocks
  }

  // Restore independent top runs
  if (data.topRunsByDepth) {
    progression.topRunsByDepth.length = 0
    progression.topRunsByDepth.push(...data.topRunsByDepth)
  }
  if (data.topRunsByEssence) {
    progression.topRunsByEssence.length = 0
    progression.topRunsByEssence.push(...data.topRunsByEssence)
  }
  if (data.topRunsByKills) {
    progression.topRunsByKills.length = 0
    progression.topRunsByKills.push(...data.topRunsByKills)
  }

  // Restore win history
  if (data.winHistory) {
    progression.winHistory.length = 0
    progression.winHistory.push(...data.winHistory)
  }

  // Run migrations to ensure data integrity
  runMigrations()
}

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

/**
 * Save current progression state to IndexedDB
 */
export async function saveProgression(): Promise<void> {
  const database = await initDB()
  const data = serializeProgression()
  // Deep clone to strip Vue reactivity proxies (IndexedDB uses structured clone which can't handle Proxies)
  const plainData = JSON.parse(JSON.stringify(data)) as ProgressionData
  await database.put('progression', plainData, 'main')
}

/**
 * Save a run to history
 */
export async function saveRun(run: RunStats): Promise<void> {
  const database = await initDB()
  await database.add('runHistory', run)
}

/**
 * Save all runs from the store (for bulk operations)
 */
export async function saveAllRuns(runs: RunStats[]): Promise<void> {
  const database = await initDB()
  const tx = database.transaction('runHistory', 'readwrite')

  for (const run of runs) {
    await tx.store.add(run)
  }

  await tx.done
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

/**
 * Load progression state from IndexedDB
 *
 * @returns true if data was loaded, false if no saved data exists
 */
export async function loadProgression(): Promise<boolean> {
  const database = await initDB()
  const data = await database.get('progression', 'main')

  if (!data) {
    return false
  }

  // Version mismatch — no migrations, just warn
  if (data.version !== SAVE_VERSION) {
    console.warn(
      `[Persistence] Save version mismatch: found ${data.version}, expected ${SAVE_VERSION}. Loading anyway.`
    )
  }

  // Validate save data
  const validation = validateProgressionData(data)
  if (!validation.valid) {
    console.error('[Persistence] Save validation failed:', validation.errors)
    // Continue anyway - we'll try to load what we can
  }
  if (validation.repaired) {
    console.warn(
      '[Persistence] Save data was repaired:',
      validation.errors.filter((e) => e.severity === 'warning')
    )
    // Save repaired data back
    const plainData = JSON.parse(JSON.stringify(data)) as ProgressionData
    await database.put('progression', plainData, 'main')
  }

  restoreProgressionFromData(data)
  return true
}

/**
 * Load run history from IndexedDB
 */
export async function loadRunHistory(): Promise<RunStats[]> {
  const database = await initDB()
  const runs = await database.getAllFromIndex('runHistory', 'by-time')
  // Sort by time descending (most recent first)
  return runs.reverse()
}

/**
 * Load run history into the store
 */
export async function loadRunHistoryIntoStore(): Promise<void> {
  const progression = useProgressionStore()
  const runs = await loadRunHistory()

  // Clear existing history and add loaded runs
  progression.runHistory.length = 0
  progression.runHistory.push(...runs.slice(0, 100)) // Keep only last 100
}

// ============================================================================
// AUTO-SAVE
// ============================================================================

let saveTimeout: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 500 // 500ms (reduced from 2000ms for faster persistence)
const BACKUP_KEY = 'borglike-backup'

// Cleanup handles for proper resource management
let autoSaveStopFn: (() => void) | null = null
let unloadHandlerFn: (() => void) | null = null

/**
 * Get a snapshot of the current progression state for backup
 */
function getProgressionSnapshot(): ProgressionData {
  return serializeProgression()
}

/**
 * Save with retry logic for reliability
 */
async function saveWithRetry(maxRetries = 3): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await saveProgression()
      return true
    } catch (err) {
      console.warn(`[Persistence] Save attempt ${i + 1} failed:`, err)
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 100 * (i + 1)))
      }
    }
  }
  console.error('[Persistence] All save attempts failed')
  return false
}

/**
 * Schedule a debounced save operation
 */
function scheduleSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(async () => {
    const success = await saveWithRetry()
    if (success) {
      console.debug('[Persistence] Auto-saved progression')
      // Check and save timed backups after successful save
      await checkAndSaveTimedBackups()
    }
  }, SAVE_DEBOUNCE_MS)
}

/**
 * Save immediately, bypassing debounce (for critical actions)
 */
export async function saveImmediately(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  await saveWithRetry()
}

/**
 * Set up beforeunload handler to save on page close
 *
 * Uses localStorage as a synchronous backup since IndexedDB is async
 * and may not complete before the page closes. Data is compressed to save space.
 *
 * @returns Cleanup function to remove the event listener
 */
export function setupUnloadHandler(): () => void {
  const handler = () => {
    // Cancel any pending debounced save
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }

    // Synchronous backup to localStorage with compression
    try {
      const data = getProgressionSnapshot()
      const compressed = compressForStorage(data)
      localStorage.setItem(BACKUP_KEY, compressed)
      console.debug('[Persistence] Compressed backup saved to localStorage on unload')
    } catch {
      // Fall back to uncompressed if compression fails
      try {
        const data = getProgressionSnapshot()
        localStorage.setItem(BACKUP_KEY, JSON.stringify(data))
        console.warn('[Persistence] Compression failed, saved uncompressed backup')
      } catch (fallbackErr) {
        console.error('[Persistence] Failed to save backup on unload:', fallbackErr)
      }
    }
  }

  window.addEventListener('beforeunload', handler)
  console.debug('[Persistence] Unload handler installed')

  // Return cleanup function
  const cleanup = () => {
    window.removeEventListener('beforeunload', handler)
    console.debug('[Persistence] Unload handler removed')
  }
  unloadHandlerFn = cleanup
  return cleanup
}

/**
 * Check for and restore localStorage backup if it's newer than IndexedDB data
 *
 * Called during initialization to recover data that may have been lost
 * due to the browser closing before IndexedDB could complete a save.
 * Handles both compressed and uncompressed backup formats.
 */
async function checkAndRestoreBackup(): Promise<void> {
  try {
    const stored = localStorage.getItem(BACKUP_KEY)
    if (!stored) return

    // Decompress/parse the backup (handles both formats)
    const backup = decompressFromStorage(stored)
    const progression = useProgressionStore()

    // Compare lifetime essence - backup is newer if it has more lifetime essence
    // (lifetime essence only increases, never decreases)
    const currentLifetime = progression.lifetimeEssence
    const backupLifetime = backup.lifetimeEssence ?? 0

    if (backupLifetime > currentLifetime) {
      console.info(
        `[Persistence] Restoring localStorage backup (${backupLifetime} > ${currentLifetime} lifetime essence)`
      )
      restoreProgressionFromData(backup)
      await saveProgression()
    }

    // Clear the backup after checking (we'll create a new one on next unload)
    localStorage.removeItem(BACKUP_KEY)
  } catch (err) {
    console.error('[Persistence] Failed to check/restore backup:', err)
    // Clear corrupted backup
    localStorage.removeItem(BACKUP_KEY)
  }
}

/**
 * Set up automatic saving when store state changes
 *
 * Call this once during app initialization, after the store is created.
 * Uses a single watcher with a composite getter for efficiency.
 *
 * @returns Stop function to unsubscribe the watcher
 */
export function setupAutoSave(): () => void {
  const progression = useProgressionStore()

  // Single watcher that tracks all saveable state
  // Returns a composite value that changes when any tracked state changes
  const stop = watch(
    () => ({
      essence: progression.currency.essence,
      artifacts: progression.currency.artifacts,
      totalRuns: progression.globalStats.totalRuns,
      totalEssence: progression.globalStats.totalEssence,
      maxDepthEver: progression.globalStats.maxDepthEver,
      prestigeLevel: progression.prestigeLevel,
      lifetimeEssence: progression.lifetimeEssence,
      totalVictories: progression.totalVictories,
      // JSON.stringify captures both keys and values for complex state
      upgrades: JSON.stringify(progression.upgradeLevels),
      bestiary: JSON.stringify(progression.bestiary),
      itemArmory: JSON.stringify(progression.itemArmory),
      slotConfigs: JSON.stringify(progression.slotConfigs),
      botCapabilities: JSON.stringify(progression.botCapabilities),
      // Track unlocks (races, classes, boosters, runSlots)
      races: Array.from(progression.unlocks.races).join(','),
      classes: Array.from(progression.unlocks.classes).join(','),
      boosters: Array.from(progression.unlocks.boosters).join(','),
      runSlots: progression.unlocks.runSlots,
      // Track active loadout
      activeLoadout: JSON.stringify(progression.activeLoadout),
      // Track run history length (saves happen via saveRun, but this catches manual changes)
      runHistoryLength: progression.runHistory.length,
      // Track independent top runs
      topRunsByDepthLength: progression.topRunsByDepth.length,
      topRunsByEssenceLength: progression.topRunsByEssence.length,
      topRunsByKillsLength: progression.topRunsByKills.length,
      // Track win history
      winHistoryLength: progression.winHistory.length,
      // Track achievements
      achievementsUnlocked: Array.from(progression.achievementState.unlocked).join(','),
      achievementsProgress: JSON.stringify(progression.achievementState.progress),
    }),
    scheduleSave,
    { deep: false }
  )

  autoSaveStopFn = stop
  console.debug('[Persistence] Auto-save enabled')
  return stop
}

// ============================================================================
// EXPORT/IMPORT
// ============================================================================

/**
 * Export all game data as a compressed string with magic header
 *
 * Format: BORGLIKE_V2_<base64-compressed-json>
 * Useful for manual backup or transferring progress.
 */
export async function exportDataAsJSON(): Promise<string> {
  const progression = useProgressionStore()
  const runs = await loadRunHistory()

  const exportData = {
    version: SAVE_VERSION,
    exportedAt: Date.now(),
    progression: {
      currency: { ...progression.currency },
      unlocks: serializeUnlocks(progression.unlocks),
      globalStats: { ...progression.globalStats },
      upgradeLevels: { ...progression.upgradeLevels },
      prestigeLevel: progression.prestigeLevel,
      lifetimeEssence: progression.lifetimeEssence,
      totalVictories: progression.totalVictories,
      activeLoadout: { boosters: [...progression.activeLoadout.boosters] },
      bestiary: { ...progression.bestiary },
      itemArmory: { ...progression.itemArmory },
      slotConfigs: progression.slotConfigs.map((config) => ({ ...config })),
      botCapabilities: { ...progression.botCapabilities },
      achievements: serializeAchievements(progression.achievementState),
      topRunsByDepth: [...progression.topRunsByDepth],
      topRunsByEssence: [...progression.topRunsByEssence],
      topRunsByKills: [...progression.topRunsByKills],
      winHistory: [...progression.winHistory],
    },
    runHistory: runs,
  }

  // Compress and add magic header
  const json = JSON.stringify(exportData)
  const compressed = LZString.compressToBase64(json)
  return EXPORT_MAGIC_V2 + compressed
}

/**
 * Import game data from compressed export string
 *
 * @param input - The exported data string (BORGLIKE_V2_ compressed format)
 * @returns true if import was successful
 */
export async function importDataFromJSON(input: string): Promise<boolean> {
  try {
    if (!input.startsWith(EXPORT_MAGIC_V2)) {
      console.error('[Persistence] Unrecognized export format')
      return false
    }

    const compressed = input.slice(EXPORT_MAGIC_V2.length)
    const json = LZString.decompressFromBase64(compressed)
    if (!json) {
      console.error('[Persistence] Failed to decompress import data')
      return false
    }

    const data: {
      version: string
      exportedAt?: number
      progression: {
        currency: Currency
        unlocks: SerializedUnlockState
        globalStats: GlobalStats
        upgradeLevels: UpgradeState
        prestigeLevel: number
        lifetimeEssence: number
        totalVictories: number
        activeLoadout?: SerializedRunLoadout
        bestiary?: Record<string, BestiaryEntry>
        itemArmory?: Record<string, ArmoryEntry>
        slotConfigs?: SlotConfig[]
        botCapabilities?: BotCapabilities
        achievements?: SerializedAchievementState
        topRunsByDepth?: RunStats[]
        topRunsByEssence?: RunStats[]
        topRunsByKills?: RunStats[]
        winHistory?: RunStats[]
      }
      runHistory?: RunStats[]
    } = JSON.parse(json)

    if (data.version !== SAVE_VERSION) {
      console.warn(
        `[Persistence] Import version mismatch: ${data.version} vs ${SAVE_VERSION}. Importing anyway.`
      )
    }

    // Convert export format to ProgressionData format
    const prog = data.progression
    const progressionData: ProgressionData = {
      version: SAVE_VERSION,
      currency: prog.currency,
      unlocks: prog.unlocks,
      globalStats: prog.globalStats,
      upgradeLevels: prog.upgradeLevels,
      prestigeLevel: prog.prestigeLevel,
      lifetimeEssence: prog.lifetimeEssence,
      totalVictories: prog.totalVictories,
      activeLoadout: prog.activeLoadout,
      bestiary: prog.bestiary,
      itemArmory: prog.itemArmory,
      slotConfigs: prog.slotConfigs,
      botCapabilities: prog.botCapabilities,
      achievements: prog.achievements,
      topRunsByDepth: prog.topRunsByDepth,
      topRunsByEssence: prog.topRunsByEssence,
      topRunsByKills: prog.topRunsByKills,
      winHistory: prog.winHistory,
    }

    // Validate imported data
    const validation = validateProgressionData(progressionData)
    if (!validation.valid) {
      console.error('[Persistence] Import validation failed:', validation.errors)
      return false
    }

    restoreProgressionFromData(progressionData)
    await saveProgression()

    // Import run history
    if (data.runHistory && Array.isArray(data.runHistory)) {
      const database = await initDB()
      await database.clear('runHistory')
      await saveAllRuns(data.runHistory)
      await loadRunHistoryIntoStore()
    }

    console.info('[Persistence] Import successful')
    return true
  } catch (error) {
    console.error('[Persistence] Import failed:', error)
    return false
  }
}

// ============================================================================
// RESET
// ============================================================================

/**
 * Clear all saved data (use with caution!)
 */
export async function clearAllData(): Promise<void> {
  const database = await initDB()
  await database.delete('progression', 'main')
  await database.clear('runHistory')
  // Also clear localStorage backup so it doesn't restore on next load
  localStorage.removeItem(BACKUP_KEY)
  console.warn('[Persistence] All saved data cleared')
}

// ============================================================================
// BACKUP ROTATION
// ============================================================================

/** Backup interval timers */
let lastRecentBackup = 0
let lastHourlyBackup = 0

/** Backup intervals in milliseconds */
const RECENT_BACKUP_INTERVAL = 5 * 60 * 1000 // 5 minutes
const HOURLY_BACKUP_INTERVAL = 60 * 60 * 1000 // 1 hour

/**
 * Save a backup to a specific slot
 */
async function saveBackupToSlot(slot: BackupSlotId): Promise<void> {
  const database = await initDB()
  const data = serializeProgression()
  const plainData = JSON.parse(JSON.stringify(data)) as ProgressionData

  await database.put(
    'backups',
    {
      data: plainData,
      timestamp: Date.now(),
    },
    slot
  )

  console.debug(`[Persistence] Backup saved to '${slot}' slot`)
}

/**
 * Check and save timed backups (called during auto-save)
 */
async function checkAndSaveTimedBackups(): Promise<void> {
  const now = Date.now()

  // Recent backup (every 5 minutes)
  if (now - lastRecentBackup >= RECENT_BACKUP_INTERVAL) {
    await saveBackupToSlot('recent')
    lastRecentBackup = now
  }

  // Hourly backup
  if (now - lastHourlyBackup >= HOURLY_BACKUP_INTERVAL) {
    await saveBackupToSlot('hourly')
    lastHourlyBackup = now
  }
}

/**
 * Save a manual backup (call on prestige/victory events)
 */
export async function saveManualBackup(): Promise<void> {
  await saveBackupToSlot('manual')
  console.info('[Persistence] Manual backup saved')
}

/**
 * List all available backups
 */
export async function listBackups(): Promise<BackupSlot[]> {
  const database = await initDB()
  const backups: BackupSlot[] = []

  for (const id of ['recent', 'hourly', 'manual'] as const) {
    const backup = await database.get('backups', id)
    if (backup) {
      backups.push({ id, ...backup })
    }
  }

  // Sort by timestamp descending (most recent first)
  return backups.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Restore game state from a backup slot
 */
export async function restoreFromBackup(slot: BackupSlotId): Promise<boolean> {
  const database = await initDB()
  const backup = await database.get('backups', slot)

  if (!backup) {
    console.error(`[Persistence] No backup found in '${slot}' slot`)
    return false
  }

  // Validate backup data
  const validation = validateProgressionData(backup.data)
  if (!validation.valid) {
    console.error('[Persistence] Backup validation failed:', validation.errors)
    return false
  }

  restoreProgressionFromData(backup.data)
  await saveProgression()

  console.info(
    `[Persistence] Restored from '${slot}' backup (${new Date(backup.timestamp).toLocaleString()})`
  )
  return true
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up persistence resources (watchers, event listeners, DB connection)
 *
 * Call this when shutting down the app or during testing.
 */
export function cleanupPersistence(): void {
  // Stop auto-save watcher
  if (autoSaveStopFn) {
    autoSaveStopFn()
    autoSaveStopFn = null
    console.debug('[Persistence] Auto-save watcher stopped')
  }

  // Remove unload handler
  if (unloadHandlerFn) {
    unloadHandlerFn()
    unloadHandlerFn = null
  }

  // Clear any pending save timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }

  // Close database connection
  closeDB()
  console.debug('[Persistence] Cleanup complete')
}

// ============================================================================
// INITIALIZATION HELPER
// ============================================================================

/**
 * Initialize persistence: load saved data and set up auto-save
 *
 * Call this once during app startup.
 */
export async function initPersistence(): Promise<boolean> {
  await initDB()
  const hadData = await loadProgression()
  // Always try to load run history (might exist independently)
  await loadRunHistoryIntoStore()
  // Check for localStorage backup and restore if newer
  await checkAndRestoreBackup()
  // Set up auto-save and unload handler
  setupAutoSave()
  setupUnloadHandler()
  return hadData
}
