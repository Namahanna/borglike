/**
 * Spell Resolution System for Borglike
 *
 * Handles spell casting, damage calculation, and effect application.
 * Spells always succeed if you have mana (no failure chance).
 */

import type {
  GameState,
  Character,
  Monster,
  Point,
  StatusEffect,
  ActionResult,
  Minion,
  MinionType,
  Element,
  SpellDamageType,
} from './types'
import { MINION_TEMPLATES, chebyshevDistance } from './types'
import { hasLineOfSight } from './monster-ai'
import { calculateLightRadius } from './lighting'
import { randomInt, random } from './rng'
import { rollDice } from './dice'
import { getSpellById, getSchoolStat, type SpellTemplate } from './data/spells'
import { getClassById } from './data/classes'
import { getSpellIdsForLevel } from './data/class-spells'
import { applyDamage, calculateSpellDeadliness, applyDeadliness } from './combat'
import { handleMonsterKill } from './actions/combat'
import { getTile, findOpenPosition, isWalkable } from './dungeon'
import { addStatusEffect, addTempResistance, clearPoison, isPoisoned } from './status-effects'
import { recalculateAllStats } from './modifiers'
import { DEFAULT_BONUSES } from './upgrade-effects'
import { incrementStat } from './stats-helpers'

// SpellCastResult has been unified into ActionResult in types.ts

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

/** 8 adjacent tile directions (cardinal + diagonal) */
const ADJACENT_DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
]

// ============================================================================
// ELEMENTAL DAMAGE HELPERS
// ============================================================================

/**
 * Convert spell damage type to monster element type
 */
function spellDamageTypeToElement(damageType: SpellDamageType): Element | null {
  const mapping: Partial<Record<SpellDamageType, Element>> = {
    fire: 'FIRE',
    cold: 'COLD',
    lightning: 'ELEC',
    // holy, dark, nature, arcane don't map to monster elements
  }
  return mapping[damageType] ?? null
}

/**
 * Apply monster resistance/immunity to spell damage
 * Returns modified damage and whether monster is immune
 *
 * @param unresistable - If true, bypasses all resistance/immunity checks
 */
function applyMonsterResistance(
  damage: number,
  monster: Monster,
  damageType: SpellDamageType | undefined,
  unresistable: boolean = false
): { damage: number; isImmune: boolean; isResistant: boolean } {
  // Unresistable damage bypasses all checks (Mana Storm, etc.)
  if (unresistable) return { damage, isImmune: false, isResistant: false }

  if (!damageType) return { damage, isImmune: false, isResistant: false }

  const element = spellDamageTypeToElement(damageType)
  if (!element) return { damage, isImmune: false, isResistant: false }

  // Check immunity first
  if (monster.template.immune?.includes(element)) {
    return { damage: 0, isImmune: true, isResistant: false }
  }

  // Check resistance
  if (monster.template.resist?.includes(element)) {
    return { damage: Math.floor(damage * 0.5), isImmune: false, isResistant: true }
  }

  return { damage, isImmune: false, isResistant: false }
}

// ============================================================================
// SHARED SPELL HELPERS
// ============================================================================

/**
 * Resolve a spell target - finds target by ID or nearest visible monster
 * Returns null if no valid target found
 */
function resolveSpellTarget(game: GameState, targetId?: string): Monster | null {
  if (targetId) {
    return findTarget(game, targetId)
  }
  return getNearestVisibleMonster(game)
}

/**
 * Calculate spell damage with upgrade bonuses applied
 */
function calculateSpellDamage(game: GameState, spell: SpellTemplate): number {
  const damage = calculateSpellPower(game.character, spell, false)
  const bonuses = game.character.upgradeBonuses ?? DEFAULT_BONUSES
  return Math.floor(damage * (1 + bonuses.damagePercent / 100))
}

/**
 * Track spell damage in game stats
 */
function trackSpellDamage(game: GameState, spellName: string, damage: number): void {
  game.stats.damageDealt += damage
  incrementStat(game.stats.damageBySource.spell, spellName, damage)
  const usage = game.stats.spellUsage[spellName]
  if (usage) usage.damage += damage
}

// ============================================================================
// SPELL AVAILABILITY
// ============================================================================

/**
 * Get all spells known by a character based on their class and level
 */
export function getKnownSpells(character: Character): string[] {
  return getSpellIdsForLevel(character.classId, character.level)
}

/**
 * Check if a character knows a specific spell
 */
export function knowsSpell(character: Character, spellId: string): boolean {
  const known = getKnownSpells(character)
  return known.includes(spellId)
}

/**
 * Check if a spell is on cooldown
 */
export function isOnCooldown(character: Character, spellId: string, currentTurn: number): boolean {
  const cooldownUntil = character.spellCooldowns[spellId]
  if (cooldownUntil === undefined) return false
  return currentTurn < cooldownUntil
}

/**
 * Get remaining cooldown turns for a spell
 */
export function getCooldownRemaining(
  character: Character,
  spellId: string,
  currentTurn: number
): number {
  const cooldownUntil = character.spellCooldowns[spellId]
  if (cooldownUntil === undefined) return 0
  return Math.max(0, cooldownUntil - currentTurn)
}

/**
 * Check if a character can cast a spell
 */
