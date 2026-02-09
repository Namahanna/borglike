/**
 * Combat Logic
 *
 * Handles engagement decisions, target selection, and combat evaluation.
 * Determines when to fight vs flee based on personality and situation.
 */

import type { GameState, Monster, Character, Point, Direction } from '../types'
import { chebyshevDistance, isAdjacent, getDirectionFromDelta, isMonsterAt } from '../types'
import type { BotContext, PersonalityConfig, BotGoal } from './types'
import { getEffectiveCapabilities } from './types'
import type { ClassBehaviorProfile } from './class-profiles'
import { getAdjacentPositions, getTile, isWalkable } from '../dungeon'
import { canRangedAttack, getBowRange, estimateDamageAfterArmor } from '../combat'
import { getAverageDamage } from '../data/monsters'
import { resetCorridorFollowing } from './exploration'
import { calculateLightRadius } from '../lighting'

// ============================================================================
// TYPES
// ============================================================================

/** Combat evaluation result */
export interface CombatEvaluation {
  /** Can we win this fight? */
  canWin: boolean
  /** Estimated turns to kill target */
  turnsToKill: number
  /** Estimated damage we'll take */
  expectedDamage: number
  /** Should we engage based on personality? */
  shouldEngage: boolean
  /** Threat level of the monster */
  threatLevel: number
}

/** Target selection result */
export interface TargetSelection {
  target: Monster
  score: number
  reason: string
}

// ============================================================================
// ENGAGEMENT DECISIONS
// ============================================================================

/**
 * Decide whether to engage a specific monster
 *
 * Considers:
 * - Our HP vs damage we'll take
 * - Personality aggression
 * - Number of nearby enemies
 * - Escape routes available
 */
export function shouldEngage(
  game: GameState,
  monster: Monster,
  config: PersonalityConfig
): boolean {
  const character = game.character
  const evaluation = evaluateCombat(character, monster)

  // Always fight if monster is adjacent and we can't escape
  if (isAdjacent(character.position, monster.position)) {
    const escapeRoutes = countEscapeRoutes(game, character.position)
    if (escapeRoutes === 0) {
      return true // Cornered, must fight
    }
  }

  // Check HP threshold based on personality
  const hpRatio = character.hp / character.maxHp
  const cautionThreshold = config.caution / 100

  // Don't engage if HP is below caution threshold
  if (hpRatio < cautionThreshold) {
    return false
  }

  // Check if we can win without dying
  if (!evaluation.canWin) {
    // Only aggressive personalities fight losing battles
    return config.aggression > 70
  }

  // Will we survive the fight?
  const hpAfterFight = character.hp - evaluation.expectedDamage
  if (hpAfterFight <= 0) {
    return false // Would die
  }

  // Check aggression vs threat
  // High aggression = engage even dangerous monsters
  // Low aggression = only engage weak monsters
  const aggressionThreshold = 100 - config.aggression
  if (evaluation.threatLevel > aggressionThreshold) {
    return false
  }

  return true
}

/**
 * Evaluate a potential combat encounter
 *
 * @param character - The player character
 * @param monster - The monster to evaluate
 * @param classProfile - Optional class profile for ranged damage calculation
 * @param distance - Distance to monster (default 1 for adjacent)
 */
function evaluateCombat(
  character: Character,
  monster: Monster,
  classProfile?: ClassBehaviorProfile,
  distance: number = 1
): CombatEvaluation {
  const template = monster.template

  // Calculate turns to kill - use effective damage if class profile provided
  const playerDamage = classProfile
    ? getEffectiveDamage(character, classProfile, distance)
    : Math.max(character.combat.meleeDamage, 1)
  const turnsToKill = Math.ceil(monster.hp / playerDamage)

  // Calculate expected damage we'll take (percentage-based armor reduction)
  const monsterDamage = estimateDamageAfterArmor(getAverageDamage(template), character)
  const expectedDamage = monsterDamage * turnsToKill

  // Can we win?
  const canWin = character.hp > expectedDamage

  // Threat level (0-100)
  // Based on damage potential and HP
  const threatLevel = Math.min(
    100,
    Math.floor(
      (monsterDamage / character.maxHp) * 100 +
        (turnsToKill > 3 ? 20 : 0) +
        (monster.isAwake ? 10 : 0)
    )
  )

  // Should engage (basic heuristic)
  const shouldEngage = canWin && threatLevel < 50

  return {
    canWin,
    turnsToKill,
    expectedDamage,
    shouldEngage,
    threatLevel,
  }
}

