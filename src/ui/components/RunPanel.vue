<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import type { ActiveRun } from '@/stores/runs'
import { PERSONALITY_DISPLAY } from '@/types/events'
import { useRunsStore } from '@/stores/runs'
import { useProgressionStore } from '@/stores/progression'
import { getBoosterById } from '@game/data/boosters'
import DungeonGrid from './DungeonGridCanvas.vue'
import ProgressBar from './common/ProgressBar.vue'

const props = defineProps<{
  run: ActiveRun
}>()

const progression = useProgressionStore()

// Get active boosters from progression store
const activeBoosters = computed(() => {
  const ids = progression.getActiveBoosterIds()
  return ids.map((id) => getBoosterById(id)).filter((b) => b !== undefined)
})

const personalityDisplay = computed(() => PERSONALITY_DISPLAY[props.run.config.personality ?? 'cautious'])

const emit = defineEmits<{
  expand: []
  restart: []
  dismiss: []
  kill: []
  configure: []
}>()

// Death screen computed values
const deathCause = computed(() => {
  return props.run.finalStats?.deathCause || 'Unknown causes'
})

const duration = computed(() => {
  const endTime = props.run.finalStats?.endTime || Date.now()
  const ms = endTime - props.run.startTime
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return `${minutes}:${secs.toString().padStart(2, '0')}`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

const essenceEarned = computed(() => {
  return props.run.finalStats?.essenceEarned || 0
})

const isNewBest = computed(() => {
  const best = progression.bestRunByDepth
  if (!best) return true // First run is always a best
  return props.run.depth > best.maxDepth
})

const killerMonster = computed(() => {
  return props.run.finalStats?.killerMonster?.name
})

// Kill button hold state using requestAnimationFrame for smoother animation
const KILL_HOLD_DURATION = 1000 // 1 second hold required
const killHoldProgress = ref(0)
let killHoldStart: number | null = null
let killHoldRafId: number | null = null

function updateKillProgress() {
  if (killHoldStart === null) return

  const elapsed = Date.now() - killHoldStart
  killHoldProgress.value = Math.min(100, (elapsed / KILL_HOLD_DURATION) * 100)

  if (elapsed >= KILL_HOLD_DURATION) {
    emit('kill')
    cancelKillHold()
  } else {
    killHoldRafId = requestAnimationFrame(updateKillProgress)
  }
}

function startKillHold() {
  if (props.run.state === 'dead') return
  killHoldStart = Date.now()
  killHoldRafId = requestAnimationFrame(updateKillProgress)
}

function cancelKillHold() {
  killHoldStart = null
  killHoldProgress.value = 0
  if (killHoldRafId !== null) {
    cancelAnimationFrame(killHoldRafId)
    killHoldRafId = null
  }
}

onUnmounted(() => {
  cancelKillHold()
})

const runs = useRunsStore()

function handleExpand() {
  emit('expand')
}

function handleToggleTurbo() {
  runs.toggleTurbo(props.run.id)
}

function handleRestart() {
  emit('restart')
}

function handleDismiss() {
  emit('dismiss')
}
</script>

<template>
  <div class="run-panel" :class="{ dead: run.state === 'dead' }">
    <header class="run-header">
      <div class="run-info">
        <span class="run-class">{{ run.config.class }}</span>
        <span class="run-race">{{ run.config.race }}</span>
        <span class="run-personality" :style="{ color: personalityDisplay.color }">
          {{ personalityDisplay.label }}
        </span>
      </div>
      <div v-if="activeBoosters.length > 0" class="run-boosters">
        <span v-for="b in activeBoosters" :key="b!.id" class="booster-badge" :title="b!.name">
          {{ b!.icon }}
        </span>
      </div>
      <div class="run-depth">
        <span class="depth-label">D:</span>
        <span class="depth-value">{{ run.depth }}</span>
      </div>
      <div class="run-controls">
        <button
          class="control-btn turbo"
          :class="{ active: run.turbo }"
          title="Toggle turbo mode"
          @click="handleToggleTurbo"
        >
          ▶▶
        </button>
        <button class="control-btn expand" title="Expand to full view" @click="handleExpand">
          ⛶
        </button>
        <button
          class="control-btn kill"
          :class="{ holding: killHoldProgress > 0, disabled: run.state === 'dead' }"
          :disabled="run.state === 'dead'"
          title="Hold to kill run"
          @mousedown="startKillHold"
          @mouseup="cancelKillHold"
          @mouseleave="cancelKillHold"
          @touchstart.prevent="startKillHold"
          @touchend="cancelKillHold"
          @touchcancel="cancelKillHold"
        >
          <span class="kill-icon">✗</span>
          <span
            v-if="killHoldProgress > 0"
            class="kill-progress"
            :style="{ width: killHoldProgress + '%' }"
          />
        </button>
      </div>
    </header>

    <div class="run-stats-bar">
      <div class="stat-group bars-group">
        <div class="bar-row">
          <span class="stat-label">HP</span>
          <ProgressBar
            :current="run.hp"
            :max="run.maxHp"
            variant="hp"
            :show-text="true"
            size="md"
            class="resource-bar"
          />
        </div>
        <div v-if="run.maxMp > 0" class="bar-row">
          <span class="stat-label">MP</span>
          <ProgressBar
            :current="run.mp"
            :max="run.maxMp"
            variant="mp"
            :show-text="true"
            size="md"
            class="resource-bar"
          />
        </div>
      </div>
      <div class="stat-group">
        <span class="stat kills">
          <span class="stat-icon">⚔</span>
          {{ run.kills }}
        </span>
        <span class="stat gold">
          <span class="stat-icon">$</span>
          {{ run.gold }}
        </span>
        <span class="stat xp">
          <span class="stat-icon">★</span>
          {{ run.xp }}
        </span>
      </div>
    </div>

    <DungeonGrid :grid="run.grid" :cursor-x="run.cursorX" :cursor-y="run.cursorY" />

    <div v-if="run.state === 'dead'" class="death-overlay">
      <span v-if="isNewBest" class="new-best-badge">NEW BEST!</span>
      <span class="death-text">DEFEATED</span>
      <div class="death-character">
        <span class="char-race">{{ run.config.race }}</span>
        <span class="char-class">{{ run.config.class }}</span>
        <span class="char-personality" :style="{ color: personalityDisplay.color }">{{
          personalityDisplay.label
        }}</span>
      </div>
      <span class="death-cause">{{
        killerMonster ? `Slain by ${killerMonster}` : deathCause
      }}</span>
      <div class="death-metrics">
        <div class="metric">
          <span class="metric-value depth">{{ run.depth }}</span>
          <span class="metric-label">Depth</span>
        </div>
        <div class="metric">
          <span class="metric-value level">{{ run.level }}</span>
          <span class="metric-label">Level</span>
        </div>
        <div class="metric">
          <span class="metric-value kills">{{ run.kills }}</span>
          <span class="metric-label">Kills</span>
        </div>
        <div class="metric">
          <span class="metric-value gold">{{ run.gold }}</span>
          <span class="metric-label">Gold</span>
        </div>
        <div class="metric">
          <span class="metric-value time">{{ duration }}</span>
          <span class="metric-label">Time</span>
        </div>
      </div>
      <div v-if="essenceEarned > 0" class="essence-earned">
        <span class="essence-icon">✦</span>
        <span class="essence-value">+{{ essenceEarned }}</span>
        <span class="essence-label">essence</span>
      </div>
      <div class="death-actions">
        <button class="death-btn expand" title="View full stats" @click="emit('expand')">
          <span>⛶</span> Details
        </button>
        <button class="death-btn configure" title="Change loadout" @click="emit('configure')">
          <span>✎</span> Config
        </button>
        <button class="death-btn restart" @click="handleRestart"><span>↻</span> Restart</button>
        <button class="death-btn dismiss" @click="handleDismiss">Dismiss</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.run-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.run-panel.dead {
  opacity: 0.7;
}

.run-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--elevated);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-base);
}

