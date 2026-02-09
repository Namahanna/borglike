/**
 * Retreat, Escape, and Teleport Logic
 *
 * Handles retreat decisions, HP monitoring, escape route finding,
 * town portal decisions, and phase door safety evaluation.
 */

import type { GameState, Point, Direction } from '../types'
import { getDirectionFromDelta, isMonsterAt } from '../types'
import type {
  PersonalityConfig,
  DangerMap,
  PhaseDoorSafety,
  DangerTier,
  BotGoal,
  BotContext,
} from './types'
import { getEffectiveCapabilities } from './types'
import type { ClassBehaviorProfile } from './class-profiles'
import { getTile, isWalkable, getAdjacentPositions } from '../dungeon'
import { isPoisoned, getPoisonDamage } from '../status-effects'
import { getLocalDanger, getTileDanger } from './danger'
import { isInCombat, countAdjacentMonsters, getCombatAdvantage } from './combat'
import {
  findHealingPotion,
  findEscapeScroll,
  findTownPortalScroll,
  findNeutralizePoison,
  findResistancePotion,
} from './items'
import { isInTown } from '../town'
import {
  isUnderPrepared,
  getEncumbranceRatio,
  ENCUMBRANCE_TOLERANCE,
  countEquipmentInInventory,
  EQUIPMENT_INVENTORY_LIMIT,
} from './preparation'
import { getAverageDamage } from '../data/monsters'
import { estimateDamageAfterArmor } from '../combat'
import { computeSafetyFlow } from './safety-flow'
import { resetCorridorFollowing } from './exploration'
import { profile } from './profiler'
import { blacklistDangerousItem } from './state'

// ============================================================================
// TYPES
// ============================================================================

/** Retreat evaluation result */
export interface RetreatEvaluation {
  /** Should we retreat? */
  shouldRetreat: boolean
  /** Urgency level (0-100, higher = more urgent) */
  urgency: number
  /** Primary reason for retreat */
  reason: string
}

/** Escape route with safety score */
export interface EscapeRoute {
  direction: Direction
  target: Point
  safetyScore: number
}

/** Decision result for town portal usage */
export interface TownPortalDecision {
  shouldUse: boolean
  reason: string
}

// ============================================================================
// RETREAT DECISIONS
// ============================================================================

/**
 * Check if status effects make retreat urgent
 *
 * Deadly combinations:
 * - paralyzed + adjacent monsters = instant death
 * - confused + low HP = random walk into danger
 * - poison + no cure + HP dropping = eventual death
 */
export function getStatusRetreatUrgency(
  game: GameState,
  adjacentCount: number,
  hpRate: number
): RetreatEvaluation {
  const character = game.character
  const hpRatio = character.hp / character.maxHp

  // Paralyzed + adjacent monsters (CRITICAL)
  const isParalyzed = character.statusEffects.some((e) => e.type === 'paralyzed')
  if (isParalyzed && adjacentCount > 0) {
    return {
      shouldRetreat: true,
      urgency: 100,
      reason: 'Paralyzed with adjacent enemies',
    }
  }

  // Confused + low HP (HIGH)
  const isConfused = character.statusEffects.some((e) => e.type === 'confused')
  if (isConfused && hpRatio < 0.4) {
    return {
      shouldRetreat: true,
      urgency: 85,
      reason: 'Confused with low HP',
    }
  }

  // Poison + no cure + HP dropping (HIGH)
  if (isPoisoned(character)) {
    const hasCure =
      findNeutralizePoison(character) !== null || findResistancePotion(character, 'poison') !== null
    const hpDropping = hpRate < 0
    const poisonDamage = getPoisonDamage(character)

    if (!hasCure && hpDropping && hpRatio < 0.5 && poisonDamage > 0) {
      const turnsToLive = character.hp / poisonDamage
      if (turnsToLive < 10) {
        return {
          shouldRetreat: true,
          urgency: 75,
          reason: `Poisoned, no cure (${Math.floor(turnsToLive)} turns to live)`,
        }
      }
    }
  }

  // Blind + surrounded (MEDIUM)
  const isBlind = character.statusEffects.some((e) => e.type === 'blind')
  if (isBlind && adjacentCount >= 2) {
    return {
      shouldRetreat: true,
      urgency: 60,
      reason: 'Blind and surrounded',
    }
  }

  // Slowed + outnumbered (MEDIUM)
  const isSlowed = character.statusEffects.some((e) => e.type === 'slowed')
  if (isSlowed && adjacentCount >= 2 && hpRatio < 0.6) {
    return {
      shouldRetreat: true,
      urgency: 55,
      reason: 'Slowed and outnumbered',
    }
  }

  return {
    shouldRetreat: false,
    urgency: 0,
    reason: '',
  }
}

