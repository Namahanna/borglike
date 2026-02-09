<script setup lang="ts">
import { computed } from 'vue'
import type { ItemTemplate } from '@game/data/items'
import type { ArtifactTemplate } from '@game/data/artifacts'
import type { ArmoryEntry } from '@/types/progression'

interface Props {
  item: ItemTemplate | ArtifactTemplate
  entry?: ArmoryEntry
  isArtifact: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Type guards
function isArtifactTemplate(item: ItemTemplate | ArtifactTemplate): item is ArtifactTemplate {
  return 'abilities' in item
}

// Format item type for display
const itemType = computed(() => {
  if (isArtifactTemplate(props.item)) {
    return props.item.baseType
  }
  return props.item.type.charAt(0).toUpperCase() + props.item.type.slice(1)
})

// Get slot name
const slotName = computed(() => {
  const item = props.item
  const slot = 'slot' in item ? item.slot : undefined
  if (!slot) return null
  return slot.charAt(0).toUpperCase() + slot.slice(1)
})

// Get tier (items only)
const tier = computed(() => {
  if (isArtifactTemplate(props.item)) return null
  return props.item.tier
})

// Get glyph for display
const glyph = computed(() => {
  if (isArtifactTemplate(props.item)) {
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
    return slotGlyphs[props.item.slot] ?? '*'
  }
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
  return typeGlyphs[props.item.type] ?? '*'
})

// Get color based on tier/artifact
const color = computed(() => {
  if (props.isArtifact) return '#fbbf24'
  const t = tier.value ?? 4
  const tierColors: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
  }
  return tierColors[t] ?? '#ffffff'
})

// Format weight (stored in 0.1 lbs)
const formattedWeight = computed(() => {
  const w = props.item.weight / 10
  return w.toFixed(1) + ' lb'
})

// Format min depth
const minDepth = computed(() => {
  return props.item.minDepth ?? 0
})

// Format discovery date
const discoveryDate = computed(() => {
  if (!props.entry) return null
  return new Date(props.entry.firstFoundTime).toLocaleDateString()
})

// Get bonuses for artifacts
const bonuses = computed(() => {
  if (!isArtifactTemplate(props.item)) return null
  return Object.entries(props.item.bonuses).map(([stat, value]) => ({
    stat,
    value: value > 0 ? `+${value}` : `${value}`,
  }))
})
</script>

