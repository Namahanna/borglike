<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import { achievements, type Achievement } from '@game/data/achievements'
import AchievementCard from './AchievementCard.vue'
import MasteryGrid from './MasteryGrid.vue'

const progression = useProgressionStore()

const emit = defineEmits<{
  close: []
}>()

// Clear new achievement notifications when modal is opened
onMounted(() => {
  progression.clearNewAchievements()
})

// Filter state
const categoryFilter = ref<'all' | Achievement['category']>('all')
const sortBy = ref<'name' | 'reward' | 'status'>('status')
const searchQuery = ref('')

// Categories for filter
const categories = ['all', 'progress', 'challenge', 'cumulative', 'mastery'] as const

// Category sort order
const categoryOrder: Record<string, number> = {
  progress: 0,
  challenge: 1,
  cumulative: 2,
  mastery: 3,
}

// Whether to show the mastery grid (shown for 'all' and 'mastery' filters)
const showMasteryGrid = computed(
  () => categoryFilter.value === 'all' || categoryFilter.value === 'mastery'
)

// Icon groups for sorting related achievements together
const iconGroupOrder: Record<string, number> = {
  '!': 0, // First blood
  v: 1, // Depth achievements
  '*': 2, // Victory
  M: 3, // Massacre
  '>': 4, // Speed demon
  $: 5, // Gold achievements
  k: 6, // Kill achievements (centurion)
  K: 7, // Kill achievements (higher tiers)
  '#': 8, // Run completion
  x: 9, // Death achievements
}

// Get status priority for sorting (lower = higher priority)
function getStatusPriority(achievement: Achievement): number {
  const unlocked = progression.isAchievementUnlocked(achievement.id)
  const collected = progression.isAchievementCollected(achievement.id)

  if (unlocked && !collected) return 0 // Uncollected first (needs attention)

  // In-progress: cumulative with progress > 0
  if (!unlocked && achievement.category === 'cumulative') {
    const progress = getProgress(achievement)
    if (progress && progress > 0) return 1
  }

  if (!unlocked) return 2 // Locked
  return 3 // Collected (completed, no action)
}

// Filter and sort achievements (mastery rendered separately via MasteryGrid)
const filteredAchievements = computed(() => {
  let result = achievements.filter((a) => a.category !== 'mastery')

  // Apply category filter
  if (categoryFilter.value !== 'all' && categoryFilter.value !== 'mastery') {
    result = result.filter((a) => a.category === categoryFilter.value)
  }

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (a) => a.name.toLowerCase().includes(query) || a.description.toLowerCase().includes(query)
    )
  }

  // Sort
  switch (sortBy.value) {
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'reward':
      result.sort((a, b) => b.reward - a.reward)
      break
    case 'status':
      // Smart ordering: uncollected → in-progress → locked → collected
      // Within each group, sort by category, then icon group, then target
      result.sort((a, b) => {
        // First by status priority
        const aPriority = getStatusPriority(a)
        const bPriority = getStatusPriority(b)
        if (aPriority !== bPriority) return aPriority - bPriority

        // Then by hidden status (non-hidden first)
        const aHidden = a.hidden ? 1 : 0
        const bHidden = b.hidden ? 1 : 0
        if (aHidden !== bHidden) return aHidden - bHidden

        // Then by category
        const aCat = categoryOrder[a.category] ?? 99
        const bCat = categoryOrder[b.category] ?? 99
        if (aCat !== bCat) return aCat - bCat

        // Then by icon group (keeps related achievements together)
        const aIcon = iconGroupOrder[a.icon] ?? 99
        const bIcon = iconGroupOrder[b.icon] ?? 99
        if (aIcon !== bIcon) return aIcon - bIcon

        // Finally by target (lower targets first, shows progression)
        return a.target - b.target
      })
      break
  }

  return result
})

// Get progress for cumulative achievements via data-driven statKey
function getProgress(achievement: Achievement): number | undefined {
  if (!achievement.statKey) return undefined
  const value = progression.globalStats[achievement.statKey]
  return typeof value === 'number' ? value : undefined
}

// Stats summary
const stats = computed(() => ({
  unlocked: progression.achievementStats.unlocked,
  total: progression.achievementStats.total,
  uncollected: progression.achievementStats.uncollected,
  essenceCollected: progression.achievementStats.essenceCollected,
  essencePending: progression.achievementStats.essencePending,
}))

// Selected achievement for detail view (future enhancement)
const selectedAchievement = ref<Achievement | null>(null)

function selectAchievement(achievement: Achievement) {
  // For now, just toggle selection for potential detail view
  selectedAchievement.value = selectedAchievement.value?.id === achievement.id ? null : achievement
}

function claimAchievement(achievement: Achievement) {
  progression.collectAchievement(achievement.id)
}

function claimById(id: string) {
  progression.collectAchievement(id)
}
</script>

<template>
  <div class="achievements-modal">
    <header class="modal-header">
      <div class="header-title">
        <h2>Achievements</h2>
        <span class="achievement-count"> {{ stats.unlocked }}/{{ stats.total }} Unlocked </span>
        <span class="essence-earned">
          <span class="essence-icon">◆</span>
          {{ stats.essenceCollected }} earned
        </span>
        <span v-if="stats.essencePending > 0" class="essence-pending">
          <span class="essence-icon">◆</span>
          {{ stats.essencePending }} to claim
        </span>
      </div>
      <button class="close-btn" @click="emit('close')">&times;</button>
    </header>

    <div class="filter-bar">
      <select v-model="categoryFilter" class="filter-select">
        <option v-for="cat in categories" :key="cat" :value="cat">
          {{ cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1) }}
        </option>
      </select>
      <select v-model="sortBy" class="filter-select">
        <option value="status">Sort by Status</option>
        <option value="reward">Sort by Reward</option>
        <option value="name">Sort by Name</option>
      </select>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search achievements..."
      />
    </div>

    <div class="modal-content">
      <!-- Regular achievements as cards -->
      <div v-if="filteredAchievements.length > 0" class="achievement-grid">
        <AchievementCard
          v-for="achievement in filteredAchievements"
          :key="achievement.id"
          :achievement="achievement"
          :is-unlocked="progression.isAchievementUnlocked(achievement.id)"
          :is-collected="progression.isAchievementCollected(achievement.id)"
          :progress="getProgress(achievement)"
          @click="selectAchievement(achievement)"
          @claim="claimAchievement(achievement)"
        />
      </div>

      <!-- Mastery grid (shown for 'all' and 'mastery' filters) -->
      <MasteryGrid v-if="showMasteryGrid" @claim="claimById" />

      <div v-if="filteredAchievements.length === 0 && !showMasteryGrid" class="empty-state">
        <p>No achievements match your filters.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.achievements-modal {
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

.achievement-count {
  font-size: var(--text-md);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.essence-earned {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-md);
  color: var(--purple);
  padding: var(--space-1) var(--space-3);
  background: rgba(139, 92, 246, 0.15);
  border-radius: var(--radius-md);
}

.essence-pending {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-md);
  font-weight: bold;
  color: var(--gold);
  padding: var(--space-1) var(--space-3);
  background: rgba(234, 179, 8, 0.15);
  border-radius: var(--radius-md);
  animation: pulse-pending 1.5s ease-in-out infinite;
}

@keyframes pulse-pending {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.essence-icon {
  font-size: var(--text-base);
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

.achievement-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-dim);
}
</style>
