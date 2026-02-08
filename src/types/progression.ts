/**
 * Meta-progression types
 */

import type { PersonalityConfig } from '@game/bot/types'
import type { Personality } from './events'

export interface Currency {
  essence: number // Primary currency from runs
  artifacts: number // Rare drops, used for prestige unlocks
}

export interface UnlockState {
  races: Set<string>
  classes: Set<string>
  runSlots: number // 1-4
  upgrades: Set<string>
  boosters: Set<string> // Unlocked booster IDs
}

/** Loadout for a run - selected boosters (max 2) */
export interface RunLoadout {
  boosters: [string | null, string | null] // Max 2 active boosters
}

/** Bot capability levels - unlocked through per-slot training */
export interface BotCapabilities {
  // ON/OFF flags (unlocked or not)
  farming: boolean // Can initiate farming loops when under-prepared

  // Graded levels (0-3)
  tactics: number // 0=none, 1=debuffs, 2=+buffs, 3=+smart debuffs
  town: number // 0=none, 1=portal, 2=+healer, 3=+commerce
  preparedness: number // 0=none, 1=counts, 2=tiers, 3=full Morgoth prep
  sweep: number // 0=disabled, 1-3=exploration thoroughness
  surf: number // 0=disabled, 1-3=HP thresholds for stair surfing
  kiting: number // 0=disabled, 1-3=engage distance for ranged classes
  targeting: number // 0=closest, 1-3=target selection intelligence
  retreat: number // 0=panic at 25%, 1-3=retreat/consumable intelligence
}

/** User toggles for ON/OFF capabilities (can disable even when unlocked) */
export interface BotToggles {
  farming: boolean
  sweepEnabled: boolean // Can disable sweep exploration even when in-range
}

/** Default capabilities - face-rush mode (all disabled) */
export const DEFAULT_BOT_CAPABILITIES: BotCapabilities = {
  farming: false,
  tactics: 0,
  town: 0,
  preparedness: 0,
  sweep: 0,
  surf: 0,
  kiting: 0,
  targeting: 0,
  retreat: 0,
}

/** Full capabilities - for migration of existing saves */
export const FULL_BOT_CAPABILITIES: BotCapabilities = {
  farming: true,
  tactics: 3,
  town: 3,
  preparedness: 3,
  sweep: 3,
  surf: 3,
  kiting: 3,
  targeting: 3,
  retreat: 3,
}

/** Default toggles - all ON when unlocked */
export const DEFAULT_BOT_TOGGLES: BotToggles = {
  farming: true,
  sweepEnabled: true,
}

/** Sweep level range - character levels where sweep is active */
export interface SweepLevelRange {
  start: number // First level where sweep activates (0 = disabled)
  end: number // Last level where sweep is active (exclusive)
}

/** Surf level range - character levels where surf/tether is active */
export interface SurfLevelRange {
  start: number // 0 = no lower bound (always eligible)
  end: number // 0 = no upper bound (always eligible)
}

/** Per-slot configuration - remembers last used settings */
export interface SlotConfig {
  race: string
  class: string
  personality: Personality
  boosters: [string | null, string | null]
  // Per-slot bot toggles (on/off overrides for globally unlocked capabilities)
  toggles: BotToggles
  // Sweep exploration level range (class-specific defaults)
  sweepLevelRange: SweepLevelRange
  // Surf level range (character levels where surf/tether activates)
  surfLevelRange?: SurfLevelRange
  // Custom personality slider values (used when personality === 'custom')
  customPersonality?: PersonalityConfig
  // Active levels for graded capabilities (can be lower than unlocked level)
  activeSweepLevel?: number // 0-3, capped by global botCapabilities.sweep
  activeSurfLevel?: number // 0-3, capped by global botCapabilities.surf
  // Depth gate offset: shifts class-based level requirement for descent
  // Positive = need more levels above depth (cautious), negative = can descend sooner (reckless)
  depthGateOffset?: number // -5 to +5, default 0
}

export interface Upgrade {
  id: string
  name: string
  description: string
  category: UpgradeCategory
  maxLevel: number
  currentLevel: number
  baseCost: number
  costScaling: number // Multiplier per level
  effect: UpgradeEffect
}

