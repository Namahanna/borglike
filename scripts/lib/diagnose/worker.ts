/**
 * Worker thread for parallel diagnosis runs
 *
 * Tinypool worker that executes runDiagnosis in parallel.
 * NOTE: Uses relative imports because workers can't resolve path aliases.
 * Shared config-parsing logic lives in ./config-parsing.ts.
 */

import { createGame, processTurn } from '../../../src/game/game-loop'
import { computeMaxUpgradeBonuses, computeUpgradeBonuses, computeUpgradeBonusesFromPreset } from '../../../src/game/upgrade-effects'
import { upgrades as allUpgrades } from '../../../src/game/data/upgrades'
import { VICTORY_BOSS_NAME } from '../../../src/game/data/monsters'
import { runBotTick, createBotState } from '../../../src/game/bot'
import { calculateCombatStats, calculateStats } from '../../../src/game/character'
import type { GameState, BotPersonality, BalanceOverrides } from '../../../src/game/types'
import { DEFAULT_BALANCE, MAX_DEPTH } from '../../../src/game/types'
import type { BotState } from '../../../src/game/bot/types'
import type { DiagnoseResult, EndReason, DiagnosticIssue, AnalyzerResult } from './types'
import { parseCapabilities, parseCustomUpgrades, resolveBoosterBonuses } from './config-parsing'

interface WorkerInput {
  seed: number
  config: {
    raceId?: string
    classId?: string
    personality?: string
    maxTurns?: number
    circuitBreakerTurns?: number
    maxUpgrades?: boolean
    excludeUpgrades?: string[]
    upgrades?: string
    boosters?: string
    randomize?: boolean
    balance?: Partial<BalanceOverrides>
    capabilities?: string
  }
}

// Available options for randomization
const RACES = ['human', 'dwarf', 'elf', 'half_elf', 'hobbit', 'gnome', 'half_orc', 'half_troll', 'dunadan', 'high_elf', 'kobold']
const CLASSES = ['warrior', 'mage', 'rogue', 'priest', 'ranger', 'paladin', 'necromancer', 'berserker', 'archmage', 'druid', 'blackguard']
const PERSONALITIES: BotPersonality[] = ['cautious', 'aggressive', 'greedy', 'speedrunner']

function pickRandom<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!
}

const DEFAULT_CONFIG = {
  raceId: 'human',
  classId: 'warrior',
  personality: 'cautious' as BotPersonality,
  maxTurns: 5000,
  circuitBreakerTurns: 1000,
  verbosity: 1 as const,
  maxUpgrades: false,
  excludeUpgrades: [] as string[],
  upgrades: 'full',
  boosters: 'class',
  randomize: false,
  balance: DEFAULT_BALANCE,
  capabilities: 'full',
}

/** Compute upgrade bonuses with optional exclusions */
function computeUpgradesWithExclusions(
  excludeUpgrades: string[],
  upgradePowerPercent: number
) {
  const levels: Record<string, number> = {}
  for (const upgrade of allUpgrades) {
    levels[upgrade.id] = excludeUpgrades.includes(upgrade.id) ? 0 : upgrade.maxLevel
  }
  return computeUpgradeBonuses(levels, upgradePowerPercent)
}