export function canCast(
  character: Character,
  spell: SpellTemplate,
  currentTurn: number
): { canCast: boolean; reason?: string } {
  // Check if character knows the spell
  if (!knowsSpell(character, spell.id)) {
    return { canCast: false, reason: 'You do not know this spell.' }
  }

  // Check mana
  if (character.mp < spell.manaCost) {
    return { canCast: false, reason: 'Not enough mana.' }
  }

  // Check cooldown
  if (isOnCooldown(character, spell.id, currentTurn)) {
    const remaining = getCooldownRemaining(character, spell.id, currentTurn)
    return { canCast: false, reason: `Spell on cooldown (${remaining} turns).` }
  }

  // Dark Pact special check - needs 10 HP to spare
  if (spell.id === 'dark_pact' && character.hp <= 10) {
    return { canCast: false, reason: 'Not enough HP to cast Dark Pact.' }
  }

  return { canCast: true }
}

/**
 * Get all spells a character can currently cast
 */
export function getAvailableSpells(
  character: Character,
  currentTurn: number
): { spell: SpellTemplate; canCast: boolean; reason?: string }[] {
  const known = getKnownSpells(character)
  return known
    .map((spellId) => {
      const spell = getSpellById(spellId)
      if (!spell) return { spell: undefined as unknown as SpellTemplate, canCast: false }
      const result = canCast(character, spell, currentTurn)
      return { spell, canCast: result.canCast, reason: result.reason }
    })
    .filter((entry) => entry.spell !== undefined)
}

// ============================================================================
// SPELL POWER CALCULATION
// ============================================================================

/**
 * Calculate spell power (damage or heal) based on character stats
 * Formula: basePower + (primaryStat - 10) * scaling + level * scaling/3
 * Then apply spell power bonus from equipped staff
 *
 * For late-game spells with levelDamage: base + perLevel * characterLevel
 */
export function calculateSpellPower(
  character: Character,
  spell: SpellTemplate,
  isHeal: boolean = false
): number {
  let finalPower: number

  // Check for level-based damage (late-game spells)
  if (!isHeal && spell.levelDamage) {
    // Late-game formula: base + perLevel * level
    finalPower = spell.levelDamage.base + spell.levelDamage.perLevel * character.level

    // Apply spell power bonus from equipped weapon (staves)
    const weapon = character.equipment.weapon
    if (weapon?.template.spellPower) {
      finalPower = Math.floor(finalPower * (1 + weapon.template.spellPower / 100))
    }

    return Math.max(1, finalPower)
  }

  // Standard formula for early/mid-game spells
  // Roll base damage/heal
  const baseNotation = isHeal ? spell.baseHeal : spell.baseDamage
  if (!baseNotation) return 0

  const basePower = rollDice(baseNotation)

  // Get scaling factor
  const scaling = isHeal ? (spell.healScaling ?? 1) : (spell.damageScaling ?? 1)

  // Get primary stat for this spell school
  const statKey = getSchoolStat(spell.school)
  const statValue = character.stats[statKey]

  // Calculate bonus from stat (every 2 points above 10)
  const statBonus = Math.floor((statValue - 10) / 2) * scaling

  // Calculate bonus from level (level / 3)
  const levelBonus = Math.floor(character.level / 3) * scaling

  finalPower = Math.max(1, basePower + statBonus + levelBonus)

  // Apply spell power bonus from equipped weapon (staves)
  const weapon = character.equipment.weapon
  if (weapon?.template.spellPower) {
    finalPower = Math.floor(finalPower * (1 + weapon.template.spellPower / 100))
  }

  // Apply spell deadliness multiplier (matches melee/ranged scaling curve)
  // This fixes mid-game damage gap where spell flat bonuses fall behind
  const spellDeadliness = calculateSpellDeadliness(character)
  finalPower = applyDeadliness(finalPower, spellDeadliness)

  return finalPower
}

// ============================================================================
// TARGET SELECTION
// ============================================================================

/**
 * Select up to N nearest visible monsters for AOE spells
 */
export function selectAOETargets(game: GameState, maxTargets: number): Monster[] {
  const charPos = game.character.position

  // Get all visible monsters
  const visibleMonsters = game.monsters.filter((monster) => {
    const tile = getTile(game.currentLevel, monster.position.x, monster.position.y)
    return tile?.visible && monster.hp > 0
  })

  if (visibleMonsters.length === 0) return []

  // Sort by distance (nearest first)
  visibleMonsters.sort((a, b) => {
    const distA = Math.abs(a.position.x - charPos.x) + Math.abs(a.position.y - charPos.y)
    const distB = Math.abs(b.position.x - charPos.x) + Math.abs(b.position.y - charPos.y)
    return distA - distB
  })

  // Return up to maxTargets
  return visibleMonsters.slice(0, maxTargets)
}

/**
 * Select ALL visible monsters for LOS (line-of-sight) spells
 * Optionally filter to only evil monsters
 */
export function selectLOSTargets(game: GameState, onlyEvil: boolean = false): Monster[] {
  // Get all visible monsters
  const visibleMonsters = game.monsters.filter((monster) => {
    const tile = getTile(game.currentLevel, monster.position.x, monster.position.y)
    if (!tile?.visible || monster.hp <= 0) return false

    // Filter to only evil if required
    if (onlyEvil && !monster.template.flags.includes('EVIL')) return false

    return true
  })

  return visibleMonsters
}

/**
 * Find a valid target monster by ID
 */
