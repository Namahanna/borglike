/**
 * Danger Grid Calculation
 *
 * Computes per-tile danger scores based on nearby monsters.
 * High-danger tiles can be marked "icky" and excluded from pathfinding.
 */

import type { Point, GameState, Monster, Character } from '../types'
import { getAdjacentPositions } from '../dungeon'
import { isPoisoned, getPoisonDamage, getPoisonTurnsRemaining } from '../status-effects'
import type { DangerGrid, DangerMap, DangerResult, DangerTier, PersonalityConfig } from './types'
import type { ClassBehaviorProfile } from './class-profiles'
import {
  findHealingPotion,
  findEscapeScroll,
  findNeutralizePoison,
  findResistancePotion,
} from './items'
import { getEffectiveDamage, countAdjacentMonsters } from './combat'
import { getMonsterAverageDamage } from '../monster-combat'

// Re-export types for convenience
export type { DangerGrid, DangerMap, DangerResult, DangerTier }

// ============================================================================
// DANGER CALCULATION
// ============================================================================

/** Cached danger result with numeric hash for invalidation */
let cachedDangerResult: DangerResult | null = null
let cachedMonsterHash: number = 0
let cachedCharPosHash: number = 0

/** Pre-computed danger multipliers indexed by Chebyshev distance (0-4) */
const DANGER_MULTIPLIERS = [2.0, 1.0, 0.6, 0.35, 0.2]

/**
 * Numeric hash of monster state for cache invalidation.
 * FNV-1a inspired — mixes id, position, and HP into a single number.
 */
function hashMonsterState(monsters: Monster[]): number {
  let hash = 2166136261 // FNV offset basis
  for (const m of monsters) {
    if (m.hp > 0) {
      // Hash id string via first 4 chars
      const id = m.id
      for (let i = 0; i < Math.min(id.length, 4); i++) {
        hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
      }
      hash = Math.imul(hash ^ m.position.x, 16777619)
      hash = Math.imul(hash ^ m.position.y, 16777619)
      hash = Math.imul(hash ^ m.hp, 16777619)
    }
  }
  return hash
}

/**
 * Create an empty DangerGrid backed by Int16Array
 */
function createDangerGrid(width: number, height: number): DangerGrid {
  return { data: new Int16Array(width * height), width, height }
}

/**
 * Compute danger grid for the current game state
 *
 * Each tile gets a danger score based on:
 * - Distance to monsters
 * - Monster damage potential
 * - Monster speed (faster = more dangerous)
 * - Whether monster is awake
 *
 * Caches result when monster state unchanged.
 */
export function computeDangerGrid(game: GameState): DangerResult {
  // Check cache validity (numeric hash comparison)
  const monsterHash = hashMonsterState(game.monsters)
  const charPosHash = game.character.position.x * 10000 + game.character.position.y

  if (
    cachedDangerResult &&
    monsterHash === cachedMonsterHash &&
    charPosHash === cachedCharPosHash
  ) {
    return {
      ...cachedDangerResult,
      computedAt: game.turn,
    }
  }

  // Cache miss - compute fresh
  const level = game.currentLevel
  const dangers = createDangerGrid(level.width, level.height)
  let maxDanger = 0

  const character = game.character
  const { width } = dangers
  const data = dangers.data

  // For each monster, add danger to nearby tiles via direct array indexing
  for (const monster of game.monsters) {
    if (monster.hp <= 0) continue
    const threat = getMonsterThreat(monster, character)
    const mx = monster.position.x
    const my = monster.position.y

    // Apply danger in a 9x9 area (radius 4) around the monster
    const yMin = Math.max(0, my - 4)
    const yMax = Math.min(dangers.height - 1, my + 4)
    const xMin = Math.max(0, mx - 4)
    const xMax = Math.min(dangers.width - 1, mx + 4)

    for (let y = yMin; y <= yMax; y++) {
      const rowOffset = y * width
      const dy = Math.abs(y - my)
      for (let x = xMin; x <= xMax; x++) {
        const dist = Math.max(Math.abs(x - mx), dy)
        if (dist > 4) continue
        const tileDanger = Math.floor(threat * DANGER_MULTIPLIERS[dist]!)
        const idx = rowOffset + x
        const newVal = data[idx]! + tileDanger
        data[idx] = newVal
        if (newVal > maxDanger) maxDanger = newVal
      }
    }
  }

  // Add status effect danger to character's position
  const adjacentCount = countAdjacentMonsters(game, character.position)
  const hasPoisonCure =
    findNeutralizePoison(character) !== null || findResistancePotion(character, 'poison') !== null
  const statusDanger = getStatusEffectDanger(character, adjacentCount, hasPoisonCure)

  if (statusDanger > 0) {
    const idx = character.position.y * width + character.position.x
    data[idx]! += statusDanger
    if (data[idx]! > maxDanger) maxDanger = data[idx]!
  }

  const result: DangerResult = {
    dangers,
    maxDanger,
    computedAt: game.turn,
  }

  cachedDangerResult = result
  cachedMonsterHash = monsterHash
  cachedCharPosHash = charPosHash

  return result
}

