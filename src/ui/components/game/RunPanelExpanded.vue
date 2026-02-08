<script setup lang="ts">
import { computed, watchEffect, ref } from 'vue'
import type { ActiveRun, DisplayItem } from '@/stores/runs'
import type { EquipSlot } from '@game/types'
import { PERSONALITY_DISPLAY } from '@/types/events'
import { useRunsStore } from '@/stores/runs'
import { useProgressionStore } from '@/stores/progression'
import { useSettingsStore, type PanelStates } from '@/stores/settings'
import { useRunDuration } from '@/ui/composables/use-run-duration'
import { useKillHoldButton } from '@/ui/composables/use-kill-hold'
import DungeonGrid from '../DungeonGridCanvas.vue'
import ProgressBar from '../common/ProgressBar.vue'
import CollapsibleSection from '../common/CollapsibleSection.vue'
import RunSummary from '../analytics/RunSummary.vue'

const props = defineProps<{
  run: ActiveRun
}>()

const emit = defineEmits<{
  collapse: []
  restart: []
  dismiss: []
  kill: []
}>()

const runs = useRunsStore()
const progression = useProgressionStore()
const settingsStore = useSettingsStore()

// Panel toggle helper
function togglePanel(panel: keyof PanelStates) {
  settingsStore.togglePanel(panel)
}

// Resistance display config
const RESIST_CONFIG: Record<string, { label: string; color: string }> = {
  FIRE: { label: 'F', color: '#ef4444' },
  COLD: { label: 'C', color: '#06b6d4' },
  POISON: { label: 'P', color: '#22c55e' },
  ACID: { label: 'A', color: '#84cc16' },
  LIGHTNING: { label: 'L', color: '#eab308' },
  LIGHT: { label: 'Lt', color: '#fbbf24' },
  DARK: { label: 'Dk', color: '#6366f1' },
  DRAIN: { label: 'Dr', color: '#a855f7' },
}

const personalityDisplay = computed(() => PERSONALITY_DISPLAY[props.run.config.personality ?? 'cautious'])

// Computed: active resistances for display
const activeResistances = computed(() => {
  return Object.entries(props.run.resistances)
    .filter(([_, value]) => value !== 0)
    .map(([type, value]) => ({
      type,
      value: value as number,
      ...(RESIST_CONFIG[type] || { label: type[0], color: '#94a3b8' }),
    }))
})

// Status effect display config
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  speed: { label: 'SPD', color: '#06b6d4' },
  heroism: { label: 'HERO', color: '#f59e0b' },
  berserk: { label: 'BRSRK', color: '#ef4444' },
  blessing: { label: 'BLESS', color: '#fbbf24' },
  protection: { label: 'PROT', color: '#3b82f6' },
}

// Computed: formatted status effects
const activeStatuses = computed(() => {
  return props.run.statusEffects.map((effect) => ({
    ...effect,
    ...(STATUS_CONFIG[effect.type] || { label: effect.type.toUpperCase(), color: '#94a3b8' }),
  }))
})

// Linger sections for N turns after content disappears (prevents layout thrash on buff cycling)
const SECTION_LINGER_TURNS = 15

const lastResistActiveTurn = ref(0)
const lastStatusActiveTurn = ref(0)

watchEffect(() => {
  if (activeResistances.value.length > 0) lastResistActiveTurn.value = props.run.turns
})
watchEffect(() => {
  if (activeStatuses.value.length > 0) lastStatusActiveTurn.value = props.run.turns
})

const showResistSection = computed(
  () =>
    activeResistances.value.length > 0 ||
    (lastResistActiveTurn.value > 0 &&
      props.run.turns - lastResistActiveTurn.value < SECTION_LINGER_TURNS),
)
const showStatusSection = computed(
  () =>
    activeStatuses.value.length > 0 ||
    (lastStatusActiveTurn.value > 0 &&
      props.run.turns - lastStatusActiveTurn.value < SECTION_LINGER_TURNS),
)

// Get personal best for comparison in RunSummary (uses cached value from store)
const personalBest = computed(() => {
  if (!props.run.finalStats) return undefined
  const best = progression.bestRunByDepth
  if (!best || best.id === props.run.finalStats.id) return undefined
  return best
})

// Separate consumables from equipment items (consumables don't count toward inventory limit)
const isConsumableChar = (char: string) => char === '!' || char === '?'