export function findTarget(game: GameState, targetId: string): Monster | null {
  const monster = game.monsters.find((m) => m.id === targetId && m.hp > 0)
  if (!monster) return null

  // Check if visible
  const tile = getTile(game.currentLevel, monster.position.x, monster.position.y)
  if (!tile?.visible) return null

  return monster
}

/**
 * Get the nearest visible monster
 */
export function getNearestVisibleMonster(game: GameState): Monster | null {
  const charPos = game.character.position

  const visibleMonsters = game.monsters.filter((monster) => {
    const tile = getTile(game.currentLevel, monster.position.x, monster.position.y)
    return tile?.visible && monster.hp > 0
  })

  if (visibleMonsters.length === 0) return null

  let nearest: Monster | null = null
  let nearestDist = Infinity

  for (const monster of visibleMonsters) {
    const dist = Math.abs(monster.position.x - charPos.x) + Math.abs(monster.position.y - charPos.y)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = monster
    }
  }

  return nearest
}

// ============================================================================
// BEAM MECHANICS
// ============================================================================

/**
 * Calculate chance for a bolt spell to become a beam
 *
 * Angband-inspired formula:
 * - Base chance: (caster_level - spell_level + 5) * 2%
 * - Mages/Archmages get +20% bonus
 * - Capped at 75%
 *
 * @param characterLevel - Caster's level
 * @param spellLevel - Spell's required level
 * @param classId - Caster's class
 * @returns Beam chance as percentage (0-75)
 */
export function calculateBeamChance(
  characterLevel: number,
  spellLevel: number,
  classId: string
): number {
  const levelDiff = characterLevel - spellLevel + 5
  let chance = levelDiff * 2

  // Mages and Archmages get bonus beam chance
  if (classId === 'mage' || classId === 'archmage') {
    chance += 20
  }

  return Math.min(75, Math.max(0, chance))
}

/**
 * Find all monsters in a line from origin through target and beyond
 * Uses Bresenham's line algorithm
 *
 * @param game - Game state
 * @param origin - Starting point (caster position)
 * @param target - Target point (primary target position)
 * @returns Array of monsters hit by the beam, in order
 */
export function findMonstersInBeam(game: GameState, origin: Point, target: Point): Monster[] {
  const hitMonsters: Monster[] = []

  // Calculate direction vector
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const distance = Math.max(Math.abs(dx), Math.abs(dy))

  if (distance === 0) return hitMonsters

  // Normalize direction
  const stepX = dx / distance
  const stepY = dy / distance

  // Trace beam for up to 12 tiles (typical spell range)
  const maxRange = 12
  for (let i = 1; i <= maxRange; i++) {
    const checkX = Math.round(origin.x + stepX * i)
    const checkY = Math.round(origin.y + stepY * i)

    // Check for wall (stops beam)
    const tile = getTile(game.currentLevel, checkX, checkY)
    if (!tile || tile.type === 'wall' || tile.type === 'door_closed') {
      break
    }

    // Check for monster at this position
    const monster = game.monsters.find(
      (m) => m.position.x === checkX && m.position.y === checkY && m.hp > 0
    )
    if (monster) {
      hitMonsters.push(monster)
    }
  }

  return hitMonsters
}

// ============================================================================
// TELEPORTATION
// ============================================================================

/**
 * Find a valid teleport destination
 */
export function findTeleportDestination(game: GameState, range: number): Point {
  const charPos = game.character.position

  if (range === 0) {
    // Full teleport - anywhere on level
    return findOpenPosition(game.currentLevel)
  }

  // Phase door - limited range
  const attempts = 50
  for (let i = 0; i < attempts; i++) {
    const dx = randomInt(-range, range)
    const dy = randomInt(-range, range)
    const newX = charPos.x + dx
    const newY = charPos.y + dy

    const tile = getTile(game.currentLevel, newX, newY)
    if (tile && isWalkable(tile)) {
      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist >= 2 && dist <= range) {
        // Check no monster at destination
        const monsterAtDest = game.monsters.find(
          (m) => m.position.x === newX && m.position.y === newY
        )
        if (!monsterAtDest) {
          return { x: newX, y: newY }
        }
      }
    }
  }

  // Fallback to random position
  return findOpenPosition(game.currentLevel)
}

// ============================================================================
// SPELL CASTING
// ============================================================================

/**
 * Cast a spell and apply its effects
 *
 * @param game - Current game state (mutated)
 * @param spellId - ID of spell to cast
 * @param targetId - Optional target monster ID (for single-target spells)
 * @returns Result of the spell cast
 */
