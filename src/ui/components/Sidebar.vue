<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProgressionStore } from '@/stores/progression'
import { races } from '@game/data/races'
import { classes } from '@game/data/classes'
import { boosters } from '@game/data/boosters'
import { monsters } from '@game/data/monsters'
import { ALL_ITEMS } from '@game/data/items'
import { ARTIFACTS } from '@game/data/artifacts'
import UpgradeList from './meta/UpgradeList.vue'
import UnlockList from './meta/UnlockList.vue'
const progression = useProgressionStore()

type Tab = 'stats' | 'upgrades' | 'unlocks'
const activeTab = ref<Tab>('upgrades')

// Totals for unlock display
const totalRaces = races.length
const totalClasses = classes.length
const totalBoosters = boosters.length
const totalMonsters = monsters.length
const totalItems = ALL_ITEMS.length
const totalArtifacts = ARTIFACTS.length

// Count total bot upgrades from global capabilities
const totalBotUpgrades = computed(() => {
  const caps = progression.botCapabilities
  let count = 0
  if (caps.farming) count++
  count += caps.tactics + caps.town + caps.preparedness
  count += caps.sweep + caps.surf
  count += caps.kiting + caps.targeting + caps.retreat
  return count
})
const maxBotUpgrades = 25 // 1 toggle + 8 graded × 3 levels each

// Swap max depth for times reached depth 50 after first time
const hasReachedDepth50 = computed(() => (progression.globalStats.timesReachedDepth50 ?? 0) > 0)

