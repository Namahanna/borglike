<script setup lang="ts">
import { computed } from 'vue'
import ProgressBar from '../common/ProgressBar.vue'

const props = defineProps<{
  id: string
  name: string
  description: string
  icon: string
  currentLevel: number
  maxLevel: number
  cost: number
  canAfford: boolean
  isMaxed: boolean
  effectValue: number
  effect: {
    type: 'flat' | 'percent' | 'unlock'
    stat?: string
    baseValue: number
    perLevel: number
  }
}>()

const emit = defineEmits<{
  purchase: [id: string]
}>()

const effectText = computed(() => {
  if (props.effect.type === 'unlock') {
    return props.currentLevel > 0 ? 'Unlocked' : 'Locked'
  }
  if (props.effectValue === 0) return 'Not purchased'
  const suffix = props.effect.type === 'percent' ? '%' : ''
  return `+${props.effectValue}${suffix}`
})

const costText = computed(() => {
  if (props.isMaxed) return 'MAX'
  return props.cost.toLocaleString()
})

function handlePurchase() {
  if (!props.isMaxed && props.canAfford) {
    emit('purchase', props.id)
  }
}
</script>

<template>
  <div
    class="upgrade-item"
    :class="{
      'is-maxed': isMaxed,
      'can-afford': canAfford && !isMaxed,
      'cannot-afford': !canAfford && !isMaxed,
    }"
  >
    <div class="upgrade-icon">{{ icon }}</div>

    <div class="upgrade-info">
      <div class="upgrade-header">
        <span class="upgrade-name">{{ name }}</span>
        <span class="upgrade-level">{{ currentLevel }}/{{ maxLevel }}</span>
      </div>

      <div class="upgrade-desc">{{ description }}</div>

      <div class="upgrade-progress">
        <ProgressBar :current="currentLevel" :max="maxLevel" variant="upgrade" size="sm" />
      </div>
    </div>

    <div class="upgrade-action">
      <div class="effect-value">{{ effectText }}</div>
      <button class="purchase-btn" :disabled="isMaxed || !canAfford" @click="handlePurchase">
        <span v-if="!isMaxed" class="cost-icon">◆</span>
        <span class="cost-text">{{ costText }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.upgrade-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(18, 18, 31, 0.98) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.upgrade-item.can-afford {
  border-color: var(--purple);
  cursor: pointer;
}

.upgrade-item.can-afford:hover {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(26, 26, 46, 0.95) 100%);
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.2);
}

.upgrade-item.is-maxed {
  opacity: 0.8;
}

.upgrade-item.cannot-afford {
  border-color: var(--border);
}

.cannot-afford .upgrade-name {
  color: var(--text-secondary);
}

.cannot-afford .upgrade-icon {
  opacity: 0.5;
}

.upgrade-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xl);
  background: var(--highlight);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.can-afford .upgrade-icon {
  color: var(--purple);
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
}

.is-maxed .upgrade-icon {
  color: var(--green);
  text-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}

.upgrade-info {
  flex: 1;
  min-width: 0;
}

.upgrade-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.upgrade-name {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--text-primary);
}

.upgrade-level {
  font-size: var(--text-base);
  color: var(--text-dim);
}

.upgrade-desc {
  font-size: var(--text-base);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}

.upgrade-progress {
  max-width: 120px;
}

.upgrade-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
  flex-shrink: 0;
}

.effect-value {
  font-size: var(--text-base);
  color: var(--cyan);
}

.is-maxed .effect-value {
  color: var(--green);
  text-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.purchase-btn {
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

.purchase-btn:not(:disabled):hover {
  background: var(--purple);
  border-color: var(--purple);
  color: white;
}

.purchase-btn:disabled {
  cursor: not-allowed;
}

.cost-icon {
  color: var(--purple);
  font-size: var(--text-base);
}

.cannot-afford .cost-icon {
  opacity: 0.5;
  filter: saturate(0.5);
}

.purchase-btn:not(:disabled):hover .cost-icon {
  color: white;
}

.is-maxed .purchase-btn {
  background: rgba(34, 197, 94, 0.15);
  border-color: var(--green);
  color: var(--green);
}
</style>
