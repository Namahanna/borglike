<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import {
  getBotUpgradeById,
  getNextGradedUpgrade,
  canPurchaseBotUpgrade,
  type BotUpgradeId,
  type GradedCapabilityField,
} from '@game/data/bot-upgrades'
import UpgradeItem from './UpgradeItem.vue'

const progression = useProgressionStore()

type Category = 'stats' | 'meta' | 'qol' | 'bot'

const activeCategory = ref<Category>('stats')

const categories: { id: Category; label: string; icon: string }[] = [
  { id: 'stats', label: 'Stats', icon: '♥' },
  { id: 'bot', label: 'Bot', icon: '⚙' },
  { id: 'meta', label: 'Meta', icon: '◆' },
  { id: 'qol', label: 'QoL', icon: '▶' },
]

const currentUpgrades = computed(() => {
  return progression.upgradesByCategory[activeCategory.value as 'stats' | 'meta' | 'qol'] ?? []
})

// Bot upgrade chains mapped to UpgradeItem shape (one card per capability)
const gradedChains: { field: GradedCapabilityField; name: string; icon: string }[] = [
  { field: 'town', name: 'Town', icon: '⌂' },
  { field: 'tactics', name: 'Tactics', icon: '⚔' },
  { field: 'targeting', name: 'Targeting', icon: '◎' },
  { field: 'retreat', name: 'Retreat', icon: '←' },
  { field: 'kiting', name: 'Kiting', icon: '→' },
  { field: 'preparedness', name: 'Preparedness', icon: '✓' },
  { field: 'sweep', name: 'Sweep Farming', icon: '↔' },
  { field: 'surf', name: 'Surf Farming', icon: '≈' },
]

const botUpgradeItems = computed(() => {
  const caps = progression.botCapabilities
  const ess = progression.currency.essence
  const items: {
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
    effect: { type: 'flat' | 'percent' | 'unlock'; baseValue: number; perLevel: number }
  }[] = []

  // Farming toggle as unlock-type card
  const farmingUnlocked = caps.farming
  items.push({
    id: 'farming',
    name: 'Resource Farming',
    description: 'Farms gold/XP when under-leveled for descent',
    icon: '$',
    currentLevel: farmingUnlocked ? 1 : 0,
    maxLevel: 1,
    cost: farmingUnlocked ? 0 : (getBotUpgradeById('farming')?.cost ?? 200),
    canAfford: !farmingUnlocked && canPurchaseBotUpgrade('farming', caps, ess),
    isMaxed: farmingUnlocked,
    effectValue: farmingUnlocked ? 1 : 0,
    effect: { type: 'unlock' as const, baseValue: 0, perLevel: 1 },
  })

  // Graded chains: one card per field (sweep/surf require farming)
  for (const chain of gradedChains) {
    if ((chain.field === 'sweep' || chain.field === 'surf') && !farmingUnlocked) continue
    const currentLevel = caps[chain.field]
    const next = getNextGradedUpgrade(chain.field, caps)
    const nextId = next?.id
    const currentDesc =
      currentLevel > 0
        ? getBotUpgradeById(`${chain.field}_${currentLevel}` as BotUpgradeId)?.description
        : undefined
    items.push({
      id: nextId ?? `${chain.field}_3`,
      name: chain.name,
      description: next?.description ?? currentDesc ?? '',
      icon: chain.icon,
      currentLevel,
      maxLevel: 3,
      cost: next?.cost ?? 0,
      canAfford: nextId ? canPurchaseBotUpgrade(nextId, caps, ess) : false,
      isMaxed: currentLevel >= 3,
      effectValue: currentLevel,
      effect: { type: 'flat' as const, baseValue: 0, perLevel: 1 },
    })
  }

  return items
})

const displayedUpgrades = computed(() => {
  if (activeCategory.value === 'bot') return botUpgradeItems.value
  return currentUpgrades.value
})

function handlePurchase(upgradeId: string) {
  if (activeCategory.value === 'bot') {
    progression.purchaseBotUpgrade(upgradeId as BotUpgradeId)
  } else {
    progression.purchaseUpgrade(upgradeId)
  }
}
</script>

<template>
  <div class="upgrade-list">
    <div class="category-tabs">
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="category-tab"
        :class="{ active: activeCategory === cat.id }"
        @click="activeCategory = cat.id"
      >
        <span class="tab-icon">{{ cat.icon }}</span>
        <span class="tab-label">{{ cat.label }}</span>
      </button>
    </div>

    <div class="upgrades-scroll">
      <UpgradeItem
        v-for="upgrade in displayedUpgrades"
        :key="upgrade.id"
        v-bind="upgrade"
        @purchase="handlePurchase"
      />

      <div v-if="displayedUpgrades.length === 0" class="no-upgrades">
        No upgrades in this category
      </div>
    </div>
  </div>
</template>

<style scoped>
.upgrade-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.category-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.category-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-1) var(--space-1);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.category-tab:hover {
  background: var(--highlight);
}

.category-tab.active {
  background: var(--highlight);
  border-bottom: 2px solid var(--purple);
}

.tab-icon {
  font-size: var(--text-xl);
  color: var(--text-dim);
}

.category-tab.active .tab-icon {
  color: var(--purple);
  text-shadow: 0 0 6px rgba(139, 92, 246, 0.5);
}

.tab-label {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
}

.category-tab.active .tab-label {
  color: var(--text-secondary);
}

.upgrades-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.no-upgrades {
  text-align: center;
  padding: var(--space-6);
  color: var(--text-dim);
  font-style: italic;
  font-size: var(--text-base);
}
</style>