/**
 * Calculate danger contribution from active status effects
 *
 * Status effects amplify danger based on severity and context:
 * - paralyzed + adjacent monsters = extreme (150+ danger)
 * - confused + low HP = high (80+ danger)
 * - poison DOT = medium-high (scales with damage)
 * - blind/slowed = medium (40-60 danger)
 * - terrified/drained = low (15-20 danger)
 */
export function getStatusEffectDanger(
  character: Character,
  adjacentMonsterCount: number,
  hasPoisonCure: boolean = false
): number {
  let totalDanger = 0
  const hpRatio = character.hp / character.maxHp

  // Check status effects
  for (const effect of character.statusEffects) {
    // Skip buffs
    if (
      [
        'speed',
        'heroism',
        'berserk',
        'blessing',
        'protection',
        'immunity_fear',
        'active_form',
      ].includes(effect.type)
    ) {
      continue
    }

    let danger = 0
    const turnsLeft = effect.turnsRemaining

    switch (effect.type) {
      case 'paralyzed':
        // Can't act = death sentence if monsters adjacent
        danger = 150 + adjacentMonsterCount * 50
        if (turnsLeft === 1) danger *= 0.5
        break

      case 'confused':
        // Random movement = can't retreat reliably
        danger = 80
        if (hpRatio < 0.3) danger += 40
        if (adjacentMonsterCount > 0) danger += 30
        danger *= Math.min(turnsLeft / 3, 1.5)
        break

      case 'blind':
        // Can't see threats
        danger = 40
        if (adjacentMonsterCount > 0) danger += 30
        break

      case 'slowed':
        // Enemies get more actions
        danger = 30 + adjacentMonsterCount * 15
        break

      case 'terrified':
        // Can't fight, must flee
        danger = 20
        if (adjacentMonsterCount >= 2) danger += 40
        break

      case 'drained':
        // Stat reduction
        danger = 15
        break
    }

    totalDanger += Math.floor(danger)
  }

  // Check poison (now a standard status effect)
  if (isPoisoned(character)) {
    const poisonTurns = getPoisonTurnsRemaining(character)
    const poisonDamage = getPoisonDamage(character)
    const totalPoisonDamage = poisonDamage * poisonTurns

    // Danger = potential damage * 2
    let poisonDanger = totalPoisonDamage * 2

    if (hpRatio < 0.3) poisonDanger *= 1.5
    if (hasPoisonCure) poisonDanger *= 0.3

    totalDanger += Math.floor(poisonDanger)
  }

  return Math.floor(totalDanger)
}

/**
 * Calculate threat level of a monster
 *
 * Threat is based on:
 * - Damage potential (primary factor, uses new attack system)
 * - Speed advantage over player
 * - Whether monster is aware of player
 * - Monster HP relative to player damage
 * - Status-inflicting abilities add extra threat
 *
 * @param monster - The monster to evaluate
 * @param character - The player character
 * @param classProfile - Optional class profile for effective damage calculation
 * @param distance - Optional distance to monster (defaults to engageDistance or 1)
 */
