/**
 * Persistence Composable
 *
 * Integrates IndexedDB persistence with Pinia stores.
 * Uses the idb-based persistence module for robust storage.
 */

import {
  initPersistence as initPersistenceModule,
  saveProgression,
  saveImmediately as saveImmediatelyModule,
  exportDataAsJSON,
  importDataFromJSON,
  clearAllData,
  saveManualBackup,
  listBackups,
  restoreFromBackup,
  type BackupSlot,
} from '@/stores/persistence'

let initialized = false

/**
 * Initialize persistence and load saved data
 *
 * Should be called once during app startup and awaited before rendering.
 * Handles: loading from IndexedDB, checking localStorage backup, setting up auto-save and unload handler.
 */
export async function initPersistence(): Promise<boolean> {
  if (initialized) return true

  try {
    const hadData = await initPersistenceModule()
    initialized = true
    return hadData
  } catch (error) {
    console.error('Failed to initialize persistence:', error)
    return false
  }
}

/**
 * Force immediate save (for critical moments like prestige)
 */
export async function forceSave(): Promise<void> {
  try {
    await saveProgression()
  } catch (error) {
    console.error('Failed to force-save:', error)
  }
}

/**
 * Save immediately with retry logic, bypassing debounce
 */
export async function saveImmediately(): Promise<void> {
  await saveImmediatelyModule()
}

/**
 * Export all game data as JSON string
 */
export async function exportData(): Promise<string> {
  return exportDataAsJSON()
}

/**
 * Import game data from JSON string
 */
export async function importData(jsonString: string): Promise<boolean> {
  return importDataFromJSON(jsonString)
}

/**
 * Clear all saved data (use with caution!)
 */
export async function clearData(): Promise<void> {
  await clearAllData()
  console.warn('All saved data cleared')
}

/**
 * Create a manual backup (for prestige/victory events)
 */
export async function createManualBackup(): Promise<void> {
  await saveManualBackup()
}

/**
 * Get list of available backups
 */
export async function getBackups(): Promise<BackupSlot[]> {
  return listBackups()
}

/**
 * Restore from a backup slot
 */
export async function restoreBackup(slot: 'recent' | 'hourly' | 'manual'): Promise<boolean> {
  return restoreFromBackup(slot)
}

/**
 * Composable for components that need persistence utilities
 *
 * Note: Initialization is now handled by App.vue awaiting initPersistence().
 * Components can use this composable to access persistence utilities.
 */
export function usePersistence() {
  return {
    forceSave,
    saveImmediately,
    exportData,
    importData,
    clearData,
    createManualBackup,
    getBackups,
    restoreBackup,
    initialized: () => initialized,
  }
}

// Re-export types for consumers
export type { BackupSlot }
