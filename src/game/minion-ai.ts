/**
 * Minion AI for Borglike
 *
 * Handles minion behavior: following player, attacking enemies, and duration tracking.
 */

import type { GameState, Minion, Monster, Point, GameEvent } from './types'
import { MINION_TEMPLATES, isMonsterAt } from './types'
import { getTile, isWalkable } from './dungeon'
import { applyDamage } from './combat'
import { handleMonsterKill } from './actions/combat'
import { addTaggedMessage } from './actions'

// ============================================================================
// MINION TURN PROCESSING
// ============================================================================

/**
 * Process all minion turns
 * Called after player turn, before monster turns
 */
export function processMinionTurns(game: GameState): GameEvent[] {
  const events: GameEvent[] = []

  // Process each minion
  for (const minion of [...game.minions]) {
    // Check if temporary minion expired
    if (!minion.permanent && minion.turnsRemaining !== undefined) {
      minion.turnsRemaining--
      if (minion.turnsRemaining <= 0) {
        // Remove expired minion
        const idx = game.minions.indexOf(minion)
        if (idx >= 0) game.minions.splice(idx, 1)
        addTaggedMessage(game, `Your ${minion.name} fades away.`, 'info', {
          tags: ['buff'],
          importance: 2,
        })
        continue
      }
    }

    // Check if minion is dead
    if (minion.hp <= 0) {
      const idx = game.minions.indexOf(minion)
      if (idx >= 0) game.minions.splice(idx, 1)
      continue
    }

    // OOC regen: Pets and skeletons regen 5 HP/turn when not adjacent to enemies
    // This helps summoner classes (Ranger wolf, Necromancer skeleton) sustain their minions
    if (minion.hp < minion.maxHp) {
      const adjacentEnemy = findAdjacentEnemy(game, minion)
      if (!adjacentEnemy) {
        minion.hp = Math.min(minion.maxHp, minion.hp + 5)
      }
    }

    // Process minion action based on speed
    const template = MINION_TEMPLATES[minion.type]
    minion.energy += template.speed

    while (minion.energy >= 100) {
      minion.energy -= 100

      // Minion AI: Attack adjacent enemy, or move toward player/enemy
      const minionEvents = processSingleMinionTurn(game, minion)
      events.push(...minionEvents)
    }
  }

  return events
}

/**
 * Process a single minion's turn
 */
function processSingleMinionTurn(game: GameState, minion: Minion): GameEvent[] {
  const events: GameEvent[] = []

  // Priority 1: Attack adjacent enemy
  const adjacentEnemy = findAdjacentEnemy(game, minion)
  if (adjacentEnemy) {
    const killed = minionAttack(game, minion, adjacentEnemy)
    events.push({
      type: 'attack',
      attackerId: minion.id,
      defenderId: adjacentEnemy.id,
      damage: minion.damage,
      killed,
    })

    if (killed) {
      addTaggedMessage(
        game,
        `Your ${minion.name} kills the ${adjacentEnemy.template.name}!`,
        'good',
        {
          tags: ['combat.kill'],
          importance: 4,
        }
      )
      handleMonsterKill(game, adjacentEnemy)
    }
    return events
  }

  // Priority 2: Move toward nearest visible enemy (must be in player's FOV)
  const distToPlayer = chebyshevDistance(minion.position, game.character.position)
  const nearestEnemy = findNearestVisibleEnemy(game, minion)
  if (nearestEnemy && distToPlayer <= 5) {
    // Only chase if staying within 5 tiles of player
    const enemyDistToPlayer = chebyshevDistance(nearestEnemy.position, game.character.position)
    if (enemyDistToPlayer <= 5) {
      const moved = moveToward(game, minion, nearestEnemy.position)
      if (moved) return events
    }
  }

  // Priority 3: Follow player - stay within 2 tiles, never exceed 5
  if (distToPlayer > 2) {
    moveToward(game, minion, game.character.position)
  }

  return events
}

