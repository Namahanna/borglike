<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import { getBoosterById } from '@game/data/boosters'
import UnlockItem from './UnlockItem.vue'

const progression = useProgressionStore()

type Tab = 'races' | 'classes' | 'boosters'

const activeTab = ref<Tab>('races')

// Use store's precomputed canAfford, just add type tag
const currentUnlocks = computed(() => {
  if (activeTab.value === 'races') {
    return progression.raceUnlocks.map((r) => ({ ...r, type: 'race' as const }))
  }
  if (activeTab.value === 'classes') {
    return progression.classUnlocks.map((c) => ({ ...c, type: 'class' as const }))
  }
  return [] // boosters handled separately
})

// Boosters grouped by category
const boosterCategories = computed(() => {
  return progression.boostersByCategory
})

const unlockedCount = computed(() => {
  if (activeTab.value === 'races') {
    return progression.raceUnlocks.filter((r) => r.isUnlocked).length
  }
  if (activeTab.value === 'classes') {
    return progression.classUnlocks.filter((c) => c.isUnlocked).length
  }
  return progression.unlockedBoosters.length
})

const totalCount = computed(() => {
  if (activeTab.value === 'races') {
    return progression.raceUnlocks.length
  }
  if (activeTab.value === 'classes') {
    return progression.classUnlocks.length
  }
  return progression.allBoosters.length
})

function handleUnlock(name: string, type: 'race' | 'class') {
  const item = currentUnlocks.value.find((u) => u.name === name)
  if (!item) return

  if (type === 'race') {
    progression.unlockRace(name, item.cost)
  } else {
    progression.unlockClass(name, item.cost)
  }
}

function handleBoosterUnlock(boosterId: string) {
  progression.unlockBooster(boosterId)
}

function getPrereqNames(boosterId: string): string[] {
  const booster = getBoosterById(boosterId)
  if (!booster?.requires) return []
  const prereqs = Array.isArray(booster.requires) ? booster.requires : [booster.requires]
  return prereqs
    .map((id) => getBoosterById(id)?.name)
    .filter((name): name is string => name !== undefined)
}
</script>

