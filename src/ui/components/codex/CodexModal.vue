<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import { races, type Race } from '@game/data/races'
import { classes, type GameClass } from '@game/data/classes'
import RaceCard from './RaceCard.vue'
import ClassCard from './ClassCard.vue'
import RaceDetailPanel from './RaceDetailPanel.vue'
import ClassDetailPanel from './ClassDetailPanel.vue'

const progression = useProgressionStore()

const emit = defineEmits<{
  close: []
}>()

// Tab state
const activeTab = ref<'races' | 'classes'>('races')

// Filter state
const categoryFilter = ref<string>('all')
const sortBy = ref<'unlock' | 'name' | 'wins'>('unlock')
const searchQuery = ref('')

// Selected item for detail panel
const selectedRace = ref<Race | null>(null)
const selectedClass = ref<GameClass | null>(null)

function selectRace(race: Race) {
  selectedRace.value = race
  selectedClass.value = null
}

function selectClass(cls: GameClass) {
  selectedClass.value = cls
  selectedRace.value = null
}

function clearSelection() {
  selectedRace.value = null
  selectedClass.value = null
}

// Categories for filtering
const categories = ['all', 'starting', 'unlockable', 'prestige']

function getCategoryLabel(cat: string): string {
  if (cat === 'all') return 'All Categories'
  return cat.charAt(0).toUpperCase() + cat.slice(1)
}

// Get category for a race/class
function getCategory(item: Race | GameClass): string {
  if (item.prestige) return 'prestige'
  if (item.starting) return 'starting'
  return 'unlockable'
}

// Check if race is unlocked
function isRaceUnlocked(race: Race): boolean {
  return progression.unlocks.races.has(race.name)
}

// Check if class is unlocked
function isClassUnlocked(cls: GameClass): boolean {
  return progression.unlocks.classes.has(cls.name)
}

// Get win count for race
function getRaceWins(race: Race): number {
  return progression.globalStats.victoriesPerRace?.[race.name] ?? 0
}

// Get win count for class
function getClassWins(cls: GameClass): number {
  return progression.globalStats.victoriesPerClass?.[cls.name] ?? 0
}

// Filter and sort races
const filteredRaces = computed(() => {
  let result = [...races]

  // Apply category filter
  if (categoryFilter.value !== 'all') {
    result = result.filter((r) => getCategory(r) === categoryFilter.value)
  }

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((r) => r.name.toLowerCase().includes(query))
  }

  // Sort
  switch (sortBy.value) {
    case 'unlock':
      // Starting first, then unlockable, then prestige. Unlocked before locked within each.
      result.sort((a, b) => {
        const orderA = a.starting ? 0 : a.prestige ? 2 : 1
        const orderB = b.starting ? 0 : b.prestige ? 2 : 1
        if (orderA !== orderB) return orderA - orderB
        const unlockedA = isRaceUnlocked(a) ? 0 : 1
        const unlockedB = isRaceUnlocked(b) ? 0 : 1
        if (unlockedA !== unlockedB) return unlockedA - unlockedB
        return a.name.localeCompare(b.name)
      })
      break
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'wins':
      result.sort((a, b) => getRaceWins(b) - getRaceWins(a))
      break
  }

  return result
})

// Filter and sort classes
const filteredClasses = computed(() => {
  let result = [...classes]

  // Apply category filter
  if (categoryFilter.value !== 'all') {
    result = result.filter((c) => getCategory(c) === categoryFilter.value)
  }

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((c) => c.name.toLowerCase().includes(query))
  }

  // Sort
  switch (sortBy.value) {
    case 'unlock':
      result.sort((a, b) => {
        const orderA = a.starting ? 0 : a.prestige ? 2 : 1
        const orderB = b.starting ? 0 : b.prestige ? 2 : 1
        if (orderA !== orderB) return orderA - orderB
        const unlockedA = isClassUnlocked(a) ? 0 : 1
        const unlockedB = isClassUnlocked(b) ? 0 : 1
        if (unlockedA !== unlockedB) return unlockedA - unlockedB
        return a.name.localeCompare(b.name)
      })
      break
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'wins':
      result.sort((a, b) => getClassWins(b) - getClassWins(a))
      break
  }

  return result
})