/**
 * Evaluate whether we should retreat from current position
 *
 * Retreat intelligence is gated by capability level:
 * - L0: Panic at 25% HP only (hardcoded)
 * - L1: + Personality caution threshold
 * - L2: + Status effect detection (paralyzed, poison, confused, blind, slow)
 * - L3: + Outnumbered, combat advantage, local danger evaluation
 *
 * @param retreatLevel - Retreat capability level (0-3), defaults to 3 for full evaluation
 */
export function shouldRetreat(
  game: GameState,
  config: PersonalityConfig,
  dangers: DangerMap,
  hpRate: number = 0,
  retreatLevel: number = 3
): RetreatEvaluation {
  const character = game.character
  const hpRatio = character.hp / character.maxHp
  const adjacentCount = countAdjacentMonsters(game, character.position)

  // L0: Hardcoded 25% HP panic only
  if (retreatLevel === 0) {
    if (hpRatio < 0.25) {
      return {
        shouldRetreat: true,
        urgency: 80,
        reason: `HP critical (${Math.floor(hpRatio * 100)}%)`,
      }
    }
    return { shouldRetreat: false, urgency: 0, reason: '' }
  }

  // L2+: Check status effects (highest priority)
  if (retreatLevel >= 2) {
    const statusRetreat = getStatusRetreatUrgency(game, adjacentCount, hpRate)
    if (statusRetreat.shouldRetreat) {
      return statusRetreat
    }
  }

  // L1+: Personality-based HP threshold
  const cautionThreshold = config.caution / 100
  if (hpRatio < cautionThreshold) {
    const urgency = Math.floor((cautionThreshold - hpRatio) * 200)
    return {
      shouldRetreat: true,
      urgency: Math.min(100, urgency),
      reason: `HP critical (${Math.floor(hpRatio * 100)}%)`,
    }
  }

  // L3+: Outnumbered check
  if (retreatLevel >= 3 && adjacentCount >= 2) {
    // Only retreat if not super aggressive
    if (config.aggression < 80) {
      return {
        shouldRetreat: true,
        urgency: 60 + adjacentCount * 10,
        reason: `Outnumbered (${adjacentCount} enemies)`,
      }
    }
  }

  // L3+: Combat advantage check
  if (retreatLevel >= 3 && isInCombat(game)) {
    const advantage = getCombatAdvantage(game)
    if (advantage < -20) {
      // Losing badly
      return {
        shouldRetreat: true,
        urgency: Math.min(100, Math.abs(advantage)),
        reason: 'Losing fight',
      }
    }
  }

  // L3+: Local danger check (even if not in combat)
  if (retreatLevel >= 3) {
    const localDanger = getLocalDanger(dangers, character.position)
    const dangerThreshold = 100 + config.aggression // Higher aggression = tolerate more danger
    // HP threshold scales with personality: cautious (50%) → 70%, aggressive (20%) → 40%
    const dangerHpThreshold = cautionThreshold + 0.2
    if (localDanger > dangerThreshold && hpRatio < dangerHpThreshold) {
      return {
        shouldRetreat: true,
        urgency: Math.floor((localDanger / dangerThreshold) * 50),
        reason: 'High danger area',
      }
    }
  }

  return {
    shouldRetreat: false,
    urgency: 0,
    reason: '',
  }
}

/**
 * Quick check for critical HP (emergency retreat)
 */
export function isCriticalHP(game: GameState, config: PersonalityConfig): boolean {
  const hpRatio = game.character.hp / game.character.maxHp
  // Critical = below half of caution threshold
  const criticalThreshold = (config.caution / 100) * 0.5
  return hpRatio < criticalThreshold
}

/**
 * Check if HP is low enough to consider healing/resting
 */
export function needsHealing(game: GameState): boolean {
  const hpRatio = game.character.hp / game.character.maxHp
  return hpRatio < 0.5
}

// ============================================================================
// ESCAPE ROUTES
// ============================================================================