<template>
  <div class="detail-panel" :class="{ artifact: isArtifact }">
    <header class="panel-header">
      <button class="back-btn" @click="emit('close')">&larr;</button>
      <h3>Item Details</h3>
    </header>

    <div class="panel-content">
      <!-- Item symbol and name -->
      <div class="item-hero">
        <div class="item-symbol" :style="{ color }">{{ glyph }}</div>
        <h2 class="item-name" :style="{ color }">{{ item.name }}</h2>
        <div class="item-subtitle">
          <span class="item-type">{{ itemType }}</span>
          <span v-if="slotName" class="item-slot">({{ slotName }})</span>
        </div>
      </div>

      <!-- Tier badge for regular items -->
      <div v-if="tier" class="tier-section">
        <span class="tier-badge" :class="`tier-${tier}`">Tier {{ tier }}</span>
      </div>

      <!-- Artifact badge -->
      <div v-if="isArtifact" class="artifact-section">
        <span class="artifact-badge">Artifact</span>
      </div>

      <!-- Stats section -->
      <div class="stats-section">
        <h4>Stats</h4>
        <div class="stat-grid">
          <div v-if="item.damage" class="stat-row">
            <span class="stat-label">Damage</span>
            <span class="stat-value damage">{{ item.damage }}</span>
          </div>
          <div v-if="item.protection" class="stat-row">
            <span class="stat-label">Protection</span>
            <span class="stat-value protection">{{ item.protection }} AC</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Weight</span>
            <span class="stat-value">{{ formattedWeight }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Min Depth</span>
            <span class="stat-value">D:{{ minDepth }}</span>
          </div>
          <div v-if="'lightRadius' in item && item.lightRadius" class="stat-row">
            <span class="stat-label">Light Radius</span>
            <span class="stat-value">{{ item.lightRadius }} tiles</span>
          </div>
          <div v-if="'range' in item && item.range" class="stat-row">
            <span class="stat-label">Range</span>
            <span class="stat-value">{{ item.range }} tiles</span>
          </div>
          <div v-if="'multiplier' in item && item.multiplier" class="stat-row">
            <span class="stat-label">Multiplier</span>
            <span class="stat-value">x{{ item.multiplier }}</span>
          </div>
        </div>
      </div>

      <!-- Bonuses section (artifacts) -->
      <div v-if="bonuses && bonuses.length > 0" class="bonuses-section">
        <h4>Bonuses</h4>
        <div class="bonus-grid">
          <div v-for="bonus in bonuses" :key="bonus.stat" class="bonus-tag">
            <span class="bonus-stat">{{ bonus.stat }}</span>
            <span class="bonus-value">{{ bonus.value }}</span>
          </div>
        </div>
      </div>

      <!-- Abilities section (artifacts) -->
      <div v-if="isArtifactTemplate(item) && item.abilities.length > 0" class="abilities-section">
        <h4>Abilities</h4>
        <ul class="abilities-list">
          <li v-for="ability in item.abilities" :key="ability">{{ ability }}</li>
        </ul>
      </div>

      <!-- Effect (regular items) -->
      <div v-if="!isArtifactTemplate(item) && item.effect" class="effect-section">
        <h4>Effect</h4>
        <p class="effect-text">{{ item.effect }}</p>
      </div>

      <!-- Description (artifacts) -->
      <div v-if="isArtifactTemplate(item)" class="description-section">
        <h4>Lore</h4>
        <p class="description-text">{{ item.description }}</p>
      </div>

      <!-- Discovery info -->
      <div v-if="entry" class="discovery-section">
        <h4>Discovery</h4>
        <div class="discovery-info">
          <div class="discovery-row">
            <span class="discovery-label">First Found</span>
            <span class="discovery-value">{{ discoveryDate }}</span>
          </div>
          <div class="discovery-row">
            <span class="discovery-label">Found at Depth</span>
            <span class="discovery-value">D:{{ entry.firstFoundDepth }}</span>
          </div>
        </div>
      </div>

      <!-- Not discovered message -->
      <div v-else class="undiscovered-section">
        <p class="undiscovered-text">
          This item has not been discovered yet. Keep exploring the dungeon!
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  background: var(--panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 280px;
  max-width: 320px;
}

.detail-panel.artifact {
  border-left-color: var(--gold);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--void);
}

.panel-header h3 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text-secondary);
}

.back-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-xl);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--highlight);
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.item-hero {
  text-align: center;
  margin-bottom: var(--space-5);
}

.item-symbol {
  font-size: 48px;
  font-weight: bold;
  line-height: 1;
  text-shadow: 0 0 12px currentColor;
  margin-bottom: var(--space-2);
}

.item-name {
  margin: 0 0 var(--space-1);
  font-size: var(--text-2xl);
}

.item-subtitle {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.item-type {
  color: var(--text-dim);
}

.item-slot {
  margin-left: var(--space-1);
}

.tier-section,
.artifact-section {
  text-align: center;
  margin-bottom: var(--space-4);
}

.tier-badge {
  display: inline-block;
  font-size: var(--text-base);
  font-weight: bold;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
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

.artifact-badge {
  display: inline-block;
  font-size: var(--text-base);
  font-weight: bold;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--gold);
  background: rgba(251, 191, 36, 0.15);
}

.stats-section,
.bonuses-section,
.abilities-section,
.effect-section,
.description-section,
.discovery-section,
.undiscovered-section {
  margin-bottom: var(--space-4);
}

h4 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.stat-label {
  color: var(--text-secondary);
}

.stat-value {
  color: var(--text-primary);
}

.stat-value.damage {
  color: var(--red);
}

.stat-value.protection {
  color: var(--blue);
}

.bonus-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.bonus-tag {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.bonus-stat {
  color: var(--text-secondary);
}

.bonus-value {
  color: var(--gold);
}

.abilities-list {
  margin: 0;
  padding: 0 0 0 var(--space-4);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.abilities-list li {
  margin-bottom: var(--space-1);
}

.effect-text,
.description-text {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: 1.5;
  font-style: italic;
}

.discovery-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.discovery-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.discovery-label {
  color: var(--text-secondary);
}

.discovery-value {
  color: var(--green);
}

.undiscovered-text {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-dim);
  font-style: italic;
  text-align: center;
  padding: var(--space-4);
  background: var(--highlight);
  border-radius: var(--radius-md);
}
</style>