// Equipment items (non-consumables) for the Pack section
const equipmentItems = computed(() => {
  return props.run.inventory.filter((item) => !isConsumableChar(item.char))
})

// Stacked consumable for display
interface StackedConsumable {
  name: string
  char: string
  color: number
  count: number
  isArtifact: boolean
  tier: number
}

// Consumables stacked by name with count
const stackedConsumables = computed(() => {
  const consumables = props.run.inventory.filter((item) => isConsumableChar(item.char))
  const stacks = new Map<string, StackedConsumable>()

  for (const item of consumables) {
    const existing = stacks.get(item.name)
    if (existing) {
      existing.count++
    } else {
      stacks.set(item.name, {
        name: item.name,
        char: item.char,
        color: item.color,
        count: 1,
        isArtifact: item.isArtifact,
        tier: item.tier,
      })
    }
  }

  // Sort: potions first, then scrolls, then by name
  return Array.from(stacks.values()).sort((a, b) => {
    if (a.char !== b.char) return a.char === '!' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

// Reactive run duration that updates every second
const runDuration = useRunDuration(() => props.run.startTime)

// Equipment slots configuration
const equipSlots = [
  { id: 'weapon', label: 'wep' },
  { id: 'armor', label: 'arm' },
  { id: 'shield', label: 'shd' },
  { id: 'helm', label: 'hlm' },
  { id: 'gloves', label: 'glv' },
  { id: 'boots', label: 'bot' },
  { id: 'ring1', label: 'rg1' },
  { id: 'ring2', label: 'rg2' },
  { id: 'amulet', label: 'amu' },
  { id: 'light', label: 'lit' },
  { id: 'bow', label: 'bow' },
]

const EMPTY_CHAR = '─'

function getSlotChar(slotId: string): string {
  const item = props.run.equipment[slotId as EquipSlot]
  return item?.char ?? EMPTY_CHAR
}

function getSlotColor(slotId: string): string {
  const item = props.run.equipment[slotId as EquipSlot]
  if (!item) return '#475569' // dim
  return '#' + item.color.toString(16).padStart(6, '0')
}

function getSlotTooltip(slotId: string): string {
  const item = props.run.equipment[slotId as EquipSlot]
  if (!item) return `${slotId} (empty)`
  return formatItemName(item)
}

function formatItemName(item: DisplayItem): string {
  if (item.enchantment > 0) {
    return `${item.name} +${item.enchantment}`
  }
  return item.name
}

function handleCollapse() {
  emit('collapse')
}

function handleToggleTurbo() {
  runs.toggleTurbo(props.run.id)
}

function handleRestart() {
  emit('restart')
}

function handleDismiss() {
  emit('dismiss')
}

// Kill button hold state using composable
const killHold = useKillHoldButton({
  duration: 1000,
  onComplete: () => emit('kill'),
})

function startKillHold() {
  if (props.run.state === 'dead') return
  killHold.start()
}

// Format bot goal for display (TYPE: reason)
function formatGoal(goal: string | undefined): string {
  if (!goal) return '...'
  const parts = goal.split(' - ')
  if (parts.length < 2) return goal
  return `${parts[0]}: ${parts.slice(1).join(' - ')}`
}
</script>

<template>
  <div class="run-expanded" :class="{ dead: run.state === 'dead' }">
    <!-- Header -->
    <header class="expanded-header">
      <div class="header-left">
        <button class="collapse-btn" title="Return to grid view" @click="handleCollapse">
          <span>✖</span>
        </button>
        <div class="run-identity">
          <span class="run-class">{{ run.config.class }}</span>
          <span class="run-race">{{ run.config.race }}</span>
          <span class="run-personality" :style="{ color: personalityDisplay.color }">{{ personalityDisplay.label }}</span>
        </div>
      </div>

      <div class="header-center">
        <span class="slot-badge">Slot {{ run.slot + 1 }}</span>
        <span class="run-time">{{ runDuration }}</span>
      </div>

      <div class="header-right">
        <button class="turbo-btn" :class="{ active: run.turbo }" @click="handleToggleTurbo">
          <span class="turbo-icon">▶▶</span>
          Turbo
        </button>
        <button
          class="kill-btn"
          :class="{ holding: killHold.progress.value > 0, disabled: run.state === 'dead' }"
          :disabled="run.state === 'dead'"
          title="Hold to end run"
          @mousedown="startKillHold"
          @mouseup="killHold.cancel"
          @mouseleave="killHold.cancel"
          @touchstart.prevent="startKillHold"
          @touchend="killHold.cancel"
          @touchcancel="killHold.cancel"
        >
          <span class="kill-icon">✗</span>
          Kill
          <span
            v-if="killHold.progress.value > 0"
            class="kill-progress"
            :style="{ width: killHold.progress.value + '%' }"
          />
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="expanded-content">
      <!-- Stats Panel -->
      <aside class="stats-panel">
        <!-- AI Status (minimal introspection) -->
        <div v-if="run.state === 'running'" class="ai-status">
          <p class="ai-line" :title="run.botGoal">
            <span class="ai-label">Goal:</span> {{ formatGoal(run.botGoal) }}
          </p>
          <p v-if="run.depthBlocker" class="ai-line prep" :title="run.depthBlocker">
            <span class="ai-label">Prep:</span> {{ run.depthBlocker }}
          </p>
        </div>

        <!-- Vitals: HP/MP bars + level/XP/gold -->
        <CollapsibleSection
          title="Vitals"
          :expanded="settingsStore.panelStates.vitals"
          @toggle="togglePanel('vitals')"
        >
          <div class="resource-row">
            <span class="stat-label">HP</span>
            <ProgressBar
              :current="run.hp"
              :max="run.maxHp"
              variant="hp"
              :show-text="true"
              size="md"
            />
          </div>
          <div v-if="run.maxMp > 0" class="resource-row">
            <span class="stat-label">MP</span>
            <ProgressBar
              :current="run.mp"
              :max="run.maxMp"
              variant="mp"
              :show-text="true"
              size="md"
            />
          </div>
          <div class="stats-row">
            <span class="stat-item"
              >Lvl <span class="val level">{{ run.level }}</span></span
            >
            <span class="stat-item"
              >XP <span class="val xp">{{ run.xp }}</span></span
            >
            <span class="stat-item"
              >Gold <span class="val gold">{{ run.gold }}</span></span
            >
          </div>
          <div class="stats-row">
            <span class="stat-item"
              >D:<span class="val depth">{{ run.depth }}</span></span
            >
            <span class="stat-item"
              >T:<span class="val">{{ run.turns.toLocaleString() }}</span></span
            >
            <span class="stat-item"
              >K:<span class="val kills">{{ run.kills }}</span></span
            >
          </div>
        </CollapsibleSection>

        <!-- Core Stats: STR, DEX, etc. -->
        <CollapsibleSection
          title="Stats"
          :expanded="settingsStore.panelStates.stats"
          @toggle="togglePanel('stats')"
        >
          <div class="core-stats-grid">
            <div class="core-stat">
              <span class="core-label">STR</span>
              <span class="core-val str">{{ run.stats.str }}</span>
            </div>
            <div class="core-stat">
              <span class="core-label">INT</span>
              <span class="core-val int">{{ run.stats.int }}</span>
            </div>
            <div class="core-stat">
              <span class="core-label">DEX</span>
              <span class="core-val dex">{{ run.stats.dex }}</span>
            </div>
            <div class="core-stat">
              <span class="core-label">WIS</span>
              <span class="core-val wis">{{ run.stats.wis }}</span>
            </div>
            <div class="core-stat">
              <span class="core-label">CON</span>
              <span class="core-val con">{{ run.stats.con }}</span>
            </div>
          </div>
        </CollapsibleSection>

        <!-- Combat Stats: AC, EVA, DMG, SPD, ACC (2-column grid) -->
        <CollapsibleSection
          title="Combat"
          :expanded="settingsStore.panelStates.combat"
          @toggle="togglePanel('combat')"
        >
          <div class="combat-stats-grid">
            <div class="combat-stat">
              <span class="combat-label">AC</span>
              <span class="combat-val armor">{{ run.combat.armor }}</span>
            </div>
            <div class="combat-stat">
              <span class="combat-label">EVA</span>
              <span class="combat-val evasion">{{ run.combat.evasion }}</span>
            </div>
            <div class="combat-stat">
              <span class="combat-label">DMG</span>
              <span class="combat-val damage">{{ run.combat.meleeDamage }}</span>
            </div>
            <div class="combat-stat">
              <span class="combat-label">ACC</span>
              <span class="combat-val accuracy">{{ run.combat.accuracy }}</span>
            </div>
            <div class="combat-stat">
              <span class="combat-label">SPD</span>
              <span
                class="combat-val speed"
                :class="{ buffed: run.combat.speed > 100, debuffed: run.combat.speed < 100 }"
              >
                {{ run.combat.speed }}
              </span>
            </div>
          </div>
        </CollapsibleSection>

        <!-- Resistances (only show if any) -->
        <CollapsibleSection
          v-show="showResistSection"
          title="Resist"
          :expanded="settingsStore.panelStates.resist"
          :badge="activeResistances.length"
          @toggle="togglePanel('resist')"
        >
          <div class="resist-grid">
            <div
              v-for="resist in activeResistances"
              :key="resist.type"
              class="resist-item"
              :title="`${resist.type}: ${resist.value}%`"
            >
              <span class="resist-label" :style="{ color: resist.color }">{{ resist.label }}</span>
              <span
                class="resist-val"
                :class="{ immune: resist.value >= 100, vuln: resist.value < 0 }"
              >
                {{ resist.value }}
              </span>
            </div>
          </div>
        </CollapsibleSection>

        <!-- Status Effects (only show if any) -->
        <CollapsibleSection
          v-show="showStatusSection"
          title="Status"
          :expanded="settingsStore.panelStates.status"
          :badge="activeStatuses.length"
          @toggle="togglePanel('status')"
        >
          <div class="status-effects">
            <div
              v-for="status in activeStatuses"
              :key="status.type"
              class="status-effect"
              :style="{ borderColor: status.color }"
            >
              <span class="status-name" :style="{ color: status.color }">{{ status.label }}</span>
              <span class="status-turns">{{ status.turnsRemaining }}</span>
            </div>
          </div>
        </CollapsibleSection>

        <!-- Equipment Grid -->
        <CollapsibleSection
          title="Equipped"
          :expanded="settingsStore.panelStates.equipment"
          @toggle="togglePanel('equipment')"
        >
          <div class="equip-grid">
            <div
              v-for="slot in equipSlots"
              :key="slot.id"
              class="equip-slot"
              :title="getSlotTooltip(slot.id)"
            >
              <span class="slot-char" :style="{ color: getSlotColor(slot.id) }">
                {{ getSlotChar(slot.id) }}
              </span>
              <span class="slot-label">{{ slot.label }}</span>
            </div>
          </div>
        </CollapsibleSection>

        <!-- Consumables (stacked potions/scrolls) -->
        <CollapsibleSection
          v-if="stackedConsumables.length > 0"
          title="Consumables"
          :expanded="settingsStore.panelStates.consumables"
          :badge="stackedConsumables.reduce((sum, c) => sum + c.count, 0)"
          @toggle="togglePanel('consumables')"
        >
          <div class="consumables-list">
            <div v-for="item in stackedConsumables" :key="item.name" class="consumable-item">
              <span
                class="item-char"
                :style="{ color: '#' + item.color.toString(16).padStart(6, '0') }"
                >{{ item.char }}</span
              >
              <span class="consumable-count">{{ item.count }}x</span>
              <span class="item-name" :class="{ artifact: item.isArtifact }">
                {{ item.name }}
              </span>
            </div>
          </div>
        </CollapsibleSection>

        <!-- Inventory (equipment items only, consumables shown separately) -->
        <CollapsibleSection
          title="Pack"
          :expanded="settingsStore.panelStates.inventory"
          :badge="equipmentItems.length"
          @toggle="togglePanel('inventory')"
        >
          <div class="inventory-list">
            <div v-for="item in equipmentItems" :key="item.id" class="inv-item">
              <span
                class="item-char"
                :style="{ color: '#' + item.color.toString(16).padStart(6, '0') }"
                >{{ item.char }}</span
              >
              <span class="item-name" :class="{ artifact: item.isArtifact }">
                {{ formatItemName(item) }}
              </span>
            </div>
            <div v-if="equipmentItems.length === 0" class="inv-empty">Empty</div>
          </div>
        </CollapsibleSection>

        <!-- Run Status Badge -->
        <div class="run-status-badges">
          <span class="status-badge" :class="run.state">
            {{ run.state === 'dead' ? 'DEAD' : run.state === 'running' ? 'ACTIVE' : 'STARTING' }}
          </span>
          <span v-if="run.turbo" class="status-badge turbo">TURBO</span>
        </div>
      </aside>

      <!-- Dungeon View -->
      <div class="dungeon-container">
        <DungeonGrid
          :grid="run.grid"
          :cursor-x="run.cursorX"
          :cursor-y="run.cursorY"
          class="expanded-grid"
        />
      </div>
    </div>

    <!-- Death Overlay with RunSummary -->
    <div v-if="run.state === 'dead'" class="death-overlay">
      <RunSummary
        v-if="run.finalStats"
        :run="run.finalStats"
        :personal-best="personalBest"
        @close="handleCollapse"
        @restart="handleRestart"
      />
      <!-- Fallback if no finalStats (shouldn't happen normally) -->
      <div v-else class="death-content">
        <span class="death-icon">☠</span>
        <span class="death-text">DEFEATED</span>
        <div class="death-stats">
          <span>Reached Depth {{ run.depth }}</span>
          <span>{{ run.kills }} Kills</span>
          <span>{{ run.gold }} Gold</span>
        </div>
        <div class="death-actions">
          <button class="action-btn primary" @click="handleRestart">
            <span>↻</span> Restart Run
          </button>
          <button class="action-btn secondary" @click="handleDismiss">Dismiss</button>
          <button class="action-btn secondary" @click="handleCollapse">Return to Grid</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.run-expanded {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  background: var(--void);
}

.run-expanded.dead {
  opacity: 0.9;
}

/* Header */
.expanded-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.collapse-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: var(--red);
  border-color: var(--red);
  color: white;
}

.run-identity {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-lg);
}

.run-class {
  color: var(--green);
  text-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

.run-race {
  color: var(--cyan);
  text-shadow: 0 0 8px rgba(6, 182, 212, 0.5);
}

.run-personality {
  font-size: var(--text-base);
  opacity: 0.7;
}

.header-center {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.slot-badge {
  font-size: var(--text-base);
  padding: var(--space-1) var(--space-3);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-transform: uppercase;
}

.run-time {
  font-size: var(--text-lg);
  color: var(--text-dim);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.turbo-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 14px;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.turbo-btn:hover {
  border-color: var(--amber);
  color: var(--amber);
}

.turbo-btn.active {
  background: rgba(245, 158, 11, 0.15);
  border-color: var(--amber);
  color: var(--amber);
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}

.turbo-icon {
  font-size: var(--text-base);
}

.kill-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 14px;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.kill-btn:hover:not(.disabled) {
  border-color: var(--red);
  color: var(--red);
}

.kill-btn.holding {
  border-color: var(--red);
  color: var(--red);
}

.kill-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.kill-btn .kill-icon {
  position: relative;
  z-index: 1;
}

.kill-btn .kill-progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: rgba(239, 68, 68, 0.3);
  transition: width 0.05s linear;
}

/* Content */
.expanded-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Stats Panel */
/* AI Status */
.ai-status {
  padding: var(--space-2) var(--space-2);
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.ai-line {
  margin: 0;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2lh;
}

.ai-line + .ai-line {
  margin-top: var(--space-1);
}

.ai-line.prep {
  color: var(--amber);
}

.ai-label {
  color: var(--text-dim);
  text-transform: uppercase;
  font-size: var(--text-sm);
}

.stats-panel {
  width: 220px;
  padding: var(--space-2);
  background: var(--panel);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stat-section {
  padding: var(--space-2) !important;
}

.stat-section h3 {
  font-size: var(--text-base);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 var(--space-2);
}

.stat-label {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

/* Vitals compact layout */
.vitals .resource-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.vitals .resource-row :deep(.progress-bar) {
  flex: 1;
}

.vitals .stat-label {
  width: 20px;
  flex-shrink: 0;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-base);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.stat-item .val {
  font-weight: bold;
  color: var(--text-primary);
}
.stat-item .val.depth {
  color: var(--purple);
}
.stat-item .val.kills {
  color: var(--red);
}
.stat-item .val.gold {
  color: var(--amber);
}
.stat-item .val.xp {
  color: var(--cyan);
}
.stat-item .val.level {
  color: var(--green);
}

/* Equipment grid */
.equip-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-1);
}

.equip-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-1) 2px;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.slot-char {
  font-size: var(--text-lg);
  line-height: 1;
}

.slot-label {
  font-size: var(--text-2xs);
  color: var(--text-dim);
  text-transform: lowercase;
}

/* Inventory list */
.inventory-list {
  max-height: 180px;
  overflow-y: auto;
}

.inv-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px 0;
  font-size: var(--text-base);
}

.item-char {
  width: 12px;
  text-align: center;
}

.item-name {
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-name.artifact {
  color: var(--amber);
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
}

.inv-empty,
.inv-more {
  font-size: var(--text-base);
  color: var(--text-dim);
  font-style: italic;
}

/* Consumables list (stacked potions/scrolls) */
.consumables-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.consumable-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-base);
}

.consumable-count {
  color: var(--text-dim);
  min-width: 20px;
}

.status-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.status-badge {
  font-size: var(--text-sm);
  padding: 3px var(--space-2);
  border-radius: var(--radius-md);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.status-badge.running {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid var(--green);
  color: var(--green);
}

.status-badge.starting {
  background: rgba(6, 182, 212, 0.15);
  border: 1px solid var(--cyan);
  color: var(--cyan);
}

.status-badge.dead {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid var(--red);
  color: var(--red);
}

.status-badge.turbo {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid var(--amber);
  color: var(--amber);
}

/* Run status badges at bottom of panel */
.run-status-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--highlight);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

/* Vitals layout (inside collapsible) */
.resource-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.resource-row :deep(.progress-bar) {
  flex: 1;
}

.resource-row .stat-label {
  width: 20px;
  flex-shrink: 0;
}

/* Core Stats Grid */
.core-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1) var(--space-2);
}

.core-stat {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-base);
}

