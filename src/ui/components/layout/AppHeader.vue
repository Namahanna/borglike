<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import { useSettingsStore } from '@/stores/settings'
import { useEngineStateStore } from '@/stores/engine-state'
import { togglePause } from '@/engine/instance-manager'

const progression = useProgressionStore()
const settings = useSettingsStore()
const engineState = useEngineStateStore()

// Auto-restart state
const hasAutoRestartUpgrade = computed(() => progression.getUpgradeLevel('auto_restart') > 0)

function toggleAutoRestart() {
  if (!hasAutoRestartUpgrade.value) return
  settings.updateSetting('autoRestart', !settings.settings.autoRestart)
}

// Animation state - CSS transition handles the timing, we just toggle the class
const isAnimating = ref(false)
let animationTimeout: ReturnType<typeof setTimeout> | null = null

// Watch for essence gains and trigger animation
watch(
  () => progression.currency.essence,
  (newVal, oldVal) => {
    if (newVal > oldVal) {
      // Clear any existing timeout to allow rapid gains
      if (animationTimeout) clearTimeout(animationTimeout)
      isAnimating.value = true
      animationTimeout = setTimeout(() => {
        isAnimating.value = false
        animationTimeout = null
      }, 500)
    }
  }
)

const emit = defineEmits<{
  openSettings: []
  openHelp: []
  openRunHistory: []
  openBestiary: []
  openArmory: []
  openCodex: []
  openAchievements: []
}>()
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <h1 class="logo">Borglike</h1>
      <span class="tagline">Idle Angband Inspired Incremental</span>
    </div>

    <div class="header-center">
      <div class="essence-display" :class="{ animating: isAnimating }">
        <span class="essence-icon">◆</span>
        <span class="essence-value">{{ progression.currency.essence.toLocaleString() }}</span>
        <span class="essence-label">Essence</span>
      </div>
      <button
        v-if="settings.settings.cheatMode"
        class="cheat-btn"
        title="Cheat: +100 Essence"
        @click="progression.addEssence(100)"
      >
        +100
      </button>
    </div>

    <div class="header-right">
      <button
        class="pause-toggle"
        :class="{ active: engineState.isPaused }"
        :disabled="engineState.isCatchingUp"
        :title="engineState.isPaused ? 'Resume (P)' : 'Pause (P)'"
        @click="togglePause()"
      >
        <span class="toggle-icon">{{ engineState.isPaused ? '▶' : '⏸' }}</span>
        <span class="toggle-label">{{ engineState.isPaused ? 'Play' : 'Pause' }}</span>
      </button>
      <button
        class="auto-run-toggle"
        :class="{
          active: settings.settings.autoRestart,
          locked: !hasAutoRestartUpgrade,
        }"
        :title="
          hasAutoRestartUpgrade
            ? settings.settings.autoRestart
              ? 'Auto-Run: ON'
              : 'Auto-Run: OFF'
            : 'Requires Auto Restart upgrade'
        "
        @click="toggleAutoRestart"
      >
        <span class="toggle-icon">↻</span>
        <span class="toggle-label">Auto</span>
      </button>
      <button class="header-btn" title="Run History" @click="emit('openRunHistory')">
        <span>≡</span>
      </button>
      <button
        class="header-btn"
        :class="{ 'has-notification': progression.hasNewAchievements }"
        title="Achievements"
        @click="emit('openAchievements')"
      >
        <span>🏆</span>
        <span v-if="progression.hasNewAchievements" class="notification-dot"></span>
      </button>
      <button class="header-btn" title="Bestiary" @click="emit('openBestiary')">
        <span>📖</span>
      </button>
      <button class="header-btn" title="Armory" @click="emit('openArmory')">
        <span>📦</span>
      </button>
      <button class="header-btn" title="Codex" @click="emit('openCodex')">
        <span>📜</span>
      </button>
      <button class="header-btn" title="Settings" @click="emit('openSettings')">
        <span>⚙</span>
      </button>
      <button class="header-btn" title="Help" @click="emit('openHelp')">
        <span>?</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.logo {
  font-size: var(--text-3xl);
  font-weight: bold;
  margin: 0;
  color: var(--purple);
  text-shadow: 0 0 12px rgba(139, 92, 246, 0.5);
}

.tagline {
  font-size: var(--text-base);
  color: var(--text-dim);
}

.header-center {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.essence-display {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: var(--radius-md);
  transition: all 0.3s ease;
}

.essence-display.animating {
  transform: scale(1.05);
  border-color: var(--purple);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
}

.essence-icon {
  font-size: var(--text-xl);
  color: var(--purple);
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.7);
}

.essence-display.animating .essence-icon {
  animation: pulse 0.5s ease;
}

.essence-value {
  font-size: var(--text-xl);
  font-weight: bold;
  color: var(--purple);
  text-shadow: 0 0 6px rgba(139, 92, 246, 0.5);
}

.essence-display.animating .essence-value {
  color: #fff;
  text-shadow: 0 0 12px rgba(139, 92, 246, 0.8);
}

.essence-label {
  font-size: var(--text-base);
  color: var(--text-secondary);
  text-transform: uppercase;
}

.cheat-btn {
  padding: var(--space-1) var(--space-3);
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid var(--amber);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--amber);
  cursor: pointer;
  transition: all 0.2s;
}

.cheat-btn:hover {
  background: rgba(245, 158, 11, 0.3);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.auto-run-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.auto-run-toggle:hover:not(.locked) {
  background: var(--border);
  color: var(--text-primary);
}

.auto-run-toggle.active {
  background: rgba(34, 197, 94, 0.15);
  border-color: var(--green);
  color: var(--green);
}

.auto-run-toggle.active .toggle-icon {
  animation: spin 2s linear infinite;
}

.auto-run-toggle.locked {
  opacity: 0.4;
  cursor: not-allowed;
}

.pause-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.pause-toggle:hover:not(:disabled) {
  background: var(--border);
  color: var(--text-primary);
}

.pause-toggle.active {
  background: rgba(245, 158, 11, 0.15);
  border-color: var(--amber);
  color: var(--amber);
}

.pause-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle-icon {
  font-size: var(--text-lg);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.header-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-xl);
  cursor: pointer;
  transition: all 0.2s;
}

.header-btn:hover {
  background: var(--border);
  color: var(--text-primary);
  border-color: var(--indigo);
}

.header-btn.has-notification {
  position: relative;
}

.notification-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  background: var(--green);
  border-radius: 50%;
  animation: notification-pulse 1.5s infinite;
}

@keyframes notification-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}
</style>