/**
 * Find the best escape route from current position
 *
 * Prefers:
 * - Directions away from monsters
 * - Lower danger tiles
 * - Towards known safe areas (stairs, explored corridors)
 */
export function findBestEscapeRoute(game: GameState, dangers: DangerMap): EscapeRoute | null {
  const pos = game.character.position
  const adjacent = getAdjacentPositions(pos)
  const routes: EscapeRoute[] = []

  // Find monster centroid (average position of nearby monsters)
  const nearbyMonsters = game.monsters.filter((m) => {
    const dx = Math.abs(m.position.x - pos.x)
    const dy = Math.abs(m.position.y - pos.y)
    return dx <= 3 && dy <= 3 && m.hp > 0
  })

  let monsterCentroid: Point | null = null
  if (nearbyMonsters.length > 0) {
    const sumX = nearbyMonsters.reduce((sum, m) => sum + m.position.x, 0)
    const sumY = nearbyMonsters.reduce((sum, m) => sum + m.position.y, 0)
    monsterCentroid = {
      x: sumX / nearbyMonsters.length,
      y: sumY / nearbyMonsters.length,
    }
  }

  for (const adj of adjacent) {
    const tile = getTile(game.currentLevel, adj.x, adj.y)
    if (!tile) continue
    if (!isWalkable(tile) && tile.type !== 'door_closed') continue

    // Skip if occupied by monster
    if (isMonsterAt(game.monsters, adj)) continue

    // Calculate safety score
    let safetyScore = 100

    // Penalize for danger
    const tileDanger = getTileDanger(dangers, adj)
    safetyScore -= tileDanger / 2

    // Bonus for moving away from monster centroid
    if (monsterCentroid) {
      const currentDist = Math.hypot(pos.x - monsterCentroid.x, pos.y - monsterCentroid.y)
      const newDist = Math.hypot(adj.x - monsterCentroid.x, adj.y - monsterCentroid.y)
      if (newDist > currentDist) {
        safetyScore += 30 // Moving away from danger
      } else if (newDist < currentDist) {
        safetyScore -= 20 // Moving toward danger
      }
    }

    // Bonus for stairs (ultimate escape)
    if (game.currentLevel.stairsDown) {
      const stairs = game.currentLevel.stairsDown
      if (adj.x === stairs.x && adj.y === stairs.y) {
        safetyScore += 50
      }
    }

    // Calculate direction
    const dx = adj.x - pos.x
    const dy = adj.y - pos.y
    const direction = getDirectionFromDelta(dx, dy)
    if (!direction) continue

    routes.push({
      direction,
      target: adj,
      safetyScore,
    })
  }

  if (routes.length === 0) {
    return null
  }

  // Sort by safety (descending)
  routes.sort((a, b) => b.safetyScore - a.safetyScore)

  return routes[0]!
}

/**
 * Find escape direction away from a specific threat
 */
export function findEscapeDirection(game: GameState, threatPos: Point): Direction | null {
  const pos = game.character.position
  const adjacent = getAdjacentPositions(pos)

  let bestDirection: Direction | null = null
  let bestDistance = -Infinity

  for (const adj of adjacent) {
    const tile = getTile(game.currentLevel, adj.x, adj.y)
    if (!tile) continue
    if (!isWalkable(tile) && tile.type !== 'door_closed') continue

    // Skip if occupied by monster
    if (isMonsterAt(game.monsters, adj)) continue

    // Calculate distance from threat
    const distFromThreat = Math.hypot(adj.x - threatPos.x, adj.y - threatPos.y)

    if (distFromThreat > bestDistance) {
      bestDistance = distFromThreat
      const dx = adj.x - pos.x
      const dy = adj.y - pos.y
      bestDirection = getDirectionFromDelta(dx, dy)
    }
  }

  return bestDirection
}

// ============================================================================
// HP MONITORING
// ============================================================================

/**
 * Get HP status for decision making
 */
export function getHPStatus(
  game: GameState,
  config: PersonalityConfig
): {
  ratio: number
  isCritical: boolean
  needsHealing: boolean
  canFight: boolean
} {
  const character = game.character
  const ratio = character.hp / character.maxHp
  const cautionThreshold = config.caution / 100

  return {
    ratio,
    isCritical: ratio < cautionThreshold * 0.5,
    needsHealing: ratio < 0.5,
    canFight: ratio >= cautionThreshold,
  }
}

/**
 * Estimate how many hits we can take
 */