// ============================================================================
// TARGET SELECTION
// ============================================================================

/**
 * Select the best target from visible monsters
 *
 * Scoring factors are gated by targeting capability level:
 * - L0: Attack closest monster only
 * - L1: + Low HP bonus, + can-win bonus
 * - L2: + Awake bonus, + threat penalty, + distance penalty
 * - L3: Full scoring (use selectTargetForClass for ranged bonuses)
 */
export function selectTarget(
  context: BotContext,
  adjacentOnly: boolean = false
): TargetSelection | null {
  const { game, config } = context
  const character = game.character
  const pos = character.position

  // Get targeting level from capabilities
  const effective = getEffectiveCapabilities(context)
  const targetingLevel = effective.targeting

  // Get candidate monsters
  let candidates = context.visibleMonsters.filter((m) => m.hp > 0)

  if (adjacentOnly) {
    candidates = candidates.filter((m) => isAdjacent(pos, m.position))
  }

  if (candidates.length === 0) {
    return null
  }

  // L0: Attack closest monster only (no scoring)
  if (targetingLevel === 0) {
    const closest = findClosestMonster(candidates, pos)
    if (!closest) return null
    return {
      target: closest.monster,
      score: 0,
      reason: 'closest',
    }
  }

  // L1+: Use scoring system with progressive factors
  let bestTarget: Monster | null = null
  let bestScore = -Infinity
  let bestReason = ''

  for (const monster of candidates) {
    const evaluation = evaluateCombat(character, monster)
    const distance = chebyshevDistance(pos, monster.position)

    // Base score from ease of kill (lower turns = higher score)
    let score = 100 - evaluation.turnsToKill * 10

    // L1+: Bonus for low HP (secure the kill)
    const hpPercent = monster.hp / monster.maxHp
    score += (1 - hpPercent) * 30

    // L1+: Bonus if we can definitely win
    if (evaluation.canWin) {
      score += 25
    }

    // L2+: Bonus for being adjacent
    if (targetingLevel >= 2 && distance === 1) {
      score += 50
    }

    // L2+: Bonus for awake monsters (they're coming for us anyway)
    if (targetingLevel >= 2 && monster.isAwake) {
      score += 20
    }

    // L2+: Penalty for high threat (unless aggressive)
    if (targetingLevel >= 2) {
      const threatPenalty = evaluation.threatLevel * (1 - config.aggression / 100)
      score -= threatPenalty
    }

    // L2+: Penalty for distance
    if (targetingLevel >= 2) {
      score -= distance * 5
    }

    let reason = ''
    if (distance === 1) {
      reason = 'adjacent'
    } else if (hpPercent < 0.3) {
      reason = 'low HP'
    } else if (monster.isAwake) {
      reason = 'awake'
    } else {
      reason = 'hunting'
    }

    if (score > bestScore) {
      bestScore = score
      bestTarget = monster
      bestReason = reason
    }
  }

  if (!bestTarget) {
    return null
  }

  return {
    target: bestTarget,
    score: bestScore,
    reason: bestReason,
  }
}

/**
 * Select target with class-aware scoring
 *
 * Requires targeting level 3 for full class-specific bonuses:
 * - For ranged classes: bonus for optimal range (3-4), penalty for adjacent (-30)
 * - For melee classes: keep current adjacent bonus (+50)
 *
 * At lower targeting levels, falls back to selectTarget behavior.
 */