export function getMonsterThreat(
  monster: Monster,
  character: Character,
  classProfile?: ClassBehaviorProfile,
  distance?: number
): number {
  const template = monster.template

  // Base threat from damage (uses new dice-based attack system)
  // getMonsterAverageDamage handles both new attacks[] and legacy damage
  const avgDamage = getMonsterAverageDamage(monster)

  // Scale: a monster doing 10 damage/turn = 20 threat
  // (was 10x, reduced to 2x so single weak monsters don't trigger CRITICAL)
  let threat = avgDamage * 2

  // Add threat for status-inflicting abilities
  const attacks = template.attacks ?? []
  for (const attack of attacks) {
    if (attack.effect.type !== 'HURT' && attack.effect.type !== 'ELEMENTAL') {
      // Status attacks are dangerous - add extra threat
      threat += 5
      // Paralyze is especially dangerous
      if (attack.effect.type === 'PARALYZE') threat += 10
    }
  }

  // Add threat for spell capabilities
  if (template.spells && template.spells.list.length > 0) {
    // Spellcasters are more dangerous
    threat += template.spells.list.length * 3
    // Breath weapons are especially dangerous
    if (template.spells.list.some((s) => s.startsWith('BR_'))) {
      threat += 15
    }
  }

  // Speed modifier: faster monsters are more dangerous
  // Base speed is 110, player is typically 100
  // A 120 speed monster gets 1.2x threat
  const speedFactor = template.speed / 100
  threat *= speedFactor

  // Awake monsters are more dangerous
  if (monster.isAwake) {
    threat *= 1.5
  } else {
    // Sleeping monsters are much less threatening
    threat *= 0.3
  }

  // Higher HP monsters are harder to kill = more dangerous
  // Use effective damage based on class profile and distance
  let playerDamage: number
  if (classProfile) {
    const effectiveDistance = distance ?? classProfile.engageDistance ?? 1
    playerDamage = getEffectiveDamage(character, classProfile, effectiveDistance)
  } else {
    playerDamage = Math.max(character.combat.meleeDamage, 5)
  }
  const turnsToKill = Math.ceil(monster.hp / playerDamage)
  threat *= Math.min(turnsToKill / 2, 3) // Cap at 3x for very tanky monsters

  // Apply character's armor reduction to perceived threat (mirrors real formula)
  // character.combat.armor already includes status effect bonuses (blessing, protection)
  const armorReductionPct = Math.min(character.combat.armor / 2, 50)
  threat *= (100 - armorReductionPct) / 100

  // Protection from Evil: halves threat from EVIL monsters
  // Angband requires player level >= monster level for PFE to work
  // We use minDepth as monster "level" approximation
  const hasPFE = character.statusEffects.some((e) => e.type === 'prot_from_evil')
  const isEvil = template.flags.includes('EVIL')
  const levelCheck = character.level >= template.minDepth
  if (hasPFE && isEvil && levelCheck) {
    threat *= 0.5
  }

  return Math.floor(threat)
}

/**
 * Get danger at a specific position (direct array lookup)
 */
export function getTileDanger(dangers: DangerGrid, pos: Point): number {
  const { x, y } = pos
  if (x < 0 || y < 0 || x >= dangers.width || y >= dangers.height) return 0
  return dangers.data[y * dangers.width + x]!
}

/**
 * Build a set of "icky" tiles that should be avoided.
 * Returns Set<string> with "x,y" keys for flow.ts compatibility.
 */
/**
 * Scale danger threshold by HP ratio (lower HP → more conservative avoidance).
 * Extracted from buildAvoidSet for use with FlowAvoidance typed-array path.
 */
export function getScaledDangerThreshold(threshold: number, character: Character): number {
  const hpRatio = character.hp / character.maxHp
  if (hpRatio < 0.25) return threshold * 0.3
  if (hpRatio < 0.5) return threshold * 0.6
  if (hpRatio < 0.75) return threshold * 0.8
  return threshold
}

export function buildAvoidSet(
  dangers: DangerGrid,
  threshold: number,
  character: Character
): Set<string> {
  const avoid = new Set<string>()
  const scaledThreshold = getScaledDangerThreshold(threshold, character)

  const { data, width, height } = dangers
  for (let i = 0; i < data.length; i++) {
    if (data[i]! > scaledThreshold) {
      const x = i % width
      const y = (i / width) | 0
      if (y < height) avoid.add(`${x},${y}`)
    }
  }

  return avoid
}

/**
 * Calculate danger threshold based on personality
 *
 * Higher aggression = higher threshold = avoid less
 * Higher caution = lower threshold = avoid more
 */
export function getDangerThreshold(aggression: number, caution: number): number {
  // Base threshold: 100 (equivalent to one 10-damage monster adjacent)
  const base = 100

  // Aggression increases threshold (avoid less)
  // Caution decreases threshold (avoid more)
  // Both are 0-100 scale

  // Net effect: +1 aggression adds 2 to threshold, +1 caution removes 1.5
  const modifier = (aggression * 2 - caution * 1.5) / 100

  // Range: base * 0.5 to base * 2.0
  const multiplier = 1 + modifier
  const clampedMultiplier = Math.max(0.5, Math.min(2.0, multiplier))

  return Math.floor(base * clampedMultiplier)
}

/**
 * Check if a position has adjacent monsters
 */
export function hasAdjacentMonster(game: GameState, pos: Point): boolean {
  const adjacent = getAdjacentPositions(pos)

  for (const adj of adjacent) {
    for (const monster of game.monsters) {
      if (monster.position.x === adj.x && monster.position.y === adj.y) {
        return true
      }
    }
  }

  return false
}

/**
 * Get the total danger around the character's current position
 */