<template>
  <div class="unlock-list">
    <div class="unlock-tabs">
      <button
        class="unlock-tab"
        :class="{ active: activeTab === 'races' }"
        @click="activeTab = 'races'"
      >
        <span class="tab-icon">☺</span>
        <span class="tab-label">Races</span>
      </button>
      <button
        class="unlock-tab"
        :class="{ active: activeTab === 'classes' }"
        @click="activeTab = 'classes'"
      >
        <span class="tab-icon">⚔</span>
        <span class="tab-label">Classes</span>
      </button>
      <button
        class="unlock-tab"
        :class="{ active: activeTab === 'boosters' }"
        @click="activeTab = 'boosters'"
      >
        <span class="tab-icon">★</span>
        <span class="tab-label">Boosters</span>
      </button>
    </div>

    <div class="unlock-header">
      <span class="header-text">{{ unlockedCount }} / {{ totalCount }} Unlocked</span>
      <span v-if="activeTab !== 'boosters'" class="codex-hint">
        <span class="codex-icon">📜</span>
        Codex has details
      </span>
    </div>

    <div class="unlocks-scroll">
      <!-- Race/Class Unlocks -->
      <template v-if="activeTab !== 'boosters'">
        <UnlockItem
          v-for="item in currentUnlocks"
          :id="item.id"
          :key="item.id"
          :name="item.name"
          :description="item.description"
          :is-unlocked="item.isUnlocked"
          :cost="item.cost"
          :can-afford="item.canAfford"
          :unlock-condition="item.unlockCondition"
          :prestige="item.prestige"
          :meets-condition="item.meetsCondition"
          :type="item.type"
          :stats="item.stats"
          :hitdie="item.hitdie"
          :infravision="'infravision' in item ? item.infravision : undefined"
          :exp-penalty="'expPenalty' in item ? item.expPenalty : undefined"
          :abilities="'abilities' in item ? item.abilities : undefined"
          :max-attacks="'maxAttacks' in item ? item.maxAttacks : undefined"
          :primary-stat="'primaryStat' in item ? item.primaryStat : undefined"
          :uses-magic="'usesMagic' in item ? item.usesMagic : undefined"
          :bot-behavior="'botBehavior' in item ? item.botBehavior : undefined"
          @unlock="handleUnlock"
        />

        <div v-if="currentUnlocks.length === 0" class="no-unlocks">
          All {{ activeTab }} unlocked!
        </div>
      </template>

      <!-- Booster Unlocks -->
      <template v-else>
        <!-- Equipment Category -->
        <div class="booster-category">
          <div class="category-header">Equipment</div>
          <div
            v-for="booster in boosterCategories.equipment"
            :key="booster.id"
            class="booster-item"
            :class="{
              'is-unlocked': booster.isUnlocked,
              'can-unlock': booster.canUnlock,
              'cannot-unlock': !booster.canUnlock && !booster.isUnlocked,
            }"
            @click="booster.canUnlock && handleBoosterUnlock(booster.id)"
          >
            <span class="booster-icon">{{ booster.icon }}</span>
            <div class="booster-info">
              <div class="booster-name">{{ booster.name }}</div>
              <div class="booster-desc">{{ booster.description }}</div>
              <div v-if="booster.requires && !booster.isUnlocked" class="booster-prereq">
                Requires: {{ getPrereqNames(booster.id).join(' + ') }}
              </div>
            </div>
            <div class="booster-status">
              <span v-if="booster.isUnlocked" class="status-unlocked">✓</span>
              <button v-else class="unlock-btn" :disabled="!booster.canUnlock">
                <span class="cost-icon">◆</span>
                {{ booster.cost.toLocaleString() }}
              </button>
            </div>
          </div>
        </div>

        <!-- Stats Category -->
        <div class="booster-category">
          <div class="category-header">Stats</div>
          <div
            v-for="booster in boosterCategories.stats"
            :key="booster.id"
            class="booster-item"
            :class="{
              'is-unlocked': booster.isUnlocked,
              'can-unlock': booster.canUnlock,
              'cannot-unlock': !booster.canUnlock && !booster.isUnlocked,
            }"
            @click="booster.canUnlock && handleBoosterUnlock(booster.id)"
          >
            <span class="booster-icon">{{ booster.icon }}</span>
            <div class="booster-info">
              <div class="booster-name">{{ booster.name }}</div>
              <div class="booster-desc">{{ booster.description }}</div>
              <div v-if="booster.requires && !booster.isUnlocked" class="booster-prereq">
                Requires: {{ getPrereqNames(booster.id).join(' + ') }}
              </div>
            </div>
            <div class="booster-status">
              <span v-if="booster.isUnlocked" class="status-unlocked">✓</span>
              <button v-else class="unlock-btn" :disabled="!booster.canUnlock">
                <span class="cost-icon">◆</span>
                {{ booster.cost.toLocaleString() }}
              </button>
            </div>
          </div>
        </div>

        <!-- Special Category -->
        <div class="booster-category">
          <div class="category-header">Special</div>
          <div
            v-for="booster in boosterCategories.special"
            :key="booster.id"
            class="booster-item"
            :class="{
              'is-unlocked': booster.isUnlocked,
              'can-unlock': booster.canUnlock,
              'cannot-unlock': !booster.canUnlock && !booster.isUnlocked,
            }"
            @click="booster.canUnlock && handleBoosterUnlock(booster.id)"
          >
            <span class="booster-icon">{{ booster.icon }}</span>
            <div class="booster-info">
              <div class="booster-name">{{ booster.name }}</div>
              <div class="booster-desc">{{ booster.description }}</div>
            </div>
            <div class="booster-status">
              <span v-if="booster.isUnlocked" class="status-unlocked">✓</span>
              <button v-else class="unlock-btn" :disabled="!booster.canUnlock">
                <span class="cost-icon">◆</span>
                {{ booster.cost.toLocaleString() }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.unlock-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.unlock-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.unlock-tab {
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

.unlock-tab:hover {
  background: var(--highlight);
}

.unlock-tab.active {
  background: var(--highlight);
  border-bottom: 2px solid var(--cyan);
}

.tab-icon {
  font-size: var(--text-xl);
  color: var(--text-dim);
}

.unlock-tab.active .tab-icon {
  color: var(--cyan);
  text-shadow: 0 0 6px rgba(6, 182, 212, 0.5);
}

.tab-label {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
}

.unlock-tab.active .tab-label {
  color: var(--text-secondary);
}

.unlock-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
}

.header-text {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
}

.codex-hint {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  color: var(--text-dim);
}

.codex-icon {
  font-size: var(--text-base);
}

.unlocks-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.no-unlocks {
  text-align: center;
  padding: var(--space-6);
  color: var(--green);
  font-style: italic;
  font-size: var(--text-base);
}

/* Booster Styles */
.booster-category {
  margin-bottom: var(--space-4);
}

.category-header {
  font-size: var(--text-base);
  color: var(--purple);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: var(--space-2) 0;
  margin-bottom: var(--space-1);
  border-bottom: 1px solid var(--border);
}

.booster-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-1);
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(18, 18, 31, 0.98) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.booster-item.can-unlock {
  cursor: pointer;
  border-color: var(--purple);
}

.booster-item.can-unlock:hover {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(26, 26, 46, 0.95) 100%);
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.2);
}

.booster-item.is-unlocked {
  opacity: 0.7;
}

.booster-item.cannot-unlock {
  border-color: var(--border);
}

.cannot-unlock .booster-name {
  color: var(--text-secondary);
}

.cannot-unlock .booster-icon {
  opacity: 0.5;
}

.booster-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xl);
  color: var(--purple);
  flex-shrink: 0;
}

.booster-info {
  flex: 1;
  min-width: 0;
}

.booster-name {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.is-unlocked .booster-name {
  color: var(--text-secondary);
}

.booster-desc {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.booster-prereq {
  font-size: var(--text-sm);
  color: var(--amber);
  font-style: italic;
  margin-top: 2px;
}

.booster-status {
  flex-shrink: 0;
}

.booster-status .status-unlocked {
  color: var(--green);
  font-size: var(--text-xl);
  text-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.booster-status .unlock-btn {
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

.booster-status .unlock-btn:not(:disabled):hover {
  background: var(--purple);
  border-color: var(--purple);
  color: white;
}

.booster-status .unlock-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.booster-status .cost-icon {
  color: var(--purple);
  font-size: var(--text-sm);
}

.booster-status .unlock-btn:not(:disabled):hover .cost-icon {
  color: white;
}
</style>