.core-label {
  color: var(--text-dim);
}

.core-val {
  font-weight: bold;
  color: var(--text-primary);
}

.core-val.str {
  color: var(--red);
}
.core-val.dex {
  color: var(--green);
}
.core-val.con {
  color: var(--amber);
}
.core-val.int {
  color: var(--cyan);
}
.core-val.wis {
  color: var(--purple);
}

/* Combat Stats Grid (2-column like core stats) */
.combat-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1) var(--space-2);
}

.combat-stat {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-base);
}

.combat-label {
  color: var(--text-dim);
}

.combat-val {
  font-weight: bold;
  color: var(--text-primary);
}

.combat-val.armor {
  color: var(--cyan);
}
.combat-val.evasion {
  color: var(--green);
}
.combat-val.damage {
  color: var(--red);
}
.combat-val.accuracy {
  color: var(--amber);
}
.combat-val.speed {
  color: var(--text-secondary);
}
.combat-val.speed.buffed {
  color: var(--green);
}
.combat-val.speed.debuffed {
  color: var(--red);
}

/* Resistances Grid */
.resist-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1) var(--space-2);
}

.resist-item {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-base);
}

.resist-label {
  font-weight: bold;
}

.resist-val {
  color: var(--text-secondary);
}

.resist-val.immune {
  color: var(--green);
  text-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
}