export function getHitsTillDeath(game: GameState): number {
  const character = game.character

  // Estimate average incoming damage based on nearby monsters
  const nearbyMonsters = game.monsters.filter((m) => {
    const dx = Math.abs(m.position.x - character.position.x)
    const dy = Math.abs(m.position.y - character.position.y)
    return dx <= 2 && dy <= 2 && m.hp > 0
  })

  if (nearbyMonsters.length === 0) {
    return Infinity
  }

  // Average damage from nearby monsters (percentage-based armor reduction)
  const avgDamage =
    nearbyMonsters.reduce((sum, m) => {
      return sum + estimateDamageAfterArmor(getAverageDamage(m.template), character)
    }, 0) / nearbyMonsters.length

  return Math.floor(character.hp / avgDamage)
}

// ============================================================================
// CLASS-AWARE RETREAT
// ============================================================================

/**
 * Evaluate whether we should retreat, considering class profile
 *
 * Key class behaviors:
 * - Berserker: NEVER retreats (neverRetreats=true)
 * - Ranged classes: May want to kite instead of retreat
 * - Melee classes: Use standard retreat logic
 */
export function shouldClassRetreat(
  game: GameState,
  config: PersonalityConfig,
  dangers: DangerMap,
  classProfile: ClassBehaviorProfile
): RetreatEvaluation {
  // Berserker never retreats
  if (classProfile.neverRetreats) {
    return {
      shouldRetreat: false,
      urgency: 0,
      reason: 'Class never retreats',
    }
  }

  // Use base retreat evaluation
  const baseEval = shouldRetreat(game, config, dangers)

  // Apply class modifier to urgency
  // Aggressive classes (positive aggressionMod) have lower urgency
  // Cautious classes (positive cautionMod) have higher urgency
  if (baseEval.shouldRetreat) {
    const modifiedUrgency =
      baseEval.urgency + classProfile.cautionMod - classProfile.aggressionMod / 2
    return {
      ...baseEval,
      urgency: Math.max(0, Math.min(100, modifiedUrgency)),
    }
  }

  return baseEval
}

// ============================================================================
// TOWN PORTAL DECISIONS
// ============================================================================

/**
 * Evaluate whether to use a Town Portal scroll
 *
 * Personality-driven thresholds:
 * - cautious: HP < 50% AND no healing, OR HP < 30%
 * - aggressive: HP < 20% AND no healing AND no escape
 * - greedy: HP < 40% OR 5+ sellable items
 * - speedrunner: HP < 15%, last resort
 *
 * Also triggers on:
 * - Equipment inventory full (hard cap)
 * - Encumbrance exceeds personality tolerance (soft pressure)
 */
