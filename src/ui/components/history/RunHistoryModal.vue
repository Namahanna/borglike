<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import RunHistoryRow from './RunHistoryRow.vue'

const progression = useProgressionStore()

const emit = defineEmits<{
  close: []
}>()

// Tab state
const activeTab = ref<'recent' | 'wins' | 'top'>('recent')

// Expanded row state
const expandedRunId = ref<string | null>(null)

function toggleExpanded(runId: string) {
  expandedRunId.value = expandedRunId.value === runId ? null : runId
}

// Computed data
const recentRuns = computed(() => progression.runHistory.slice(0, 50))
const wins = computed(() => progression.winHistory)

// Use independent top runs storage (persisted separately from recent history)
const topByDepth = computed(() => progression.topRunsByDepth)
const topByEssence = computed(() => progression.topRunsByEssence)
const topByKills = computed(() => progression.topRunsByKills)

// Format time ago helper
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(timestamp).toLocaleDateString()
}
</script>

<template>
  <div class="run-history-modal">
    <header class="modal-header">
      <h2>Run History</h2>
      <button class="close-btn" @click="emit('close')">&times;</button>
    </header>

    <nav class="modal-tabs">
      <button :class="{ active: activeTab === 'recent' }" @click="activeTab = 'recent'">
        Recent ({{ recentRuns.length }})
      </button>
      <button :class="{ active: activeTab === 'wins' }" @click="activeTab = 'wins'">
        Wins ({{ wins.length }})
      </button>
      <button :class="{ active: activeTab === 'top' }" @click="activeTab = 'top'">Top Runs</button>
    </nav>

    <div class="modal-content">
      <!-- Recent tab -->
      <div v-if="activeTab === 'recent'" class="recent-runs">
        <div v-if="recentRuns.length === 0" class="empty-state">
          No runs recorded yet. Complete a run to see it here.
        </div>
        <div v-else class="run-list">
          <RunHistoryRow
            v-for="run in recentRuns"
            :key="run.id"
            :run="run"
            :expanded="expandedRunId === run.id"
            :time-ago="formatTimeAgo(run.endTime ?? run.startTime)"
            @toggle="toggleExpanded(run.id)"
          />
        </div>
      </div>

      <!-- Wins tab -->
      <div v-else-if="activeTab === 'wins'" class="wins-runs">
        <div v-if="wins.length === 0" class="empty-state">
          No victories yet. Defeat Morgoth to record a win!
        </div>
        <div v-else class="run-list">
          <RunHistoryRow
            v-for="(run, index) in wins"
            :key="run.id"
            :run="run"
            :rank="index + 1"
            :expanded="expandedRunId === run.id"
            :time-ago="formatTimeAgo(run.endTime ?? run.startTime)"
            @toggle="toggleExpanded(run.id)"
          />
        </div>
      </div>

      <!-- Top runs tab -->
      <div v-else-if="activeTab === 'top'" class="top-runs">
        <section class="top-section">
          <h3>Deepest Runs</h3>
          <div class="run-list">
            <RunHistoryRow
              v-for="(run, index) in topByDepth"
              :key="run.id"
              :run="run"
              :rank="index + 1"
              :expanded="expandedRunId === run.id"
              :time-ago="formatTimeAgo(run.endTime ?? run.startTime)"
              @toggle="toggleExpanded(run.id)"
            />
          </div>
        </section>

        <section class="top-section">
          <h3>Most Essence</h3>
          <div class="run-list">
            <RunHistoryRow
              v-for="(run, index) in topByEssence"
              :key="run.id"
              :run="run"
              :rank="index + 1"
              :expanded="expandedRunId === run.id"
              :time-ago="formatTimeAgo(run.endTime ?? run.startTime)"
              @toggle="toggleExpanded(run.id)"
            />
          </div>
        </section>

        <section class="top-section">
          <h3>Most Kills</h3>
          <div class="run-list">
            <RunHistoryRow
              v-for="(run, index) in topByKills"
              :key="run.id"
              :run="run"
              :rank="index + 1"
              :expanded="expandedRunId === run.id"
              :time-ago="formatTimeAgo(run.endTime ?? run.startTime)"
              @toggle="toggleExpanded(run.id)"
            />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.run-history-modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  color: var(--text-primary);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-3xl);
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--highlight);
  color: var(--text-primary);
}

.modal-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--void);
}

.modal-tabs button {
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: var(--text-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.modal-tabs button:hover {
  background: var(--highlight);
  color: var(--text-primary);
}

.modal-tabs button.active {
  background: var(--highlight);
  border-color: var(--purple);
  color: var(--purple);
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.empty-state {
  text-align: center;
  padding: 40px var(--space-5);
  color: var(--text-dim);
  font-style: italic;
}

.run-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.top-section {
  margin-bottom: var(--space-6);
}

.top-section:last-child {
  margin-bottom: 0;
}

.top-section h3 {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--text-lg);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