// Win rate
const winRate = computed(() => {
  const runs = progression.globalStats.totalRuns
  if (runs === 0) return '0%'
  const pct = (progression.totalVictories / runs) * 100
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`
})

// Recent run averages (from runHistory, last 100)
const recentStats = computed(() => {
  const history = progression.runHistory
  if (history.length === 0) return null
  const n = history.length
  const avgDepth = Math.round(history.reduce((s, r) => s + r.maxDepth, 0) / n)
  const avgKills = Math.round(history.reduce((s, r) => s + r.kills, 0) / n)
  const avgTurns = Math.round(history.reduce((s, r) => s + (r.turns ?? 0), 0) / n)
  return { avgDepth, avgKills, avgTurns, count: n }
})

// Nemesis: monster with most player deaths from bestiary
const nemesis = computed(() => {
  const entries = Object.entries(progression.bestiary)
  let best: { name: string; deaths: number } | null = null
  for (const [name, entry] of entries) {
    const deaths = entry.deaths ?? 0
    if (deaths > 0 && (!best || deaths > best.deaths)) {
      best = { name, deaths }
    }
  }
  return best
})
</script>

<template>
  <div class="sidebar-container">
    <div class="sidebar-tabs">
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'upgrades' }"
        @click="activeTab = 'upgrades'"
      >
        Upgrades
      </button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'unlocks' }"
        @click="activeTab = 'unlocks'"
      >
        Unlocks
      </button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'stats' }"
        @click="activeTab = 'stats'"
      >
        Stats
      </button>
    </div>

    <div class="sidebar-content">
      <!-- Stats Tab -->
      <div v-if="activeTab === 'stats'" class="tab-content">
        <section class="section">
          <h2>Global</h2>
          <div class="stat-rows">
            <div class="stat-row">
              <span class="stat-label">Total Runs</span>
              <span class="stat-val">{{ progression.globalStats.totalRuns.toLocaleString() }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Victories</span>
              <span class="stat-val victory">{{ progression.totalVictories }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Win Rate</span>
              <span class="stat-val">{{ winRate }}</span>
            </div>
            <div v-if="hasReachedDepth50" class="stat-row">
              <span class="stat-label">Depth 50 Clears</span>
              <span class="stat-val depth">{{ progression.globalStats.timesReachedDepth50 }}</span>
            </div>
            <div v-else class="stat-row">
              <span class="stat-label">Max Depth</span>
              <span class="stat-val depth">{{ progression.globalStats.maxDepthEver }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Kills</span>
              <span class="stat-val kills">{{
                progression.globalStats.totalKills.toLocaleString()
              }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Gold</span>
              <span class="stat-val gold">{{
                progression.globalStats.totalGold.toLocaleString()
              }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Floors Traveled</span>
              <span class="stat-val depth">{{
                (progression.globalStats.totalFloorsVisited ?? 0).toLocaleString()
              }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Essence Earned</span>
              <span class="stat-val essence">{{
                progression.globalStats.totalEssence.toLocaleString()
              }}</span>
            </div>
          </div>
        </section>

        <section v-if="recentStats" class="section">
          <h2>Recent Runs</h2>
          <div class="stat-rows">
            <div class="stat-row">
              <span class="stat-label">Avg Depth</span>
              <span class="stat-val depth">{{ recentStats.avgDepth }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Avg Kills</span>
              <span class="stat-val kills">{{ recentStats.avgKills }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Avg Turns</span>
              <span class="stat-val">{{ recentStats.avgTurns.toLocaleString() }}</span>
            </div>
            <div v-if="nemesis" class="stat-row nemesis-row">
              <span class="stat-label">Nemesis</span>
              <span class="stat-val kills nemesis-name"
                >{{ nemesis.name }} ({{ nemesis.deaths }})</span
              >
            </div>
          </div>
        </section>

        <section class="section">
          <h2>Progress</h2>
          <div class="stat-rows">
            <div class="stat-row">
              <span class="stat-label">Run Slots</span>
              <span class="stat-val">{{ progression.unlocks.runSlots }} / 4</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Races</span>
              <span class="stat-val"
                >{{ progression.availableRaces.length }} / {{ totalRaces }}</span
              >
            </div>
            <div class="stat-row">
              <span class="stat-label">Classes</span>
              <span class="stat-val"
                >{{ progression.availableClasses.length }} / {{ totalClasses }}</span
              >
            </div>
            <div class="stat-row">
              <span class="stat-label">Boosters</span>
              <span class="stat-val"
                >{{ progression.unlocks.boosters.size }} / {{ totalBoosters }}</span
              >
            </div>
            <div class="stat-row">
              <span class="stat-label">Bot Upgrades</span>
              <span class="stat-val">{{ totalBotUpgrades }} / {{ maxBotUpgrades }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Bestiary</span>
              <span class="stat-val"
                >{{ progression.bestiaryStats.discovered }} / {{ totalMonsters }}</span
              >
            </div>
            <div class="stat-row">
              <span class="stat-label">Items</span>
              <span class="stat-val"
                >{{ progression.armoryStats.discovered - progression.armoryStats.artifacts }} /
                {{ totalItems }}</span
              >
            </div>
            <div class="stat-row">
              <span class="stat-label">Artifacts</span>
              <span class="stat-val"
                >{{ progression.armoryStats.artifacts }} / {{ totalArtifacts }}</span
              >
            </div>
            <div class="stat-row">
              <span class="stat-label">Achievements</span>
              <span class="stat-val"
                >{{ progression.achievementStats.unlocked }} /
                {{ progression.achievementStats.total }}</span
              >
            </div>
          </div>
        </section>
      </div>

      <!-- Upgrades Tab -->
      <div v-else-if="activeTab === 'upgrades'" class="tab-content full-height">
        <UpgradeList />
      </div>

      <!-- Unlocks Tab -->
      <div v-else-if="activeTab === 'unlocks'" class="tab-content full-height">
        <UnlockList />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-tabs {
  display: flex;
  background: var(--elevated);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-tab {
  flex: 1;
  padding: var(--space-3) var(--space-2);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.sidebar-tab:hover {
  background: var(--highlight);
  color: var(--text-primary);
}

.sidebar-tab.active {
  color: var(--purple);
  border-bottom-color: var(--purple);
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
}

.tab-content {
  height: 100%;
  overflow-y: auto;
}

.tab-content.full-height {
  display: flex;
  flex-direction: column;
}

.tab-content:not(.full-height) {
  padding: var(--space-3) var(--space-4);
}

.section {
  margin-bottom: var(--space-4);
}

.section h2 {
  font-size: var(--text-base);
  text-transform: uppercase;
  color: var(--text-dim);
  margin: 0 0 var(--space-2);
  letter-spacing: 1px;
}

.stat-rows {
  display: flex;
  flex-direction: column;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 2px 0;
  font-size: var(--text-base);
}

.stat-row:not(:last-child) {
  border-bottom: 1px solid var(--border);
}

.stat-label {
  color: var(--text-secondary);
  white-space: nowrap;
  margin-right: var(--space-2);
}

.stat-val {
  color: var(--cyan);
  text-align: right;
}

.stat-val.depth {
  color: var(--purple);
}

.stat-val.kills {
  color: var(--red);
}

.stat-val.gold {
  color: var(--amber);
}

.stat-val.essence {
  color: var(--purple);
}

.stat-val.victory {
  color: var(--green);
}

.nemesis-row {
  align-items: flex-start;
}

.nemesis-name {
  word-break: break-word;
  line-height: 1.3;
}
</style>