export function shouldUseTownPortal(
  game: GameState,
  config: PersonalityConfig,
  personality: string
): TownPortalDecision {
  // Never use in town (can't use there anyway)
  if (isInTown(game)) {
    return { shouldUse: false, reason: 'Already in town' }
  }

  // Don't use if portal already active
  if (game.townPortal) {
    return { shouldUse: false, reason: 'Portal already active' }
  }

  // Check if we have a scroll
  const scroll = findTownPortalScroll(game.character)
  if (!scroll) {
    return { shouldUse: false, reason: 'No scroll available' }
  }

  const character = game.character
  const hpRatio = character.hp / character.maxHp
  const hasHealing = findHealingPotion(character) !== null
  const hasEscape = findEscapeScroll(character) !== null

  // Check depth preparation - if under-prepared, consider returning to town
  // Scaled by personality caution: aggressive bots tolerate running on empty,
  // cautious bots trigger town visits earlier
  const adjacentCount = countAdjacentMonsters(game, character.position)
  if (adjacentCount === 0) {
    const underPrepared = isUnderPrepared(
      character,
      character.inventory,
      character.depth,
      config.caution
    )
    if (underPrepared) {
      return { shouldUse: true, reason: `Under-prepared: ${underPrepared}` }
    }
  }

  // Count sellable items (non-equipped equipment in inventory)
  const sellableItems = character.inventory.filter(
    (item) =>
      item.template.slot !== undefined &&
      item.template.type !== 'potion' &&
      item.template.type !== 'scroll'
  ).length

  // Count total TP scrolls (to check if we can spare one)
  const tpScrollCount = character.inventory.filter(
    (item) => item.template.name === 'Scroll of Town Portal'
  ).length

  // At early depths (1-4), preserve the ONLY TP scroll for planned trips
  // Don't waste it on emergency survival unless:
  // 1. We have 2+ TP scrolls (can afford to use one)
  // 2. OR we have enough gold to buy useful items (TP=75g, potions=27g min)
  // 3. OR we have sellable items worth visiting town for
  // 4. OR HP is critically low (< 10% - absolute emergency, about to die)
  const isEarlyDepth = character.depth >= 1 && character.depth <= 4
  const minUsefulGold = 75 // Enough to buy a replacement TP scroll
  const hasTownValue = character.gold >= minUsefulGold || sellableItems >= 3
  const canSpareTP = tpScrollCount >= 2
  const absoluteEmergency = hpRatio < 0.1 // Only 10% HP = 1-2 hits from death

  if (isEarlyDepth && !canSpareTP && !hasTownValue && !absoluteEmergency) {
    // Preserve TP scroll at early depths - use other survival options instead
    return { shouldUse: false, reason: 'Preserving TP for planned trip' }
  }

  // Hard cap: equipment inventory full - must return to sell
  const equipmentCount = countEquipmentInInventory(character.inventory)
  if (equipmentCount >= EQUIPMENT_INVENTORY_LIMIT) {
    return { shouldUse: true, reason: 'Equipment inventory full' }
  }

  // Encumbrance check: personality-based tolerance
  // Only check when not in combat (adjacentCount === 0 already checked above)
  if (adjacentCount === 0) {
    const ratio = getEncumbranceRatio(character)
    const tolerance = ENCUMBRANCE_TOLERANCE[personality] ?? 1.0
    if (ratio > tolerance) {
      return { shouldUse: true, reason: `Encumbered (${Math.round(ratio * 100)}%)` }
    }
  }

  // Personality-specific thresholds
  switch (personality) {
    case 'cautious':
      // Very careful - portals to town when moderately hurt
      if (hpRatio < 0.3) {
        return { shouldUse: true, reason: 'HP critical (cautious)' }
      }
      if (hpRatio < 0.5 && !hasHealing) {
        return { shouldUse: true, reason: 'HP low, no healing (cautious)' }
      }
      break

    case 'aggressive':
      // Only uses portal as last resort
      if (hpRatio < 0.2 && !hasHealing && !hasEscape) {
        return { shouldUse: true, reason: 'HP critical, no options (aggressive)' }
      }
      break

    case 'greedy':
      // Uses portal to sell gear or when hurt
      if (hpRatio < 0.4) {
        return { shouldUse: true, reason: 'HP low (greedy)' }
      }
      if (sellableItems >= 5) {
        return { shouldUse: true, reason: 'Inventory full of loot (greedy)' }
      }
      break

    case 'speedrunner':
      // Avoids town trips - only absolute emergency
      if (hpRatio < 0.15) {
        return { shouldUse: true, reason: 'HP critical (speedrunner)' }
      }
      break

    default:
      // Default behavior (balanced)
      if (hpRatio < 0.35 && !hasHealing) {
        return { shouldUse: true, reason: 'HP low, no healing' }
      }
  }

  return { shouldUse: false, reason: '' }
}

// ============================================================================
// PHASE DOOR SAFETY
// ============================================================================

/**
 * Evaluate if phase door (short-range teleport) is safe to use
 *
 * Samples tiles within range 10 and counts "safe" zones where
 * danger < avoidance × 0.5. Returns safe if:
 * - >= 25% of landing zones are safe, OR
 * - Average danger is < 50% of current position danger
 */
export function evaluatePhaseDoorSafety(
  game: GameState,
  dangers: DangerMap,
  avoidance: number
): PhaseDoorSafety {
  const pos = game.character.position
  const level = game.currentLevel
  const safeThreshold = avoidance * 0.5
  const currentDanger = getTileDanger(dangers, pos)

  // Sample tiles within phase door range (10 squares)
  const range = 10
  let totalSamples = 0
  let safeSamples = 0
  let totalDanger = 0

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy))
      if (dist === 0 || dist > range) continue

      const x = pos.x + dx
      const y = pos.y + dy

      // Check if tile is walkable
      const tile = getTile(level, x, y)
      if (!tile || !isWalkable(tile)) continue

      // Check if occupied by monster
      if (isMonsterAt(game.monsters, { x, y })) continue

      totalSamples++
      const tileDanger = getTileDanger(dangers, { x, y })
      totalDanger += tileDanger

      if (tileDanger < safeThreshold) {
        safeSamples++
      }
    }
  }

  if (totalSamples === 0) {
    return { isSafe: false, safeRatio: 0, avgDanger: Infinity }
  }

  const safeRatio = safeSamples / totalSamples
  const avgDanger = totalDanger / totalSamples

  // Safe if >= 25% safe zones OR average danger < 50% of current
  const isSafe = safeRatio >= 0.25 || avgDanger < currentDanger * 0.5

  return { isSafe, safeRatio, avgDanger }
}

