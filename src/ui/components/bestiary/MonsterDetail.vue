<script setup lang="ts">
import { computed } from 'vue'
import type { MonsterTemplate } from '@game/data/monsters'
import { getAverageDamage, getAbilities } from '@game/data/monsters'
import type { BestiaryEntry } from '@/types/progression'
import { getKnowledgeBonus } from '@game/knowledge-effects'

interface Props {
  monster: MonsterTemplate
  entry?: BestiaryEntry
  bestiaryCapPercent?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Get unlock tier based on kill count
function getUnlockTier(kills: number): number {
  if (kills >= 30) return 4
  if (kills >= 15) return 3
  if (kills >= 5) return 2
  if (kills >= 1) return 1
  return 0
}

const kills = computed(() => props.entry?.kills ?? 0)
const deaths = computed(() => props.entry?.deaths ?? 0)
const tier = computed(() => getUnlockTier(kills.value))

// Knowledge bonus calculation
const bestiaryCapPercent = computed(() => props.bestiaryCapPercent ?? 25)
const knowledgeBonus = computed(() => getKnowledgeBonus(kills.value, bestiaryCapPercent.value))
const isLocked = computed(() => tier.value === 0)

// Format first kill time
const firstKillDate = computed(() => {
  if (!props.entry?.firstKillTime) return null
  return new Date(props.entry.firstKillTime).toLocaleDateString()
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

// Next unlock info
const nextUnlock = computed(() => {
  const k = kills.value
  if (k >= 30) return null
  if (k >= 15) return { kills: 30, desc: 'Speed, XP & depth info' }
  if (k >= 5) return { kills: 15, desc: 'Abilities & flags' }
  if (k >= 1) return { kills: 5, desc: 'HP, Damage & Armor' }
  return { kills: 1, desc: 'Name & symbol' }
})
</script>

<template>
  <div class="monster-detail">
    <header class="detail-header">
      <button class="back-btn" @click="emit('close')">&larr; Back</button>
    </header>

    <div class="detail-content">
      <!-- Symbol and name -->
      <div class="monster-identity">
        <div class="monster-symbol" :style="{ color: isLocked ? '#4b5563' : monsterColor }">
          {{ isLocked ? '?' : monster.char }}
        </div>
        <h2 class="monster-name">{{ isLocked ? 'Unknown Monster' : monster.name }}</h2>
      </div>

      <!-- Kill/Death counts -->
      <div class="stats-row">
        <div class="stat-box kills">
          <span class="count">{{ kills }}</span>
          <span class="label">Kills</span>
        </div>
        <div class="stat-box deaths">
          <span class="count">{{ deaths }}</span>
          <span class="label">Deaths</span>
        </div>
      </div>

      <!-- Knowledge Bonus -->
      <div v-if="kills > 0" class="knowledge-section">
        <div class="knowledge-header">
          <span class="knowledge-label">Knowledge Bonus</span>
          <span class="knowledge-value">+{{ knowledgeBonus.toFixed(1) }}%</span>
        </div>
        <div class="knowledge-bar">
          <div
            class="knowledge-fill"
            :style="{ width: `${(knowledgeBonus / bestiaryCapPercent) * 100}%` }"
          ></div>
        </div>
        <div class="knowledge-tiers">
          <span :class="{ active: knowledgeBonus >= 10 }">10%</span>
          <span :class="{ active: knowledgeBonus >= bestiaryCapPercent }"
            >{{ bestiaryCapPercent }}%</span
          >
        </div>
        <div class="knowledge-desc">
          Deal +{{ knowledgeBonus.toFixed(1) }}% damage, take -{{ knowledgeBonus.toFixed(1) }}%
          damage
        </div>
      </div>

      <div v-if="firstKillDate" class="first-kill">First killed: {{ firstKillDate }}</div>

      <!-- Stats (tier 2+) -->
      <div v-if="tier >= 2" class="stats-section">
        <h3>Combat Stats</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{{ monster.hp }}</span>
            <span class="stat-label">HP</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ Math.round(getAverageDamage(monster)) }}</span>
            <span class="stat-label">Damage</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ monster.armor }}</span>
            <span class="stat-label">Armor</span>
          </div>
        </div>
      </div>

      <!-- Abilities and flags (tier 3+) -->
      <div v-if="tier >= 3" class="abilities-section">
        <h3>Abilities</h3>
        <div v-if="getAbilities(monster).length > 0" class="ability-list">
          <span v-for="ability in getAbilities(monster)" :key="ability" class="ability-tag">
            {{ ability }}
          </span>
        </div>
        <div v-else class="no-abilities">None</div>

        <h3>Type</h3>
        <div v-if="monster.flags.length > 0" class="flag-list">
          <span v-for="flag in monster.flags" :key="flag" class="flag-tag">
            {{ flag }}
          </span>
        </div>
        <div v-else class="no-flags">Normal</div>
      </div>

      <!-- Full info (tier 4) -->
      <div v-if="tier >= 4" class="full-info-section">
        <h3>Details</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Speed</span>
            <span class="info-value">{{ monster.speed }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Experience</span>
            <span class="info-value">{{ monster.experience }} XP</span>
          </div>
          <div class="info-item">
            <span class="info-label">Depth</span>
            <span class="info-value">D:{{ monster.minDepth }}+</span>
          </div>
        </div>
      </div>

      <!-- Locked info -->
      <div v-if="tier < 4 && nextUnlock" class="unlock-hint">
        <div class="hint-header">Next unlock at {{ nextUnlock.kills }} kills:</div>
        <div class="hint-desc">{{ nextUnlock.desc }}</div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${(kills / nextUnlock.kills) * 100}%` }"
          ></div>
        </div>
        <div class="progress-text">{{ kills }} / {{ nextUnlock.kills }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monster-detail {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.detail-header {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--void);
}

.back-btn {
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.detail-content {
  padding: var(--space-5);
}

.monster-identity {
  text-align: center;
  margin-bottom: var(--space-5);
}

.monster-symbol {
  font-size: 64px;
  font-weight: bold;
  line-height: 1;
  text-shadow: 0 0 16px currentColor;
  margin-bottom: var(--space-3);
}

.monster-name {
  margin: 0;
  font-size: var(--text-3xl);
  color: var(--text-primary);
}

.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.stat-box {
  text-align: center;
  padding: var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-lg);
}

.stat-box .count {
  display: block;
  font-size: 28px;
  font-weight: bold;
}

.stat-box.kills .count {
  color: var(--purple);
}

.stat-box.deaths .count {
  color: var(--red);
}

.stat-box .label {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.knowledge-section {
  padding: var(--space-4);
  background: var(--highlight);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-4);
}

.knowledge-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.knowledge-label {
  font-size: var(--text-base);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.knowledge-value {
  font-size: var(--text-2xl);
  font-weight: bold;
  color: var(--green);
}

.knowledge-bar {
  height: 8px;
  background: var(--void);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--space-2);
}

.knowledge-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--green) 0%, var(--purple) 100%);
  transition: width 0.3s ease;
}

.knowledge-tiers {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-base);
  color: var(--text-dim);
  margin-bottom: var(--space-2);
}

.knowledge-tiers span.active {
  color: var(--green);
  font-weight: bold;
}

.knowledge-desc {
  font-size: var(--text-base);
  color: var(--text-secondary);
  text-align: center;
}

.first-kill {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-align: center;
  margin-bottom: var(--space-4);
}

.stats-section,
.abilities-section,
.full-info-section {
  margin-bottom: var(--space-5);
}

.stats-section h3,
.abilities-section h3,
.full-info-section h3 {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.stat-item {
  text-align: center;
  padding: var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.stat-value {
  display: block;
  font-size: var(--text-3xl);
  font-weight: bold;
  color: var(--text-primary);
}

.stat-label {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
}

.ability-list,
.flag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.ability-tag {
  padding: var(--space-1) var(--space-3);
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--red);
}

.flag-tag {
  padding: var(--space-1) var(--space-3);
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--purple);
}

.no-abilities,
.no-flags {
  font-size: var(--text-base);
  color: var(--text-dim);
  font-style: italic;
  margin-bottom: var(--space-4);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.info-item {
  text-align: center;
  padding: var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.info-label {
  display: block;
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  margin-bottom: var(--space-1);
}

.info-value {
  font-size: var(--text-lg);
  font-weight: bold;
  color: var(--text-primary);
}

.unlock-hint {
  padding: var(--space-4);
  background: var(--void);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-align: center;
}

.hint-header {
  font-size: var(--text-base);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}

.hint-desc {
  font-size: var(--text-lg);
  color: var(--purple);
  margin-bottom: var(--space-3);
}

.progress-bar {
  height: 6px;
  background: var(--highlight);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--space-2);
}

.progress-fill {
  height: 100%;
  background: var(--purple);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: var(--text-base);
  color: var(--text-dim);
}
</style>
