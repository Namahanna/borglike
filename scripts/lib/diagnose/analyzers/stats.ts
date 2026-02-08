/**
 * Stats Analyzer
 *
 * Tracks character combat stats at death:
 * - Final armor, damage, accuracy, evasion
 * - Equipment breakdown
 * - Level and attributes
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  EndReason,
} from '../types'
import type { GameState } from '@game/types'
import type { BotState } from '@bot/types'
import { calculateCombatStats, calculateStats } from '@game/character'

interface FinalStats {
  // Character level
  level: number
  depth: number

  // Attributes
  str: number
  dex: number
  con: number
  int: number
  wis: number

  // Combat stats
  maxHp: number
  armor: number
  meleeDamage: number
  rangedDamage: number
  accuracy: number
  evasion: number
  speed: number

  // Equipment
  weaponName: string | null
  weaponDamage: string | null
  weaponEnchant: number
  armorName: string | null
  armorProtection: number
  bowName: string | null
}

export class StatsAnalyzer implements Analyzer {
  readonly name = 'stats'
  private issues: DiagnosticIssue[] = []
  private finalStats: FinalStats | null = null
  private statsHistory: { turn: number; depth: number; armor: number; meleeDamage: number }[] = []

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.finalStats = null
    this.statsHistory = []
  }

  onPostTurn(ctx: { game: GameState; turn: number }): void {
    // Sample stats every 100 turns
    if (ctx.turn % 100 === 0) {
      const combatStats = calculateCombatStats(ctx.game.character)
      this.statsHistory.push({
        turn: ctx.turn,
        depth: ctx.game.character.depth,
        armor: combatStats.armor,
        meleeDamage: combatStats.meleeDamage,
      })
    }
  }

  onEnd(game: GameState, _reason: EndReason): void {
    const char = game.character
    const stats = calculateStats(char)
    const combatStats = calculateCombatStats(char)

    // Get equipment details
    const weapon = char.equipment.weapon
    const armorItem = char.equipment.armor
    const bow = char.equipment.bow

    this.finalStats = {
      level: char.level,
      depth: char.depth,

      str: stats.str,
      dex: stats.dex,
      con: stats.con,
      int: stats.int,
      wis: stats.wis,

      maxHp: combatStats.maxHp,
      armor: combatStats.armor,
      meleeDamage: combatStats.meleeDamage,
      rangedDamage: combatStats.rangedDamage,
      accuracy: combatStats.accuracy,
      evasion: combatStats.evasion,
      speed: combatStats.speed,

      weaponName: weapon?.template.name ?? null,
      weaponDamage: weapon?.template.damage ?? null,
      weaponEnchant: weapon?.enchantment ?? 0,
      armorName: armorItem?.template.name ?? null,
      armorProtection: armorItem ? (armorItem.template.protection ?? 0) + armorItem.enchantment : 0,
      bowName: bow?.template.name ?? null,
    }
  }

  summarize(): AnalyzerResult {
    const s = this.finalStats

    if (!s) {
      return {
        name: this.name,
        metrics: {},
        issues: this.issues,
        details: ['No final stats recorded'],
      }
    }

    return {
      name: this.name,
      metrics: {
        'final.level': s.level,
        'final.depth': s.depth,
        'final.armor': s.armor,
        'final.meleeDamage': s.meleeDamage,
        'final.rangedDamage': s.rangedDamage,
        'final.accuracy': s.accuracy,
        'final.evasion': s.evasion,
        'final.maxHp': s.maxHp,
        'final.speed': s.speed,
        'final.str': s.str,
        'final.dex': s.dex,
        'final.con': s.con,
      },
      issues: this.issues,
      details: [
        `Level ${s.level} at depth ${s.depth}`,
        `STR:${s.str} DEX:${s.dex} CON:${s.con} INT:${s.int} WIS:${s.wis}`,
        `HP:${s.maxHp} Armor:${s.armor} Evasion:${s.evasion}`,
        `Melee:${s.meleeDamage} Ranged:${s.rangedDamage} Accuracy:${s.accuracy}`,
        `Weapon: ${s.weaponName ?? 'none'} (${s.weaponDamage ?? '-'}${s.weaponEnchant > 0 ? ` +${s.weaponEnchant}` : ''})`,
        `Armor: ${s.armorName ?? 'none'} (${s.armorProtection} prot)`,
        `Bow: ${s.bowName ?? 'none'}`,
      ],
    }
  }
}

export function createStatsAnalyzer(): StatsAnalyzer {
  return new StatsAnalyzer()
}
