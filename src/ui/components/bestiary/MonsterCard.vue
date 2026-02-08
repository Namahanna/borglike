<script setup lang="ts">
import { computed } from 'vue'
import type { MonsterTemplate } from '@game/data/monsters'
import type { BestiaryEntry } from '@/types/progression'
import { getKnowledgeBonus } from '@game/knowledge-effects'

interface Props {
  monster: MonsterTemplate
  entry?: BestiaryEntry
  bestiaryCapPercent?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: []
}>()

// Get unlock tier based on kill count
function getUnlockTier(kills: number): number {
  if (kills >= 30) return 4 // Fully unlocked
  if (kills >= 15) return 3 // Abilities revealed
  if (kills >= 5) return 2 // Stats revealed
  if (kills >= 1) return 1 // Name + symbol revealed
  return 0 // Locked
}

const kills = computed(() => props.entry?.kills ?? 0)
const tier = computed(() => getUnlockTier(kills.value))
const isLocked = computed(() => tier.value === 0)
const isFullyUnlocked = computed(() => tier.value >= 4)

// Knowledge bonus
const knowledgeBonus = computed(() => getKnowledgeBonus(kills.value, props.bestiaryCapPercent))

// Progress to next tier
const progress = computed(() => {
  const k = kills.value
  if (k >= 30) return null
  if (k >= 15) return { current: k, next: 30, percent: ((k - 15) / 15) * 100 }
  if (k >= 5) return { current: k, next: 15, percent: ((k - 5) / 10) * 100 }
  if (k >= 1) return { current: k, next: 5, percent: ((k - 1) / 4) * 100 }
  return { current: 0, next: 1, percent: 0 }
})

// Color mapping
const monsterColor = computed(() => {
  const colorMap: Record<string, string> = {
    white: '#ffffff',
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    yellow: '#eab308',
    orange: '#f97316',
    purple: '#8b5cf6',
    violet: '#a78bfa',
    umber: '#92400e',
    lightUmber: '#d97706',
    slate: '#64748b',
    lightDark: '#374151',
    lightRed: '#f87171',
    lightGreen: '#4ade80',
    lightBlue: '#60a5fa',
    lightPurple: '#c084fc',
    lightSlate: '#94a3b8',
    black: '#1f2937',
  }
  return colorMap[props.monster.color] ?? '#ffffff'
})
</script>

<template>
  <div
    class="monster-card"
    :class="{ locked: isLocked, unlocked: isFullyUnlocked }"
    @click="emit('click')"
  >
    <div class="card-content">
      <div class="monster-symbol" :style="{ color: isLocked ? '#4b5563' : monsterColor }">
        {{ isLocked ? '?' : monster.char }}
      </div>
      <div class="monster-name">
        {{ isLocked ? 'Unknown' : monster.name }}
      </div>
      <div v-if="tier >= 2" class="monster-stats">
        <span class="stat">HP {{ monster.hp }}</span>
        <span class="stat">D:{{ monster.minDepth }}</span>
      </div>
      <div v-if="!isLocked" class="kill-count">{{ kills }} kill{{ kills !== 1 ? 's' : '' }}</div>
      <div v-if="knowledgeBonus > 0" class="knowledge-badge">+{{ knowledgeBonus.toFixed(0) }}%</div>
    </div>

    <div v-if="progress" class="progress-bar">
      <div class="progress-fill" :style="{ width: `${progress.percent}%` }"></div>
      <span class="progress-text">{{ progress.current }}/{{ progress.next }}</span>
    </div>

    <div v-if="isFullyUnlocked" class="unlocked-badge">
      <span>✓</span>
    </div>
  </div>
</template>

<style scoped>
.monster-card {
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.monster-card:hover {
  background: var(--border);
  transform: translateY(-2px);
}

.monster-card.locked {
  filter: grayscale(0.7);
  opacity: 0.7;
}

.monster-card.unlocked {
  border-color: var(--purple);
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.3);
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.monster-symbol {
  font-size: var(--text-5xl);
  font-weight: bold;
  line-height: 1;
  text-shadow: 0 0 8px currentColor;
}

.monster-name {
  font-size: var(--text-base);
  color: var(--text-primary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.monster-card.locked .monster-name {
  color: var(--text-dim);
  font-style: italic;
}

.monster-stats {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-base);
  color: var(--text-dim);
}

.stat {
  padding: 1px var(--space-1);
  background: var(--void);
  border-radius: var(--radius-sm);
}

.kill-count {
  font-size: var(--text-base);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.knowledge-badge {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--green);
  background: rgba(34, 197, 94, 0.15);
  padding: 2px var(--space-2);
  border-radius: var(--radius-md);
  margin-top: var(--space-1);
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--void);
}

.progress-fill {
  height: 100%;
  background: var(--purple);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  bottom: 6px;
  right: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-dim);
}

.unlocked-badge {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  width: 18px;
  height: 18px;
  background: var(--purple);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-base);
  color: white;
}
</style>
