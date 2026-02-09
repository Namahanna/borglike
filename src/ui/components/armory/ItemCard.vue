<script setup lang="ts">
import { computed } from 'vue'
import type { ItemTemplate } from '@game/data/items'
import type { ArtifactTemplate } from '@game/data/artifacts'
import type { ArmoryEntry } from '@/types/progression'

interface Props {
  item: ItemTemplate | ArtifactTemplate
  entry?: ArmoryEntry
  isArtifact?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: []
}>()

const isDiscovered = computed(() => !!props.entry)

// Get glyph for item type
function getGlyph(item: ItemTemplate | ArtifactTemplate): string {
  if ('slot' in item && !('type' in item)) {
    // Artifact - use slot to determine glyph
    const slotGlyphs: Record<string, string> = {
      weapon: '/',
      body: '[',
      shield: ')',
      helm: ']',
      gloves: '(',
      boots: '{',
      ring: '=',
      amulet: '"',
      light: '~',
    }
    return slotGlyphs[item.slot] ?? '*'
  }
  // Regular item template
  const typeGlyphs: Record<string, string> = {
    weapon: '/',
    bow: '}',
    armor: '[',
    shield: ')',
    helm: ']',
    gloves: '(',
    boots: '{',
    ring: '=',
    amulet: '"',
    light: '~',
    potion: '!',
    scroll: '?',
  }
  return typeGlyphs[(item as ItemTemplate).type] ?? '*'
}

// Get color based on tier
function getColor(item: ItemTemplate | ArtifactTemplate, isArtifact: boolean): string {
  if (isArtifact) return '#fbbf24' // Gold for artifacts
  const tier = (item as ItemTemplate).tier ?? 4
  const tierColors: Record<number, string> = {
    1: '#9ca3af', // Gray/white
    2: '#22c55e', // Green
    3: '#3b82f6', // Blue
    4: '#a855f7', // Purple
  }
  return tierColors[tier] ?? '#ffffff'
}

const glyph = computed(() => getGlyph(props.item))
const color = computed(() => getColor(props.item, props.isArtifact ?? false))
const itemName = computed(() => props.item.name)
const tier = computed(() => (props.item as ItemTemplate).tier ?? 4)
</script>

<template>
  <div
    class="item-card"
    :class="{ locked: !isDiscovered, artifact: isArtifact }"
    @click="emit('click')"
  >
    <div class="card-content">
      <div class="item-symbol" :style="{ color: isDiscovered ? color : '#4b5563' }">
        {{ isDiscovered ? glyph : '?' }}
      </div>
      <div class="item-name">
        {{ isDiscovered ? itemName : 'Unknown' }}
      </div>
      <div v-if="isDiscovered && entry" class="discovery-info">
        <span class="depth">D:{{ entry.firstFoundDepth }}</span>
      </div>
      <div v-if="isDiscovered && !isArtifact" class="tier-badge" :class="`tier-${tier}`">
        T{{ tier }}
      </div>
    </div>

    <div v-if="isDiscovered" class="discovered-badge">
      <span>✓</span>
    </div>
  </div>
</template>

<style scoped>
.item-card {
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.item-card:hover {
  background: var(--border);
  transform: translateY(-2px);
}

.item-card.locked {
  filter: grayscale(0.7);
  opacity: 0.6;
}

.item-card.artifact {
  border-color: var(--gold);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.3);
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.item-symbol {
  font-size: var(--text-5xl);
  font-weight: bold;
  line-height: 1;
  text-shadow: 0 0 8px currentColor;
}

.item-name {
  font-size: var(--text-base);
  color: var(--text-primary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.item-card.locked .item-name {
  color: var(--text-dim);
  font-style: italic;
}

.discovery-info {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-base);
  color: var(--text-dim);
  margin-top: 2px;
}

.depth {
  padding: 1px var(--space-1);
  background: var(--void);
  border-radius: var(--radius-sm);
}

.tier-badge {
  font-size: var(--text-sm);
  font-weight: bold;
  padding: 2px var(--space-2);
  border-radius: var(--radius-md);
  margin-top: var(--space-1);
}

.tier-badge.tier-1 {
  color: #9ca3af;
  background: rgba(156, 163, 175, 0.15);
}

.tier-badge.tier-2 {
  color: var(--green);
  background: rgba(34, 197, 94, 0.15);
}

.tier-badge.tier-3 {
  color: var(--blue);
  background: rgba(59, 130, 246, 0.15);
}

.tier-badge.tier-4 {
  color: var(--purple);
  background: rgba(168, 85, 247, 0.15);
}

.discovered-badge {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  width: 18px;
  height: 18px;
  background: var(--green);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-base);
  color: white;
}

.item-card.artifact .discovered-badge {
  background: var(--gold);
}
</style>