// ============================================================================
// MINION COMBAT
// ============================================================================

/**
 * Minion attacks a monster
 */
function minionAttack(game: GameState, minion: Minion, target: Monster): boolean {
  const damage = minion.damage
  game.stats.damageDealt += damage
  game.stats.damageBySource.minion += damage
  return applyDamage(target, damage)
}

/**
 * Find an adjacent enemy to attack
 */
function findAdjacentEnemy(game: GameState, minion: Minion): Monster | null {
  for (const monster of game.monsters) {
    if (monster.hp <= 0) continue
    const dx = Math.abs(monster.position.x - minion.position.x)
    const dy = Math.abs(monster.position.y - minion.position.y)
    if (dx <= 1 && dy <= 1 && dx + dy > 0) {
      return monster
    }
  }
  return null
}

/**
 * Find nearest visible enemy
 */
function findNearestVisibleEnemy(game: GameState, minion: Minion): Monster | null {
  let nearest: Monster | null = null
  let nearestDist = Infinity

  for (const monster of game.monsters) {
    if (monster.hp <= 0) continue
    // Check if monster is visible (in player's FOV)
    const tile = getTile(game.currentLevel, monster.position.x, monster.position.y)
    if (!tile?.visible) continue

    const dist = chebyshevDistance(minion.position, monster.position)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = monster
    }
  }

  return nearest
}

// ============================================================================
// MINION MOVEMENT
// ============================================================================

/**
 * Move minion one step toward target position
 */
function moveToward(game: GameState, minion: Minion, target: Point): boolean {
  const dx = target.x - minion.position.x
  const dy = target.y - minion.position.y

  // Determine step direction
  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1

  // Try diagonal first, then cardinal directions
  const candidates: Point[] = []
  if (stepX !== 0 && stepY !== 0) {
    candidates.push({ x: minion.position.x + stepX, y: minion.position.y + stepY })
  }
  if (stepX !== 0) {
    candidates.push({ x: minion.position.x + stepX, y: minion.position.y })
  }
  if (stepY !== 0) {
    candidates.push({ x: minion.position.x, y: minion.position.y + stepY })
  }

  for (const pos of candidates) {
    if (canMinionMoveTo(game, pos)) {
      minion.position = pos
      return true
    }
  }

  return false
}

/**
 * Check if minion can move to position
 */
function canMinionMoveTo(game: GameState, pos: Point): boolean {
  const tile = getTile(game.currentLevel, pos.x, pos.y)
  if (!tile || !isWalkable(tile)) return false

  // Check for player
  if (pos.x === game.character.position.x && pos.y === game.character.position.y) return false

  // Check for monsters
  if (isMonsterAt(game.monsters, pos)) return false

  // Check for other minions
  if (game.minions.some((m) => m.position.x === pos.x && m.position.y === pos.y && m.hp > 0)) {
    return false
  }

  return true
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Chebyshev distance (diagonal distance)
 */
function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/**
 * Handle minion taking damage (called from monster-ai when monsters attack minions)
 */
export function damageMinionById(game: GameState, minionId: string, damage: number): boolean {
  const minion = game.minions.find((m) => m.id === minionId)
  if (!minion) return false

  minion.hp -= damage
  game.stats.damageTaken += damage

  if (minion.hp <= 0) {
    const idx = game.minions.indexOf(minion)
    if (idx >= 0) game.minions.splice(idx, 1)
    addTaggedMessage(game, `Your ${minion.name} has been slain!`, 'danger', {
      tags: ['damage.taken'],
      importance: 3,
    })
    return true // Minion died
  }
  return false
}

/**
 * Get minion at a position (for monster targeting)
 */
export function getMinionAtPosition(game: GameState, pos: Point): Minion | null {
  return (
    game.minions.find((m) => m.position.x === pos.x && m.position.y === pos.y && m.hp > 0) ?? null
  )
}