export type UpgradeCategory =
  | 'stats' // Direct stat bonuses
  | 'borg' // AI behavior modifications
  | 'meta' // XP/gold multipliers
  | 'qol' // Quality of life (turbo speed, auto-restart)

export interface UpgradeEffect {
  type: 'flat' | 'percent' | 'unlock'
  stat?: string
  value: number
}

/** Equipment snapshot for run history display */
export interface EquipmentSnapshot {
  slot: string // EquipSlot name
  name: string // Item or artifact name
  enchantment: number // +1, +2, etc.
  isArtifact: boolean
}

/** Bestiary entry tracking kills and deaths per monster */
export interface BestiaryEntry {
  kills: number
  firstKillTime: number
  deaths: number // How many times this monster has killed the player
  firstDeathTime?: number
}

/** Item armory entry tracking item discovery */
export interface ArmoryEntry {
  firstFoundTime: number
  firstFoundDepth: number
  isArtifact: boolean
}

/** Snapshot of the monster that killed the player */
export interface KillerMonsterSnapshot {
  name: string
  level: number // Monster's effective depth level
  hp: number // Monster's max HP
}

export interface RunStats {
  id: string
  startTime: number
  endTime?: number
  race: string
  class: string
  maxDepth: number
  kills: number
  goldEarned: number
  xpEarned: number
  deathCause?: string
  essenceEarned: number
  // Extended fields for run history
  equipment?: EquipmentSnapshot[]
  inventory?: string[] // Item names at death
  turns?: number // Total turns played
  personality?: string // Bot personality used
  seed?: number // RNG seed for reproducibility
  // Combat stats
  level?: number // Character level at death
  damageDealt?: number
  damageTaken?: number
  // Economy stats
  goldSpent?: number
  itemsBought?: number
  itemsSold?: number
  // Ability usage
  spellsCast?: number
  abilitiesUsed?: number
  // Death details
  killerMonster?: KillerMonsterSnapshot
  deathDepth?: number // Depth where death occurred (may differ from maxDepth)
  // Loadout
  boosters?: string[] // Booster names used this run

  // === EXTENDED STATS (v2) ===
  // Damage dealt breakdown
  damageBySource?: {
    melee: number
    ranged: number
    spell: Record<string, number>
    ability: Record<string, number>
    minion: number
  }
  // Damage taken breakdown
  damageByElement?: Record<string, number>
  damageByMethod?: { melee: number; breath: number; spell: number; trap: number }
  damageTakenByMonster?: Record<string, number>
  // Resource usage
  spellUsage?: Record<string, { casts: number; damage: number; mana: number }>
  abilityUsage?: Record<string, { uses: number; damage: number }>
  consumablesUsed?: { healingPotions: number; buffPotions: number; scrolls: Record<string, number> }
  // Combat accuracy
  meleeHits?: number
  meleeMisses?: number
  rangedHits?: number
  rangedMisses?: number
  criticalHits?: number
  attacksDodged?: number
  // Survival
  healingBySource?: {
    potions: number
    spells: number
    regen: number
    lifesteal: number
    other: number
  }
  statusEffectsSuffered?: Record<string, number>
  closeCalls?: number
}

export interface GlobalStats {
  totalRuns: number
  totalDeaths: number
  totalKills: number
  totalGold: number
  totalEssence: number
  totalFloorsVisited: number
  maxDepthEver: number
  fastestDepth10?: number // Turns to reach depth 10
  longestRun?: number // Most turns survived
  timesReachedDepth50?: number // Runs that reached the final level
  // Prestige unlock tracking
  victoriesPerRace?: Record<string, number> // race name → win count
  victoriesPerClass?: Record<string, number> // class name → win count
  // Best depth tracking for unlock conditions
  bestDepthPerRace?: Record<string, number> // race name → best depth
  bestDepthPerClass?: Record<string, number> // class id → best depth
}

/** Context passed to prestige unlock condition predicates */
export interface UnlockContext {
  globalStats: GlobalStats
  bestiary: Record<string, BestiaryEntry>
}

/** Achievement tracking state */
export interface AchievementState {
  unlocked: Set<string> // Completed achievement IDs
  collected: Set<string> // Achievements where essence has been claimed
  progress: Record<string, number> // Cumulative progress tracking
  newUnlocks: Set<string> // Recently unlocked (for notification dot)
}
