<script setup lang="ts">
import { computed } from 'vue'
import type { GameClass } from '@game/data/classes'

interface Props {
  gameClass: GameClass
  unlocked: boolean
  wins: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: []
}>()

// Get category badge
const category = computed(() => {
  if (props.gameClass.prestige) return 'prestige'
  if (props.gameClass.starting) return 'starter'
  return 'unlockable'
})

// Class symbols based on archetype
const classSymbols: Record<string, string> = {
  warrior: '\u2694', // Crossed swords
  mage: '\u2728', // Sparkles
  rogue: '\uD83D\uDDE1', // Dagger (🗡)
  priest: '\u271D', // Latin cross
  ranger: '\uD83C\uDFF9', // Bow and arrow (🏹)
  paladin: '\u2638', // Wheel of dharma (shield-like)
  necromancer: '\uD83D\uDC80', // Skull (💀)
  berserker: '\uD83D\uDCA2', // Anger symbol (💢)
  archmage: '\u2728', // Sparkles
  druid: '\uD83C\uDF3F', // Herb (🌿)
  blackguard: '\u26AB', // Black circle
}

// Get display symbol
const symbol = computed(() => {
  if (!props.unlocked) return '?'
  return classSymbols[props.gameClass.id] ?? props.gameClass.name.charAt(0).toUpperCase()
})

// Get color based on category and magic
const color = computed(() => {
  if (!props.unlocked) return '#4b5563'
  if (props.gameClass.prestige) return '#f59e0b' // Amber for prestige
  if (props.gameClass.starting) return '#22c55e' // Green for starter
  return '#3b82f6' // Blue for unlockable
})

// Short unlock hint for locked classes
const unlockHint = computed(() => {
  if (props.unlocked || !props.gameClass.unlockCondition) return null
  const condition = props.gameClass.unlockCondition
  // Shorten common patterns
  if (condition.includes('Win a run with')) {
    return condition.replace('Win a run with ', 'Win ')
  }
  if (condition.includes(' total')) {
    return condition.replace(' total', '')
  }
  return condition.length > 15 ? condition.substring(0, 12) + '...' : condition
})

// Primary stat display
const primaryStat = computed(() => {
  if (!props.unlocked) return null
  const statNames: Record<string, string> = {
    str: 'STR',
    int: 'INT',
    wis: 'WIS',
    dex: 'DEX',
    con: 'CON',
  }
  return statNames[props.gameClass.primaryStat] ?? props.gameClass.primaryStat.toUpperCase()
})
</script>

<template>
  <div
    class="class-card"
    :class="{
      locked: !unlocked,
      prestige: gameClass.prestige,
      starter: gameClass.starting,
      magic: gameClass.usesMagic,
    }"
    @click="emit('click')"
  >
    <div class="category-badge" :class="category">
      {{ category.toUpperCase() }}
    </div>

    <div class="card-content">
      <div class="class-symbol" :style="{ color }">
        {{ symbol }}
      </div>
      <div class="class-name">
        {{ gameClass.name }}
      </div>

      <!-- Magic indicator and primary stat -->
      <div v-if="unlocked" class="class-info">
        <span v-if="gameClass.usesMagic" class="magic-badge">Magic</span>
        <span v-if="primaryStat" class="primary-stat">{{ primaryStat }}</span>
      </div>
      <div v-else-if="unlockHint" class="unlock-hint">
        {{ unlockHint }}
      </div>

      <!-- Win count -->
      <div v-if="unlocked && wins > 0" class="win-count">
        {{ wins }} win{{ wins !== 1 ? 's' : '' }}
      </div>
    </div>

    <!-- Unlocked badge -->
    <div v-if="unlocked" class="unlocked-badge">
      <span>✓</span>
    </div>

    <!-- Lock icon for locked -->
    <div v-if="!unlocked" class="lock-icon">
      <span>🔒</span>
    </div>
  </div>
</template>

<style scoped>
.class-card {
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.class-card:hover {
  background: var(--border);
  transform: translateY(-2px);
}

.class-card.locked {
  filter: grayscale(0.5);
  opacity: 0.7;
}

.class-card.prestige {
  border-color: rgba(245, 158, 11, 0.5);
}

.class-card.prestige:not(.locked) {
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.2);
}

.category-badge {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  font-size: var(--text-2xs);
  font-weight: bold;
  letter-spacing: 0.5px;
  padding: 2px 0;
  text-align: center;
  background: var(--void);
  color: var(--text-dim);
}

.category-badge.starter {
  color: var(--green);
  background: rgba(34, 197, 94, 0.1);
}

.category-badge.unlockable {
  color: var(--blue);
  background: rgba(59, 130, 246, 0.1);
}

.category-badge.prestige {
  color: var(--amber);
  background: rgba(245, 158, 11, 0.1);
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-3);
}

.class-symbol {
  font-size: 28px;
  line-height: 1;
  text-shadow: 0 0 8px currentColor;
}

.class-name {
  font-size: var(--text-base);
  color: var(--text-primary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.class-card.locked .class-name {
  color: var(--text-dim);
}

.class-info {
  display: flex;
  gap: var(--space-1);
  margin-top: 2px;
}

.magic-badge {
  font-size: var(--text-2xs);
  color: var(--violet);
  background: rgba(167, 139, 250, 0.15);
  padding: 1px var(--space-1);
  border-radius: var(--radius-sm);
}

.primary-stat {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  background: var(--void);
  padding: 1px var(--space-1);
  border-radius: var(--radius-sm);
}

.unlock-hint {
  font-size: var(--text-sm);
  color: var(--text-dim);
  font-style: italic;
  margin-top: 2px;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.win-count {
  font-size: var(--text-base);
  color: var(--green);
  margin-top: var(--space-1);
  padding: 2px var(--space-2);
  background: rgba(34, 197, 94, 0.1);
  border-radius: var(--radius-md);
}

.unlocked-badge {
  position: absolute;
  top: 14px;
  right: var(--space-1);
  width: 16px;
  height: 16px;
  background: var(--green);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  color: white;
}

.class-card.prestige .unlocked-badge {
  background: var(--amber);
}

.lock-icon {
  position: absolute;
  top: 14px;
  right: var(--space-1);
  font-size: var(--text-base);
  opacity: 0.5;
}
</style>
