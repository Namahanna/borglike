<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppHeader from './ui/components/layout/AppHeader.vue'
import AppFeed from './ui/components/layout/AppFeed.vue'
import Sidebar from './ui/components/Sidebar.vue'
import RunArea from './ui/components/RunArea.vue'
import SettingsPanel from './ui/components/settings/SettingsPanel.vue'
import RunHistoryModal from './ui/components/history/RunHistoryModal.vue'
import BestiaryModal from './ui/components/bestiary/BestiaryModal.vue'
import ItemArmoryModal from './ui/components/armory/ItemArmoryModal.vue'
import CodexModal from './ui/components/codex/CodexModal.vue'
import AchievementsModal from './ui/components/achievements/AchievementsModal.vue'
import HelpModal from './ui/components/help/HelpModal.vue'
import CatchUpOverlay from './ui/components/overlay/CatchUpOverlay.vue'
import { useEngineStateStore } from './stores/engine-state'
import { useProgressionStore } from './stores/progression'
import { useKeyboard } from './ui/composables/use-keyboard'
import { initPersistence } from './ui/composables/use-persistence'
import { useGameTitle } from './ui/composables/use-game-title'

// Loading state - block render until persistence loads
const isLoaded = ref(false)

// These composables must be called synchronously during setup (before any await)
// They register lifecycle hooks that need the active component instance
useKeyboard()
useGameTitle()
const engineState = useEngineStateStore()
const progression = useProgressionStore()

// Initialize persistence on mount
onMounted(async () => {
  // CRITICAL: Await persistence before allowing app to render
  // This prevents race conditions where components try to write before data loads
  await initPersistence()
  isLoaded.value = true

  // Show help on first launch
  if (progression.globalStats.totalRuns === 0) {
    showHelp.value = true
  }
})

// Modal state
const showSettings = ref(false)
const showRunHistory = ref(false)
const showBestiary = ref(false)
const showArmory = ref(false)
const showCodex = ref(false)
const showAchievements = ref(false)
const showHelp = ref(false)

function handleOpenSettings() {
  showSettings.value = true
}

function handleCloseSettings() {
  showSettings.value = false
}

function handleOpenRunHistory() {
  showRunHistory.value = true
}

function handleCloseRunHistory() {
  showRunHistory.value = false
}

function handleOpenBestiary() {
  showBestiary.value = true
}

function handleCloseBestiary() {
  showBestiary.value = false
}

function handleOpenArmory() {
  showArmory.value = true
}

function handleCloseArmory() {
  showArmory.value = false
}

function handleOpenCodex() {
  showCodex.value = true
}

function handleCloseCodex() {
  showCodex.value = false
}

function handleOpenAchievements() {
  showAchievements.value = true
}

function handleCloseAchievements() {
  showAchievements.value = false
}

function handleOpenHelp() {
  showHelp.value = true
}

function handleCloseHelp() {
  showHelp.value = false
}
</script>

<template>
  <!-- Loading screen while persistence initializes -->
  <div v-if="!isLoaded" class="loading-screen">
    <div class="loading-content">
      <div class="loading-title">Borglike</div>
      <div class="loading-text">Loading...</div>
    </div>
  </div>

  <!-- Main app (only renders after persistence is ready) -->
  <div v-else class="app-layout">
    <AppHeader
      class="header"
      @open-settings="handleOpenSettings"
      @open-help="handleOpenHelp"
      @open-run-history="handleOpenRunHistory"
      @open-bestiary="handleOpenBestiary"
      @open-armory="handleOpenArmory"
      @open-codex="handleOpenCodex"
      @open-achievements="handleOpenAchievements"
    />
    <main class="game">
      <RunArea />
    </main>
    <aside class="sidebar">
      <Sidebar />
    </aside>
    <AppFeed class="feed" />

    <!-- Settings Modal -->
    <Teleport to="body">
      <div v-if="showSettings" class="modal-overlay" @click="handleCloseSettings">
        <div class="modal-container" @click.stop>
          <SettingsPanel @close="handleCloseSettings" />
        </div>
      </div>
    </Teleport>

    <!-- Run History Modal -->
    <Teleport to="body">
      <div v-if="showRunHistory" class="modal-overlay" @click="handleCloseRunHistory">
        <div class="modal-container modal-lg" @click.stop>
          <RunHistoryModal @close="handleCloseRunHistory" />
        </div>
      </div>
    </Teleport>

    <!-- Bestiary Modal -->
    <Teleport to="body">
      <div v-if="showBestiary" class="modal-overlay" @click="handleCloseBestiary">
        <div class="modal-container modal-lg" @click.stop>
          <BestiaryModal @close="handleCloseBestiary" />
        </div>
      </div>
    </Teleport>

    <!-- Item Armory Modal -->
    <Teleport to="body">
      <div v-if="showArmory" class="modal-overlay" @click="handleCloseArmory">
        <div class="modal-container modal-lg" @click.stop>
          <ItemArmoryModal @close="handleCloseArmory" />
        </div>
      </div>
    </Teleport>

    <!-- Codex Modal -->
    <Teleport to="body">
      <div v-if="showCodex" class="modal-overlay" @click="handleCloseCodex">
        <div class="modal-container modal-lg" @click.stop>
          <CodexModal @close="handleCloseCodex" />
        </div>
      </div>
    </Teleport>

    <!-- Achievements Modal -->
    <Teleport to="body">
      <div v-if="showAchievements" class="modal-overlay" @click="handleCloseAchievements">
        <div class="modal-container modal-lg" @click.stop>
          <AchievementsModal @close="handleCloseAchievements" />
        </div>
      </div>
    </Teleport>

    <!-- Help Modal -->
    <Teleport to="body">
      <div v-if="showHelp" class="modal-overlay" @click="handleCloseHelp">
        <div class="modal-container" @click.stop>
          <HelpModal @close="handleCloseHelp" />
        </div>
      </div>
    </Teleport>

    <!-- Catch-Up Overlay -->
    <Teleport to="body">
      <CatchUpOverlay v-if="engineState.isCatchingUp" />
    </Teleport>
  </div>
</template>

<style scoped>
/* Loading screen */
.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--void);
}

.loading-content {
  text-align: center;
}

.loading-title {
  font-size: 2rem;
  font-weight: bold;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.loading-text {
  color: var(--text-secondary);
  font-size: 1rem;
}

.app-layout {
  display: grid;
  grid-template-rows: 48px 1fr 48px;
  grid-template-columns: 1fr 300px;
  grid-template-areas:
    'header  header'
    'game    sidebar'
    'feed    feed';
  height: 100vh;
  gap: 1px;
  background: var(--border);
}

.header {
  grid-area: header;
}

.game {
  grid-area: game;
  background: var(--void);
  overflow: hidden;
}

.sidebar {
  grid-area: sidebar;
  background: var(--panel);
  overflow-y: auto;
}

.feed {
  grid-area: feed;
}

/* Responsive: narrower screens */
@media (max-width: 1199px) {
  .app-layout {
    grid-template-columns: 1fr 260px;
  }
}

/* Mobile: hide sidebar */
@media (max-width: 768px) {
  .app-layout {
    grid-template-columns: 1fr;
    grid-template-areas:
      'header'
      'game'
      'feed';
  }

  .sidebar {
    display: none;
  }
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 18, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  margin: var(--space-5);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-container.modal-lg {
  max-width: 800px;
}
</style>
