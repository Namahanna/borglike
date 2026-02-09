<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSettingsStore, FONT_OPTIONS } from '@/stores/settings'
import { useProgressionStore } from '@/stores/progression'
import { clearData } from '@/ui/composables/use-persistence'
import { cleanupPersistence } from '@/stores/persistence'
import PanelFrame from '../common/PanelFrame.vue'

const emit = defineEmits<{
  close: []
}>()

const settingsStore = useSettingsStore()
const progression = useProgressionStore()

const appVersion = __APP_VERSION__
const activeTab = ref<'gameplay' | 'data'>('gameplay')

// Confirmation dialog state
const showResetConfirm = ref(false)
const showExportSuccess = ref(false)

// Tab definitions
const tabs = [
  { id: 'gameplay', label: 'Gameplay', icon: '🎮' },
  { id: 'data', label: 'Data', icon: '💾' },
] as const

// Stats for data tab
const totalEssence = computed(() => progression.globalStats.totalEssence)
const totalRuns = computed(() => progression.globalStats.totalRuns)

// Check if auto-restart upgrade is purchased
const hasAutoRestartUpgrade = computed(() => progression.getUpgradeLevel('auto_restart') > 0)

const fontSizeOptions = [
  { value: 'small' as const, label: 'Small' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'large' as const, label: 'Large' },
]

