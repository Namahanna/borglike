/**
 * Feed Store
 *
 * Manages the event feed that displays game messages across all active runs.
 * Uses semantic tags and importance levels for filtering, with regex fallback
 * for untagged messages during migration.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore, type FeedVerbosity } from './settings'
import type { MessageTag, MessageImportance } from '@game/types'

/** Feed event type (maps from GameMessage types) */
export type FeedEventType = 'info' | 'combat' | 'item' | 'level' | 'death' | 'good' | 'danger'

/** A single event in the feed */
export interface FeedEvent {
  id: number
  slot: number
  message: string
  type: FeedEventType
  timestamp: number
}

/** Minimum importance threshold for each verbosity level */
const VERBOSITY_THRESHOLDS: Record<FeedVerbosity, MessageImportance> = {
  minimal: 4, // Deaths, kills, major events
  normal: 3, // + combat, healing
  verbose: 2, // + item management, gold
  all: 1, // Everything
}

// ============================================================================
// LEGACY REGEX PATTERNS (fallback for untagged messages)
// ============================================================================

/** Message patterns to filter out (even if type matches) */
const FILTER_PATTERNS = [
  /^You open the door\.$/,
  /^You pick up .* gold\.$/, // Gold pickups are too noisy
  /^The .* misses you\.$/, // Misses are less interesting
  /^The .* misses[.!]$/, // Monster misses (no target specified)
  /^You miss the .*\.$/,
  /^You suffer \d+ poison damage/, // Poison tick damage is noisy
  /^You hit the .* for \d+ damage/, // Regular hits are too noisy
  /^You hit the .* \d+.*x for \d+.*damage/, // Multi-hit melee
  /^Your arrow hits .* for \d+ damage/, // Ranged hits also noisy
  /^Your arrows? .* \d+.*x for \d+.*damage/, // Multi-shot ranged
  /^The .* (hits|bites|claws|touches|stings|crushes|gazes at|gazes|engulfs) you for \d+ damage/, // Getting hit is noisy
  /^The .* attacks \d+ times for \d+ damage/, // Multi-attack messages
  /^You critically hit/, // Even crits can be noisy
  /^You cast .* for \d+ damage/, // Spell damage is noisy
  /^You cast .* hitting \d+ enemies/, // AOE spells
  /^Your .* beams through/, // Beam spells
  /^You drain \d+ HP/, // Lifesteal is noisy
  /^You cast .+\. You feel/, // Self-buff spells (Light Orb, etc)
]

/** Message patterns that should always show (even if type is 'info') */
const IMPORTANT_INFO_PATTERNS = [
  /^You descend to depth/,
  /^You ascend to depth/,
  /^Welcome to the dungeon/,
  /^You have died/,
  /^Congratulations/,
  /reached level/,
  /^Second Wind/,
]

/** Message types to always show in legacy mode */
const ALWAYS_SHOW_TYPES = new Set(['combat', 'danger', 'good', 'item'])

let eventIdCounter = 0

