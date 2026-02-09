<script setup lang="ts">
import { ref, computed } from 'vue'
import type { StatModifiers, RaceAbility } from '@game/data/races'

const props = defineProps<{
  id: string
  name: string
  description: string
  isUnlocked: boolean
  cost: number
  canAfford: boolean
  unlockCondition?: string
  prestige?: boolean
  meetsCondition?: boolean
  type: 'race' | 'class'
  // Extended data for tooltips
  stats?: StatModifiers
  hitdie?: number
  // Race-specific
  infravision?: number
  expPenalty?: number
  abilities?: RaceAbility[]
  // Class-specific
  maxAttacks?: number
  primaryStat?: string
  usesMagic?: boolean
  botBehavior?: string
}>()

// Can only unlock if: not already unlocked, can afford, and meets condition
const canUnlock = computed(() => {
  if (props.isUnlocked) return false
  if (!props.canAfford) return false
  if (props.meetsCondition === false) return false
  return true
})

const showTooltip = ref(false)
const tooltipPosition = ref({ x: 0, y: 0 })

function formatStat(value: number): string {
  if (value > 0) return `+${value}`
  return String(value)
}

function formatStatClass(value: number): string {
  if (value > 0) return 'stat-positive'
  if (value < 0) return 'stat-negative'
  return 'stat-neutral'
}

const hasExtendedData = computed(() => props.stats !== undefined)

function handleMouseEnter(event: MouseEvent) {
  if (!hasExtendedData.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tooltipPosition.value = {
    x: rect.right + 8,
    y: rect.top,
  }
  showTooltip.value = true
}

function handleMouseLeave() {
  showTooltip.value = false
}

const emit = defineEmits<{
  unlock: [id: string, type: 'race' | 'class']
}>()

function handleUnlock() {
  if (canUnlock.value) {
    emit('unlock', props.name, props.type)
  }
}
</script>

<template>
  <div
    class="unlock-item"
    :class="{
      'is-unlocked': isUnlocked,
      'can-afford': canUnlock,
      'cannot-afford': !isUnlocked && !canUnlock,
      'is-prestige': prestige,
      'condition-not-met': !isUnlocked && meetsCondition === false,
    }"
    @click="handleUnlock"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="unlock-badge">
      <span v-if="isUnlocked" class="badge-icon unlocked">✓</span>
      <span v-else-if="meetsCondition === false" class="badge-icon locked">🔒</span>
      <span v-else-if="prestige" class="badge-icon prestige">★</span>
      <span v-else class="badge-icon locked">●</span>
    </div>

    <div class="unlock-info">
      <div class="unlock-status">
        <span v-if="isUnlocked" class="status-unlocked">✓</span>
        <template v-else>
          <button class="unlock-btn" :disabled="!canUnlock">
            <span class="cost-icon">◆</span>
            <span>{{ cost.toLocaleString() }}</span>
          </button>
        </template>
      </div>
      <div class="unlock-header">
        <span class="unlock-name">{{ name }}</span>
        <span v-if="prestige" class="prestige-tag">Prestige</span>
      </div>
      <div class="unlock-desc">{{ description }}</div>
      <div
        v-if="!isUnlocked && meetsCondition === false && unlockCondition"
        class="unlock-condition"
      >
        {{ unlockCondition }}
      </div>
    </div>

    <!-- Tooltip -->
    <Teleport to="body">
      <div
        v-if="showTooltip && hasExtendedData"
        class="unlock-tooltip"
        :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"
      >
        <div class="tooltip-header">
          <span class="tooltip-name">{{ name }}</span>
          <span v-if="prestige" class="tooltip-prestige">Prestige</span>
        </div>

        <!-- Stats -->
        <div v-if="stats" class="tooltip-stats">
          <span :class="formatStatClass(stats.str)">STR {{ formatStat(stats.str) }}</span>
          <span :class="formatStatClass(stats.int)">INT {{ formatStat(stats.int) }}</span>
          <span :class="formatStatClass(stats.wis)">WIS {{ formatStat(stats.wis) }}</span>
          <span :class="formatStatClass(stats.dex)">DEX {{ formatStat(stats.dex) }}</span>
          <span :class="formatStatClass(stats.con)">CON {{ formatStat(stats.con) }}</span>
        </div>

        <!-- Race-specific info -->
        <template v-if="type === 'race'">
          <div class="tooltip-row">
            <span class="tooltip-label">Hit Die:</span>
            <span class="tooltip-value">+{{ hitdie }}</span>
          </div>
          <div v-if="infravision && infravision > 0" class="tooltip-row">
            <span class="tooltip-label">Infravision:</span>
            <span class="tooltip-value">{{ infravision * 10 }}ft</span>
          </div>
          <div v-if="expPenalty && expPenalty !== 100" class="tooltip-row">
            <span class="tooltip-label">XP Cost:</span>
            <span class="tooltip-value xp-penalty">{{ expPenalty }}%</span>
          </div>
        </template>

        <!-- Class-specific info -->
        <template v-if="type === 'class'">
          <div class="tooltip-row">
            <span class="tooltip-label">Hit Die:</span>
            <span class="tooltip-value"
              >{{ hitdie !== undefined && hitdie >= 0 ? '+' : '' }}{{ hitdie }}</span
            >
          </div>
          <div class="tooltip-row">
            <span class="tooltip-label">Max Attacks:</span>
            <span class="tooltip-value">{{ maxAttacks }}/round</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-label">Primary:</span>
            <span class="tooltip-value primary-stat">{{ primaryStat?.toUpperCase() }}</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-label">Magic:</span>
            <span class="tooltip-value">{{ usesMagic ? 'Yes' : 'No' }}</span>
          </div>
        </template>

        <!-- Abilities (Race) -->
        <div v-if="abilities && abilities.length > 0" class="tooltip-abilities">
          <div class="abilities-header">Abilities</div>
          <div v-for="ability in abilities" :key="ability.id" class="ability-item">
            <span class="ability-name">{{ ability.name }}</span>
            <span class="ability-desc">{{ ability.description }}</span>
          </div>
        </div>

        <!-- Bot Behavior (Class) -->
        <div v-if="botBehavior" class="tooltip-behavior">
          <div class="behavior-header">Bot AI</div>
          <div class="behavior-text">{{ botBehavior }}</div>
        </div>

        <!-- Unlock condition -->
        <div v-if="unlockCondition && !isUnlocked" class="tooltip-unlock">
          {{ unlockCondition }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.unlock-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(18, 18, 31, 0.98) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.unlock-item.can-afford {
  cursor: pointer;
  border-color: var(--cyan);
}

.unlock-item.can-afford:hover {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(26, 26, 46, 0.95) 100%);
  box-shadow: 0 0 12px rgba(6, 182, 212, 0.2);
}