export function castSpell(game: GameState, spellId: string, targetId?: string): ActionResult {
  const spell = getSpellById(spellId)
  if (!spell) {
    return { success: false, message: 'Unknown spell.' }
  }

  const character = game.character

  // Check if can cast
  const castCheck = canCast(character, spell, game.turn)
  if (!castCheck.canCast) {
    return { success: false, message: castCheck.reason || 'Cannot cast spell.' }
  }

  // Deduct mana
  character.mp -= spell.manaCost

  // Apply cooldown
  if (spell.cooldown > 0) {
    character.spellCooldowns[spellId] = game.turn + spell.cooldown
  }

  // Track spell cast and initialize usage tracking
  game.stats.spellsCast++
  const usage = game.stats.spellUsage[spell.name] ?? { casts: 0, damage: 0, mana: 0 }
  usage.casts++
  usage.mana += spell.manaCost
  game.stats.spellUsage[spell.name] = usage

  // Handle Dark Pact HP cost
  if (spell.id === 'dark_pact') {
    character.hp -= 10
  }

  // Execute effect based on type
  switch (spell.effectType) {
    case 'damage':
      return castDamageSpell(game, spell, targetId)

    case 'aoe_damage':
      return castAOEDamageSpell(game, spell)

    case 'heal':
      return castHealSpell(game, spell)

    case 'buff':
      return castBuffSpell(game, spell)

    case 'debuff':
      return castDebuffSpell(game, spell, targetId)

    case 'lifedrain':
      return castLifedrainSpell(game, spell, targetId)

    case 'teleport':
      return castTeleportSpell(game, spell)

    case 'teleport_other':
      return castTeleportOtherSpell(game, spell, targetId)

    case 'targeted_teleport':
      return castTargetedTeleportSpell(game, spell, targetId)

    case 'shadow_step':
      return castShadowStepSpell(game, spell, targetId)

    case 'summon':
      return castSummonSpell(game, spell)

    default:
      return { success: false, message: 'Unknown spell effect.' }
  }
}

// ============================================================================
// SPELL EFFECT HANDLERS
// ============================================================================

/**
 * Cast a single-target damage spell (may become beam at higher levels)
 */
function castDamageSpell(game: GameState, spell: SpellTemplate, targetId?: string): ActionResult {
  const target = resolveSpellTarget(game, targetId)
  if (!target) {
    return { success: true, message: `You cast ${spell.name}, but there are no targets.` }
  }

  // Check if spell becomes a beam
  let beamTargets: Monster[] = []
  if (spell.canBeam) {
    const beamChance = calculateBeamChance(
      game.character.level,
      spell.level,
      game.character.classId
    )
    if (random() * 100 < beamChance) {
      beamTargets = findMonstersInBeam(game, game.character.position, target.position)
    }
  }

  const baseDamage = calculateSpellDamage(game, spell)

  if (beamTargets.length > 1) {
    return castBeamSpell(game, spell, baseDamage, beamTargets)
  }

  // Single target (normal bolt or beam that only hit one target)
  let damage = baseDamage

  // Double vs evil if applicable
  if (spell.doubleVsEvil && target.template.flags.includes('EVIL')) {
    damage *= 2
  }

  // Apply monster resistance/immunity (unless unresistable)
  const resistResult = applyMonsterResistance(
    damage,
    target,
    spell.damageType,
    spell.unresistable ?? false
  )
  damage = resistResult.damage

  // Apply debuff if spell has one
  if (spell.debuff && damage > 0) {
    applyMonsterDebuff(target, spell.debuff.type, spell.debuff.value, spell.debuff.duration)
  }

  // Apply damage and track stats
  const killed = applyDamage(target, damage)
  trackSpellDamage(game, spell.name, damage)
  if (killed) handleMonsterKill(game, target)

  // Build result message
  let resultStr = ''
  if (!spell.unresistable) {
    if (resistResult.isImmune) {
      resultStr = ` ${target.template.name} is immune!`
    } else if (resistResult.isResistant) {
      resultStr = ` ${target.template.name} resists!`
    }
  }
  const killedStr = killed ? ' It dies!' : ''
  return {
    success: true,
    message: `You cast ${spell.name} at ${target.template.name} for ${damage} damage.${resultStr}${killedStr}`,
    damage,
    targets: [target.id],
    events: [
      {
        type: 'attack',
        attackerId: game.character.id,
        defenderId: target.id,
        damage,
        killed,
      },
    ],
  }
}

/**
 * Apply beam spell damage to multiple targets in a line
 */
function castBeamSpell(
  game: GameState,
  spell: SpellTemplate,
  baseDamage: number,
  targets: Monster[]
): ActionResult {
  let totalDamage = 0
  let killedCount = 0
  const targetIds: string[] = []
  const targetNames: string[] = []
  const events: ActionResult['events'] = []

  for (const target of targets) {
    let damage = baseDamage

    // Double vs evil if applicable
    if (spell.doubleVsEvil && target.template.flags.includes('EVIL')) {
      damage *= 2
    }

    // Apply debuff if spell has one
    if (spell.debuff) {
      applyMonsterDebuff(target, spell.debuff.type, spell.debuff.value, spell.debuff.duration)
    }

    // Apply damage
    const killed = applyDamage(target, damage)
    totalDamage += damage
    targetIds.push(target.id)
    targetNames.push(target.template.name)

    events.push({
      type: 'attack',
      attackerId: game.character.id,
      defenderId: target.id,
      damage,
      killed,
    })

    if (killed) {
      handleMonsterKill(game, target)
      killedCount++
    }
  }

  trackSpellDamage(game, spell.name, totalDamage)

  const killedStr = killedCount > 0 ? ` ${killedCount} killed!` : ''
  return {
    success: true,
    message: `Your ${spell.name} beams through ${targets.length} enemies for ${totalDamage} total damage!${killedStr}`,
    damage: totalDamage,
    targets: targetIds,
    events,
  }
}

/**
 * Cast an AOE damage spell
 * Supports standard AOE (nearest N targets) and LOS (all visible targets)
 */
