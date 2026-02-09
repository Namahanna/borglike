<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GameClass } from '@game/data/classes'
import { getClassSpellList, getClassPrimarySchool } from '@game/data/class-spells'
import { getSpellById } from '@game/data/spells'
import CollapsibleSection from '@/ui/components/common/CollapsibleSection.vue'

interface Props {
  gameClass: GameClass
  unlocked: boolean
  wins: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Collapsible state
const spellsExpanded = ref(true)
const abilitiesExpanded = ref(true)

// Category badge
const category = computed(() => {
  if (props.gameClass.prestige) return 'Prestige'
  if (props.gameClass.starting) return 'Starter'
  return 'Unlockable'
})

// Color for category
const categoryColor = computed(() => {
  if (props.gameClass.prestige) return '#f59e0b'
  if (props.gameClass.starting) return '#22c55e'
  return '#3b82f6'
})

// Format stat with sign
function formatStat(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `${value}`
  return '0'
}

// Get stat bar width (scale: -4 to +4 maps to 0% to 100%, with 50% being neutral)
function getStatBarWidth(value: number): number {
  const clamped = Math.max(-4, Math.min(4, value))
  return ((clamped + 4) / 8) * 100
}

// Get stat bar color based on value
function getStatBarColor(value: number): string {
  if (value > 0) return '#22c55e'
  if (value < 0) return '#ef4444'
  return '#6b7280'
}

// All stats for display
const stats = computed(() => [
  { key: 'str', label: 'STR', value: props.gameClass.stats.str },
  { key: 'int', label: 'INT', value: props.gameClass.stats.int },
  { key: 'wis', label: 'WIS', value: props.gameClass.stats.wis },
  { key: 'dex', label: 'DEX', value: props.gameClass.stats.dex },
  { key: 'con', label: 'CON', value: props.gameClass.stats.con },
])

// Primary stat name
const primaryStatName = computed(() => {
  const names: Record<string, string> = {
    str: 'Strength',
    int: 'Intelligence',
    wis: 'Wisdom',
    dex: 'Dexterity',
    con: 'Constitution',
  }
  return names[props.gameClass.primaryStat] ?? props.gameClass.primaryStat
})

// Spell school color mapping
const schoolColors: Record<string, string> = {
  arcane: 'var(--purple)',
  divine: 'var(--gold)',
  nature: 'var(--green)',
  shadow: 'var(--violet)',
}

// Class spell list with resolved spell data
const classSpells = computed(() => {
  const list = getClassSpellList(props.gameClass.id)
  if (!list) return []
  return list.spells
    .map((entry) => {
      const spell = getSpellById(entry.spellId)
      if (!spell) return null
      return {
        id: spell.id,
        name: spell.name,
        school: spell.school,
        learnLevel: entry.learnLevel,
        manaCost: spell.manaCost,
        color: schoolColors[spell.school] ?? 'var(--text-dim)',
      }
    })
    .filter((s) => s !== null)
})

// Magic school label
const schoolLabels: Record<string, string> = {
  arcane: 'Arcane Caster',
  divine: 'Divine Caster',
  nature: 'Nature Caster',
  shadow: 'Shadow Caster',
}

const magicSchool = computed(() => {
  const school = getClassPrimarySchool(props.gameClass.id)
  if (!school) return null
  return {
    label: schoolLabels[school] ?? school,
    school,
    color: schoolColors[school] ?? 'var(--text-dim)',
  }
})

// Special abilities from class flags + magic school
const specialAbilities = computed(() => {
  const abilities: { name: string; description: string; color?: string }[] = []
  if (magicSchool.value) {
    abilities.push({
      name: magicSchool.value.label,
      description: `${classSpells.value.length} spells from the ${magicSchool.value.school} school`,
      color: magicSchool.value.color,
    })
  }
  if (props.gameClass.canShieldBash) {
    abilities.push({
      name: 'Shield Bash',
      description: 'Bonus damage when shield equipped',
    })
  }
  if (props.gameClass.combatLifesteal) {
    abilities.push({
      name: 'Combat Lifesteal',
      description: `Heals ${props.gameClass.combatLifesteal}% of melee damage dealt`,
    })
  }
  if (props.gameClass.finesse) {
    abilities.push({
      name: 'Finesse',
      description: 'Uses the better of STR or DEX for melee damage',
    })
  }
  return abilities
})
</script>

<template>
  <div class="detail-panel" :class="{ prestige: gameClass.prestige }">
    <header class="panel-header">
      <button class="back-btn" @click="emit('close')">&larr;</button>
      <h3>Class Details</h3>
    </header>

    <div class="panel-content">
      <!-- Class name and category -->
      <div class="class-hero">
        <h2 class="class-name" :style="{ color: categoryColor }">{{ gameClass.name }}</h2>
        <div class="class-category" :style="{ color: categoryColor }">{{ category }} Class</div>
        <div class="class-tags">
          <span v-if="gameClass.usesMagic" class="tag magic">Uses Magic</span>
          <span v-else class="tag melee">No Magic</span>
          <span class="tag primary">{{ primaryStatName }}</span>
        </div>
      </div>

      <!-- Lock status -->
      <div v-if="!unlocked" class="locked-section">
        <div class="lock-badge">Locked</div>
        <p class="unlock-condition">{{ gameClass.unlockCondition }}</p>
      </div>

      <!-- Description -->
      <div class="description-section">
        <p class="description-text">"{{ gameClass.description }}"</p>
      </div>