.run-info {
  display: flex;
  gap: var(--space-2);
}

.run-class {
  color: var(--green);
  text-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

.run-race {
  color: var(--cyan);
  text-shadow: 0 0 8px rgba(6, 182, 212, 0.5);
}

.run-personality {
  font-size: var(--text-base);
  padding: 1px var(--space-1);
  background: rgba(0, 0, 0, 0.3);
  border-radius: var(--radius-sm);
  text-shadow: 0 0 6px currentColor;
}

.run-boosters {
  display: flex;
  gap: var(--space-1);
}

.booster-badge {
  font-size: var(--text-base);
  padding: 2px var(--space-1);
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid var(--purple);
  border-radius: var(--radius-md);
  color: var(--purple);
  cursor: default;
}

.run-depth {
  display: flex;
  align-items: center;
  gap: 2px;
}

.depth-label {
  color: var(--text-dim);
}

.depth-value {
  color: var(--purple);
  font-weight: bold;
  text-shadow: 0 0 6px rgba(139, 92, 246, 0.5);
}

.run-controls {
  display: flex;
  gap: var(--space-1);
}

.control-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--highlight);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: var(--text-base);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.control-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.control-btn.turbo.active {
  background: rgba(245, 158, 11, 0.15);
  border-color: var(--amber);
  color: var(--amber);
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}

