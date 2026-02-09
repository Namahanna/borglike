<script setup lang="ts">
import { computed } from 'vue'
import type { RunStats } from '@/types/progression'
import PanelFrame from '../common/PanelFrame.vue'
import ProgressBar from '../common/ProgressBar.vue'

const props = defineProps<{
  run: RunStats
  personalBest?: RunStats
}>()

const emit = defineEmits<{
  close: []
  restart: []
}>()

// Format duration
const duration = computed(() => {
  if (!props.run.endTime) return '--:--'
  const seconds = Math.floor((props.run.endTime - props.run.startTime) / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
})

// Compare with personal best
const comparison = computed(() => {
  if (!props.personalBest) return null

  return {
    depth: props.run.maxDepth - props.personalBest.maxDepth,
    kills: props.run.kills - props.personalBest.kills,
    gold: props.run.goldEarned - props.personalBest.goldEarned,
    essence: props.run.essenceEarned - props.personalBest.essenceEarned,
  }
})

const isNewBest = computed(() => {
  if (!props.personalBest) return true
  return props.run.maxDepth > props.personalBest.maxDepth
})

// Performance grades
const depthGrade = computed(() => {
  const depth = props.run.maxDepth
  if (depth >= 50) return { grade: 'S', color: 'var(--purple)' }
  if (depth >= 30) return { grade: 'A', color: 'var(--green)' }
  if (depth >= 20) return { grade: 'B', color: 'var(--cyan)' }
  if (depth >= 10) return { grade: 'C', color: 'var(--amber)' }
  return { grade: 'D', color: 'var(--red)' }
})

function formatDiff(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `${value}`
  return '='
}

function getDiffClass(value: number): string {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

// Combat accuracy
const meleeAccuracy = computed(() => {
  const hits = props.run.meleeHits ?? 0
  const misses = props.run.meleeMisses ?? 0
  const total = hits + misses
  if (total === 0) return null
  return Math.round((hits / total) * 100)
})

const rangedAccuracy = computed(() => {
  const hits = props.run.rangedHits ?? 0
  const misses = props.run.rangedMisses ?? 0
  const total = hits + misses
  if (total === 0) return null
  return Math.round((hits / total) * 100)
})

// Top damage sources (spells/abilities)
const topDamageSources = computed(() => {
  const sources: Array<{ name: string; damage: number; type: 'spell' | 'ability' }> = []

  // Add spells
  if (props.run.damageBySource?.spell) {
    for (const [name, damage] of Object.entries(props.run.damageBySource.spell)) {
      sources.push({ name, damage, type: 'spell' })
    }
  }

  // Add abilities
  if (props.run.damageBySource?.ability) {
    for (const [name, damage] of Object.entries(props.run.damageBySource.ability)) {
      sources.push({ name, damage, type: 'ability' })
    }
  }

  // Sort by damage and take top 5
  return sources.sort((a, b) => b.damage - a.damage).slice(0, 5)
})

// Top threats (monsters by damage taken)
const topThreats = computed(() => {
  if (!props.run.damageTakenByMonster) return []

  const threats = Object.entries(props.run.damageTakenByMonster)
    .map(([name, damage]) => ({ name, damage }))
    .sort((a, b) => b.damage - a.damage)
    .slice(0, 3)

  return threats
})

// Primary damage type
const primaryDamageType = computed(() => {
  if (!props.run.damageBySource) return null
  const { melee, ranged, spell, ability, minion } = props.run.damageBySource
  const spellTotal = Object.values(spell).reduce((a, b) => a + b, 0)
  const abilityTotal = Object.values(ability).reduce((a, b) => a + b, 0)

  const types = [
    { type: 'Melee', damage: melee },
    { type: 'Ranged', damage: ranged },
    { type: 'Spell', damage: spellTotal },
    { type: 'Ability', damage: abilityTotal },
    { type: 'Minion', damage: minion },
  ]

  const max = types.reduce((a, b) => (b.damage > a.damage ? b : a))
  return max.damage > 0 ? max.type : null
})

// Check if we have extended stats
const hasExtendedStats = computed(() => {
  return props.run.damageBySource !== undefined
})
</script>

<template>
  <div class="run-summary">
    <header class="summary-header">
      <div class="header-content">
        <h2>Run Complete</h2>
        <span v-if="isNewBest" class="new-best-badge">NEW BEST!</span>
      </div>
      <button class="close-btn" @click="emit('close')">✕</button>
    </header>

    <div class="summary-content">
      <!-- Character Info -->
      <div class="character-info">
        <span class="char-race">{{ run.race }}</span>
        <span class="char-class">{{ run.class }}</span>
        <span v-if="primaryDamageType" class="char-damage-type">{{ primaryDamageType }}</span>
        <span class="char-time">{{ duration }}</span>
      </div>

      <!-- Grade Display -->
      <div class="grade-section">
        <div class="grade-display" :style="{ color: depthGrade.color }">
          {{ depthGrade.grade }}
        </div>
        <div class="grade-label">Performance</div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <PanelFrame class="stat-card">
          <div class="stat-label">Max Depth</div>
          <div class="stat-value depth">{{ run.maxDepth }}</div>
          <div v-if="comparison" class="stat-diff" :class="getDiffClass(comparison.depth)">
            {{ formatDiff(comparison.depth) }}
          </div>
        </PanelFrame>

        <PanelFrame class="stat-card">
          <div class="stat-label">Kills</div>
          <div class="stat-value kills">{{ run.kills }}</div>
          <div v-if="comparison" class="stat-diff" :class="getDiffClass(comparison.kills)">
            {{ formatDiff(comparison.kills) }}
          </div>
        </PanelFrame>

        <PanelFrame class="stat-card">
          <div class="stat-label">Gold</div>
          <div class="stat-value gold">{{ run.goldEarned.toLocaleString() }}</div>
          <div v-if="comparison" class="stat-diff" :class="getDiffClass(comparison.gold)">
            {{ formatDiff(comparison.gold) }}
          </div>
        </PanelFrame>

        <PanelFrame class="stat-card">
          <div class="stat-label">XP</div>
          <div class="stat-value xp">{{ run.xpEarned.toLocaleString() }}</div>
        </PanelFrame>
      </div>

      <!-- Cause of Death -->
      <PanelFrame v-if="run.deathCause" class="death-cause">
        <div class="death-label">Cause of Death</div>
        <div class="death-text">{{ run.deathCause }}</div>
      </PanelFrame>

      <!-- Extended Stats Section -->
      <template v-if="hasExtendedStats">
        <!-- Combat Breakdown -->
        <PanelFrame class="extended-section">
          <div class="section-title">Combat</div>
          <div class="combat-stats">
            <div class="combat-row">
              <span class="combat-label">Damage Dealt</span>
              <span class="combat-value dealt">{{ (run.damageDealt ?? 0).toLocaleString() }}</span>
            </div>
            <div class="combat-row">
              <span class="combat-label">Damage Taken</span>
              <span class="combat-value taken">{{ (run.damageTaken ?? 0).toLocaleString() }}</span>
            </div>
            <div v-if="meleeAccuracy !== null" class="combat-row">
              <span class="combat-label">Melee Accuracy</span>
              <span class="combat-value">{{ meleeAccuracy }}%</span>
            </div>
            <div v-if="rangedAccuracy !== null" class="combat-row">
              <span class="combat-label">Ranged Accuracy</span>
              <span class="combat-value">{{ rangedAccuracy }}%</span>
            </div>
            <div v-if="run.criticalHits" class="combat-row">
              <span class="combat-label">Critical Hits</span>
              <span class="combat-value crit">{{ run.criticalHits }}</span>
            </div>
            <div v-if="run.attacksDodged" class="combat-row">
              <span class="combat-label">Attacks Dodged</span>
              <span class="combat-value">{{ run.attacksDodged }}</span>
            </div>
          </div>
        </PanelFrame>

        <!-- Top Damage Sources -->
        <PanelFrame v-if="topDamageSources.length > 0" class="extended-section">
          <div class="section-title">Top Damage Sources</div>
          <div class="source-list">
            <div v-for="source in topDamageSources" :key="source.name" class="source-row">
              <span class="source-name" :class="source.type">{{ source.name }}</span>
              <span class="source-damage">{{ source.damage.toLocaleString() }}</span>
            </div>
          </div>
        </PanelFrame>

        <!-- Top Threats -->
        <PanelFrame v-if="topThreats.length > 0" class="extended-section">
          <div class="section-title">Top Threats</div>
          <div class="source-list">
            <div v-for="threat in topThreats" :key="threat.name" class="source-row">
              <span class="source-name threat">{{ threat.name }}</span>
              <span class="source-damage threat">{{ threat.damage.toLocaleString() }}</span>
            </div>
          </div>
        </PanelFrame>

        <!-- Survival Stats -->
        <PanelFrame v-if="run.closeCalls || run.healingBySource" class="extended-section">
          <div class="section-title">Survival</div>
          <div class="combat-stats">
            <div v-if="run.healingBySource?.potions" class="combat-row">
              <span class="combat-label">Potion Healing</span>
              <span class="combat-value heal">{{
                run.healingBySource.potions.toLocaleString()
              }}</span>
            </div>
            <div v-if="run.healingBySource?.spells" class="combat-row">
              <span class="combat-label">Spell Healing</span>
              <span class="combat-value heal">{{
                run.healingBySource.spells.toLocaleString()
              }}</span>
            </div>
            <div v-if="run.healingBySource?.regen" class="combat-row">
              <span class="combat-label">Regeneration</span>
              <span class="combat-value heal">{{
                run.healingBySource.regen.toLocaleString()
              }}</span>
            </div>
            <div v-if="run.closeCalls" class="combat-row">
              <span class="combat-label">Close Calls</span>
              <span class="combat-value danger">{{ run.closeCalls }}</span>
            </div>
          </div>
        </PanelFrame>

        <!-- Resources Used -->
        <PanelFrame v-if="run.consumablesUsed" class="extended-section">
          <div class="section-title">Resources</div>
          <div class="combat-stats">
            <div v-if="run.consumablesUsed.healingPotions" class="combat-row">
              <span class="combat-label">Healing Potions</span>
              <span class="combat-value">{{ run.consumablesUsed.healingPotions }}</span>
            </div>
            <div v-if="run.consumablesUsed.buffPotions" class="combat-row">
              <span class="combat-label">Buff Potions</span>
              <span class="combat-value">{{ run.consumablesUsed.buffPotions }}</span>
            </div>
            <div
              v-if="Object.keys(run.consumablesUsed.scrolls || {}).length > 0"
              class="combat-row"
            >
              <span class="combat-label">Scrolls Used</span>
              <span class="combat-value">{{
                Object.values(run.consumablesUsed.scrolls || {}).reduce((a, b) => a + b, 0)
              }}</span>
            </div>
          </div>
        </PanelFrame>
      </template>

      <!-- Essence Earned -->
      <PanelFrame class="essence-section">
        <div class="essence-header">
          <span class="essence-label">Essence Earned</span>
          <span class="essence-icon">◆</span>
        </div>
        <div class="essence-value">+{{ run.essenceEarned.toLocaleString() }}</div>
        <ProgressBar
          :current="run.essenceEarned"
          :max="Math.max(run.essenceEarned, 100)"
          variant="upgrade"
          size="md"
          class="essence-bar"
        />
        <div v-if="comparison" class="essence-diff" :class="getDiffClass(comparison.essence)">
          vs Personal Best: {{ formatDiff(comparison.essence) }}
        </div>
      </PanelFrame>
    </div>

    <footer class="summary-footer">
      <button class="action-btn secondary" @click="emit('close')">Return to Grid</button>
      <button class="action-btn primary" @click="emit('restart')">
        <span class="btn-icon">▶</span>
        Start New Run
      </button>
    </footer>
  </div>
</template>

<style scoped>
.run-summary {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  background: var(--elevated);
  border-bottom: 1px solid var(--border);
}

.header-content {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.summary-header h2 {
  font-size: var(--text-2xl);
  font-weight: bold;
  color: var(--text-primary);
  margin: 0;
}

.new-best-badge {
  font-size: var(--text-base);
  padding: var(--space-1) var(--space-3);
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid var(--purple);
  border-radius: var(--radius-md);
  color: var(--purple);
  text-transform: uppercase;
  letter-spacing: 1px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
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

.summary-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}

.character-info {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--text-lg);
}

.char-race {
  color: var(--cyan);
  text-shadow: 0 0 6px rgba(6, 182, 212, 0.4);
}

.char-class {
  color: var(--green);
  text-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.char-time {
  color: var(--text-dim);
}

.char-damage-type {
  color: var(--amber);
  font-size: var(--text-base);
  padding: 2px var(--space-2);
  background: rgba(245, 158, 11, 0.15);
  border-radius: var(--radius-md);
}

.grade-section {
  text-align: center;
  margin: var(--space-3) 0;
}

.grade-display {
  font-size: var(--text-display);
  font-weight: bold;
  line-height: 1;
  text-shadow: 0 0 30px currentColor;
}

.grade-label {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-top: var(--space-2);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  width: 100%;
  max-width: 400px;
}

.stat-card {
  padding: var(--space-4) !important;
  text-align: center;
}

.stat-label {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: var(--space-2);
}

.stat-value {
  font-size: var(--text-4xl);
  font-weight: bold;
  color: var(--text-primary);
}

.stat-value.depth {
  color: var(--purple);
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
}

.stat-value.kills {
  color: var(--red);
}

.stat-value.gold {
  color: var(--amber);
  text-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
}

.stat-value.xp {
  color: var(--cyan);
}

.stat-diff {
  font-size: var(--text-base);
  margin-top: var(--space-2);
}

.stat-diff.positive {
  color: var(--green);
}

.stat-diff.negative {
  color: var(--red);
}

.stat-diff.neutral {
  color: var(--text-dim);
}

.death-cause {
  width: 100%;
  max-width: 400px;
  padding: var(--space-4) !important;
  text-align: center;
}

.death-label {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: var(--space-2);
}

.death-text {
  font-size: var(--text-lg);
  color: var(--red);
}

.essence-section {
  width: 100%;
  max-width: 400px;
  padding: var(--space-5) !important;
  text-align: center;
}

.essence-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.essence-label {
  font-size: var(--text-base);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.essence-icon {
  color: var(--purple);
  font-size: var(--text-lg);
}

.essence-value {
  font-size: var(--text-5xl);
  font-weight: bold;
  color: var(--purple);
  text-shadow: 0 0 12px rgba(139, 92, 246, 0.5);
  margin-bottom: var(--space-3);
}

.essence-bar {
  margin-bottom: var(--space-2);
}

.essence-diff {
  font-size: var(--text-base);
}

.essence-diff.positive {
  color: var(--green);
}

.essence-diff.negative {
  color: var(--red);
}

.essence-diff.neutral {
  color: var(--text-dim);
}

.summary-footer {
  display: flex;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--elevated);
  border-top: 1px solid var(--border);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.secondary {
  background: var(--highlight);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.action-btn.secondary:hover {
  background: var(--border);
  color: var(--text-primary);
}

.action-btn.primary {
  background: var(--indigo);
  border: 1px solid var(--indigo);
  color: white;
  font-weight: bold;
}

.action-btn.primary:hover {
  background: var(--indigo-hover);
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
}

.btn-icon {
  font-size: var(--text-base);
}

/* Extended Stats Sections */
.extended-section {
  width: 100%;
  max-width: 400px;
  padding: var(--space-4) !important;
}

.section-title {
  font-size: var(--text-base);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.combat-stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.combat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.combat-label {
  font-size: var(--text-base);
  color: var(--text-dim);
}

.combat-value {
  font-size: var(--text-lg);
  font-weight: bold;
  color: var(--text-primary);
}

.combat-value.dealt {
  color: var(--green);
}

.combat-value.taken {
  color: var(--red);
}

.combat-value.crit {
  color: var(--amber);
}

.combat-value.heal {
  color: var(--green);
}

.combat-value.danger {
  color: var(--red);
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.source-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.source-name {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.source-name.spell {
  color: var(--cyan);
}

.source-name.ability {
  color: var(--purple);
}

.source-name.threat {
  color: var(--red);
}

.source-damage {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--text-primary);
}

.source-damage.threat {
  color: var(--red);
}
</style>
