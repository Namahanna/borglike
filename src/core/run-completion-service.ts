/**
 * Run Completion Service
 *
 * Bridges the game engine (game-runner) to the Pinia stores (progression, runs).
 * Handles run end processing: calculating rewards, updating stats, and triggering unlocks.
 */

import type { RunResult } from '@game/game-runner'
import type { RunStats, EquipmentSnapshot, KillerMonsterSnapshot } from '@/types/progression'
import { useProgressionStore } from '@stores/progression'
import { saveRun } from '@stores/persistence'
import { getMonsterByName } from '@game/data/monsters'
import { getBoosterById } from '@game/data/boosters'
import { races, startingRaces } from '@game/data/races'
import { classes, startingClasses } from '@game/data/classes'

// ============================================================================
// TYPES
// ============================================================================

/** Result returned after processing a completed run */
export interface RunCompletionResult {
  /** The RunStats record stored in history */
  runStats: RunStats
  /** Total essence earned this run (after all multipliers) */
  essenceEarned: number
  /** Whether this was a victory */
  isVictory: boolean
  /** New unlocks earned (if any) */
  newUnlocks: {
    races: string[]
    classes: string[]
  }
  /** New achievements earned this run */
  newAchievements: string[]
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/** Result of the sync path: completion data + deferred save promise */
export interface SyncCompletionResult {
  completion: RunCompletionResult
  savePromise: Promise<void>
}

/**
 * Synchronous path for run completion -- does everything except awaiting the IndexedDB save.
 * Returns the completion result and a deferred save promise the caller can await later.
 * Used during catch-up to avoid awaiting in a tight loop.
 */
export function handleRunCompletionSync(result: RunResult): SyncCompletionResult {
  const progression = useProgressionStore()
  const isVictory = result.reason === 'victory'

  // Convert RunResult to RunStats for storage
  const runStats = convertToRunStats(result, isVictory)

  // Calculate essence reward using the formula-based calculation
  let essenceEarned = progression.calculateEssenceReward(runStats, isVictory)

  // Apply booster essence multiplier (Essence Magnet)
  const boosterEssenceMult = result.game.boosterBonuses?.essenceMultiplier ?? 1
  if (boosterEssenceMult > 1) {
    essenceEarned = Math.floor(essenceEarned * boosterEssenceMult)
  }

  runStats.essenceEarned = essenceEarned

  // Record the run in history (memory)
  progression.recordRun(runStats, isVictory)

  // Fire IndexedDB save but don't await -- caller decides when to flush
  const savePromise = saveRun(runStats).catch((err) => {
    console.error('[RunCompletion] Failed to save run:', err)
  })

  // Record monster kills to bestiary
  if (result.game.stats.monsterKills) {
    progression.recordMonsterKills(result.game.stats.monsterKills)
  }

  // Record item discoveries to catalog
  if (result.game.stats.itemsDiscovered) {
    progression.recordItemDiscoveries(result.game.stats.itemsDiscovered)
  }

  // Record monster death (which monster killed the player)
  if (!isVictory && runStats.deathCause) {
    const killerMonster = extractKillerMonster(runStats.deathCause)
    if (killerMonster) {
      progression.recordMonsterDeath(killerMonster)
    }
  }

  // Add essence to currency
  progression.addEssence(essenceEarned)

  const newUnlocks = { races: [] as string[], classes: [] as string[] }

  // Check for and award any achievements
  const newAchievements = checkAchievements(result, progression)

  return {
    completion: { runStats, essenceEarned, isVictory, newUnlocks, newAchievements },
    savePromise,
  }
}

/**
 * Handle the completion of a game run (awaits persistence).
 *
 * Wraps handleRunCompletionSync and awaits the IndexedDB save.
 */
export async function handleRunCompletion(result: RunResult): Promise<RunCompletionResult> {
  const { completion, savePromise } = handleRunCompletionSync(result)
  await savePromise
  return completion
}

// ============================================================================
// CONVERSION
// ============================================================================

/**
 * Convert a game-runner RunResult to a progression store RunStats
 */
function convertToRunStats(result: RunResult, isVictory: boolean): RunStats {
  const game = result.game
  const char = game.character

  // Extract equipment snapshot
  const equipment: EquipmentSnapshot[] = []
  for (const [slot, item] of Object.entries(char.equipment)) {
    if (item) {
      equipment.push({
        slot,
        name: item.artifact?.name ?? item.template.name,
        enchantment: item.enchantment,
        isArtifact: !!item.artifact,
      })
    }
  }

  // Extract inventory item names
  const inventory = char.inventory.map((item) => item.artifact?.name ?? item.template.name)

  // Get death cause and extract killer monster info
  const deathCause = isVictory ? undefined : getDeathCause(game)
  const killerMonster = isVictory ? undefined : extractKillerMonsterInfo(deathCause)

  // Get booster names from IDs
  const boosters = game.boosterIds
    ?.map((id) => getBoosterById(id)?.name)
    .filter((name): name is string => !!name)

  return {
    id: game.runId,
    startTime: game.stats.startTime,
    endTime: game.stats.endTime ?? Date.now(),
    race: char.raceId,
    class: char.classId,
    maxDepth: result.maxDepth,
    kills: result.kills,
    goldEarned: game.stats.goldCollected,
    xpEarned: char.xp,
    deathCause,
    essenceEarned: 0, // Will be filled in after calculation
    // Extended fields
    equipment,
    inventory,
    turns: game.turn,
    personality: game.personality,
    seed: game.seed,
    // Combat stats
    level: char.level,
    damageDealt: game.stats.damageDealt,
    damageTaken: game.stats.damageTaken,
    // Economy stats
    goldSpent: game.stats.goldSpent,
    itemsBought: game.stats.itemsBought,
    itemsSold: game.stats.itemsSold,
    // Ability usage
    spellsCast: game.stats.spellsCast,
    abilitiesUsed: game.stats.abilitiesUsed,
    // Death details
    killerMonster,
    deathDepth: isVictory ? undefined : char.depth,
    // Loadout
    boosters,
    // Extended stats (v2)
    damageBySource: game.stats.damageBySource,
    damageByElement: game.stats.damageByElement,
    damageByMethod: game.stats.damageByMethod,
    damageTakenByMonster: game.stats.damageTakenByMonster,
    spellUsage: game.stats.spellUsage,
    abilityUsage: game.stats.abilityUsage,
    consumablesUsed: game.stats.consumablesUsed,
    meleeHits: game.stats.meleeHits,
    meleeMisses: game.stats.meleeMisses,
    rangedHits: game.stats.rangedHits,
    rangedMisses: game.stats.rangedMisses,
    criticalHits: game.stats.criticalHits,
    attacksDodged: game.stats.attacksDodged,
    healingBySource: game.stats.healingBySource,
    statusEffectsSuffered: game.stats.statusEffectsSuffered,
    closeCalls: game.stats.closeCalls,
  }
}

/**
 * Determine the cause of death from game state
 */
function getDeathCause(game: RunResult['game']): string {
  // Check recent messages for death cause
  const recentMessages = game.messages.slice(-5)
  for (const msg of recentMessages) {
    // Check for "kills you" format (monster-ai sends as 'danger', combat sends as 'combat')
    if ((msg.type === 'danger' || msg.type === 'combat') && msg.text.includes('kills you')) {
      return msg.text
    }
  }

  // Default death message
  return `Slain on depth ${game.character.depth}`
}

/**
 * Extract the monster name that killed the player from a death message
 * Format: "The Monster Name kills you!" -> "Monster Name"
 */
function extractKillerMonster(deathCause: string): string | null {
  // Match "The X kills you!" pattern
  const killMatch = deathCause.match(/^The (.+) kills you!?$/i)
  if (killMatch && killMatch[1]) {
    return killMatch[1]
  }
  return null
}

/**
 * Extract full killer monster info from death cause
 * Looks up the monster template to get level and HP stats
 */
function extractKillerMonsterInfo(deathCause?: string): KillerMonsterSnapshot | undefined {
  if (!deathCause) return undefined

  const monsterName = extractKillerMonster(deathCause)
  if (!monsterName) return undefined

  // Look up the monster template to get stats
  const template = getMonsterByName(monsterName)
  if (!template) {
    // Return basic info if template not found
    return { name: monsterName, level: 1, hp: 0 }
  }

  return {
    name: monsterName,
    level: template.minDepth ?? 1,
    hp: template.hp,
  }
}

// ============================================================================
// ACHIEVEMENT CHECKING
// ============================================================================

/**
 * Check and award achievements based on the run result and global stats
 */
function checkAchievements(
  result: RunResult,
  progression: ReturnType<typeof useProgressionStore>
): string[] {
  const newAchievements: string[] = []

  // Helper to check and award
  const checkAndAward = (id: string): boolean => {
    if (progression.awardAchievement(id)) {
      newAchievements.push(id)
      return true
    }
    return false
  }

  // Progress achievements (per-run checks)
  if (result.kills >= 1) checkAndAward('first_blood')
  if (result.maxDepth >= 10) checkAndAward('depth_10')
  if (result.maxDepth >= 25) checkAndAward('depth_25')
  if (result.maxDepth >= 50) checkAndAward('depth_50')
  if (result.reason === 'victory') checkAndAward('first_victory')

  // Challenge achievements (single-run challenges)
  if (result.kills >= 50) checkAndAward('massacre')
  if (result.game.stats.goldCollected >= 1000) checkAndAward('treasure_hunter')

  // Speed demon: reach depth 10 in under 500 turns
  if (result.maxDepth >= 10 && result.game.turn < 500) {
    checkAndAward('speed_demon')
  }

  // Cumulative achievements (global stat checks)
  // Note: globalStats have already been updated by recordRun at this point

  // Monster kill tiers
  if (progression.globalStats.totalKills >= 100) checkAndAward('centurion')
  if (progression.globalStats.totalKills >= 1000) checkAndAward('slayer')
  if (progression.globalStats.totalKills >= 5000) checkAndAward('butcher')
  if (progression.globalStats.totalKills >= 25000) checkAndAward('annihilator')
  if (progression.globalStats.totalKills >= 100000) checkAndAward('genocide')

  // Gold tiers
  if (progression.globalStats.totalGold >= 10000) checkAndAward('millionaire')
  if (progression.globalStats.totalGold >= 100000) checkAndAward('tycoon')
  if (progression.globalStats.totalGold >= 500000) checkAndAward('mogul')
  if (progression.globalStats.totalGold >= 1000000) checkAndAward('dragons_hoard')

  // Death tiers
  if (progression.globalStats.totalDeaths >= 100) checkAndAward('frequent_dier')
  if (progression.globalStats.totalDeaths >= 500) checkAndAward('professional_corpse')
  if (progression.globalStats.totalDeaths >= 1000) checkAndAward('death_enthusiast')
  if (progression.globalStats.totalDeaths >= 5000) checkAndAward('immortally_mortal')

  // Depth 50 tiers
  const depth50 = progression.globalStats.timesReachedDepth50 ?? 0
  if (depth50 >= 50) checkAndAward('deep_diver')
  if (depth50 >= 100) checkAndAward('abyss_regular')
  if (depth50 >= 250) checkAndAward('bottom_dweller')
  if (depth50 >= 500) checkAndAward('abyss_veteran')
  if (depth50 >= 1000) checkAndAward('eternal_delver')

  // Mastery achievements (victory-only — check all, not just current, for retroactive awards)
  if (result.reason === 'victory') {
    const raceWins = progression.globalStats.victoriesPerRace ?? {}
    const classWins = progression.globalStats.victoriesPerClass ?? {}

    // Individual race/class wins
    for (const race of races) {
      if ((raceWins[race.name] ?? 0) >= 1) checkAndAward(`win_race_${race.id}`)
    }
    for (const cls of classes) {
      if ((classWins[cls.name] ?? 0) >= 1) checkAndAward(`win_class_${cls.id}`)
    }

    // Meta achievements — count distinct wins
    const startingRaceWins = startingRaces.filter((r) => (raceWins[r.name] ?? 0) >= 1).length
    const startingClassWins = startingClasses.filter((c) => (classWins[c.name] ?? 0) >= 1).length
    const totalRaceWins = races.filter((r) => (raceWins[r.name] ?? 0) >= 1).length
    const totalClassWins = classes.filter((c) => (classWins[c.name] ?? 0) >= 1).length

    if (startingRaceWins >= startingRaces.length) checkAndAward('win_all_starting_races')
    if (startingClassWins >= startingClasses.length) checkAndAward('win_all_starting_classes')
    if (totalRaceWins >= races.length) checkAndAward('win_all_races')
    if (totalClassWins >= classes.length) checkAndAward('win_all_classes')
  }

  return newAchievements
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate the total essence earned in all recorded runs
 */
export function getTotalRunEssence(): number {
  const progression = useProgressionStore()
  return progression.runHistory.reduce((sum, run) => sum + run.essenceEarned, 0)
}

/**
 * Get statistics summary from run history
 */
export function getRunStatsSummary(): {
  totalRuns: number
  totalVictories: number
  avgDepth: number
  avgKills: number
  bestDepth: number
  totalEssence: number
} {
  const progression = useProgressionStore()
  const history = progression.runHistory

  if (history.length === 0) {
    return {
      totalRuns: 0,
      totalVictories: 0,
      avgDepth: 0,
      avgKills: 0,
      bestDepth: 0,
      totalEssence: 0,
    }
  }

  const totalRuns = history.length
  const totalVictories = progression.totalVictories
  const avgDepth = history.reduce((sum, r) => sum + r.maxDepth, 0) / totalRuns
  const avgKills = history.reduce((sum, r) => sum + r.kills, 0) / totalRuns
  const bestDepth = Math.max(...history.map((r) => r.maxDepth))
  const totalEssence = history.reduce((sum, r) => sum + r.essenceEarned, 0)

  return {
    totalRuns,
    totalVictories,
    avgDepth: Math.round(avgDepth * 10) / 10,
    avgKills: Math.round(avgKills * 10) / 10,
    bestDepth,
    totalEssence,
  }
}