function castAOEDamageSpell(game: GameState, spell: SpellTemplate): ActionResult {
  // Select targets based on targeting mode
  let targets: Monster[]
  if (spell.targetMode === 'los') {
    // Line of sight: hit ALL visible enemies (optionally filtered to evil only)
    targets = selectLOSTargets(game, spell.onlyEvil ?? false)
  } else {
    // Standard AOE: hit up to maxTargets nearest enemies
    const maxTargets = spell.maxTargets ?? 3
    targets = selectAOETargets(game, maxTargets)
  }

  if (targets.length === 0) {
    const noTargetMsg = spell.onlyEvil
      ? `You cast ${spell.name}, but there are no evil creatures in sight.`
      : `You cast ${spell.name}, but there are no targets.`
    return { success: true, message: noTargetMsg }
  }

  let totalDamage = 0
  let killedCount = 0
  const targetIds: string[] = []
  const targetNames: string[] = []
  const events: ActionResult['events'] = []

  // Calculate base damage (same for all targets)
  const baseDamage = calculateSpellDamage(game, spell)

  let immuneCount = 0
  let resistCount = 0

  for (const target of targets) {
    let damage = baseDamage

    // Double vs evil if applicable
    if (spell.doubleVsEvil && target.template.flags.includes('EVIL')) {
      damage *= 2
    }

    // Apply monster resistance/immunity (unless unresistable)
    const resistResult = applyMonsterResistance(
      damage,
      target,
      spell.damageType,
      spell.unresistable ?? false
    )
    damage = resistResult.damage
    if (resistResult.isImmune) immuneCount++
    if (resistResult.isResistant) resistCount++

    // Apply debuff if spell has one (e.g., Ice Storm's slow)
    if (spell.debuff && damage > 0) {
      applyMonsterDebuff(target, spell.debuff.type, spell.debuff.value, spell.debuff.duration)
    }

    // Apply damage
    const killed = applyDamage(target, damage)
    totalDamage += damage
    targetIds.push(target.id)
    targetNames.push(target.template.name)

    // Emit attack event for this target
    events.push({
      type: 'attack',
      attackerId: game.character.id,
      defenderId: target.id,
      damage,
      killed,
    })

    if (killed) {
      handleMonsterKill(game, target)
      killedCount++
    }
  }

  trackSpellDamage(game, spell.name, totalDamage)

  // If spell has drain, heal
  if (spell.drainPercent) {
    const healAmount = Math.floor((totalDamage * spell.drainPercent) / 100)
    const oldHp = game.character.hp
    game.character.hp = Math.min(game.character.hp + healAmount, game.character.maxHp)
    game.stats.healingBySource.spells += game.character.hp - oldHp
  }

  // Build result message
  let resistStr = ''
  if (!spell.unresistable) {
    resistStr =
      immuneCount > 0
        ? ` (${immuneCount} immune)`
        : resistCount > 0
          ? ` (${resistCount} resist)`
          : ''
  }
  const killedStr = killedCount > 0 ? ` ${killedCount} killed!` : ''
  const drainStr = spell.drainPercent
    ? ` You drain ${Math.floor((totalDamage * spell.drainPercent) / 100)} HP.`
    : ''
  return {
    success: true,
    message: `You cast ${spell.name} hitting ${targets.length} enemies for ${totalDamage} total damage.${resistStr}${killedStr}${drainStr}`,
    damage: totalDamage,
    targets: targetIds,
    events,
  }
}

/**
 * Cast a healing spell
 * Supports standard healing, full heal (Restoration), and cure all effects
 */
function castHealSpell(game: GameState, spell: SpellTemplate): ActionResult {
  const oldHp = game.character.hp
  let actualHeal: number

  if (spell.fullHeal) {
    // Full heal (Restoration) - restore to max HP
    game.character.hp = game.character.maxHp
    actualHeal = game.character.hp - oldHp
  } else {
    // Standard healing with spell power calculation
    let healAmount = calculateSpellPower(game.character, spell, true)
    // Apply class heal potency modifier (e.g. Paladin heals for 80%)
    const gameClass = getClassById(game.character.classId)
    if (gameClass?.healPotency) {
      healAmount = Math.floor(healAmount * gameClass.healPotency)
    }
    game.character.hp = Math.min(game.character.hp + healAmount, game.character.maxHp)
    actualHeal = game.character.hp - oldHp
  }

  // Track spell healing
  game.stats.healingBySource.spells += actualHeal

  const effects: string[] = []

  // Cure poison if applicable
  if (spell.curesPoison && isPoisoned(game.character)) {
    clearPoison(game.character)
    effects.push('Poison cured')
  }

  // Cure all negative status effects (Restoration)
  if (spell.curesAll) {
    // Clear all negative status effects
    const negativeEffects = ['confusion', 'blindness', 'fear', 'paralysis', 'slow']
    const hadEffects = game.character.statusEffects.some((e) =>
      negativeEffects.includes(e.type as string)
    )
    game.character.statusEffects = game.character.statusEffects.filter(
      (e) => !negativeEffects.includes(e.type as string)
    )
    if (hadEffects) {
      recalculateAllStats(game.character)
      effects.push('Status ailments cured')
    }
  }

  const effectStr = effects.length > 0 ? ` ${effects.join('. ')}.` : ''
  const healStr = spell.fullHeal ? 'fully restored' : `heal ${actualHeal} HP`
  return {
    success: true,
    message: `You cast ${spell.name} and ${healStr}.${effectStr}`,
    healed: actualHeal,
  }
}

/**
 * Cast a buff spell
 */
