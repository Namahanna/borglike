<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useEngineStateStore } from '@/stores/engine-state'
import { skipCatchUp } from '@/engine/instance-manager'

const engineState = useEngineStateStore()
const tickerRef = ref<HTMLElement | null>(null)

const SLOT_COLORS = ['var(--cyan)', 'var(--green)', 'var(--amber)', 'var(--purple)']

const targetSeconds = computed(() => Math.round(engineState.catchUpTargetMs / 1000))
const overallPercent = computed(() => Math.round(engineState.overallProgress * 100))

// ETA tracking
const startTime = ref(Date.now())
const currentTime = ref(Date.now())
let etaInterval: number | undefined

const eta = computed(() => {
  const elapsed = (currentTime.value - startTime.value) / 1000
  const progress = engineState.overallProgress

  if (progress < 0.01) return null // Not enough data yet

  const estimatedTotal = elapsed / progress
  const remaining = Math.max(0, estimatedTotal - elapsed)

  if (remaining < 60) {
    return `~${Math.ceil(remaining)}s`
  } else {
    const mins = Math.floor(remaining / 60)
    const secs = Math.ceil(remaining % 60)
    return `~${mins}m ${secs}s`
  }
})

onMounted(() => {
  etaInterval = window.setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (etaInterval !== undefined) {
    clearInterval(etaInterval)
  }
})

// Auto-scroll ticker to bottom when new completions arrive
watch(
  () => engineState.catchUpCompletions.length,
  async () => {
    await nextTick()
    if (tickerRef.value) {
      tickerRef.value.scrollTop = tickerRef.value.scrollHeight
    }
  }
)
</script>

<template>
  <div class="catchup-overlay">
    <div class="catchup-content">
      <h2 class="catchup-title">Catching Up...</h2>

      <div class="slot-progress-list">
        <div v-for="entry in engineState.catchUpProgress" :key="entry.slot" class="slot-progress">
          <div class="slot-label" :style="{ color: SLOT_COLORS[entry.slot] }">
            Slot {{ entry.slot + 1 }}
          </div>
          <div class="progress-bar-track">
            <div
              class="progress-bar-fill"
              :style="{
                width:
                  entry.ticksTotal > 0
                    ? (entry.ticksCompleted / entry.ticksTotal) * 100 + '%'
                    : '0%',
              }"
            />
          </div>
          <span class="slot-percent">
            {{
              entry.ticksTotal > 0
                ? Math.round((entry.ticksCompleted / entry.ticksTotal) * 100)
                : 0
            }}%
          </span>
          <span v-if="entry.deathsDuringCatchUp > 0" class="slot-deaths">
            ({{ entry.deathsDuringCatchUp }}
            {{ entry.deathsDuringCatchUp === 1 ? 'death' : 'deaths' }})
          </span>
        </div>
      </div>

      <div class="overall-section">
        <div class="overall-label">Overall</div>
        <div class="progress-bar-track overall-track">
          <div class="progress-bar-fill overall-fill" :style="{ width: overallPercent + '%' }" />
        </div>
        <span class="overall-percent">{{ overallPercent }}%</span>
      </div>

      <div class="catchup-info">
        Simulating {{ targetSeconds }}s of game time...
        <span v-if="eta" class="eta-timer">{{ eta }} remaining</span>
      </div>

      <button class="skip-btn" @click="skipCatchUp()">Skip</button>

      <div
        v-if="engineState.catchUpCompletions.length > 0"
        ref="tickerRef"
        class="completion-ticker"
      >
        <div v-for="(c, i) in engineState.catchUpCompletions" :key="i" class="ticker-entry">
          <span class="ticker-slot" :style="{ color: SLOT_COLORS[c.slot] }">{{ c.slot + 1 }}</span>
          <span class="ticker-build">{{ c.race }} {{ c.class }}</span>
          <span class="ticker-depth">D{{ c.depth }}</span>
          <span class="ticker-essence">+{{ c.essence }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.catchup-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(10, 10, 18, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
}

.catchup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  max-width: 500px;
  width: 100%;
  padding: var(--space-6);
}

.catchup-title {
  font-size: var(--text-2xl);
  color: var(--text-primary);
  margin: 0;
}

.slot-progress-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

.slot-progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.slot-label {
  font-size: var(--text-base);
  min-width: 48px;
}

.progress-bar-track {
  flex: 1;
  height: 12px;
  background: var(--highlight);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--indigo);
  border-radius: var(--radius-sm);
  transition: width 0.15s ease;
}

.slot-percent {
  font-size: var(--text-base);
  color: var(--text-secondary);
  min-width: 36px;
  text-align: right;
}

.slot-deaths {
  font-size: var(--text-sm);
  color: var(--amber);
}

.overall-section {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  margin-top: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.overall-label {
  font-size: var(--text-base);
  color: var(--text-primary);
  min-width: 48px;
}

.overall-track {
  height: 16px;
}

.overall-fill {
  background: linear-gradient(90deg, var(--indigo), var(--purple));
}

.overall-percent {
  font-size: var(--text-base);
  color: var(--text-primary);
  font-weight: bold;
  min-width: 36px;
  text-align: right;
}

.catchup-info {
  font-size: var(--text-base);
  color: var(--text-dim);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.eta-timer {
  font-size: var(--text-sm);
  color: var(--indigo);
  font-weight: 500;
}

.skip-btn {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-5);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.skip-btn:hover {
  background: var(--border);
  color: var(--text-primary);
  border-color: var(--indigo);
}

.completion-ticker {
  width: 100%;
  max-height: 160px;
  overflow-y: auto;
  margin-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-sm);
}

.ticker-entry {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-dim);
  padding: 1px 0;
}

.ticker-slot {
  min-width: 12px;
  font-weight: bold;
}

.ticker-build {
  flex: 1;
  color: var(--text-secondary);
}

.ticker-depth {
  color: var(--text-dim);
}

.ticker-essence {
  color: var(--purple);
  min-width: 40px;
  text-align: right;
}
</style>
