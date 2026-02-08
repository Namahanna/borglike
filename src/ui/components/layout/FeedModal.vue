<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FeedEvent, FeedEventType } from '@/stores/feed'
import PanelFrame from '../common/PanelFrame.vue'

const props = defineProps<{
  events: FeedEvent[]
}>()

const emit = defineEmits<{
  close: []
}>()

// Filter state
const searchQuery = ref('')
const slotFilter = ref<number | 'all'>('all')
const typeFilter = ref<FeedEventType | 'all'>('all')

// Slot options
const slotOptions = [
  { value: 'all', label: 'All Slots' },
  { value: -1, label: 'System' },
  { value: 0, label: 'Run 1' },
  { value: 1, label: 'Run 2' },
  { value: 2, label: 'Run 3' },
  { value: 3, label: 'Run 4' },
]

// Type options
const typeOptions: { value: FeedEventType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'combat', label: 'Combat' },
  { value: 'item', label: 'Item' },
  { value: 'level', label: 'Level' },
  { value: 'death', label: 'Death' },
  { value: 'good', label: 'Good' },
  { value: 'danger', label: 'Danger' },
  { value: 'info', label: 'Info' },
]

// Filtered events
const filteredEvents = computed(() => {
  return props.events.filter((event) => {
    // Slot filter
    if (slotFilter.value !== 'all' && event.slot !== slotFilter.value) {
      return false
    }

    // Type filter
    if (typeFilter.value !== 'all' && event.type !== typeFilter.value) {
      return false
    }

    // Search filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      if (!event.message.toLowerCase().includes(query)) {
        return false
      }
    }

    return true
  })
})

function getSlotColor(slot: number): string {
  if (slot < 0) return 'var(--text-dim)'
  const colors = ['var(--cyan)', 'var(--green)', 'var(--amber)', 'var(--purple)']
  return colors[slot % colors.length] ?? 'var(--text-secondary)'
}

function getSlotLabel(slot: number): string {
  return slot < 0 ? 'SYS' : String(slot + 1)
}

function getTypeClass(type: FeedEventType): string {
  return `event-${type}`
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', { hour12: false })
}
</script>

<template>
  <div class="modal-overlay" @click="emit('close')">
    <PanelFrame class="feed-modal" @click.stop>
      <header class="modal-header">
        <h2>Event Log</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </header>

      <div class="filters">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search messages..."
        />

        <select v-model="slotFilter" class="filter-select">
          <option v-for="opt in slotOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <select v-model="typeFilter" class="filter-select">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <span class="event-count">{{ filteredEvents.length }} events</span>
      </div>

      <div class="event-list">
        <div
          v-for="event in filteredEvents"
          :key="event.id"
          class="event-row"
          :class="getTypeClass(event.type)"
        >
          <span class="event-timestamp">{{ formatTimestamp(event.timestamp) }}</span>
          <span class="event-slot" :style="{ color: getSlotColor(event.slot) }">
            [{{ getSlotLabel(event.slot) }}]
          </span>
          <span class="event-message">{{ event.message }}</span>
        </div>

        <div v-if="filteredEvents.length === 0" class="no-events">
          No events match your filters.
        </div>
      </div>
    </PanelFrame>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.feed-modal {
  width: 700px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-3);
}

.modal-header h2 {
  margin: 0;
  font-size: var(--text-xl);
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: var(--text-2xl);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
}

.close-btn:hover {
  color: var(--text-primary);
}

.filters {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 150px;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-base);
}

.search-input:focus {
  outline: none;
  border-color: var(--cyan);
}

.filter-select {
  padding: var(--space-2) var(--space-3);
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-base);
  cursor: pointer;
}

.event-count {
  font-size: var(--text-base);
  color: var(--text-dim);
  margin-left: auto;
}

.event-list {
  flex: 1;
  overflow-y: auto;
  min-height: 300px;
  max-height: 500px;
}

.event-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-size: var(--text-base);
  border-bottom: 1px solid var(--border-dim, rgba(255, 255, 255, 0.05));
}

.event-row:last-child {
  border-bottom: none;
}

.event-timestamp {
  color: var(--text-dim);
  font-size: var(--text-base);
  flex-shrink: 0;
}

.event-slot {
  font-weight: bold;
  flex-shrink: 0;
}

.event-message {
  color: var(--text-secondary);
}

.event-combat .event-message {
  color: var(--red);
}

.event-item .event-message {
  color: var(--amber);
}

.event-level .event-message {
  color: var(--cyan);
}

.event-death .event-message {
  color: var(--red);
  text-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

.event-good .event-message {
  color: var(--green);
}

.event-danger .event-message {
  color: var(--red);
  font-weight: bold;
}

.no-events {
  padding: var(--space-6);
  text-align: center;
  color: var(--text-dim);
  font-style: italic;
}
</style>