function castBuffSpell(game: GameState, spell: SpellTemplate): ActionResult {
  if (!spell.buff) {
    return { success: true, message: `You cast ${spell.name}.` }
  }

  // Handle resist_elements specially
  if (spell.id === 'resist_elements') {
    // Grant fire and cold resistance
    addTempResistance(game.character, { type: 'FIRE', turnsRemaining: 30, value: 50 })
    addTempResistance(game.character, { type: 'COLD', turnsRemaining: 30, value: 50 })
    return {
      success: true,
      message: 'You cast Resist Elements. You feel protected from fire and cold!',
    }
  }

  // Handle resistance spell specially (full elemental coverage)
  if (spell.id === 'resistance') {
    // Grant fire, cold, lightning, and poison resistance
    addTempResistance(game.character, { type: 'FIRE', turnsRemaining: 30, value: 50 })
    addTempResistance(game.character, { type: 'COLD', turnsRemaining: 30, value: 50 })
    addTempResistance(game.character, { type: 'LIGHTNING', turnsRemaining: 30, value: 50 })
    addTempResistance(game.character, { type: 'POISON', turnsRemaining: 30, value: 50 })
    return {
      success: true,
      message: 'You cast Resistance. You feel protected from the elements!',
    }
  }

  // Standard buff
  const buffType = spell.buff.type as StatusEffect['type']
  addStatusEffect(game.character, {
    type: buffType,
    turnsRemaining: spell.buff.duration,
    value: spell.buff.value,
  })

  return {
    success: true,
    message: `You cast ${spell.name}. ${getBuffMessage(spell.buff.type)}`,
  }
}

/**
 * Cast a debuff spell
 */
function castDebuffSpell(game: GameState, spell: SpellTemplate, targetId?: string): ActionResult {
  if (!spell.debuff) {
    return { success: true, message: `You cast ${spell.name}.` }
  }

  const target = resolveSpellTarget(game, targetId)
  if (!target) {
    return { success: true, message: `You cast ${spell.name}, but there are no targets.` }
  }

  applyMonsterDebuff(target, spell.debuff.type, spell.debuff.value, spell.debuff.duration)

  return {
    success: true,
    message: `You cast ${spell.name} on ${target.template.name}. ${getDebuffMessage(spell.debuff.type)}`,
    targets: [target.id],
  }
}

/**
 * Cast a lifedrain spell
 */
function castLifedrainSpell(
  game: GameState,
  spell: SpellTemplate,
  targetId?: string
): ActionResult {
  const target = resolveSpellTarget(game, targetId)
  if (!target) {
    return { success: true, message: `You cast ${spell.name}, but there are no targets.` }
  }

  // Calculate and apply damage
  const damage = calculateSpellDamage(game, spell)
  const killed = applyDamage(target, damage)
  trackSpellDamage(game, spell.name, damage)

  // Heal based on drain percent
  const drainPercent = spell.drainPercent ?? 50
  const healAmount = Math.floor((damage * drainPercent) / 100)
  const oldHp = game.character.hp
  game.character.hp = Math.min(game.character.hp + healAmount, game.character.maxHp)
  const actualHeal = game.character.hp - oldHp
  game.stats.healingBySource.spells += actualHeal

  if (killed) {
    handleMonsterKill(game, target)
  }

  const killedStr = killed ? ' It dies!' : ''
  return {
    success: true,
    message: `You cast ${spell.name} on ${target.template.name} for ${damage} damage, healing ${actualHeal} HP.${killedStr}`,
    damage,
    healed: actualHeal,
    targets: [target.id],
    events: [
      {
        type: 'attack',
        attackerId: game.character.id,
        defenderId: target.id,
        damage,
        killed,
      },
    ],
  }
}

/**
 * Cast a teleport spell
 */
function castTeleportSpell(game: GameState, spell: SpellTemplate): ActionResult {
  const range = spell.teleportRange ?? 0
  const destination = findTeleportDestination(game, range)

  game.character.position = destination

  // Apply Sneak Attack buff for Rogues (post-teleport burst damage)
  applyPostTeleportBuff(game)

  const rangeStr = range === 0 ? '' : ' a short distance'
  return {
    success: true,
    message: `You cast ${spell.name} and teleport${rangeStr}!`,
  }
}

/**
 * Cast a teleport other spell to banish a monster
 * Inspired by Angband's Teleport Other - moves dangerous monster away
 */
function castTeleportOtherSpell(
  game: GameState,
  spell: SpellTemplate,
  targetId?: string
): ActionResult {
  // Find target
  const target: Monster | null = targetId
    ? findTarget(game, targetId)
    : getNearestVisibleMonster(game)

  if (!target) {
    return { success: true, message: `You cast ${spell.name}, but there are no targets.` }
  }

  // Teleport the monster to a random location on the level
  const newPosition = findOpenPosition(game.currentLevel)
  target.position = newPosition
  target.isAwake = false // Disoriented after teleport

  return {
    success: true,
    message: `You cast ${spell.name}! ${target.template.name} vanishes!`,
    targets: [target.id],
  }
}

/**
 * Cast a targeted teleport spell (Dimension Door)
 * Teleports to a specific visible position within FOV range.
 * Range is dynamic based on calculateLightRadius().
 *
 * @param targetId - Destination as "x,y" string
 */