.control-btn.expand:hover {
  border-color: var(--indigo);
  color: var(--indigo);
}

.control-btn.kill {
  position: relative;
  overflow: hidden;
}

.control-btn.kill:hover:not(.disabled) {
  border-color: var(--red);
  color: var(--red);
}

.control-btn.kill.holding {
  border-color: var(--red);
  color: var(--red);
}

.control-btn.kill.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.kill-icon {
  position: relative;
  z-index: 1;
}

.kill-progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: rgba(239, 68, 68, 0.3);
  transition: width 0.05s linear;
}

.run-stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-base);
}

.stat-group {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.bars-group {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 1;
  max-width: 220px;
  gap: var(--space-1);
}

.bar-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.stat-label {
  color: var(--text-dim);
  font-size: var(--text-base);
  width: 20px;
  flex-shrink: 0;
}

.resource-bar {
  flex: 1;
}

.stat {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.stat-icon {
  font-size: var(--text-base);
}

.stat.kills {
  color: var(--red);
}

.stat.gold {
  color: var(--amber);
}

.stat.xp {
  color: var(--cyan);
}

.death-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: rgba(10, 10, 18, 0.9);
}

.new-best-badge {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--amber);
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid var(--amber);
  padding: 2px var(--space-2);
  border-radius: var(--radius-md);
  letter-spacing: 1px;
  text-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
  animation: pulse-best 1.5s ease-in-out infinite;
}

@keyframes pulse-best {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.6);
  }
}

.death-text {
  font-size: var(--text-2xl);
  font-weight: bold;
  color: var(--red);
  text-shadow: 0 0 20px rgba(239, 68, 68, 0.8);
  letter-spacing: 2px;
}

.death-character {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-base);
}

.char-race {
  color: var(--cyan);
}

.char-class {
  color: var(--green);
}

.char-personality {
  font-size: var(--text-sm);
  padding: 1px var(--space-1);
  background: rgba(0, 0, 0, 0.3);
  border-radius: var(--radius-sm);
}

.death-cause {
  font-size: var(--text-base);
  color: var(--text-dim);
  margin-bottom: var(--space-1);
}

.death-metrics {
  display: flex;
  gap: var(--space-4);
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.metric-value {
  font-size: var(--text-lg);
  font-weight: bold;
}

.metric-value.depth {
  color: var(--purple);
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
}

.metric-value.level {
  color: var(--cyan);
  text-shadow: 0 0 8px rgba(6, 182, 212, 0.5);
}

.metric-value.kills {
  color: var(--red);
  text-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

.metric-value.gold {
  color: var(--amber);
  text-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
}

.metric-value.time {
  color: var(--text-secondary);
}

.metric-label {
  font-size: var(--text-sm);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.essence-earned {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: var(--radius-md);
  margin-top: 2px;
}

.essence-icon {
  color: var(--purple);
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
}

.essence-value {
  font-size: var(--text-md);
  font-weight: bold;
  color: var(--purple);
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
}

.essence-label {
  font-size: var(--text-base);
  color: var(--text-dim);
}

.death-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.death-btn {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-base);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.death-btn.expand {
  background: var(--highlight);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.death-btn.expand:hover {
  border-color: var(--purple);
  color: var(--purple);
}

.death-btn.configure {
  background: var(--highlight);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.death-btn.configure:hover {
  border-color: var(--cyan);
  color: var(--cyan);
}

.death-btn.restart {
  background: var(--indigo);
  border: 1px solid var(--indigo);
  color: white;
}

.death-btn.restart:hover {
  background: var(--indigo-hover);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
}

.death-btn.dismiss {
  background: var(--highlight);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.death-btn.dismiss:hover {
  background: var(--border);
  color: var(--text-primary);
}
</style>
