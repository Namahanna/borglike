<script setup lang="ts">
defineProps<{
  focused?: boolean
  noPadding?: boolean
}>()
</script>

<template>
  <div
    class="panel-frame"
    :class="{ 'panel-frame--focused': focused, 'panel-frame--no-padding': noPadding }"
  >
    <slot />
  </div>
</template>

<style scoped>
.panel-frame {
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(18, 18, 31, 0.98) 100%);
  border: 1px solid var(--border);
  border-top-color: var(--border-light);
  border-left-color: var(--border-light);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 4px 12px rgba(0, 0, 0, 0.4);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.panel-frame--no-padding {
  padding: 0;
}

.panel-frame--focused {
  border-color: var(--indigo);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.4),
    0 0 20px rgba(99, 102, 241, 0.15);
}
</style>