/**
 * Determine if escape should take priority over healing
 *
 * Escape beats healing when:
 * - CRITICAL tier AND HP < 30%
 * - OR surrounded (3+ adjacent monsters)
 * - OR hitsTillDeath <= 1 with 2+ adjacent
 */
export function shouldEscapeOverHeal(
  game: GameState,
  tier: DangerTier,
  adjacentCount: number
): boolean {
  const hpRatio = game.character.hp / game.character.maxHp
  const hitsTillDeath = getHitsTillDeath(game)

  // CRITICAL tier with low HP - escape is priority
  if (tier === 'CRITICAL' && hpRatio < 0.3) {
    return true
  }

  // Surrounded by 3+ monsters - escape is needed
  if (adjacentCount >= 3) {
    return true
  }

  // About to die with multiple adjacent threats
  if (hitsTillDeath <= 1 && adjacentCount >= 2) {
    return true
  }

  return false
}

// ============================================================================
// GOAL CREATION (survival domain)
// ============================================================================

/**
 * Get FLEE goal - escape from danger.
 * Returns a flee goal if retreat is warranted, null otherwise.
 * Handles state transitions: corridor reset, safety flow caching.
 */
/**
 * Get FLEE goal - escape from danger
 *
 * CRITICAL: Never returns null when shouldRetreat=true
 * Always provides emergency fallback to prevent walking into danger
 */
