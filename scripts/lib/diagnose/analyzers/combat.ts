/**
 * Combat Analyzer
 *
 * Tracks combat behavior and outcomes:
 * - Damage dealt vs taken
 * - Kill counts and rates
 * - Retreat behavior
 * - Death causes
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  PostTurnContext,
  EndReason,
} from '../types'
import type { GameState } from '@game/types'
import type { BotState, GoalType } from '@bot/types'

/** Configuration for combat analysis */
export interface CombatAnalyzerConfig {
  /** Warn if damage taken exceeds this % of max HP in one turn */
  highDamageThreshold: number
  /** Track HP thresholds for retreat analysis */
  retreatThresholds: number[]
}

const DEFAULT_CONFIG: CombatAnalyzerConfig = {
  highDamageThreshold: 30,
  retreatThresholds: [50, 25, 10],
}

interface CombatEncounter {
  startTurn: number
  endTurn: number
  damageTaken: number
  damageDealt: number
  kills: number
  retreated: boolean
  startHP: number
  endHP: number
}

export class CombatAnalyzer implements Analyzer {
  readonly name = 'combat'
  private config: CombatAnalyzerConfig
  private issues: DiagnosticIssue[] = []

  // Combat tracking
  private inCombat = false
  private currentEncounter: CombatEncounter | null = null
  private encounters: CombatEncounter[] = []

  // Aggregate metrics
  private totalDamageDealt = 0
  private totalDamageTaken = 0
  private totalKills = 0
  private retreatCount = 0
  private totalTurns = 0
  private combatTurns = 0
  private deathCause: string | null = null

  // Per-turn tracking
  private lastKills = 0

