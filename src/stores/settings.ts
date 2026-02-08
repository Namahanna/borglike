import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/** Feed verbosity levels for filtering messages */
export type FeedVerbosity = 'minimal' | 'normal' | 'verbose' | 'all'

export type FontFamily =
  | 'jetbrains-mono'
  | 'fira-code'
  | 'source-code-pro'
  | 'ibm-plex-mono'
  | 'inconsolata'
  | 'roboto-mono'
  | 'space-mono'
  | 'system'

export interface FontOption {
  id: FontFamily
  label: string
  css: string
  googleFamily?: string
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'jetbrains-mono', label: 'JetBrains Mono', css: "'JetBrains Mono', monospace" },
  { id: 'fira-code', label: 'Fira Code', css: "'Fira Code', monospace", googleFamily: 'Fira+Code' },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    css: "'Source Code Pro', monospace",
    googleFamily: 'Source+Code+Pro',
  },
  {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    css: "'IBM Plex Mono', monospace",
    googleFamily: 'IBM+Plex+Mono',
  },
  { id: 'inconsolata', label: 'Inconsolata', css: "'Inconsolata', monospace", googleFamily: 'Inconsolata' },
  {
    id: 'roboto-mono',
    label: 'Roboto Mono',
    css: "'Roboto Mono', monospace",
    googleFamily: 'Roboto+Mono',
  },
  { id: 'space-mono', label: 'Space Mono', css: "'Space Mono', monospace", googleFamily: 'Space+Mono' },
  { id: 'system', label: 'System Mono', css: 'monospace' },
]

export interface GameSettings {
  // Display
  showGrid: boolean
  showMinimap: boolean
  animationSpeed: 'slow' | 'normal' | 'fast' | 'instant'
  fontSize: 'small' | 'medium' | 'large'
  fontFamily: FontFamily

  // Gameplay
  defaultPersonality: 'cautious' | 'aggressive' | 'greedy' | 'speedrunner'
  autoRestart: boolean
  turboByDefault: boolean

  // Feed
  feedVerbosity: FeedVerbosity
  feedShowTimestamps: boolean

  // Audio
  soundEnabled: boolean
  musicEnabled: boolean
  volume: number

  // Advanced
  showFPS: boolean
  cheatMode: boolean
}

/** Panel collapse states for the expanded run view */
export interface PanelStates {
  vitals: boolean
  stats: boolean
  combat: boolean
  resist: boolean
  status: boolean
  equipment: boolean
  consumables: boolean
  inventory: boolean
}

const DEFAULT_PANEL_STATES: PanelStates = {
  vitals: true,
  stats: true,
  combat: true,
  resist: false,
  status: true,
  equipment: true,
  consumables: true,
  inventory: true,
}

const DEFAULT_SETTINGS: GameSettings = {
  showGrid: true,
  showMinimap: true,
  animationSpeed: 'normal',
  fontSize: 'medium',
  fontFamily: 'jetbrains-mono',
  defaultPersonality: 'cautious',
  autoRestart: false,
  turboByDefault: true,
  feedVerbosity: 'normal',
  feedShowTimestamps: false,
  soundEnabled: true,
  musicEnabled: false,
  volume: 0.7,
  showFPS: false,
  cheatMode: false,
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<GameSettings>({ ...DEFAULT_SETTINGS })
  const panelStates = ref<PanelStates>({ ...DEFAULT_PANEL_STATES })

  // Load settings from localStorage on init
  function loadSettings() {
    try {
      const saved = localStorage.getItem('borglike-settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        settings.value = { ...DEFAULT_SETTINGS, ...parsed }
      }
    } catch (e) {
      console.warn('Failed to load settings:', e)
    }
  }

  // Load panel states from localStorage
  function loadPanelStates() {
    try {
      const saved = localStorage.getItem('borglike-panel-states')
      if (saved) {
        const parsed = JSON.parse(saved)
        panelStates.value = { ...DEFAULT_PANEL_STATES, ...parsed }
      }
    } catch (e) {
      console.warn('Failed to load panel states:', e)
    }
  }

  // Save settings to localStorage
  function saveSettings() {
    try {
      localStorage.setItem('borglike-settings', JSON.stringify(settings.value))
    } catch (e) {
      console.warn('Failed to save settings:', e)
    }
  }

  // Save panel states to localStorage
  function savePanelStates() {
    try {
      localStorage.setItem('borglike-panel-states', JSON.stringify(panelStates.value))
    } catch (e) {
      console.warn('Failed to save panel states:', e)
    }
  }

  // Update a single setting (watcher handles persistence)
  function updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    settings.value[key] = value
  }

  // Toggle a panel's expanded/collapsed state
  function togglePanel(panel: keyof PanelStates) {
    panelStates.value[panel] = !panelStates.value[panel]
  }

  // Reset to defaults (watcher handles persistence)
  function resetSettings() {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  // Apply font scale to :root CSS variable
  const FONT_SCALE_MAP: Record<GameSettings['fontSize'], number> = {
    small: 0.85,
    medium: 1,
    large: 1.2,
  }

  function applyFontScale() {
    document.documentElement.style.setProperty(
      '--font-scale',
      String(FONT_SCALE_MAP[settings.value.fontSize])
    )
  }

  // Track loaded Google Fonts to avoid duplicate <link> tags
  const loadedFonts = new Set<string>()

  function applyFontFamily() {
    const fontId = settings.value.fontFamily
    const option = FONT_OPTIONS.find((f) => f.id === fontId)
    if (!option) return

    // Lazy-load Google Font if needed
    if (option.googleFamily && !loadedFonts.has(option.googleFamily)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${option.googleFamily}:wght@400;700&display=swap`
      document.head.appendChild(link)
      loadedFonts.add(option.googleFamily)
    }

    document.documentElement.style.setProperty('--font-mono', option.css)
  }

  // Watch for changes and auto-save (single source of truth for persistence)
  watch(settings, saveSettings, { deep: true })
  watch(() => settings.value.fontSize, applyFontScale)
  watch(() => settings.value.fontFamily, applyFontFamily)
  watch(panelStates, savePanelStates, { deep: true })

  // Load on init
  loadSettings()
  loadPanelStates()
  applyFontScale()
  applyFontFamily()

  return {
    settings,
    panelStates,
    updateSetting,
    togglePanel,
    resetSettings,
    loadSettings,
    saveSettings,
  }
})