.resist-val.vuln {
  color: var(--red);
}

/* Status Effects */
.status-effects {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.status-effect {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 6px;
  background: var(--highlight);
  border: 1px solid;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}

.status-name {
  font-weight: bold;
}

.status-turns {
  color: var(--text-dim);
}

/* Dungeon */
.dungeon-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  overflow: hidden;
}

.expanded-grid {
  font-size: var(--text-xl);
}

/* Death Overlay */
.death-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 18, 0.85);
  z-index: 10;
}

.death-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.death-icon {
  font-size: 48px;
  opacity: 0.8;
}

.death-text {
  font-size: var(--text-5xl);
  font-weight: bold;
  color: var(--red);
  text-shadow: 0 0 24px rgba(239, 68, 68, 0.6);
  letter-spacing: 6px;
}

.death-stats {
  display: flex;
  gap: var(--space-6);
  font-size: var(--text-lg);
  color: var(--text-secondary);
}

.death-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.primary {
  background: var(--indigo);
  border: 1px solid var(--indigo);
  color: white;
  font-weight: bold;
}

.action-btn.primary:hover {
  background: var(--indigo-hover);
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
}

.action-btn.secondary {
  background: var(--highlight);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.action-btn.secondary:hover {
  background: var(--border);
  color: var(--text-primary);
  border-color: var(--indigo);
}
</style>