function handleExportData() {
  const data = {
    settings: settingsStore.settings,
    progression: {
      currency: progression.currency,
      unlocks: {
        races: Array.from(progression.unlocks.races),
        classes: Array.from(progression.unlocks.classes),
        runSlots: progression.unlocks.runSlots,
        upgrades: Array.from(progression.unlocks.upgrades),
      },
      upgradeLevels: progression.upgradeLevels,
      globalStats: progression.globalStats,
      prestigeLevel: progression.prestigeLevel,
      lifetimeEssence: progression.lifetimeEssence,
    },
    exportedAt: new Date().toISOString(),
    version: __APP_VERSION__,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `borglike-save-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)

  showExportSuccess.value = true
  setTimeout(() => {
    showExportSuccess.value = false
  }, 3000)
}

function handleResetProgress() {
  showResetConfirm.value = true
}

async function confirmReset() {
  // Stop auto-save and remove beforeunload handler FIRST,
  // otherwise unload re-saves current state to localStorage
  cleanupPersistence()
  // Clear IndexedDB (primary storage) and localStorage (backup)
  await clearData()
  localStorage.clear()
  window.location.reload()
}

function cancelReset() {
  showResetConfirm.value = false
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-header">
      <h2>
        Settings <span class="version-tag">v{{ appVersion }}</span>
      </h2>
      <button class="close-btn" @click="emit('close')">✕</button>
    </header>

    <!-- Tabs -->
    <nav class="settings-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <div class="settings-content">
      <!-- Gameplay Settings -->
      <div v-if="activeTab === 'gameplay'" class="settings-section">
        <PanelFrame class="setting-group">
          <h3>Display</h3>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Font Size</span>
              <span class="setting-desc">Scale all text in the UI</span>
            </div>
            <div class="font-size-picker">
              <button
                v-for="opt in fontSizeOptions"
                :key="opt.value"
                class="font-size-btn"
                :class="{ active: settingsStore.settings.fontSize === opt.value }"
                @click="settingsStore.updateSetting('fontSize', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Font</span>
              <span class="setting-desc">Monospace font for the entire UI</span>
            </div>
            <select
              :value="settingsStore.settings.fontFamily"
              class="setting-select"
              @change="
                settingsStore.updateSetting(
                  'fontFamily',
                  ($event.target as HTMLSelectElement).value as any
                )
              "
            >
              <option v-for="font in FONT_OPTIONS" :key="font.id" :value="font.id">
                {{ font.label }}
              </option>
            </select>
          </div>
        </PanelFrame>

        <PanelFrame class="setting-group">
          <h3>Run Settings</h3>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Turbo by Default</span>
              <span class="setting-desc">Start new runs in turbo mode</span>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settingsStore.settings.turboByDefault"
                @change="
                  settingsStore.updateSetting(
                    'turboByDefault',
                    ($event.target as HTMLInputElement).checked
                  )
                "
              />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-row" :class="{ locked: !hasAutoRestartUpgrade }">
            <div class="setting-info">
              <span class="setting-label">Auto-Restart</span>
              <span v-if="hasAutoRestartUpgrade" class="setting-desc"
                >Automatically start new run on death</span
              >
              <span v-else class="setting-desc locked-desc">Requires Auto Restart upgrade</span>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settingsStore.settings.autoRestart"
                :disabled="!hasAutoRestartUpgrade"
                @change="
                  settingsStore.updateSetting(
                    'autoRestart',
                    ($event.target as HTMLInputElement).checked
                  )
                "
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </PanelFrame>

        <PanelFrame class="setting-group">
          <h3>Feed</h3>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Verbosity</span>
              <span class="setting-desc">How much to show in the event feed</span>
            </div>
            <select
              :value="settingsStore.settings.feedVerbosity"
              class="setting-select"
              @change="
                settingsStore.updateSetting(
                  'feedVerbosity',
                  ($event.target as HTMLSelectElement).value as
                    | 'minimal'
                    | 'normal'
                    | 'verbose'
                    | 'all'
                )
              "
            >
              <option value="minimal">Minimal</option>
              <option value="normal">Normal</option>
              <option value="verbose">Verbose</option>
              <option value="all">All</option>
            </select>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Show Timestamps</span>
              <span class="setting-desc">Display time (hh:mm:ss) on events</span>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settingsStore.settings.feedShowTimestamps"
                @change="
                  settingsStore.updateSetting(
                    'feedShowTimestamps',
                    ($event.target as HTMLInputElement).checked
                  )
                "
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </PanelFrame>

        <PanelFrame class="setting-group">
          <h3>Advanced</h3>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Cheat Mode</span>
              <span class="setting-desc">Enable cheat tools (free essence, stat boosters)</span>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settingsStore.settings.cheatMode"
                @change="
                  settingsStore.updateSetting(
                    'cheatMode',
                    ($event.target as HTMLInputElement).checked
                  )
                "
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </PanelFrame>
      </div>

      <!-- Data Settings -->
      <div v-if="activeTab === 'data'" class="settings-section">
        <PanelFrame class="setting-group">
          <h3>Statistics</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Total Runs</span>
              <span class="stat-value">{{ totalRuns }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Total Essence</span>
              <span class="stat-value essence">{{ totalEssence.toLocaleString() }}</span>
            </div>
          </div>
        </PanelFrame>

        <PanelFrame class="setting-group">
          <h3>Save Data</h3>

          <div class="data-actions">
            <button class="data-btn" @click="handleExportData">
              <span class="btn-icon">📥</span>
              Export Save
            </button>
            <button class="data-btn">
              <span class="btn-icon">📤</span>
              Import Save
            </button>
          </div>

          <div v-if="showExportSuccess" class="export-success">Save exported successfully!</div>
        </PanelFrame>

        <PanelFrame class="setting-group danger">
          <h3>Danger Zone</h3>
          <p class="danger-warning">
            This will permanently delete all your progress, including upgrades, unlocks, and
            statistics.
          </p>
          <button class="reset-btn" @click="handleResetProgress">Reset All Progress</button>
        </PanelFrame>
      </div>
    </div>

    <!-- Reset Confirmation Modal -->
    <div v-if="showResetConfirm" class="modal-overlay" @click="cancelReset">
      <PanelFrame class="confirm-modal" @click.stop>
        <h3>Confirm Reset</h3>
        <p>Are you sure you want to reset ALL progress? This cannot be undone!</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="cancelReset">Cancel</button>
          <button class="modal-btn danger" @click="confirmReset">Yes, Reset Everything</button>
        </div>
      </PanelFrame>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  background: var(--elevated);
  border-bottom: 1px solid var(--border);
}

.settings-header h2 {
  font-size: var(--text-2xl);
  font-weight: bold;
  color: var(--text-primary);
  margin: 0;
}

.version-tag {
  font-size: var(--text-base);
  font-weight: normal;
  color: var(--text-dim);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--red);
  border-color: var(--red);
  color: white;
}

.settings-tabs {
  display: flex;
  background: var(--elevated);
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: rgba(99, 102, 241, 0.05);
}

.tab-btn.active {
  color: var(--indigo);
  border-bottom-color: var(--indigo);
}

.tab-icon {
  font-size: var(--text-lg);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.setting-group {
  padding: var(--space-4) !important;
}

.setting-group h3 {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 var(--space-4);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: var(--text-md);
  color: var(--text-primary);
}

.setting-desc {
  font-size: var(--text-base);
  color: var(--text-dim);
}

.setting-row.locked {
  opacity: 0.6;
}

.locked-desc {
  color: var(--amber);
}

.setting-select {
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-primary);
  cursor: pointer;
}

.setting-select:focus {
  outline: none;
  border-color: var(--indigo);
}

/* Font Size Picker */
.font-size-picker {
  display: flex;
  gap: 2px;
  background: var(--highlight);
  border-radius: var(--radius-md);
  padding: 2px;
}

.font-size-btn {
  padding: var(--space-1) var(--space-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.font-size-btn:hover {
  color: var(--text-primary);
}

.font-size-btn.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: var(--indigo);
  color: var(--indigo);
}

/* Toggle Switch */
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  transition: 0.3s;
}

.toggle-slider:before {
  position: absolute;
  content: '';
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background: var(--text-secondary);
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .toggle-slider {
  background: rgba(99, 102, 241, 0.2);
  border-color: var(--indigo);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(20px);
  background: var(--indigo);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.stat-item .stat-label {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
}

.stat-item .stat-value {
  font-size: var(--text-2xl);
  font-weight: bold;
  color: var(--text-primary);
}

.stat-item .stat-value.essence {
  color: var(--purple);
}

/* Data Actions */
.data-actions {
  display: flex;
  gap: var(--space-3);
}

.data-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.data-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.btn-icon {
  font-size: var(--text-lg);
}

.export-success {
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid var(--green);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--green);
  text-align: center;
}

/* Danger Zone */
.setting-group.danger {
  border-color: var(--red);
}

.setting-group.danger h3 {
  color: var(--red);
}

.danger-warning {
  font-size: var(--text-base);
  color: var(--text-secondary);
  margin: 0 0 var(--space-3);
  line-height: 1.4;
}

.reset-btn {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--red);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--red);
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: var(--red);
  color: white;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 18, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.confirm-modal {
  width: 100%;
  max-width: 400px;
  padding: var(--space-6) !important;
}

.confirm-modal h3 {
  font-size: var(--text-xl);
  color: var(--red);
  margin: 0 0 var(--space-3);
}

.confirm-modal p {
  font-size: var(--text-md);
  color: var(--text-secondary);
  margin: 0 0 var(--space-5);
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: var(--space-3);
}

.modal-btn {
  flex: 1;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn.cancel {
  background: var(--highlight);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.modal-btn.cancel:hover {
  background: var(--border);
  color: var(--text-primary);
}

.modal-btn.danger {
  background: var(--red);
  border: 1px solid var(--red);
  color: white;
}

.modal-btn.danger:hover {
  background: var(--red-hover);
}
</style>