// Discovery stats
const raceStats = computed(() => {
  const unlocked = races.filter((r) => isRaceUnlocked(r)).length
  return { unlocked, total: races.length }
})

const classStats = computed(() => {
  const unlocked = classes.filter((c) => isClassUnlocked(c)).length
  return { unlocked, total: classes.length }
})

// Clear filter when switching tabs
function switchTab(tab: 'races' | 'classes') {
  activeTab.value = tab
  clearSelection()
}
</script>

<template>
  <div class="codex-modal">
    <header class="modal-header">
      <div class="header-title">
        <h2>Codex</h2>
        <div class="discovery-counts">
          <span class="discovery-count">
            {{ raceStats.unlocked }}/{{ raceStats.total }} Races
          </span>
          <span class="discovery-count class">
            {{ classStats.unlocked }}/{{ classStats.total }} Classes
          </span>
        </div>
      </div>
      <button class="close-btn" @click="emit('close')">&times;</button>
    </header>

    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'races' }"
        @click="switchTab('races')"
      >
        Races ({{ raceStats.unlocked }}/{{ raceStats.total }})
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'classes' }"
        @click="switchTab('classes')"
      >
        Classes ({{ classStats.unlocked }}/{{ classStats.total }})
      </button>
    </div>

    <div class="filter-bar">
      <select v-model="categoryFilter" class="filter-select">
        <option v-for="cat in categories" :key="cat" :value="cat">
          {{ getCategoryLabel(cat) }}
        </option>
      </select>
      <select v-model="sortBy" class="filter-select">
        <option value="unlock">Sort by Unlock</option>
        <option value="name">Sort by Name</option>
        <option value="wins">Sort by Wins</option>
      </select>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        :placeholder="activeTab === 'races' ? 'Search races...' : 'Search classes...'"
      />
    </div>

    <div class="modal-body">
      <div class="modal-content">
        <!-- Races Grid -->
        <div v-if="activeTab === 'races'" class="card-grid">
          <RaceCard
            v-for="race in filteredRaces"
            :key="race.id"
            :race="race"
            :unlocked="isRaceUnlocked(race)"
            :wins="getRaceWins(race)"
            :class="{ selected: selectedRace?.id === race.id }"
            @click="selectRace(race)"
          />
        </div>

        <!-- Classes Grid -->
        <div v-else class="card-grid">
          <ClassCard
            v-for="cls in filteredClasses"
            :key="cls.id"
            :game-class="cls"
            :unlocked="isClassUnlocked(cls)"
            :wins="getClassWins(cls)"
            :class="{ selected: selectedClass?.id === cls.id }"
            @click="selectClass(cls)"
          />
        </div>
      </div>

      <!-- Detail Panel -->
      <RaceDetailPanel
        v-if="selectedRace"
        :race="selectedRace"
        :unlocked="isRaceUnlocked(selectedRace)"
        :wins="getRaceWins(selectedRace)"
        @close="clearSelection"
      />
      <ClassDetailPanel
        v-if="selectedClass"
        :game-class="selectedClass"
        :unlocked="isClassUnlocked(selectedClass)"
        :wins="getClassWins(selectedClass)"
        @close="clearSelection"
      />
    </div>
  </div>
</template>

<style scoped>
.codex-modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  height: 80vh;
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

.discovery-counts {
  display: flex;
  gap: var(--space-2);
}

.discovery-count {
  font-size: var(--text-base);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.discovery-count.class {
  color: var(--violet);
  background: rgba(167, 139, 250, 0.15);
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

.tab-bar {
  display: flex;
  gap: 0;
  padding: 0 var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--void);
}

.tab-btn {
  padding: var(--space-3) var(--space-5);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--text-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--purple);
  border-bottom-color: var(--purple);
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

.modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--space-3);
}

/* Selected card highlight */
.card-grid :deep(.race-card.selected),
.card-grid :deep(.class-card.selected) {
  outline: 2px solid var(--purple);
  outline-offset: -2px;
}

.card-grid :deep(.race-card.selected.prestige),
.card-grid :deep(.class-card.selected.prestige) {
  outline-color: var(--amber);
}
</style>