export function getFleeGoal(
  context: BotContext,
  dangers: DangerMap,
  hpRate: number = 0
): BotGoal | null {
  const { game, effectiveConfig, botState } = context

  // Check flee cooldown
  if (game.turn < botState.fleeCooldownUntil) {
    return null
  }

  // Get retreat level from capabilities
  const effective = getEffectiveCapabilities(context)
  const retreatLevel = effective.retreat

  // Check if retreat warranted (PASS HP RATE and RETREAT LEVEL)
  // Use effectiveConfig to include class modifiers (aggression/caution)
  const retreatEval = shouldRetreat(game, effectiveConfig, dangers, hpRate, retreatLevel)
  if (!retreatEval.shouldRetreat) return null

  // If fleeing due to high danger area while pursuing TAKE goal, blacklist that item
  // This prevents oscillation: approach item → danger → flee → approach → danger...
  if (retreatEval.reason === 'High danger area' && botState.currentGoal?.type === 'TAKE') {
    const itemId = botState.currentGoal.targetId
    if (itemId) {
      blacklistDangerousItem(botState, itemId, game.turn)
    }
  }

  // Bullrush: When committed to DESCEND, push through "high danger area" to reach stairs
  // Other flee triggers (HP critical, outnumbered, losing fight, status) still apply
  if (retreatEval.reason === 'High danger area' && botState.currentGoal?.type === 'DESCEND') {
    return null
  }

  // Exit corridor-following mode
  resetCorridorFollowing(botState)

  // Try 1: Safety flow (if monsters nearby)
  const nearbyMonsters = game.monsters.filter((m) => {
    if (m.hp <= 0) return false
    const dx = Math.abs(m.position.x - game.character.position.x)
    const dy = Math.abs(m.position.y - game.character.position.y)
    return dx <= 10 && dy <= 10
  })

  if (nearbyMonsters.length > 0) {
    const safetyResult = profile('computeSafetyFlow', () =>
      computeSafetyFlow(game.currentLevel, nearbyMonsters, game.character.position, game.turn)
    )

    if (safetyResult.target) {
      botState.cachedSafetyFlow = safetyResult
      return {
        type: 'FLEE',
        target: safetyResult.target,
        targetId: null,
        reason: `${retreatEval.reason} (safety flow)`,
        startTurn: game.turn,
      }
    }
  }

  // Try 2: Escape route logic
  const escapeRoute = findBestEscapeRoute(game, dangers)
  if (escapeRoute) {
    return {
      type: 'FLEE',
      target: escapeRoute.target,
      targetId: null,
      reason: retreatEval.reason,
      startTurn: game.turn,
    }
  }

  // Try 3: Stairs down
  if (game.currentLevel.stairsDown) {
    const stairsTile = getTile(
      game.currentLevel,
      game.currentLevel.stairsDown.x,
      game.currentLevel.stairsDown.y
    )
    if (stairsTile?.explored) {
      return {
        type: 'FLEE',
        target: game.currentLevel.stairsDown,
        targetId: null,
        reason: `${retreatEval.reason} (stairs escape)`,
        startTurn: game.turn,
      }
    }
  }

  // Try 4: Stairs up
  if (game.currentLevel.stairsUp) {
    const stairsUpTile = getTile(
      game.currentLevel,
      game.currentLevel.stairsUp.x,
      game.currentLevel.stairsUp.y
    )
    if (stairsUpTile?.explored) {
      return {
        type: 'FLEE',
        target: game.currentLevel.stairsUp,
        targetId: null,
        reason: `${retreatEval.reason} (ascend escape)`,
        startTurn: game.turn,
      }
    }
  }

  // Try 5: Any walkable adjacent tile with lowest danger
  const pos = game.character.position
  const adjacent = getAdjacentPositions(pos)
  const walkableEscapes: Point[] = []

  for (const adj of adjacent) {
    const tile = getTile(game.currentLevel, adj.x, adj.y)
    if (!tile || (!isWalkable(tile) && tile.type !== 'door_closed')) continue

    if (!isMonsterAt(game.monsters, adj)) {
      walkableEscapes.push(adj)
    }
  }

  if (walkableEscapes.length > 0) {
    // Pick lowest danger tile
    let bestEscape = walkableEscapes[0]!
    let lowestDanger = getTileDanger(dangers, bestEscape)

    for (const escape of walkableEscapes) {
      const escapeDanger = getTileDanger(dangers, escape)
      if (escapeDanger < lowestDanger) {
        lowestDanger = escapeDanger
        bestEscape = escape
      }
    }

    return {
      type: 'FLEE',
      target: bestEscape,
      targetId: null,
      reason: `${retreatEval.reason} (adjacent escape)`,
      startTurn: game.turn,
    }
  }

  // Try 6: Stand still (last resort - better than moving into danger)
  return {
    type: 'FLEE',
    target: pos,
    targetId: null,
    reason: `${retreatEval.reason} (stand ground)`,
    startTurn: game.turn,
  }
}

/**
 * Get RECOVER goal - rest to heal when safe.
 * Returns a recover goal if healing is needed and safe, null otherwise.
 *
 * Smart recovery: Skip long recovers (>30 turns) when town trip is available.
 */
export function getRecoverGoal(
  context: BotContext,
  dangerThreshold: number,
  localDanger: number,
  hpRatio: number
): BotGoal | null {
  const { game, config } = context
  const character = game.character
  const pos = character.position

  // Recover if: HP < 50% AND safe AND no visible monsters
  const shouldRecoverNow =
    hpRatio < 0.5 && localDanger < dangerThreshold * 0.5 && context.visibleMonsters.length === 0

  if (!shouldRecoverNow) return null

  // Calculate turns to heal to 50% threshold
  const regenPerTurn = Math.max(1, Math.floor(character.maxHp * 0.01))
  const targetHp = Math.ceil(character.maxHp * 0.5)
  const hpToHeal = targetHp - character.hp
  const turnsToHeal = Math.ceil(hpToHeal / regenPerTurn)

  // Quick heal - just RECOVER
  const QUICK_HEAL_THRESHOLD = 30
  if (turnsToHeal <= QUICK_HEAL_THRESHOLD) {
    return {
      type: 'RECOVER',
      target: pos,
      targetId: null,
      reason: `Recovering (${turnsToHeal}t to 50%)`,
      startTurn: game.turn,
    }
  }

  // Slow heal - check if town trip is better option
  const tpDecision = shouldUseTownPortal(game, config, context.personality)
  if (tpDecision.shouldUse) {
    // Skip RECOVER - let town trip goal handle it
    return null
  }

  // No better option - RECOVER anyway
  return {
    type: 'RECOVER',
    target: pos,
    targetId: null,
    reason: `Recovering (${turnsToHeal}t, no TP)`,
    startTurn: game.turn,
  }
}