function runDiagnosisInWorker(input: WorkerInput): DiagnoseResult {
  const { seed, config } = input
  const cfg = { ...DEFAULT_CONFIG, ...config, seed }

  // Handle randomization - use seed to deterministically pick options
  if (cfg.randomize) {
    cfg.raceId = pickRandom(RACES, seed)
    cfg.classId = pickRandom(CLASSES, Math.floor(seed / RACES.length))
    cfg.personality = pickRandom(PERSONALITIES, Math.floor(seed / (RACES.length * CLASSES.length)))
  }

  // Merge balance overrides
  const balance = { ...DEFAULT_BALANCE, ...config.balance }

  // Compute upgrade bonuses based on config
  let upgradeBonuses = undefined
  if (cfg.maxUpgrades) {
    if (cfg.excludeUpgrades && cfg.excludeUpgrades.length > 0) {
      // Max upgrades with exclusions (for isolation testing)
      upgradeBonuses = computeUpgradesWithExclusions(cfg.excludeUpgrades, balance.upgradePowerPercent)
    } else {
      // All upgrades maxed
      upgradeBonuses = computeMaxUpgradeBonuses(balance.upgradePowerPercent)
    }
  } else if (cfg.upgrades && cfg.upgrades !== 'none') {
    // Try parsing as custom upgrade string first (contains '=')
    const customLevels = parseCustomUpgrades(cfg.upgrades)
    if (customLevels) {
      upgradeBonuses = computeUpgradeBonuses(customLevels, balance.upgradePowerPercent)
    } else {
      // Fall back to preset name (none, early, mid, late, full)
      upgradeBonuses = computeUpgradeBonusesFromPreset(cfg.upgrades, balance.upgradePowerPercent)
    }
  }

  // Parse bot capabilities
  const capabilities = parseCapabilities(cfg.capabilities)

  // Compute booster bonuses
  const boosterBonuses = resolveBoosterBonuses(cfg.boosters, cfg.classId)

  const game: GameState = createGame({
    raceId: cfg.raceId,
    classId: cfg.classId,
    seed: cfg.seed,
    upgradeBonuses,
    boosterBonuses,
    balanceOverrides: balance,
  })

  const botState: BotState = createBotState()
  let endReason: EndReason = 'max_turns'
  let turnsOnCurrentLevel = 0
  let currentDepth = game.character.depth

  // Basic tracking for metrics
  let stuckCount = 0
  let lastActionStr = ''
  let sameActionCount = 0
  let maxDepthReached = 0
  let totalDamageTaken = 0
  let moveCount = 0
  let waitCount = 0
  let killedBy: string | null = null

  while (game.isRunning && game.turn < cfg.maxTurns) {
    const previousHP = game.character.hp
    const previousPosition = { ...game.character.position }

    const action = runBotTick(game, cfg.personality as BotPersonality, botState, capabilities)
    processTurn(game, action)

    // Track movement
    const moved = previousPosition.x !== game.character.position.x ||
                  previousPosition.y !== game.character.position.y
    if (moved) moveCount++
    if (action.type === 'wait') waitCount++

    // Track damage
    if (game.character.hp < previousHP) {
      totalDamageTaken += previousHP - game.character.hp
    }

    // Track depth
    if (game.character.depth !== currentDepth) {
      currentDepth = game.character.depth
      turnsOnCurrentLevel = 0
    } else {
      turnsOnCurrentLevel++
    }
    maxDepthReached = Math.max(maxDepthReached, currentDepth)

    // Track stuck patterns
    const actionStr = JSON.stringify(action)
    if (actionStr === lastActionStr) {
      sameActionCount++
      if (sameActionCount >= 10) stuckCount++
    } else {
      sameActionCount = 1
      lastActionStr = actionStr
    }

    // End conditions
    if (game.character.hp <= 0) {
      endReason = 'death'
      // Find adjacent monster as likely killer
      const adjacentMonsters = game.monsters.filter(m => {
        const dx = Math.abs(m.position.x - game.character.position.x)
        const dy = Math.abs(m.position.y - game.character.position.y)
        return dx <= 1 && dy <= 1 && m.hp > 0
      })
      if (adjacentMonsters.length > 0) {
        killedBy = adjacentMonsters[0]!.template.name
      }
      break
    }
    if (game.isVictory) {
      endReason = 'victory'
      break
    }
    // Exempt depth 50 (Morgoth hunt needs more turns)
    if (turnsOnCurrentLevel >= cfg.circuitBreakerTurns && game.character.depth < MAX_DEPTH) {
      endReason = 'circuit_breaker'
      break
    }
  }

  // Build basic analyzer results
  const issues: DiagnosticIssue[] = []
  if (endReason === 'circuit_breaker') {
    issues.push({ severity: 'error', message: `Circuit breaker triggered at depth ${currentDepth}` })
  }
  if (stuckCount > 100) {  // Raised from 50 - normal corridor exploration can accumulate stuck counts
    issues.push({ severity: 'warning', message: `High stuck count: ${stuckCount}` })
  }

  // Calculate final combat stats
  const char = game.character
  const stats = calculateStats(char)
  const combatStats = calculateCombatStats(char)
  const weapon = char.equipment.weapon
  const armorItem = char.equipment.armor

  // Check if Morgoth was killed
  const morgothKills = game.stats.monsterKills[VICTORY_BOSS_NAME] ?? 0

  const analyzerResults: AnalyzerResult[] = [{
    name: 'worker-metrics',
    metrics: {
      maxDepth: maxDepthReached,
      totalTurns: game.turn,
      moveRate: game.turn > 0 ? moveCount / game.turn : 0,
      waitRate: game.turn > 0 ? waitCount / game.turn : 0,
      stuckCount,
      kills: game.stats.kills,
      damageTaken: totalDamageTaken,
      killedBy: killedBy ?? 'unknown',
      morgothKills,
      isVictory: game.isVictory,
    },
    details: Object.entries(game.stats.spellUsage)
      .filter(([, v]) => v.casts > 0)
      .sort((a, b) => b[1].damage - a[1].damage)
      .map(([name, v]) => `spell:${name} casts=${v.casts} dmg=${v.damage} mana=${v.mana}`),
    issues: [],
  }, {
    name: 'stats',
    metrics: {
      'final.level': char.level,
      'final.depth': char.depth,
      'final.armor': combatStats.armor,
      'final.meleeDamage': combatStats.meleeDamage,
      'final.rangedDamage': combatStats.rangedDamage,
      'final.accuracy': combatStats.accuracy,
      'final.evasion': combatStats.evasion,
      'final.maxHp': combatStats.maxHp,
      'final.speed': combatStats.speed,
      'final.str': stats.str,
      'final.dex': stats.dex,
      'final.con': stats.con,
      'final.weaponEnchant': weapon?.enchantment ?? 0,
      'final.armorProtection': armorItem ? (armorItem.template.protection ?? 0) + armorItem.enchantment : 0,
    },
    issues: [],
  }]

  return {
    seed: cfg.seed,
    config: { ...cfg, personality: cfg.personality as BotPersonality, excludeUpgrades: cfg.excludeUpgrades ?? [], capabilities: cfg.capabilities, upgrades: cfg.upgrades ?? 'none', boosters: cfg.boosters ?? 'none' },
    endReason,
    finalState: {
      turn: game.turn,
      depth: game.character.depth,
      level: game.character.level,
      xp: game.character.xp,
      hp: game.character.hp,
      maxHp: game.character.maxHp,
      kills: game.stats.kills,
      gold: game.character.gold,
      position: { ...game.character.position },
    },
    analyzerResults,
    allIssues: issues,
    hasErrors: issues.some(i => i.severity === 'error'),
    hasWarnings: issues.some(i => i.severity === 'warning'),
  }
}

// Tinypool expects a default export function
export default runDiagnosisInWorker