export function selectTargetForClass(
  context: BotContext,
  classProfile: ClassBehaviorProfile,
  adjacentOnly: boolean = false
): TargetSelection | null {
  const { game, config } = context
  const character = game.character
  const pos = character.position

  // Get targeting level from capabilities
  const effective = getEffectiveCapabilities(context)
  const targetingLevel = effective.targeting

  // L0-L2: Fall back to non-class-aware selection
  if (targetingLevel < 3) {
    return selectTarget(context, adjacentOnly)
  }

  // L3: Full class-aware scoring
  // Get candidate monsters
  let candidates = context.visibleMonsters.filter((m) => m.hp > 0)

  if (adjacentOnly) {
    candidates = candidates.filter((m) => isAdjacent(pos, m.position))
  }

  if (candidates.length === 0) {
    return null
  }

  const optimalRange = classProfile.engageDistance || 3
  const bowRange = getBowRange(character)

  let bestTarget: Monster | null = null
  let bestScore = -Infinity
  let bestReason = ''

  for (const monster of candidates) {
    const distance = chebyshevDistance(pos, monster.position)
    const evaluation = evaluateCombat(character, monster, classProfile, distance)

    // Base score from ease of kill (lower turns = higher score)
    let score = 100 - evaluation.turnsToKill * 10

    // Class-aware distance scoring (L3 only)
    if (classProfile.prefersRanged && character.equipment.bow) {
      // Ranged class scoring
      if (distance >= optimalRange && distance <= bowRange) {
        // At optimal shooting range
        score += 40
      } else if (distance >= 2 && distance <= bowRange) {
        // Can shoot but not optimal
        score += 20
      } else if (distance === 1) {
        // Adjacent - bad for ranged classes
        score -= 30
      }
    } else {
      // Melee class scoring - prefer adjacent
      if (distance === 1) {
        score += 50
      }
    }

    // Bonus for awake monsters (they're coming for us anyway)
    if (monster.isAwake) {
      score += 20
    }

    // Bonus for low HP (secure the kill)
    const hpPercent = monster.hp / monster.maxHp
    score += (1 - hpPercent) * 30

    // Penalty for high threat (unless aggressive)
    const threatPenalty = evaluation.threatLevel * (1 - config.aggression / 100)
    score -= threatPenalty

    // Penalty for distance (reduced for ranged classes at good range)
    if (classProfile.prefersRanged && distance >= 2 && distance <= bowRange) {
      score -= distance * 2 // Reduced penalty when can shoot
    } else {
      score -= distance * 5
    }

    // Bonus if we can definitely win
    if (evaluation.canWin) {
      score += 25
    }

    let reason = ''
    if (classProfile.prefersRanged && distance >= 2 && distance <= bowRange) {
      reason = 'in range'
    } else if (distance === 1) {
      reason = 'adjacent'
    } else if (hpPercent < 0.3) {
      reason = 'low HP'
    } else if (monster.isAwake) {
      reason = 'awake'
    } else {
      reason = 'hunting'
    }

    if (score > bestScore) {
      bestScore = score
      bestTarget = monster
      bestReason = reason
    }
  }

  if (!bestTarget) {
    return null
  }

  return {
    target: bestTarget,
    score: bestScore,
    reason: bestReason,
  }
}

/**
 * Find adjacent monster to attack (quick check)
 */
export function findAdjacentMonster(game: GameState): Monster | null {
  const pos = game.character.position
  const adjacent = getAdjacentPositions(pos)

  for (const adj of adjacent) {
    const monster = game.monsters.find(
      (m) => m.position.x === adj.x && m.position.y === adj.y && m.hp > 0
    )
    if (monster) {
      return monster
    }
  }

  return null
}

/**
 * Count adjacent monsters (for outnumbered check)
 */
export function countAdjacentMonsters(game: GameState, pos: Point): number {
  const adjacent = getAdjacentPositions(pos)
  let count = 0

  for (const adj of adjacent) {
    if (isMonsterAt(game.monsters, adj)) count++
  }

  return count
}