export function getLocalDanger(dangers: DangerGrid, pos: Point): number {
  let totalDanger = getTileDanger(dangers, pos)

  // Also check adjacent tiles (inlined for performance — avoids getAdjacentPositions allocation)
  const { data, width, height } = dangers
  const px = pos.x
  const py = pos.y
  for (let dy = -1; dy <= 1; dy++) {
    const ny = py + dy
    if (ny < 0 || ny >= height) continue
    const rowOffset = ny * width
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = px + dx
      if (nx < 0 || nx >= width) continue
      totalDanger += data[rowOffset + nx]! * 0.5
    }
  }

  return Math.floor(totalDanger)
}

// ============================================================================
// AVOIDANCE & DANGER TIERS (Angband-inspired)
// ============================================================================

/**
 * Calculate dynamic avoidance threshold based on:
 * - Base threshold from personality (aggression/caution)
 * - HP multiplier (lower HP = lower tolerance)
 * - Resource bonus (having escape/healing options)
 *
 * Formula: avoidance = baseThreshold × hpMultiplier × resourceBonus
 */
export function calculateAvoidance(game: GameState, config: PersonalityConfig): number {
  const character = game.character
  const hpRatio = character.hp / character.maxHp

  // Base threshold from personality
  const baseThreshold = getDangerThreshold(config.aggression, config.caution)

  // HP multiplier: scales down as HP drops, minimum 0.3
  const hpMultiplier = Math.max(0.3, hpRatio)

  // Resource bonus: having options makes us braver
  const hasHealing = findHealingPotion(character) !== null
  const hasEscape = findEscapeScroll(character) !== null
  const resourceBonus = 1.0 + (hasHealing ? 0.15 : 0) + (hasEscape ? 0.1 : 0)

  return Math.floor(baseThreshold * hpMultiplier * resourceBonus)
}

/**
 * Get danger tier based on current danger vs avoidance threshold
 *
 * Tiers:
 * - SAFE: danger < avoidance × 0.5 (normal behavior)
 * - CAUTION: danger < avoidance × 1.0 (consider escape if no healing)
 * - DANGER: danger < avoidance × 1.5 (heal or escape)
 * - CRITICAL: danger >= avoidance × 1.5 (escape beats healing)
 */
export function getDangerTier(danger: number, avoidance: number): DangerTier {
  if (danger < avoidance * 0.5) {
    return 'SAFE'
  }
  if (danger < avoidance * 1.0) {
    return 'CAUTION'
  }
  if (danger < avoidance * 1.5) {
    return 'DANGER'
  }
  return 'CRITICAL'
}

// ============================================================================
// IMMEDIATE DANGER (Two-Scope System)
// ============================================================================

/**
 * Get danger from ADJACENT monsters only (distance <= 1)
 * Used for consumable decisions - don't waste items on distant threats
 *
 * Following Angband borg pattern: immediate threats are tracked separately
 * from general danger. This prevents wasting healing potions and escape
 * scrolls when monsters are visible but not actually threatening.
 */
export function getImmediateDanger(game: GameState): number {
  const character = game.character
  const pos = character.position
  let immediateDanger = 0

  for (const monster of game.monsters) {
    if (monster.hp <= 0) continue

    // Chebyshev distance (8-directional)
    const dx = Math.abs(monster.position.x - pos.x)
    const dy = Math.abs(monster.position.y - pos.y)
    const dist = Math.max(dx, dy)

    // Only count adjacent monsters (distance <= 1)
    if (dist <= 1) {
      immediateDanger += getMonsterThreat(monster, character)
    }
    // Also count distance-2 monsters if they're faster (can close gap)
    else if (dist === 2 && monster.template.speed > 100) {
      immediateDanger += getMonsterThreat(monster, character) * 0.5
    }
  }

  return Math.floor(immediateDanger)
}

/**
 * Get danger tier based on immediate (adjacent) danger
 * More conservative thresholds since these are actual threats
 *
 * Unlike getDangerTier which uses an avoidance threshold,
 * this compares danger directly to current HP (Angband pattern)
 *
 * @param hasAdjacentMonster - Whether there's any adjacent monster (for SAFE check)
 */
export function getImmediateDangerTier(
  immediateDanger: number,
  currentHP: number,
  _maxHP: number,
  hasAdjacentMonster: boolean = false
): DangerTier {
  // Any adjacent monster means NOT safe (even 0-damage monsters like Floating Eyes)
  if (immediateDanger === 0 && !hasAdjacentMonster) {
    return 'SAFE'
  }
  // Adjacent monster with 0 threat (gaze-only, etc.) - still needs handling
  if (immediateDanger === 0 && hasAdjacentMonster) {
    return 'CAUTION'
  }
  if (immediateDanger < currentHP * 0.5) {
    return 'CAUTION' // Can take 2+ hits
  }
  if (immediateDanger < currentHP) {
    return 'DANGER' // Can take 1 hit
  }
  return 'CRITICAL' // Might die this turn
}
