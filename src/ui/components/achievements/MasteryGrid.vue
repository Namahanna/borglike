<script setup lang="ts">
import { computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import { races, startingRaces, unlockableRaces, prestigeRaces } from '@game/data/races'
import { classes, startingClasses, unlockableClasses, prestigeClasses } from '@game/data/classes'
import { getMetaAchievements } from '@game/data/achievements'
import AchievementCard from './AchievementCard.vue'

const progression = useProgressionStore()

const emit = defineEmits<{
  claim: [achievementId: string]
}>()

const raceWins = computed(() => progression.globalStats.victoriesPerRace ?? {})
const classWins = computed(() => progression.globalStats.victoriesPerClass ?? {})

// Race groups for display
const raceGroups = computed(() => [
  { label: 'Starting', items: startingRaces },
  { label: 'Unlockable', items: unlockableRaces },
  { label: 'Prestige', items: prestigeRaces },
])

// Class groups for display
const classGroups = computed(() => [
  { label: 'Starting', items: startingClasses },
  { label: 'Unlockable', items: unlockableClasses },
  { label: 'Prestige', items: prestigeClasses },
])

// Summary counts
const raceWinCount = computed(() => races.filter((r) => (raceWins.value[r.name] ?? 0) >= 1).length)
const classWinCount = computed(
  () => classes.filter((c) => (classWins.value[c.name] ?? 0) >= 1).length
)

// Achievement status helpers
function isRaceUnlocked(raceId: string): boolean {
  return progression.isAchievementUnlocked(`win_race_${raceId}`)
}
function isRaceCollected(raceId: string): boolean {
  return progression.isAchievementCollected(`win_race_${raceId}`)
}
function isClassUnlocked(classId: string): boolean {
  return progression.isAchievementUnlocked(`win_class_${classId}`)
}
function isClassCollected(classId: string): boolean {
  return progression.isAchievementCollected(`win_class_${classId}`)
}

function claimRace(raceId: string) {
  emit('claim', `win_race_${raceId}`)
}
function claimClass(classId: string) {
  emit('claim', `win_class_${classId}`)
}
function claimMeta(id: string) {
  emit('claim', id)
}

// Meta achievements with computed progress
const metaAchievements = computed(() => {
  const metas = getMetaAchievements()
  return metas.map((a) => {
    let progress = 0
    if (a.id === 'win_all_starting_races')
      progress = startingRaces.filter((r) => (raceWins.value[r.name] ?? 0) >= 1).length
    else if (a.id === 'win_all_starting_classes')
      progress = startingClasses.filter((c) => (classWins.value[c.name] ?? 0) >= 1).length
    else if (a.id === 'win_all_races') progress = raceWinCount.value
    else if (a.id === 'win_all_classes') progress = classWinCount.value
    return { achievement: a, progress }
  })
})
</script>

<template>
  <div class="mastery-grid">
    <!-- Race Mastery -->
    <section class="mastery-section">
      <h3 class="section-title">
        Race Mastery
        <span class="section-count">{{ raceWinCount }}/{{ races.length }}</span>
      </h3>
      <div v-for="group in raceGroups" :key="group.label" class="tier-group">
        <span class="tier-label">{{ group.label }}</span>
        <div class="cell-row">
          <div
            v-for="race in group.items"
            :key="race.id"
            class="mastery-cell"
            :class="{
              won: isRaceUnlocked(race.id),
              collected: isRaceCollected(race.id),
              claimable: isRaceUnlocked(race.id) && !isRaceCollected(race.id),
              prestige: race.prestige,
            }"
            @click="
              isRaceUnlocked(race.id) && !isRaceCollected(race.id) ? claimRace(race.id) : undefined
            "
          >
            <span class="cell-icon">@</span>
            <span class="cell-name">{{ race.name }}</span>
            <span v-if="isRaceUnlocked(race.id)" class="cell-check">&#10003;</span>
            <span v-if="race.prestige" class="prestige-marker">&#9830;</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Class Mastery -->
    <section class="mastery-section">
      <h3 class="section-title">
        Class Mastery
        <span class="section-count">{{ classWinCount }}/{{ classes.length }}</span>
      </h3>
      <div v-for="group in classGroups" :key="group.label" class="tier-group">
        <span class="tier-label">{{ group.label }}</span>
        <div class="cell-row">
          <div
            v-for="cls in group.items"
            :key="cls.id"
            class="mastery-cell"
            :class="{
              won: isClassUnlocked(cls.id),
              collected: isClassCollected(cls.id),
              claimable: isClassUnlocked(cls.id) && !isClassCollected(cls.id),
              prestige: cls.prestige,
            }"
            @click="
              isClassUnlocked(cls.id) && !isClassCollected(cls.id) ? claimClass(cls.id) : undefined
            "
          >
            <span class="cell-icon">&amp;</span>
            <span class="cell-name">{{ cls.name }}</span>
            <span v-if="isClassUnlocked(cls.id)" class="cell-check">&#10003;</span>
            <span v-if="cls.prestige" class="prestige-marker">&#9830;</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Meta Achievements -->
    <section class="meta-section">
      <h3 class="section-title">Milestones</h3>
      <div class="meta-grid">
        <AchievementCard
          v-for="{ achievement, progress } in metaAchievements"
          :key="achievement.id"
          :achievement="achievement"
          :is-unlocked="progression.isAchievementUnlocked(achievement.id)"
          :is-collected="progression.isAchievementCollected(achievement.id)"
          :progress="progress"
          @claim="claimMeta(achievement.id)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.mastery-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.mastery-section {
  background: var(--void);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0 0 var(--space-3) 0;
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.section-count {
  font-size: var(--text-base);
  font-weight: normal;
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.tier-group {
  margin-bottom: var(--space-3);
}

.tier-group:last-child {
  margin-bottom: 0;
}

.tier-label {
  display: block;
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: var(--space-2);
  letter-spacing: 0.05em;
}

.cell-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.mastery-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-dim);
  position: relative;
  transition: all 0.2s;
  min-width: 120px;
}

.mastery-cell:hover {
  background: var(--border);
}

.mastery-cell.won {
  color: var(--text-primary);
  border-color: var(--green);
  background: rgba(34, 197, 94, 0.08);
}

.mastery-cell.won.collected {
  opacity: 0.65;
}

.mastery-cell.claimable {
  border-color: var(--purple);
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.35);
  cursor: pointer;
  animation: pulse-glow 2s ease-in-out infinite;
}

.mastery-cell.prestige {
  border-color: var(--gold);
}

.mastery-cell.prestige.won {
  border-color: var(--green);
  box-shadow: 0 0 6px rgba(234, 179, 8, 0.2);
}

.mastery-cell.prestige.claimable {
  border-color: var(--purple);
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.35);
}

@keyframes pulse-glow {
  0%,
  100% {
    box-shadow: 0 0 8px rgba(139, 92, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 16px rgba(139, 92, 246, 0.6);
  }
}

.cell-icon {
  font-weight: bold;
  font-size: var(--text-base);
  width: 20px;
  text-align: center;
  color: var(--text-dim);
}

.mastery-cell.won .cell-icon {
  color: var(--green);
}

.cell-name {
  flex: 1;
  white-space: nowrap;
}

.cell-check {
  color: var(--green);
  font-weight: bold;
  font-size: var(--text-base);
}

.prestige-marker {
  position: absolute;
  top: -2px;
  right: -2px;
  font-size: var(--text-2xs);
  color: var(--gold);
}

.meta-section {
  margin-top: var(--space-2);
}

.meta-section .section-title {
  margin-bottom: var(--space-3);
}

.meta-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