/**
 * Check if we're outnumbered
 */
export function isOutnumbered(game: GameState): boolean {
  const adjacentCount = countAdjacentMonsters(game, game.character.position)
  return adjacentCount >= 2
}

/**
 * Find closest monster from a list
 * Returns both the monster and distance, or null if list is empty or all dead
 */
export function findClosestMonster(
  monsters: Monster[],
  pos: Point
): { monster: Monster; distance: number } | null {
  let closest: Monster | null = null
  let closestDist = Infinity

  for (const monster of monsters) {
    if (monster.hp <= 0) continue
    const dist = chebyshevDistance(pos, monster.position)
    if (dist < closestDist) {
      closestDist = dist
      closest = monster
    }
  }

  return closest ? { monster: closest, distance: closestDist } : null
}

/**
 * Get distance to closest monster (convenience wrapper)
 */
export function getClosestMonsterDistance(monsters: Monster[], pos: Point): number {
  const result = findClosestMonster(monsters, pos)
  return result ? result.distance : Infinity
}

// ============================================================================
// EFFECTIVE DAMAGE CALCULATION
// ============================================================================

/**
 * Get effective damage based on class profile and distance
 *
 * For ranged classes with a bow at distance >= 2, use ranged damage.
 * For caster classes without melee preference, estimate spell damage.
 * Otherwise fall back to melee damage.
 */
export function getEffectiveDamage(
  character: Character,
  classProfile: ClassBehaviorProfile,
  distance: number = 1
): number {
  // Ranged classes use bow at distance
  if (classProfile.prefersRanged && character.equipment.bow && distance >= 2) {
    return Math.max(character.combat.rangedDamage, 1)
  }

  // Caster classes: estimate spell damage if they prefer ranged but not melee
  // This means they're spell-focused, not bow-focused
  if (classProfile.prefersRanged && !classProfile.prefersMelee && !character.equipment.bow) {
    const spellDamage = estimateCasterDamage(character)
    if (spellDamage > character.combat.meleeDamage) {
      return spellDamage
    }
  }

  return Math.max(character.combat.meleeDamage, 1)
}

/**
 * Estimate average spell damage for a caster.
 * Used for danger calculations - casters kill faster with spells than melee.
 *
 * Uses a simplified formula based on INT and level, plus spell power from staff.
 */
function estimateCasterDamage(character: Character): number {
  // Base: assume average damage spell does 2d6 (7 average)
  const baseDamage = 7

  // INT modifier (every 2 points above 10)
  const intMod = Math.floor((character.stats.int - 10) / 2)

  // Level scaling (level / 3)
  const levelBonus = Math.floor(character.level / 3)

  let damage = baseDamage + intMod + levelBonus

  // Apply spell power from staff
  const weapon = character.equipment.weapon
  if (weapon?.template.spellPower) {
    damage = Math.floor(damage * (1 + weapon.template.spellPower / 100))
  }

  return Math.max(damage, 1)
}

// ============================================================================
// COMBAT STATE
// ============================================================================

/**
 * Check if we're currently in combat
 */
export function isInCombat(game: GameState): boolean {
  return countAdjacentMonsters(game, game.character.position) > 0
}

/**
 * Estimate if we're winning the current fight
 * Returns positive if winning, negative if losing
 */