export const useFeedStore = defineStore('feed', () => {
  // State
  const events = ref<FeedEvent[]>([])
  const MAX_EVENTS = 1000

  // Track last processed message turn per run (fixes the index tracking bug)
  const lastMessageTurn = ref<Map<string, number>>(new Map())

  // Computed
  const recentEvents = computed(() => events.value.slice(0, 10))
  const hasEvents = computed(() => events.value.length > 0)

  /**
   * Check if a tagged message passes the importance threshold
   */
  function passesImportanceFilter(
    importance: MessageImportance | undefined,
    _tags: MessageTag[] | undefined,
    verbosity: FeedVerbosity
  ): boolean {
    const threshold = VERBOSITY_THRESHOLDS[verbosity]

    // If message has importance, use it directly
    if (importance !== undefined) {
      return importance >= threshold
    }

    // Untagged messages: default importance based on presence of tags
    // (during migration, assume untagged = legacy = use regex fallback)
    return false // Will fall through to legacy filter
  }

  /**
   * Legacy filter for untagged messages (regex-based)
   * Returns true if message should be shown
   */
  function legacyFilter(text: string, type: string, verbosity: FeedVerbosity): boolean {
    // In 'all' mode, show everything
    if (verbosity === 'all') {
      return true
    }

    // Check if explicitly filtered out
    for (const pattern of FILTER_PATTERNS) {
      if (pattern.test(text)) {
        return false
      }
    }

    // Always show certain types
    if (ALWAYS_SHOW_TYPES.has(type)) {
      return true
    }

    // Check important info patterns
    for (const pattern of IMPORTANT_INFO_PATTERNS) {
      if (pattern.test(text)) {
        return true
      }
    }

    // In verbose mode, show more
    if (verbosity === 'verbose') {
      return type !== 'info' // Show all non-info messages
    }

    // Filter out generic info messages
    return false
  }

  /**
   * Check if a message should be displayed in the feed
   */
  function shouldShowMessage(
    text: string,
    type: string,
    importance?: MessageImportance,
    tags?: MessageTag[]
  ): boolean {
    const settings = useSettingsStore()
    const verbosity = settings.settings.feedVerbosity

    // Try importance-based filtering first (for tagged messages)
    if (importance !== undefined) {
      return passesImportanceFilter(importance, tags, verbosity)
    }

    // Fall back to legacy regex filtering for untagged messages
    return legacyFilter(text, type, verbosity)
  }

  /**
   * Map GameMessage type to FeedEventType
   */
  function mapMessageType(type: string, text: string): FeedEventType {
    if (text.includes('died') || text.includes('death')) {
      return 'death'
    }
    if (text.includes('reached level') || text.includes('Level ')) {
      return 'level'
    }
    if (type === 'danger') {
      return 'danger'
    }
    if (type === 'good') {
      return 'good'
    }
    if (type === 'combat') {
      return 'combat'
    }
    if (type === 'item') {
      return 'item'
    }
    return 'info'
  }

  /**
   * Add an event to the feed
   */
  function addEvent(slot: number, message: string, type: FeedEventType) {
    events.value.unshift({
      id: eventIdCounter++,
      slot,
      message,
      type,
      timestamp: Date.now(),
    })

    // Trim to max events
    if (events.value.length > MAX_EVENTS) {
      events.value.pop()
    }
  }

  /**
   * Process new messages from a game state
   * Called by instance-manager on each tick
   */
  function processMessages(
    runId: string,
    slot: number,
    messages: Array<{
      text: string
      type: string
      turn: number
      importance?: MessageImportance
      tags?: MessageTag[]
    }>
  ) {
    const lastTurn = lastMessageTurn.value.get(runId) ?? -1
    let newLastTurn = lastTurn

    // Process messages in order (oldest to newest for this batch)
    for (const msg of messages) {
      if (!msg) continue

      // Skip messages we've already processed (by turn number, not index)
      // This fixes the bug where messages stop showing after array shifts
      if (msg.turn <= lastTurn) continue

      newLastTurn = Math.max(newLastTurn, msg.turn)

      // Filter messages
      if (!shouldShowMessage(msg.text, msg.type, msg.importance, msg.tags)) {
        continue
      }

      // Map type and add to feed
      const feedType = mapMessageType(msg.type, msg.text)
      addEvent(slot, msg.text, feedType)
    }

    // Update last turn
    if (newLastTurn > lastTurn) {
      lastMessageTurn.value.set(runId, newLastTurn)
    }
  }

  /**
   * Clear tracking for a run (call when run ends/restarts)
   */
  function clearRunTracking(runId: string) {
    lastMessageTurn.value.delete(runId)
  }

  /**
   * Clear all events
   */
  function clearEvents() {
    events.value = []
    lastMessageTurn.value.clear()
  }

  /**
   * Add a system message (not tied to a specific run)
   */
  function addSystemMessage(message: string, type: FeedEventType = 'info') {
    addEvent(-1, message, type)
  }

  return {
    // State
    events,

    // Computed
    recentEvents,
    hasEvents,

    // Actions
    addEvent,
    processMessages,
    clearRunTracking,
    clearEvents,
    addSystemMessage,
  }
})
