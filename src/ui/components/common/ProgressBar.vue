<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  current: number
  max: number
  variant?: 'hp' | 'mp' | 'xp' | 'upgrade' | 'essence'
  showText?: boolean
  size?: 'sm' | 'md' | 'lg'
}>()

const percentage = computed(() => {
  if (props.max <= 0) return 0
  return Math.min(100, Math.max(0, (props.current / props.max) * 100))
})

const hpState = computed(() => {
  if (props.variant !== 'hp') return ''
  const pct = percentage.value
  if (pct <= 25) return 'hp-low'
  if (pct <= 50) return 'hp-mid'
  return 'hp-full'
})

const variantClass = computed(() => {
  if (props.variant === 'hp') return hpState.value
  return props.variant || 'hp-full'
})
</script>

<template>
  <div class="progress-bar" :class="[variantClass, size || 'md']">
    <div class="progress-fill" :style="{ width: percentage + '%' }" />
    <span v-if="showText" class="progress-text"> {{ current }}/{{ max }} </span>
  </div>
</template>

<style scoped>
.progress-bar {
  position: relative;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.progress-bar.sm {
  height: 8px;
}
.progress-bar.md {
  height: 12px;
}
.progress-bar.lg {
  height: 16px;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.hp-full .progress-fill {
  background: var(--green);
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}

.hp-mid .progress-fill {
  background: var(--amber);
  box-shadow: 0 0 4px rgba(245, 158, 11, 0.4);
}

.hp-low .progress-fill {
  background: var(--red);
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);
}

.mp .progress-fill {
  background: var(--indigo);
  box-shadow: 0 0 4px rgba(99, 102, 241, 0.4);
}

.xp .progress-fill {
  background: var(--cyan);
  box-shadow: 0 0 4px rgba(6, 182, 212, 0.4);
}

.upgrade .progress-fill {
  background: var(--purple);
  box-shadow: 0 0 4px rgba(139, 92, 246, 0.4);
}

.essence .progress-fill {
  background: linear-gradient(90deg, var(--purple), var(--indigo));
  box-shadow: 0 0 4px rgba(139, 92, 246, 0.4);
}

.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-base);
  color: var(--text-primary);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