export function getCombatAdvantage(game: GameState): number {
  const character = game.character
  const adjacentMonsters = game.monsters.filter(
    (m) => isAdjacent(character.position, m.position) && m.hp > 0
  )

  if (adjacentMonsters.length === 0) {
    return 100 // Not in combat, we're "winning"
  }

  // Sum up expected damage from all adjacent monsters
  let totalThreat = 0
  let _totalTurnsToKill = 0

  for (const monster of adjacentMonsters) {
    const eval_ = evaluateCombat(character, monster)
    totalThreat += eval_.expectedDamage
    _totalTurnsToKill += eval_.turnsToKill
  }

  // Advantage = our HP buffer vs expected damage
  const hpBuffer = character.hp - totalThreat
  const advantage = (hpBuffer / character.maxHp) * 100

  return advantage
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Count escape routes (walkable adjacent tiles without monsters)
 */
function countEscapeRoutes(game: GameState, pos: Point): number {
  const adjacent = getAdjacentPositions(pos)
  let routes = 0

  for (const adj of adjacent) {
    // Check if tile is walkable
    const tile = getTile(game.currentLevel, adj.x, adj.y)
    if (!tile || !isWalkable(tile)) continue

    // Check if not occupied by monster
    if (!isMonsterAt(game.monsters, adj)) {
      routes++
    }
  }

  return routes
}

// ============================================================================
// RANGED COMBAT HELPERS
// ============================================================================

/**
 * Check if character has a ranged weapon equipped
 */
export function hasRangedWeapon(game: GameState): boolean {
  return game.character.equipment.bow != null // Handles both null and undefined
}

/**
 * Find best target for ranged attack
 *
 * Prefers targets at optimal range (2-4 tiles) that we can hit
 */
export function findBestRangedTarget(game: GameState, visibleMonsters: Monster[]): Monster | null {
  const character = game.character
  const pos = character.position
  const bowRange = getBowRange(character)

  if (bowRange === 0) return null

  let bestTarget: Monster | null = null
  let bestScore = -Infinity

  for (const monster of visibleMonsters) {
    if (monster.hp <= 0) continue

    // Check if we can hit this target
    if (!canRangedAttack(character, monster.position)) continue

    const dx = Math.abs(monster.position.x - pos.x)
    const dy = Math.abs(monster.position.y - pos.y)
    const distance = Math.max(dx, dy)

    // Score based on:
    // - Optimal range (3-4 tiles = highest)
    // - Lower HP = easier kill
    // - Threat level
    let score = 100

    // Range bonus: prefer 3-4 tiles, penalty for 2 or 5+
    if (distance >= 3 && distance <= 4) {
      score += 20
    } else if (distance === 2) {
      score += 10
    } else {
      score -= (distance - 4) * 5
    }

    // HP bonus: prefer low HP targets
    const hpPercent = monster.hp / monster.maxHp
    score += (1 - hpPercent) * 30

    // Awake monsters are more urgent
    if (monster.isAwake) {
      score += 15
    }

    if (score > bestScore) {
      bestScore = score
      bestTarget = monster
    }
  }

  return bestTarget
}

/**
 * Find best position to kite from (maintain distance while able to attack)
 *
 * Returns a direction to move to maintain optimal range from enemies.
 * For bow users: uses bow range as max attack distance.
 * For casters: uses vision range (can cast at anything visible).
 */
export function findKitePosition(
  game: GameState,
  targetMonster: Monster,
  optimalRange: number
): Direction | null {
  const character = game.character
  const pos = character.position
  const targetPos = targetMonster.position

  const currentDx = targetPos.x - pos.x
  const currentDy = targetPos.y - pos.y
  const currentDist = Math.max(Math.abs(currentDx), Math.abs(currentDy))

  // Calculate effective max range: bow range for archers, light radius for casters
  const bowRange = getBowRange(character)
  const effectiveMaxRange =
    bowRange > 0 ? bowRange : calculateLightRadius(character, game.character.depth)

  // If engageDistance > what we can see, cap it at what we can actually hit
  const actualOptimal = Math.min(optimalRange, effectiveMaxRange)

  // If we're at good range (>= desired optimal, within attack range), no need to move
  if (currentDist >= actualOptimal && currentDist <= effectiveMaxRange) {
    return null
  }

  // Need to move away from the monster
  const adjacent = getAdjacentPositions(pos)
  let bestDirection: Direction | null = null
  let bestScore = -Infinity

  for (const adj of adjacent) {
    const tile = getTile(game.currentLevel, adj.x, adj.y)
    if (!tile) continue
    if (!isWalkable(tile) && tile.type !== 'door_closed') continue

    // Skip if occupied by monster
    if (isMonsterAt(game.monsters, adj)) continue

    // Calculate new distance to target
    const newDx = targetPos.x - adj.x
    const newDy = targetPos.y - adj.y
    const newDist = Math.max(Math.abs(newDx), Math.abs(newDy))

    // Score this position
    let score = 0

    // Prefer positions closer to optimal range
    const distFromOptimal = Math.abs(newDist - optimalRange)
    score = 100 - distFromOptimal * 20

    // Bonus if we can still attack from this position
    if (newDist >= 2 && newDist <= effectiveMaxRange) {
      score += 50
    }

    // Bonus for moving away when too close
    if (currentDist < optimalRange && newDist > currentDist) {
      score += 30
    }

    // Calculate direction
    const dx = adj.x - pos.x
    const dy = adj.y - pos.y
    const direction = getDirectionFromDelta(dx, dy)
    if (!direction) continue

    if (score > bestScore) {
      bestScore = score
      bestDirection = direction
    }
  }

  return bestDirection
}

/**
 * Check if we should avoid melee based on class profile
 */
export function shouldAvoidMelee(classProfile: ClassBehaviorProfile, distance: number): boolean {
  // Ranged classes should avoid adjacent (distance 1) if possible
  if (classProfile.prefersRanged && distance <= 1) {
    return true
  }
  return false
}

// ============================================================================
// GOAL CREATION (combat domain)
// ============================================================================

/**
 * Get optimal kiting range based on level.
 * L2: standard 3-tile distance. L3: class-tuned engageDistance.
 * Only called for L2+; L0/L1 don't actively reposition.
 */
function getOptimalRange(kitingLevel: number, classEngageDistance: number): number {
  if (kitingLevel >= 3) return classEngageDistance
  return 3 // L2 default
}

/**
 * Get KITE goal - proactive ranged combat positioning.
 * For ranged classes with a bow equipped:
 * - distance < optimal → KITE goal to reposition away
 * - distance == optimal (within shooting range) → KITE goal to shoot from here
 * - distance > bowRange → return null (let KILL approach to optimal range)
 *
 * This is the primary combat goal for ranged classes, evaluated BEFORE KILL.
 * Gated by kiting capability level - L0 disables kiting entirely.
 */
export function getKiteGoal(context: BotContext): BotGoal | null {
  const { game, botState, classProfile, visibleMonsters } = context
  const character = game.character
  const pos = character.position

  // Only for ranged classes (bow users or ranged casters)
  if (!classProfile.prefersRanged) return null
  if (visibleMonsters.length === 0) return null

  // GATE: Kiting capability check
  const effective = getEffectiveCapabilities(context)
  const kitingLevel = effective.kiting
  if (kitingLevel === 0) return null // L0: no kiting, fight melee

  // Determine if bow user or ranged caster
  const hasBow = hasRangedWeapon(game)
  const isRangedCaster = !hasBow // prefersRanged but no bow = caster

  // Determine effective range: bow range for archers, or use engageDistance for casters
  const effectiveRange = hasBow ? getBowRange(character) : 10 // Casters can hit anything visible

  // Find closest visible monster to evaluate positioning
  const closest = findClosestMonster(visibleMonsters, pos)
  if (!closest) return null

  const closestMonster = closest.monster
  const closestDist = closest.distance

  // Track how long we've been kiting the same target (persists across goal re-evaluations).
  // Give up after MAX_KITE_DURATION turns to prevent infinite kiting of unkillable monsters.
  const MAX_KITE_DURATION = 100
  const primaryTarget = closestMonster.id
  if (botState.kiteTargetId !== primaryTarget) {
    botState.kiteTargetId = primaryTarget
    botState.kiteTargetStartTurn = game.turn
  }
  const kiteDuration = game.turn - botState.kiteTargetStartTurn
  if (kiteDuration > MAX_KITE_DURATION) {
    botState.kiteTargetId = null // Reset so we can kite again on a new level
    // Escape valve: ascend to get away from unkillable monster
    const stairsUp = botState.knownStairsUp ?? game.currentLevel.stairsUp
    if (stairsUp && game.character.depth > 1) {
      return {
        type: 'ASCEND_TO_FARM',
        target: stairsUp,
        targetId: null,
        reason: `Abandoning unkillable ${closestMonster.template.name} — ascending`,
        startTurn: game.turn,
      }
    }
    // No stairs up known or at depth 1 — just release the KITE goal
    return null
  }

  // L1: Ranged stance — attack at range, but NO repositioning (zero CB risk)
  // Only Case 3 (at range → attack). If too close, let melee handle it.
  if (kitingLevel === 1) {
    if (closestDist < 2) return null // Too close, let melee handle

    // Attack from current position if in range
    const target = findBestRangedTarget(game, visibleMonsters)
    if (target) {
      // Bow users: already kiting this target from range — release so bot can explore/descend
      if (
        hasBow &&
        botState.currentGoal?.type === 'KITE' &&
        botState.currentGoal.targetId === target.id
      ) {
        return null
      }
      if (hasBow ? canRangedAttack(character, target.position) : true) {
        return {
          type: 'KITE',
          // Bow: stay in place (prevents oscillation). Caster: approach to melee if needed.
          target: hasBow ? pos : target.position,
          targetId: target.id,
          reason: `${isRangedCaster ? 'Casting at' : 'Shooting'} ${target.template.name} at range`,
          startTurn: game.turn,
        }
      }
    }
    return null
  }

  // L2/L3: Full active kiting with repositioning
  const optimalRange = getOptimalRange(kitingLevel, classProfile.engageDistance || 3)

  // Case 1: Too far - let KILL goal handle approach (only for bow users)
  // Casters can always cast if they can see the target
  if (hasBow && closestDist > effectiveRange) {
    return null
  }

  // Case 2: Too close - need to kite away (same for bow and casters)
  if (closestDist < optimalRange) {
    const kiteDirection = findKitePosition(game, closestMonster, optimalRange)

    if (kiteDirection) {
      // Calculate the position we'd move to
      const dx =
        kiteDirection === 'e' || kiteDirection === 'ne' || kiteDirection === 'se'
          ? 1
          : kiteDirection === 'w' || kiteDirection === 'nw' || kiteDirection === 'sw'
            ? -1
            : 0
      const dy =
        kiteDirection === 's' || kiteDirection === 'se' || kiteDirection === 'sw'
          ? 1
          : kiteDirection === 'n' || kiteDirection === 'ne' || kiteDirection === 'nw'
            ? -1
            : 0
      const newPos = { x: pos.x + dx, y: pos.y + dy }

      return {
        type: 'KITE',
        target: newPos,
        targetId: closestMonster.id,
        reason: `Kiting away from ${closestMonster.template.name} (dist ${closestDist})`,
        startTurn: game.turn,
      }
    }

    // Can't kite away - if not adjacent, attack from current position
    if (closestDist >= 2) {
      // Bow users: already kiting this target — release so bot can explore/descend
      if (
        hasBow &&
        botState.currentGoal?.type === 'KITE' &&
        botState.currentGoal.targetId === closestMonster.id
      ) {
        return null
      }
      // For bow users, check canRangedAttack; for casters, any visible target is valid
      if (hasBow ? canRangedAttack(character, closestMonster.position) : true) {
        return {
          type: 'KITE',
          // Bow: stay in place. Caster: approach to melee if needed.
          target: hasBow ? pos : closestMonster.position,
          targetId: closestMonster.id,
          reason: `${isRangedCaster ? 'Casting at' : 'Shooting'} ${closestMonster.template.name} (can't kite)`,
          startTurn: game.turn,
        }
      }
    }

    // Adjacent and can't kite - let melee handle it
    return null
  }

  // Case 3: At or beyond optimal range - attack!
  // Find best target (might be different from closest)
  const target = findBestRangedTarget(game, visibleMonsters)
  if (target) {
    // Bow users: already kiting this target from range — release so bot can explore/descend
    if (
      hasBow &&
      botState.currentGoal?.type === 'KITE' &&
      botState.currentGoal.targetId === target.id
    ) {
      return null
    }
    // For bow users, verify line of sight; for casters, any visible target works
    if (hasBow ? canRangedAttack(character, target.position) : true) {
      return {
        type: 'KITE',
        // Bow: stay in place (prevents oscillation). Caster: approach to melee if needed.
        target: hasBow ? pos : target.position,
        targetId: target.id,
        reason: `${isRangedCaster ? 'Casting at' : 'Shooting'} ${target.template.name} at range`,
        startTurn: game.turn,
      }
    }
  }

  return null
}

/**
 * Get KILL goal - hunt monsters.
 *
 * Creates KILL goals for:
 * 1. Adjacent monsters (always, for any class)
 * 2. Close monsters within engagement range (bypass shouldEngage for nearby threats)
 * 3. Distant monsters if shouldEngage approves
 *
 * For ranged classes: Don't create KILL goal if already at shooting range.
 * Let KITE handle shooting - KILL is for approaching distant targets.
 */
export function getKillGoal(context: BotContext, hpRatio: number): BotGoal | null {
  const { game, config, botState, visibleMonsters, classProfile } = context
  const pos = game.character.position
  const character = game.character

  // Check for adjacent monster first (always attack, any class)
  const adjacentMonster = findAdjacentMonster(game)
  if (adjacentMonster) {
    // Exit corridor-following mode when in combat
    resetCorridorFollowing(botState)
    return {
      type: 'KILL',
      target: adjacentMonster.position,
      targetId: adjacentMonster.id,
      reason: 'Adjacent monster',
      startTurn: game.turn,
    }
  }

  // For ranged classes with a bow: check if we should let KITE handle this
  if (classProfile.prefersRanged && hasRangedWeapon(game) && visibleMonsters.length > 0) {
    const bowRange = getBowRange(character)

    // Find distance to closest visible monster
    const closestDist = getClosestMonsterDistance(visibleMonsters, pos)

    // If already within shooting range (dist >= 2 and <= bowRange), let KITE handle it
    if (closestDist >= 2 && closestDist <= bowRange) {
      return null // KITE goal will handle shooting
    }
  }

  // For close monsters (within 4 tiles), always create KILL goal to approach
  // This prevents the "stuck at distance 2" bug where bot won't close the gap
  // Exception: critically low HP (< 25%) should still flee instead
  const CLOSE_ENGAGEMENT_RANGE = 4
  if (visibleMonsters.length > 0 && hpRatio >= 0.25) {
    const closest = findClosestMonster(visibleMonsters, pos)

    // If monster is close, engage without shouldEngage check
    // For ranged classes, this means approaching to get in range
    if (closest && closest.distance <= CLOSE_ENGAGEMENT_RANGE) {
      resetCorridorFollowing(botState)
      return {
        type: 'KILL',
        target: closest.monster.position,
        targetId: closest.monster.id,
        reason: `Engaging nearby ${closest.monster.template.name}`,
        startTurn: game.turn,
      }
    }
  }

  // For distant monsters, use full shouldEngage evaluation
  // Use class-aware target selection for better scoring
  const targetSelection = classProfile.prefersRanged
    ? selectTargetForClass(context, classProfile, false)
    : selectTarget(context, false)
  if (!targetSelection) return null

  // Check if we should engage this target
  if (!shouldEngage(game, targetSelection.target, config)) {
    return null
  }

  // Exit corridor-following mode when hunting
  resetCorridorFollowing(botState)

  return {
    type: 'KILL',
    target: targetSelection.target.position,
    targetId: targetSelection.target.id,
    reason: `Hunting ${targetSelection.target.template.name} (${targetSelection.reason})`,
    startTurn: game.turn,
  }
}