      <!-- Stats section -->
      <div class="stats-section">
        <h4>Stat Modifiers</h4>
        <div class="stat-bars">
          <div v-for="stat in stats" :key="stat.key" class="stat-row">
            <span class="stat-label">{{ stat.label }}</span>
            <div class="stat-bar-container">
              <div class="stat-bar-bg">
                <div class="stat-bar-center"></div>
                <div
                  class="stat-bar-fill"
                  :style="{
                    width: getStatBarWidth(stat.value) + '%',
                    background: getStatBarColor(stat.value),
                  }"
                ></div>
              </div>
            </div>
            <span class="stat-value" :style="{ color: getStatBarColor(stat.value) }">
              {{ formatStat(stat.value) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Class properties -->
      <div class="properties-section">
        <h4>Properties</h4>
        <div class="property-grid">
          <div class="property-row">
            <span class="property-label">Hit Die</span>
            <span class="property-value" :class="{ negative: gameClass.hitdie < 0 }">
              {{ gameClass.hitdie >= 0 ? '+' + gameClass.hitdie : gameClass.hitdie }}
            </span>
          </div>
          <div class="property-row">
            <span class="property-label">Max Attacks</span>
            <span class="property-value">{{ gameClass.maxAttacks }}</span>
          </div>
          <div class="property-row">
            <span class="property-label">Primary Stat</span>
            <span class="property-value">{{ primaryStatName }}</span>
          </div>
        </div>
      </div>

      <!-- Abilities (collapsible) -->
      <div v-if="specialAbilities.length > 0" class="abilities-section">
        <CollapsibleSection
          title="Abilities"
          :badge="specialAbilities.length"
          :expanded="abilitiesExpanded"
          @toggle="abilitiesExpanded = !abilitiesExpanded"
        >
          <div class="ability-list">
            <div
              v-for="ability in specialAbilities"
              :key="ability.name"
              class="ability-item"
              :style="ability.color ? { borderLeftColor: ability.color } : {}"
            >
              <div class="ability-name">{{ ability.name }}</div>
              <div class="ability-description">{{ ability.description }}</div>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <!-- Spells (collapsible) -->
      <div v-if="classSpells.length > 0" class="spells-section">
        <CollapsibleSection
          title="Spells"
          :badge="classSpells.length"
          :expanded="spellsExpanded"
          @toggle="spellsExpanded = !spellsExpanded"
        >
          <div class="spell-list">
            <div v-for="spell in classSpells" :key="spell.id" class="spell-row">
              <span class="spell-dot" :style="{ background: spell.color }"></span>
              <span class="spell-name">{{ spell.name }}</span>
              <span class="spell-meta">
                <span class="spell-level">L{{ spell.learnLevel }}</span>
                <span class="spell-mana">{{ spell.manaCost }}mp</span>
              </span>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <!-- Bot behavior -->
      <div class="behavior-section">
        <h4>Bot Behavior</h4>
        <p class="behavior-text">{{ gameClass.botBehavior }}</p>
      </div>

      <!-- History section -->
      <div v-if="unlocked" class="history-section">
        <h4>Your History</h4>
        <div class="history-grid">
          <div class="history-row">
            <span class="history-label">Victories</span>
            <span class="history-value wins">{{ wins }}</span>
          </div>
        </div>
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
  min-height: 0;
  min-width: 280px;
  max-width: 320px;
}

.detail-panel.prestige {
  border-left-color: rgba(245, 158, 11, 0.5);
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
  padding: var(--space-3);
}

.class-hero {
  text-align: center;
  margin-bottom: var(--space-3);
}

.class-name {
  margin: 0 0 var(--space-1);
  font-size: var(--text-3xl);
}

.class-category {
  font-size: var(--text-base);
  opacity: 0.8;
  margin-bottom: var(--space-2);
}

.class-tags {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}

.tag {
  font-size: var(--text-sm);
  padding: 2px var(--space-2);
  border-radius: var(--radius-md);
  font-weight: 500;
}

.tag.magic {
  color: var(--violet);
  background: rgba(167, 139, 250, 0.15);
}

.tag.melee {
  color: var(--red);
  background: rgba(239, 68, 68, 0.15);
}

.tag.primary {
  color: var(--text-secondary);
  background: var(--highlight);
}

.locked-section {
  text-align: center;
  margin-bottom: var(--space-3);
  padding: var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--border);
}

.lock-badge {
  display: inline-block;
  font-size: var(--text-base);
  font-weight: bold;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--red);
  background: rgba(239, 68, 68, 0.15);
  margin-bottom: var(--space-2);
}

.unlock-condition {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.description-section {
  margin-bottom: var(--space-3);
}

.description-text {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
  font-style: italic;
  line-height: 1.4;
  text-align: center;
}

.stats-section,
.properties-section,
.abilities-section,
.spells-section,
.behavior-section,
.history-section {
  margin-bottom: var(--space-3);
}

h4 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stat-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.stat-label {
  width: 32px;
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.stat-bar-container {
  flex: 1;
  height: 12px;
}

.stat-bar-bg {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--void);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.stat-bar-center {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}

.stat-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: var(--radius-sm);
  transition: width 0.3s ease;
}

.stat-value {
  width: 24px;
  font-size: var(--text-base);
  text-align: right;
}

.property-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.property-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.property-label {
  color: var(--text-secondary);
}

.property-value {
  color: var(--text-primary);
}

.property-value.negative {
  color: var(--red);
}

.ability-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ability-item {
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--purple);
}

.ability-name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.ability-description {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.spell-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.spell-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 3px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
}

.spell-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.spell-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.spell-name {
  flex: 1;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spell-meta {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
  font-size: var(--text-sm);
}

.spell-level {
  color: var(--text-dim);
}

.spell-mana {
  color: var(--cyan);
}

.behavior-text {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: 1.5;
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--blue);
}

.history-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.history-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.history-label {
  color: var(--text-secondary);
}

.history-value {
}

.history-value.wins {
  color: var(--green);
}
</style>
