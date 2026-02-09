/**
 * Baseline Mode
 *
 * Runs standardized baseline tests across all classes or races.
 * Thin wrapper over runMatrix — keeps the nice CLI sugar.
 */

import { runMatrix } from './matrix'
import type { BalanceOverrides } from '@game/types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Standard classes for baseline testing (alphabetical) */
export const BASELINE_CLASSES = [
  'archmage',
  'berserker',
  'blackguard',
  'druid',
  'mage',
  'necromancer',
  'paladin',
  'priest',
  'ranger',
  'rogue',
  'warrior',
] as const

/** Standard races for baseline testing (grouped by tier) */
export const BASELINE_RACES = [
  // Starter (average)
  'human',
  'dwarf',
  'elf',
  // Unlockable (spread)
  'half_elf',
  'hobbit',
  'gnome',
  'half_orc',
  'half_troll',
  'dunadan',
  'high_elf',
  'kobold',
] as const

/** Standard baseline parameters */
export const BASELINE_DEFAULTS = {
  runs: 100,
  turns: 50000,
  seed: 1000,
  threads: 20,
}

// ============================================================================
// TYPES
// ============================================================================

export interface BaselineConfig {
  runs?: number
  turns?: number
  seed?: number
  threads?: number
  race?: string
  personality?: string
  maxUpgrades?: boolean
  upgrades?: string
  boosters?: string
  capabilities?: string
  // Balance overrides
  monsterHp?: number
  monsterDamage?: number
  startPotions?: number
  potionRate?: number
  regen?: number
  armorPen?: number
  enchantRate?: number
  itemRate?: number
  levelupHp?: number
  xpRate?: number
  upgradePower?: number
  bestiary?: number
  hpFraction?: number
}

export interface BaselineResult {
  classId: string
  avgDepth: number
  maxDepth: number
  cbRate: number
  avgKills: number
  morgothKills: number
  avgTurns: number
}

export interface BaselineRaceResult {
  raceId: string
  avgDepth: number
  maxDepth: number
  cbRate: number
  avgKills: number
  morgothKills: number
  avgTurns: number
}

export interface BaselineRacesConfig extends BaselineConfig {
  classId?: string
}

// ============================================================================
// HELPERS
// ============================================================================

/** Build balance overrides from config, shared by both modes. */
function buildBalance(config: BaselineConfig, maxUpgrades: boolean): Partial<BalanceOverrides> {
  const effectiveBestiary = (config.bestiary ?? 0) > 0 ? config.bestiary! : (maxUpgrades ? 25 : 0)
  return {
    monsterHpPercent: config.monsterHp ?? 100,
    monsterDamagePercent: config.monsterDamage ?? 100,
    startingPotions: config.startPotions ?? 3,
    potionRatePercent: config.potionRate ?? 100,
    regenPer10Turns: config.regen ?? 0,
    armorPenetration: config.armorPen ?? 0,
    enchantRatePercent: config.enchantRate ?? 100,
    itemRatePercent: config.itemRate ?? 100,
    levelupHpPercent: config.levelupHp ?? 100,
    xpRatePercent: config.xpRate ?? 100,
    upgradePowerPercent: config.upgradePower ?? 100,
    bestiaryBonusPercent: effectiveBestiary,
    baseHpFraction: (config.hpFraction ?? 70) / 100,
  }
}

// ============================================================================
// BASELINE (classes)
// ============================================================================

export async function runBaseline(config: BaselineConfig = {}): Promise<BaselineResult[]> {
  const runs = config.runs ?? BASELINE_DEFAULTS.runs
  const turns = config.turns ?? BASELINE_DEFAULTS.turns
  const seed = config.seed ?? BASELINE_DEFAULTS.seed
  const threads = config.threads ?? BASELINE_DEFAULTS.threads
  const race = config.race ?? 'human'
  const personality = config.personality ?? 'cautious'
  const maxUpgrades = config.maxUpgrades ?? true
  const upgrades = config.upgrades ?? 'full'
  const boosters = config.boosters ?? 'class'
  const capabilities = config.capabilities ?? 'full'

  const result = await runMatrix({
    classes: [...BASELINE_CLASSES],
    races: [race],
    personalities: [personality],
    upgradeTiers: [upgrades],
    capabilityTiers: [capabilities],
    runs,
    maxTurns: turns,
    startSeed: seed,
    threads,
    boosters,
    maxUpgrades,
    balance: buildBalance(config, maxUpgrades),
    headerLabel: 'BASELINE TEST',
  })

  return result.cells.map(c => ({
    classId: c.cell.classId,
    avgDepth: c.avgDepth,
    maxDepth: c.maxDepth,
    cbRate: c.cbRate,
    avgKills: c.avgKills,
    morgothKills: c.morgothKills,
    avgTurns: c.avgTurns,
  })).sort((a, b) => b.avgDepth - a.avgDepth)
}

// ============================================================================
// BASELINE RACES
// ============================================================================

export async function runBaselineRaces(config: BaselineRacesConfig = {}): Promise<BaselineRaceResult[]> {
  const runs = config.runs ?? BASELINE_DEFAULTS.runs
  const turns = config.turns ?? BASELINE_DEFAULTS.turns
  const seed = config.seed ?? BASELINE_DEFAULTS.seed
  const threads = config.threads ?? BASELINE_DEFAULTS.threads
  const classId = config.classId ?? 'warrior'
  const personality = config.personality ?? 'cautious'
  const maxUpgrades = config.maxUpgrades ?? true
  const upgrades = config.upgrades ?? 'full'
  const boosters = config.boosters ?? 'class'
  const capabilities = config.capabilities ?? 'full'

  const result = await runMatrix({
    classes: [classId],
    races: [...BASELINE_RACES],
    personalities: [personality],
    upgradeTiers: [upgrades],
    capabilityTiers: [capabilities],
    runs,
    maxTurns: turns,
    startSeed: seed,
    threads,
    boosters,
    maxUpgrades,
    balance: buildBalance(config, maxUpgrades),
    headerLabel: 'BASELINE RACES TEST',
  })

  return result.cells.map(c => ({
    raceId: c.cell.raceId,
    avgDepth: c.avgDepth,
    maxDepth: c.maxDepth,
    cbRate: c.cbRate,
    avgKills: c.avgKills,
    morgothKills: c.morgothKills,
    avgTurns: c.avgTurns,
  })).sort((a, b) => b.avgDepth - a.avgDepth)
}
