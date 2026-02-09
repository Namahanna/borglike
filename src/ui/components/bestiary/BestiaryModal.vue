<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import { monsters, type MonsterTemplate } from '@game/data/monsters'
import MonsterCard from './MonsterCard.vue'
import MonsterDetail from './MonsterDetail.vue'

const progression = useProgressionStore()

const emit = defineEmits<{
  close: []
}>()

// Bestiary cap from Bestiary Mastery upgrade: 10% base + 5% per level
const bestiaryCapPercent = computed(() => {
  const level = progression.upgradeLevels['bestiary_mastery'] ?? 0
  return 10 + level * 5
})

// Filter state
const typeFilter = ref<string>('all')
const sortBy = ref<'kills' | 'name' | 'depth'>('depth')
const searchQuery = ref('')

// Selected monster for detail view
const selectedMonster = ref<MonsterTemplate | null>(null)

// Get unique monster types from flags
const monsterTypes = computed(() => {
  const types = new Set<string>()
  for (const m of monsters) {
    for (const flag of m.flags) {
      if (
        ['DRAGON', 'ORC', 'TROLL', 'UNDEAD', 'DEMON', 'ANIMAL', 'GIANT', 'UNIQUE'].includes(flag)
      ) {
        types.add(flag)
      }
    }
  }
  return ['all', ...Array.from(types).sort()]
})

// Filter and sort monsters
const filteredMonsters = computed(() => {
  let result = [...monsters]

  // Apply type filter
  if (typeFilter.value !== 'all') {
    result = result.filter((m) => m.flags.includes(typeFilter.value))
  }

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((m) => m.name.toLowerCase().includes(query))
  }

  // Sort
  switch (sortBy.value) {
    case 'kills':
      result.sort((a, b) => {
        const killsA = progression.bestiary[a.name]?.kills ?? 0
        const killsB = progression.bestiary[b.name]?.kills ?? 0
        return killsB - killsA
      })
      break
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'depth':
      result.sort((a, b) => a.minDepth - b.minDepth)
      break
  }

  return result
})

// Discovery stats
const discoveryStats = computed(() => ({
  discovered: Object.keys(progression.bestiary).length,
  total: monsters.length,
  fullyUnlocked: Object.values(progression.bestiary).filter((e) => e.kills >= 30).length,
}))

function selectMonster(monster: MonsterTemplate) {
  selectedMonster.value = monster
}

function closeDetail() {
  selectedMonster.value = null
}
</script>

<template>
  <div class="bestiary-modal">
    <header class="modal-header">
      <div class="header-title">
        <h2>Bestiary</h2>
        <span class="discovery-count">
          {{ discoveryStats.discovered }}/{{ discoveryStats.total }} Discovered
        </span>
      </div>
      <button class="close-btn" @click="emit('close')">&times;</button>
    </header>

    <div class="filter-bar">
      <select v-model="typeFilter" class="filter-select">
        <option v-for="type in monsterTypes" :key="type" :value="type">
          {{ type === 'all' ? 'All Types' : type }}
        </option>
      </select>
      <select v-model="sortBy" class="filter-select">
        <option value="depth">Sort by Depth</option>
        <option value="kills">Sort by Kills</option>
        <option value="name">Sort by Name</option>
      </select>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search monsters..."
      />
    </div>

    <div class="modal-content">
      <div class="monster-grid">
        <MonsterCard
          v-for="monster in filteredMonsters"
          :key="monster.name"
          :monster="monster"
          :entry="progression.bestiary[monster.name]"
          :bestiary-cap-percent="bestiaryCapPercent"
          @click="selectMonster(monster)"
        />
      </div>
    </div>

    <!-- Detail overlay -->
    <Transition name="slide">
      <div v-if="selectedMonster" class="detail-overlay" @click="closeDetail">
        <div class="detail-panel" @click.stop>
          <MonsterDetail
            :monster="selectedMonster"
            :entry="progression.bestiary[selectedMonster.name]"
            :bestiary-cap-percent="bestiaryCapPercent"
            @close="closeDetail"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bestiary-modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  position: relative;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.modal-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  color: var(--text-primary);
}

.discovery-count {
  font-size: var(--text-md);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-3xl);
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--highlight);
  color: var(--text-primary);
}

.filter-bar {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--void);
}

.filter-select {
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-primary);
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: var(--purple);
}

.search-input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.search-input:focus {
  outline: none;
  border-color: var(--purple);
}

.search-input::placeholder {
  color: var(--text-dim);
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.monster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-3);
}

.detail-overlay {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 18, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.detail-panel {
  width: 100%;
  max-width: 400px;
  max-height: 90%;
  overflow-y: auto;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