.unlock-item.is-unlocked {
  opacity: 0.7;
}

.unlock-item.cannot-afford {
  border-color: var(--border);
}

.cannot-afford .unlock-name {
  color: var(--text-secondary);
}

.cannot-afford .unlock-badge {
  opacity: 0.5;
}

.unlock-item.is-prestige {
  border-color: var(--amber);
}

.unlock-item.is-prestige.can-afford:hover {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(26, 26, 46, 0.95) 100%);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.2);
}

.unlock-badge {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.badge-icon {
  font-size: var(--text-lg);
}

.badge-icon.unlocked {
  color: var(--green);
  text-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.badge-icon.prestige {
  color: var(--amber);
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
}

.badge-icon.locked {
  color: var(--text-dim);
}

.unlock-info {
  flex: 1;
  min-width: 0;
}

.unlock-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: 2px;
}

.unlock-name {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--text-primary);
}

.is-unlocked .unlock-name {
  color: var(--text-secondary);
}

.prestige-tag {
  font-size: var(--text-2xs);
  padding: 1px var(--space-1);
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid var(--amber);
  border-radius: var(--radius-sm);
  color: var(--amber);
  text-transform: uppercase;
}

.unlock-desc {
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: 1.4;
}

.unlock-condition {
  font-size: var(--text-sm);
  color: var(--amber);
  margin-top: 2px;
  font-style: italic;
  opacity: 0.8;
}

.condition-not-met {
  border-color: var(--text-dim);
}

.condition-not-met .prestige-tag {
  background: rgba(100, 100, 100, 0.2);
  border-color: var(--text-dim);
  color: var(--text-dim);
}

.unlock-status {
  float: right;
  margin-left: var(--space-2);
}

.status-unlocked {
  color: var(--green);
  font-size: var(--text-xl);
  text-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.unlock-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.unlock-btn:not(:disabled):hover {
  background: var(--cyan);
  border-color: var(--cyan);
  color: white;
}

.is-prestige .unlock-btn:not(:disabled):hover {
  background: var(--amber);
  border-color: var(--amber);
}

.unlock-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.cost-icon {
  color: var(--purple);
  font-size: var(--text-sm);
}

.unlock-btn:not(:disabled):hover .cost-icon {
  color: white;
}

/* Tooltip Styles */
.unlock-tooltip {
  position: fixed;
  z-index: 9999;
  min-width: 220px;
  max-width: 280px;
  padding: var(--space-3);
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(15, 15, 26, 0.99) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.tooltip-name {
  font-size: var(--text-lg);
  font-weight: bold;
  color: var(--text-primary);
}

.tooltip-prestige {
  font-size: var(--text-sm);
  padding: 2px var(--space-1);
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid var(--amber);
  border-radius: var(--radius-sm);
  color: var(--amber);
  text-transform: uppercase;
}

.tooltip-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  padding: var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.stat-positive {
  color: var(--green);
}

.stat-negative {
  color: var(--red);
}

.stat-neutral {
  color: var(--text-dim);
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: var(--text-base);
}

.tooltip-label {
  color: var(--text-dim);
}

.tooltip-value {
  color: var(--text-primary);
}

.xp-penalty {
  color: var(--amber);
}

.primary-stat {
  color: var(--cyan);
  font-weight: bold;
}

.tooltip-abilities {
  margin-top: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.abilities-header {
  font-size: var(--text-sm);
  color: var(--purple);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: var(--space-2);
}

.ability-item {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--space-2);
}

.ability-item:last-child {
  margin-bottom: 0;
}

.ability-name {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--cyan);
}

.ability-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-top: 1px;
}

.tooltip-behavior {
  margin-top: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.behavior-header {
  font-size: var(--text-sm);
  color: var(--purple);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: var(--space-1);
}

.behavior-text {
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: 1.4;
}

.tooltip-unlock {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-2);
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--amber);
  font-style: italic;
}
</style>