  constructor(config: Partial<CombatAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(game: GameState, _botState: BotState): void {
    this.issues = []
    this.inCombat = false
    this.currentEncounter = null
    this.encounters = []
    this.totalDamageDealt = 0
    this.totalDamageTaken = 0
    this.totalKills = 0
    this.retreatCount = 0
    this.totalTurns = 0
    this.combatTurns = 0
    this.deathCause = null

    this.lastKills = game.stats.kills
  }

  onTurn(ctx: TurnContext): void {
    this.totalTurns++

    // Check if in combat (adjacent monsters or attacking)
    const goal = ctx.botState.currentGoal
    const combatGoals: GoalType[] = ['KILL', 'FLEE', 'KITE']
    const isCombatAction =
      ctx.action.type === 'attack' ||
      ctx.action.type === 'ranged_attack' ||
      (goal && combatGoals.includes(goal.type))

    // Check for adjacent monsters
    const hasAdjacentMonster = ctx.game.monsters.some((m) => {
      const dx = Math.abs(m.position.x - ctx.game.character.position.x)
      const dy = Math.abs(m.position.y - ctx.game.character.position.y)
      return dx <= 1 && dy <= 1 && m.hp > 0
    })

    const nowInCombat = isCombatAction || hasAdjacentMonster

    if (nowInCombat && !this.inCombat) {
      // Start combat encounter
      this.inCombat = true
      this.currentEncounter = {
        startTurn: ctx.turn,
        endTurn: ctx.turn,
        damageTaken: 0,
        damageDealt: 0,
        kills: 0,
        retreated: false,
        startHP: ctx.game.character.hp,
        endHP: ctx.game.character.hp,
      }
    } else if (!nowInCombat && this.inCombat) {
      // End combat encounter
      this.finalizeCombat(ctx.turn)
    }

    if (this.inCombat) {
      this.combatTurns++

      // Track retreat attempts
      if (goal && (goal.type === 'FLEE' || goal.type === 'KITE')) {
        if (this.currentEncounter && !this.currentEncounter.retreated) {
          this.currentEncounter.retreated = true
          this.retreatCount++
        }
      }
    }
  }

  onPostTurn(ctx: PostTurnContext): void {
    // Track damage taken
    const damageTaken = ctx.previousHP - ctx.game.character.hp
    if (damageTaken > 0) {
      this.totalDamageTaken += damageTaken
      if (this.currentEncounter) {
        this.currentEncounter.damageTaken += damageTaken
      }

      // Check for high damage warning
      const damagePercent = (damageTaken / ctx.game.character.maxHp) * 100
      if (damagePercent >= this.config.highDamageThreshold) {
        this.issues.push({
          severity: 'warning',
          message: `High damage taken: ${damageTaken} (${damagePercent.toFixed(0)}% of max HP)`,
          turn: ctx.turn,
          context: {
            damage: damageTaken,
            hpBefore: ctx.previousHP,
            hpAfter: ctx.game.character.hp,
          },
        })
      }
    }

    // Track kills (and estimate damage dealt)
    const newKills = ctx.game.stats.kills - this.lastKills
    if (newKills > 0) {
      this.totalKills += newKills
      if (this.currentEncounter) {
        this.currentEncounter.kills += newKills
      }
    }

    // Track damage dealt from stats
    const damageDealt = ctx.game.stats.damageDealt - this.totalDamageDealt
    if (damageDealt > 0) {
      if (this.currentEncounter) {
        this.currentEncounter.damageDealt += damageDealt
      }
    }
    this.totalDamageDealt = ctx.game.stats.damageDealt

    // Update tracking
    this.lastKills = ctx.game.stats.kills

    if (this.currentEncounter) {
      this.currentEncounter.endHP = ctx.game.character.hp
    }
  }

  private finalizeCombat(turn: number): void {
    if (this.currentEncounter) {
      this.currentEncounter.endTurn = turn
      this.encounters.push({ ...this.currentEncounter })
    }
    this.inCombat = false
    this.currentEncounter = null
  }

  onLevelChange(): void {
    // End any active combat
    if (this.inCombat && this.currentEncounter) {
      this.finalizeCombat(this.currentEncounter.endTurn)
    }
  }

  onEnd(game: GameState, reason: EndReason): void {
    // Finalize any active combat
    if (this.inCombat && this.currentEncounter) {
      this.finalizeCombat(game.turn)
    }

    // Determine death cause
    if (reason === 'death') {
      // Check last message for death cause
      const lastMessages = game.messages.slice(-5)
      const deathMsg = lastMessages.find((m) => m.type === 'danger')
      this.deathCause = deathMsg?.text ?? 'unknown'

      // This is combat death by default
      this.issues.push({
        severity: 'error',
        message: `Death at depth ${game.character.depth}: ${this.deathCause}`,
        turn: game.turn,
        context: { depth: game.character.depth, kills: this.totalKills },
      })
    }
  }

  summarize(): AnalyzerResult {
    const combatRate = this.totalTurns > 0 ? (this.combatTurns / this.totalTurns) * 100 : 0
    const retreatRate = this.encounters.length > 0
      ? (this.retreatCount / this.encounters.length) * 100
      : 0
    const survivalRate = this.encounters.length > 0
      ? (this.encounters.filter((e) => e.endHP > 0).length / this.encounters.length) * 100
      : 100
    const avgDamagePerEncounter = this.encounters.length > 0
      ? this.totalDamageTaken / this.encounters.length
      : 0

    return {
      name: this.name,
      metrics: {
        totalKills: this.totalKills,
        totalDamageDealt: this.totalDamageDealt,
        totalDamageTaken: this.totalDamageTaken,
        encounters: this.encounters.length,
        combatTurns: this.combatTurns,
        combatRate: Math.round(combatRate * 10) / 10,
        retreatRate: Math.round(retreatRate * 10) / 10,
        survivalRate: Math.round(survivalRate * 10) / 10,
      },
      issues: this.issues,
      details: [
        `Kills: ${this.totalKills}`,
        `Combat encounters: ${this.encounters.length}`,
        `Combat rate: ${combatRate.toFixed(1)}% of turns`,
        `Retreat rate: ${retreatRate.toFixed(1)}%`,
        `Avg damage per encounter: ${avgDamagePerEncounter.toFixed(1)}`,
        this.deathCause ? `Death cause: ${this.deathCause}` : 'Survived',
      ],
    }
  }
}

/** Create a combat analyzer with default config */
export function createCombatAnalyzer(config?: Partial<CombatAnalyzerConfig>): CombatAnalyzer {
  return new CombatAnalyzer(config)
}