function castTargetedTeleportSpell(
  game: GameState,
  _spell: SpellTemplate,
  targetId?: string
): ActionResult {
  if (!targetId) {
    return { success: false, message: 'Must specify destination for Dimension Door.' }
  }

  // Parse target position from "x,y" format
  const [xStr, yStr] = targetId.split(',')
  const destX = parseInt(xStr ?? '0', 10)
  const destY = parseInt(yStr ?? '0', 10)
  if (isNaN(destX) || isNaN(destY)) {
    return { success: false, message: 'Invalid destination coordinates.' }
  }
  const destination: Point = { x: destX, y: destY }

  // Calculate dynamic range based on current FOV
  const maxRange = calculateLightRadius(game.character, game.character.depth)
  const dist = chebyshevDistance(game.character.position, destination)
  if (dist > maxRange) {
    return { success: false, message: 'Destination is beyond your vision.' }
  }

  // Verify LOS to destination
  if (!hasLineOfSight(game.character.position, destination, game.currentLevel)) {
    return { success: false, message: 'Cannot see destination clearly.' }
  }

  // Verify destination tile is visible and walkable
  const tile = getTile(game.currentLevel, destX, destY)
  if (!tile?.visible) {
    return { success: false, message: 'Destination must be visible.' }
  }
  if (!isWalkable(tile)) {
    return { success: false, message: 'Cannot teleport to that location.' }
  }

  // Verify no monster at destination
  const monsterAtDest = game.monsters.find(
    (m) => m.position.x === destX && m.position.y === destY && m.hp > 0
  )
  if (monsterAtDest) {
    return { success: false, message: 'Cannot teleport onto a creature.' }
  }

  // Execute teleport
  game.character.position = destination

  // Apply Sneak Attack buff for Rogues (post-teleport burst damage)
  applyPostTeleportBuff(game)

  return {
    success: true,
    message: `You step through a dimensional door!`,
  }
}

/**
 * Apply Sneak Attack buff to Rogue after any teleport
 * Grants 2.5x damage on next attack (consumed on use)
 */
function applyPostTeleportBuff(game: GameState): void {
  // Only Rogues get Sneak Attack after teleporting
  if (game.character.classId !== 'rogue') return

  // Apply sneak_attack buff (1 turn duration, consumed on attack)
  addStatusEffect(game.character, {
    type: 'sneak_attack',
    turnsRemaining: 2, // Lasts until next attack (or 2 turns if no attack)
    value: 250, // 2.5x multiplier (stored as percentage)
  })
}

/**
 * Find a valid tile adjacent to a monster for Shadow Step destination
 */
function findShadowStepDestination(game: GameState, monster: Monster): Point | null {
  const monsterPos = monster.position
  const charPos = game.character.position

  // Score positions: prefer tiles opposite from where we are (behind the target)
  const candidates: Array<{ pos: Point; score: number }> = []

  for (const dir of ADJACENT_DIRECTIONS) {
    const x = monsterPos.x + dir.dx
    const y = monsterPos.y + dir.dy

    // Check if tile is valid and walkable
    const tile = getTile(game.currentLevel, x, y)
    if (!tile || !isWalkable(tile)) continue

    // Check tile is visible (LOS requirement)
    if (!tile.visible) continue

    // Check no monster at destination
    const hasMonster = game.monsters.some(
      (m) => m.position.x === x && m.position.y === y && m.hp > 0
    )
    if (hasMonster) continue

    // Check no minion at destination
    const hasMinion = game.minions.some((m) => m.position.x === x && m.position.y === y)
    if (hasMinion) continue

    // Score: prefer tiles away from our current position (flanking bonus)
    const distFromChar = Math.abs(x - charPos.x) + Math.abs(y - charPos.y)
    const score = distFromChar // Higher = further from original position = better flanking

    candidates.push({ pos: { x, y }, score })
  }

  if (candidates.length === 0) return null

  // Sort by score descending (prefer flanking positions)
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]!.pos
}

/**
 * Cast Shadow Step spell - teleport adjacent to target monster
 * Grants Sneak Attack buff (Rogue only)
 */
function castShadowStepSpell(
  game: GameState,
  spell: SpellTemplate,
  targetId?: string
): ActionResult {
  const target = resolveSpellTarget(game, targetId)
  if (!target) {
    return { success: true, message: `You cast ${spell.name}, but there are no targets.` }
  }

  // Check if already adjacent to target
  const dx = Math.abs(target.position.x - game.character.position.x)
  const dy = Math.abs(target.position.y - game.character.position.y)
  if (dx <= 1 && dy <= 1) {
    return { success: false, message: 'You are already adjacent to that target.' }
  }

  // Find valid destination adjacent to target
  const destination = findShadowStepDestination(game, target)
  if (!destination) {
    return { success: false, message: 'No valid position adjacent to target.' }
  }

  // Execute teleport
  game.character.position = destination

  // Apply Sneak Attack buff (Rogue only)
  applyPostTeleportBuff(game)

  return {
    success: true,
    message: `You step through shadows, appearing behind ${target.template.name}!`,
    targets: [target.id],
  }
}

/**
 * Cast a summon spell to create a minion
 * Supports single summons and multi-summons (Summon Pack)
 */
function castSummonSpell(game: GameState, spell: SpellTemplate): ActionResult {
  // Handle multi-summon spells (Summon Pack)
  if (spell.summonIds && spell.summonIds.length > 0) {
    return castMultiSummonSpell(game, spell)
  }

  // Determine minion type from spell
  let minionType: MinionType
  if (spell.id === 'summon_wolf') {
    minionType = 'wolf'
  } else if (spell.id === 'summon_skeleton') {
    minionType = 'skeleton'
  } else if (spell.id === 'summon_bear') {
    minionType = 'bear'
  } else {
    return { success: false, message: 'Unknown summon spell.' }
  }

  return summonMinion(game, minionType)
}

/**
 * Cast a multi-summon spell (e.g., Summon Pack summons wolf + bear)
 */
function castMultiSummonSpell(game: GameState, spell: SpellTemplate): ActionResult {
  const results: string[] = []

  for (const summonId of spell.summonIds!) {
    // Map spell ID to minion type
    let minionType: MinionType | null = null
    if (summonId === 'summon_wolf') minionType = 'wolf'
    else if (summonId === 'summon_bear') minionType = 'bear'
    else if (summonId === 'summon_skeleton') minionType = 'skeleton'

    if (minionType) {
      const result = summonMinion(game, minionType)
      if (result.success && result.message) {
        results.push(result.message)
      }
    }
  }

  if (results.length === 0) {
    return { success: false, message: 'No room to summon!' }
  }

  return {
    success: true,
    message: `You cast ${spell.name}! ${results.join(' ')}`,
  }
}

/**
 * Summon a single minion of the given type
 */
function summonMinion(game: GameState, minionType: MinionType): ActionResult {
  const template = MINION_TEMPLATES[minionType]

  // Calculate scaled HP for minions that scale with level
  // Wolf: 30 base + 2 per level (32 at L1, 70 at L20)
  // Skeleton: 20 base + 2 per level (22 at L1, 60 at L20)
  // Bear: 60 base + 3 per level (63 at L1, 120 at L20)
  const scaledMaxHp =
    minionType === 'wolf' || minionType === 'skeleton'
      ? template.maxHp + game.character.level * 2
      : minionType === 'bear'
        ? template.maxHp + game.character.level * 3
        : template.maxHp

  // Check existing minions of this type
  const existing = game.minions.filter((m) => m.type === minionType && m.hp > 0)

  if (existing.length >= template.maxCount) {
    // At cap — heal the most damaged one instead of spawning
    const mostDamaged = existing.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b))
    mostDamaged.maxHp = scaledMaxHp
    const oldHp = mostDamaged.hp
    mostDamaged.hp = mostDamaged.maxHp
    const healed = mostDamaged.hp - oldHp
    return {
      success: true,
      message: `Your ${template.name} is restored to full health! (+${healed} HP)`,
    }
  }

  // Find spawn position (adjacent to player)
  const spawnPos = findMinionSpawnPosition(game)
  if (!spawnPos) {
    return { success: false, message: 'No room to summon!' }
  }

  // Create the minion with scaled HP
  const minion: Minion = {
    id: `minion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type: minionType,
    name: template.name,
    hp: scaledMaxHp,
    maxHp: scaledMaxHp,
    position: spawnPos,
    damage: template.damage,
    energy: 0,
    permanent: template.permanent,
    turnsRemaining: template.duration,
  }

  game.minions.push(minion)

  const durationStr = template.permanent ? '' : ` (${template.duration} turns)`
  return {
    success: true,
    message: `You summon a ${template.name}!${durationStr}`,
  }
}

/**
 * Find a valid spawn position for a minion (adjacent to player)
 */
function findMinionSpawnPosition(game: GameState): Point | null {
  const charPos = game.character.position

  for (const dir of ADJACENT_DIRECTIONS) {
    const x = charPos.x + dir.dx
    const y = charPos.y + dir.dy

    const tile = getTile(game.currentLevel, x, y)
    if (!tile || !isWalkable(tile)) continue

    // Check no monster at position
    const hasMonster = game.monsters.some((m) => m.position.x === x && m.position.y === y)
    if (hasMonster) continue

    // Check no minion at position
    const hasMinion = game.minions.some((m) => m.position.x === x && m.position.y === y)
    if (hasMinion) continue

    return { x, y }
  }

  return null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Apply a debuff to a monster
 * Replaces existing debuff of the same type
 */
function applyMonsterDebuff(monster: Monster, type: string, value: number, duration: number): void {
  const debuffType = type as 'slow' | 'weaken' | 'blind'

  // Remove existing debuff of same type
  monster.debuffs = monster.debuffs.filter((d) => d.type !== debuffType)

  // Add new debuff
  monster.debuffs.push({
    type: debuffType,
    turnsRemaining: duration,
    value,
  })
}

/**
 * Get flavor message for a buff type
 */
function getBuffMessage(buffType: string): string {
  switch (buffType) {
    case 'blessing':
      return 'You feel righteous!'
    case 'protection':
      return 'You feel protected!'
    case 'speed':
      return 'You feel fast!'
    case 'heroism':
      return 'You feel heroic!'
    case 'damage_bonus':
      return 'You feel powerful!'
    case 'ac_bonus':
      return 'You feel shielded!'
    default:
      return 'You feel enhanced!'
  }
}

/**
 * Get flavor message for a debuff type
 */
function getDebuffMessage(debuffType: string): string {
  switch (debuffType) {
    case 'slow':
      return 'It is slowed!'
    case 'weaken':
      return 'It is weakened!'
    case 'blind':
      return 'It is blinded!'
    default:
      return 'It is afflicted!'
  }
}
