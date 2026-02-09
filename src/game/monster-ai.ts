/**
 * Monster Spawning and AI
 *
 * Handles monster spawning, AI decision making, detection, movement,
 * and the speed/energy system for turn-based combat.
 */

import type {
  Monster,
  Point,
  DungeonLevel,
  GameState,
  GameAction,
  GameEvent,
  MonsterTemplate,
  Direction,
  GameMessage,
  UniqueState,
  MessageTag,
  MessageImportance,
} from './types'
import { MAX_DEPTH, getDirectionFromDelta, DIRECTION_VECTORS } from './types'
import { randomInt, random } from './rng'
import { applyDamage } from './combat'
import { getEffectiveStats } from './modifiers'
import { checkSecondWind } from './status-effects'
import { getKnowledgeBonuses } from './knowledge-effects'
import { getSpawnableMonsters, getMonsterByName, VICTORY_BOSS_NAME } from './data/index'
import {
  findPath,
  findOpenPositions,
  isWalkable,
  getTile,
  getAdjacentPositions,
  distance,
} from './dungeon'
import { resolveMonsterAttacks, formatMonsterAttackMessage } from './monster-combat'
import { shouldCastSpell, executeMonsterSpell } from './monster-spells'
import { damageMinionById } from './minion-ai'
import { rollDice } from './dice'
import { incrementStat, checkCloseCall } from './stats-helpers'

// ============================================================================
// UNIQUE ID GENERATION
// ============================================================================

let monsterIdCounter = 0

/**
 * Generate a unique monster ID
 */
function generateMonsterId(): string {
  return `monster_${++monsterIdCounter}`
}

/**
 * Reset the monster ID counter (useful for testing)
 */
export function resetMonsterIdCounter(): void {
  monsterIdCounter = 0
}

// ============================================================================
// MONSTER SPAWNING
// ============================================================================

/**
 * Spawn a monster from a template at a given position
 *
 * @param template - The monster template to spawn from
 * @param position - The position to spawn the monster at
 * @param hpPercent - HP modifier (100 = normal, 50 = half HP)
 * @returns A new Monster instance
 */
export function spawnMonster(template: MonsterTemplate, position: Point, hpPercent = 100): Monster {
  const adjustedHp = Math.max(1, Math.floor((template.hp * hpPercent) / 100))
  return {
    id: generateMonsterId(),
    template,
    hp: adjustedHp,
    maxHp: adjustedHp,
    position: { ...position },
    energy: 0,
    isAwake: false,
    seen: false,
    debuffs: [],
    buffs: [],
  }
}

/**
 * Spawn monsters for a dungeon level based on depth
 *
 * Monster count scales with depth: 5 + floor(depth / 2)
 * Monsters are placed at random open positions, avoiding stairs.
 * Uniques that have already spawned this run are filtered out.
 *
 * @param level - The dungeon level to spawn monsters on
 * @param depth - The dungeon depth (affects monster count and types)
 * @param hpPercent - HP modifier (100 = normal, 50 = half HP)
 * @param uniqueState - Optional unique tracking state (filters already-spawned uniques)
 * @returns Array of spawned monsters
 */
export function spawnMonstersForLevel(
  level: DungeonLevel,
  depth: number,
  hpPercent = 100,
  uniqueState?: UniqueState
): Monster[] {
  const monsters: Monster[] = []
  const monsterCount = 5 + Math.floor(depth / 2)

  // Get available monster templates for this depth
  let templates = getSpawnableMonsters(depth)

  // Filter out uniques that have been killed this run (killed uniques don't respawn)
  if (uniqueState) {
    templates = templates.filter((t) => {
      if (t.flags?.includes('UNIQUE') && uniqueState.killed.has(t.name)) {
        return false
      }
      return true
    })
  }

  if (templates.length === 0) {
    return monsters
  }

  // Find open positions, excluding stairs
  const allOpenPositions = findOpenPositions(level, monsterCount + 10)
  const validPositions = allOpenPositions.filter((pos) => {
    const tile = getTile(level, pos.x, pos.y)
    if (!tile) return false
    // Exclude stair tiles
    return tile.type !== 'stairs_up' && tile.type !== 'stairs_down'
  })

  // Spawn monsters at available positions
  const spawnCount = Math.min(monsterCount, validPositions.length)
  for (let i = 0; i < spawnCount; i++) {
    // Pick a random template (weighted toward common monsters at depth)
    const template = pickRandomTemplate(templates)
    const pos = validPositions[i]
    if (template && pos) {
      const monster = spawnMonster(template, pos, hpPercent)
      monsters.push(monster)

      // Track unique spawns (for getLivingUniques - uniques currently alive in the run)
      if (uniqueState && template.flags?.includes('UNIQUE')) {
        uniqueState.spawned.add(template.name)
      }
    }
  }

  // Spawn boss on max depth (respawns on revisit, but not if killed)
  if (depth === MAX_DEPTH) {
    const bossAlreadyKilled = uniqueState?.killed.has(VICTORY_BOSS_NAME)
    if (!bossAlreadyKilled) {
      const bossTemplate = getMonsterByName(VICTORY_BOSS_NAME)
      if (bossTemplate) {
        const bossPos = findOpenPositions(level, 1)[0]
        if (bossPos) {
          const boss = spawnMonster(bossTemplate, bossPos, hpPercent)
          monsters.push(boss)
          if (uniqueState) {
            uniqueState.spawned.add(VICTORY_BOSS_NAME)
          }
        }
      }
    }
  }

  return monsters
}

/**
 * Pick a random monster template, weighted by rarity
 *
 * Uses template.rarity (default 1.0) as spawn weight.
 * Lower rarity = rarer spawn. Uniques typically have 0.1-0.15 rarity.
 *
 * @param templates - Available templates to choose from
 * @returns A randomly selected template based on weighted probability
 */
function pickRandomTemplate(templates: MonsterTemplate[]): MonsterTemplate | null {
  if (templates.length === 0) return null

  // Calculate total weight
  let totalWeight = 0
  for (const t of templates) {
    totalWeight += t.rarity ?? 1.0
  }

  // Pick random value in weight range
  let roll = random() * totalWeight
  for (const t of templates) {
    const weight = t.rarity ?? 1.0
    roll -= weight
    if (roll <= 0) {
      return t
    }
  }

  // Fallback (shouldn't reach here)
  return templates[templates.length - 1] ?? null
}

// ============================================================================
// DETECTION & AWARENESS
// ============================================================================

/**
 * Check if a monster can see/detect the player
 *
 * Uses distance check based on monster's hearing range (derived from template).
 * Also performs a simple line-of-sight check.
 *
 * @param monster - The monster checking detection
 * @param playerPos - The player's position
 * @param level - The dungeon level
 * @returns True if the monster can detect the player
 */
export function canSeePlayer(monster: Monster, playerPos: Point, level: DungeonLevel): boolean {
  // Base detection range from monster speed (faster = more alert)
  // Normal speed (110) gives range of 8, faster monsters see further
  const baseRange = Math.floor(monster.template.speed / 10) - 3
  const detectionRange = Math.max(5, baseRange)

  // Check distance first (hearing)
  const dist = distance(monster.position, playerPos)
  if (dist > detectionRange) {
    return false
  }

  // Perform line-of-sight check using Bresenham's algorithm
  return hasLineOfSight(monster.position, playerPos, level)
}

/**
 * Check line of sight between two points using Bresenham's algorithm
 *
 * @param from - Starting position
 * @param to - Target position
 * @param level - The dungeon level
 * @returns True if there's a clear line of sight
 */
export function hasLineOfSight(from: Point, to: Point, level: DungeonLevel): boolean {
  let x0 = from.x
  let y0 = from.y
  const x1 = to.x
  const y1 = to.y

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    // Don't check the start or end positions for blocking
    if ((x0 !== from.x || y0 !== from.y) && (x0 !== to.x || y0 !== to.y)) {
      const tile = getTile(level, x0, y0)
      if (!tile || tile.type === 'wall' || tile.type === 'door_closed') {
        return false
      }
    }

    if (x0 === x1 && y0 === y1) break

    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }

  return true
}

/**
 * Wake nearby monsters when the player makes noise (combat, etc.)
 *
 * @param monsters - All monsters on the level
 * @param playerPos - The player's position
 * @param radius - The noise radius
 */
export function wakeNearbyMonsters(monsters: Monster[], playerPos: Point, radius: number): void {
  for (const monster of monsters) {
    if (!monster.isAwake) {
      const dist = distance(monster.position, playerPos)
      if (dist <= radius) {
        monster.isAwake = true
      }
    }
  }
}

// ============================================================================
// AI DECISION MAKING
// ============================================================================

/**
 * Decide what action a monster should take
 *
 * Decision priority:
 * 1. If asleep and player in detection range, wake up
 * 2. If adjacent to player, attack
 * 3. If can see player, move toward player
 * 4. Otherwise, wander randomly
 *
 * @param monster - The monster making a decision
 * @param game - The current game state
 * @returns The action to take, or null to wait
 */
export function decideAction(monster: Monster, game: GameState): GameAction | null {
  const playerPos = game.character.position

  // If asleep, check if we should wake up (player or minion in sight)
  if (!monster.isAwake) {
    let shouldWake = canSeePlayer(monster, playerPos, game.currentLevel)
    if (!shouldWake) {
      // Also wake if any minion is visible
      for (const minion of game.minions) {
        if (minion.hp > 0 && canSeePlayer(monster, minion.position, game.currentLevel)) {
          shouldWake = true
          break
        }
      }
    }
    if (shouldWake) {
      monster.isAwake = true
    } else {
      return null // Stay asleep
    }
  }

  // Find nearest target (player or minion)
  const target = findNearestTarget(monster, game)
  if (!target) return { type: 'wait' }

  // Check if adjacent to target (can attack)
  if (isAdjacentTo(monster.position, target.position)) {
    if (target.isMinion && target.minionId) {
      return { type: 'attack', targetId: target.minionId }
    }
    return { type: 'attack', targetId: game.character.id }
  }

  // Try to move toward target if we can see them
  if (canSeePlayer(monster, target.position, game.currentLevel)) {
    const movePos = findMoveTowardPlayer(monster, target.position, game.currentLevel, game.monsters)
    if (movePos) {
      const direction = getDirectionToward(monster.position, movePos)
      if (direction) {
        return { type: 'move', direction }
      }
    }
  }

  // Wander randomly
  const randomMove = findRandomMove(monster, game.currentLevel, game.monsters)
  if (randomMove) {
    const direction = getDirectionToward(monster.position, randomMove)
    if (direction) {
      return { type: 'move', direction }
    }
  }

  // No valid action, wait
  return { type: 'wait' }
}

/**
 * Check if two positions are adjacent (including diagonals)
 *
 * @param a - First position
 * @param b - Second position
 * @returns True if adjacent
 */
function isAdjacentTo(a: Point, b: Point): boolean {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  return dx <= 1 && dy <= 1 && (dx > 0 || dy > 0)
}

/**
 * Find the nearest valid target (player or minion) for a monster.
 * Prefers minion on tie (makes minions useful as tanks).
 */
function findNearestTarget(
  monster: Monster,
  game: GameState
): { position: Point; isMinion: boolean; minionId?: string } | null {
  const playerPos = game.character.position
  const playerDist = distance(monster.position, playerPos)

  // Find nearest alive minion
  let nearestMinion: { position: Point; id: string; dist: number } | null = null
  for (const minion of game.minions) {
    if (minion.hp <= 0) continue
    const dist = distance(monster.position, minion.position)
    if (!nearestMinion || dist < nearestMinion.dist) {
      nearestMinion = { position: minion.position, id: minion.id, dist }
    }
  }

  // Prefer minion on tie (tank value)
  if (nearestMinion && nearestMinion.dist <= playerDist) {
    return { position: nearestMinion.position, isMinion: true, minionId: nearestMinion.id }
  }

  return { position: playerPos, isMinion: false }
}

/**
 * Get the direction from one point toward another
 *
 * @param from - Starting position
 * @param to - Target position
 * @returns The direction, or null if same position
 */
function getDirectionToward(
  from: Point,
  to: Point
): 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (dx === 0 && dy === 0) return null

  // Normalize to -1, 0, or 1
  const nx = dx === 0 ? 0 : dx > 0 ? 1 : -1
  const ny = dy === 0 ? 0 : dy > 0 ? 1 : -1

  // Use shared utility function (excludes 'wait' from possible returns)
  const dir = getDirectionFromDelta(nx, ny)
  return dir === 'wait' ? null : dir
}

// ============================================================================
// MOVEMENT
// ============================================================================

/**
 * Find the next move position toward the player
 *
 * Uses A* pathfinding but avoids tiles occupied by other monsters.
 *
 * @param monster - The monster looking to move
 * @param playerPos - The player's position
 * @param level - The dungeon level
 * @param monsters - All monsters (to avoid collisions)
 * @returns The next position to move to, or null if no path
 */
export function findMoveTowardPlayer(
  monster: Monster,
  playerPos: Point,
  level: DungeonLevel,
  monsters: Monster[]
): Point | null {
  // Get the full path
  const path = findPath(level, monster.position, playerPos)

  // Path includes start position, so we want the second element
  if (path.length < 2) {
    return null
  }

  const nextPos: Point | undefined = path[1]
  if (!nextPos) return null

  // Check if another monster is occupying that position
  const blocked = monsters.some(
    (m) => m.id !== monster.id && m.position.x === nextPos!.x && m.position.y === nextPos!.y
  )

  if (blocked) {
    // Try to find an alternative adjacent move that gets us closer
    return findAlternativeMove(monster, playerPos, level, monsters) ?? null
  }

  return nextPos!
}

/**
 * Find an alternative move when the primary path is blocked
 *
 * @param monster - The monster looking to move
 * @param playerPos - The player's position
 * @param level - The dungeon level
 * @param monsters - All monsters (to avoid collisions)
 * @returns An alternative position, or null
 */
function findAlternativeMove(
  monster: Monster,
  playerPos: Point,
  level: DungeonLevel,
  monsters: Monster[]
): Point | null {
  const adjacent = getAdjacentPositions(monster.position)
  const currentDist = distance(monster.position, playerPos)

  // Find walkable, unoccupied positions that get us closer
  const validMoves = adjacent.filter((pos) => {
    const tile = getTile(level, pos.x, pos.y)
    if (!tile || !isWalkable(tile)) return false

    // Check for monster collision
    const occupied = monsters.some(
      (m) => m.id !== monster.id && m.position.x === pos.x && m.position.y === pos.y
    )
    if (occupied) return false

    // Must get us closer to the player
    return distance(pos, playerPos) < currentDist
  })

  if (validMoves.length === 0) return null

  // Pick the one that gets us closest
  validMoves.sort((a, b) => distance(a, playerPos) - distance(b, playerPos))
  return validMoves[0] ?? null
}

/**
 * Find a random adjacent walkable tile for wandering
 *
 * @param monster - The monster looking to wander
 * @param level - The dungeon level
 * @param monsters - All monsters (to avoid collisions)
 * @returns A random walkable position, or null if none available
 */
export function findRandomMove(
  monster: Monster,
  level: DungeonLevel,
  monsters: Monster[]
): Point | null {
  const adjacent = getAdjacentPositions(monster.position)

  // Filter to walkable, unoccupied positions
  const validMoves = adjacent.filter((pos) => {
    const tile = getTile(level, pos.x, pos.y)
    if (!tile || !isWalkable(tile)) return false

    // Check for monster collision
    const occupied = monsters.some(
      (m) => m.id !== monster.id && m.position.x === pos.x && m.position.y === pos.y
    )
    return !occupied
  })

  if (validMoves.length === 0) return null

  // Pick a random valid move
  const index = randomInt(0, validMoves.length - 1)
  return validMoves[index] ?? null
}

// ============================================================================
// SPEED/ENERGY SYSTEM
// ============================================================================

/**
 * Base energy threshold for taking an action
 */
const ENERGY_THRESHOLD = 100

/**
 * Get a monster's effective speed after buffs/debuffs
 *
 * Calculates actual speed considering:
 * - Base template speed
 * - Slow debuff (reduces speed by percentage)
 * - Haste buff (increases speed by percentage)
 *
 * Used by bot AI to detect fast/hasted monsters for slowing.
 */
export function getMonsterEffectiveSpeed(monster: Monster): number {
  let speed = monster.template.speed

  // Apply slow debuff (reduces speed)
  const slowDebuff = monster.debuffs.find((d) => d.type === 'slow')
  if (slowDebuff) {
    speed = Math.floor((speed * (100 - slowDebuff.value)) / 100)
  }

  // Apply haste buff (increases speed)
  const hasteBuff = monster.buffs.find((b) => b.type === 'haste')
  if (hasteBuff) {
    speed = Math.floor((speed * (100 + hasteBuff.value)) / 100)
  }

  return speed
}

/**
 * Update a monster's energy based on its speed
 *
 * Energy accumulates each game turn based on the monster's speed.
 * When energy reaches the threshold (100), the monster can act.
 *
 * Speed values:
 * - 100 = slow (gains 100 energy per turn, acts every turn at threshold)
 * - 110 = normal (gains 110 energy per turn)
 * - 120 = fast (gains 120 energy per turn, sometimes acts twice)
 *
 * @param monster - The monster to update
 * @returns True if the monster has enough energy to act
 */
export function updateMonsterEnergy(monster: Monster): boolean {
  const effectiveSpeed = getMonsterEffectiveSpeed(monster)
  monster.energy += effectiveSpeed

  if (monster.energy >= ENERGY_THRESHOLD) {
    monster.energy -= ENERGY_THRESHOLD
    return true
  }

  return false
}

/**
 * Tick down monster debuffs, removing expired ones
 *
 * @param monster - The monster to tick debuffs for
 */
export function tickMonsterDebuffs(monster: Monster): void {
  monster.debuffs = monster.debuffs.filter((debuff) => {
    debuff.turnsRemaining--
    return debuff.turnsRemaining > 0
  })
}

/**
 * Tick down monster buffs, removing expired ones
 *
 * @param monster - The monster to tick buffs for
 */
export function tickMonsterBuffs(monster: Monster): void {
  monster.buffs = monster.buffs.filter((buff) => {
    buff.turnsRemaining--
    return buff.turnsRemaining > 0
  })
}

/**
 * Reset a monster's energy (e.g., after spawning or special effects)
 *
 * @param monster - The monster to reset
 */
export function resetMonsterEnergy(monster: Monster): void {
  monster.energy = 0
}

/**
 * Check if a monster can currently act (has enough energy)
 *
 * @param monster - The monster to check
 * @returns True if the monster has enough energy
 */
export function canMonsterAct(monster: Monster): boolean {
  return monster.energy >= ENERGY_THRESHOLD
}

// ============================================================================
// MONSTER TURN PROCESSING
// ============================================================================

/** Base energy cost for actions (100 = 1 turn) */
const BASE_ENERGY_COST = 100

/** Energy gained per game tick based on speed */
const ENERGY_PER_TICK = 100

/**
 * Add a tagged message to the game log
 */
function addTaggedMessage(
  game: GameState,
  text: string,
  type: GameMessage['type'],
  options?: { tags?: MessageTag[]; importance?: MessageImportance }
): void {
  game.messages.push({
    turn: game.turn,
    text,
    type,
    tags: options?.tags,
    importance: options?.importance,
  })
  if (game.messages.length > 100) game.messages.shift()
}

/**
 * Process all monster turns
 *
 * Uses energy/speed system where faster monsters act more often
 */
export function processMonsterTurns(game: GameState): GameEvent[] {
  const events: GameEvent[] = []

  // Get player's effective speed (including status effects like haste/slow)
  const playerSpeed = getEffectiveStats(game.character).speed

  for (const monster of game.monsters) {
    const effectiveSpeed = getMonsterEffectiveSpeed(monster)

    // Add energy based on monster speed, scaled by player speed
    // Player speed > 100 (e.g., hasted) means monsters act relatively slower
    monster.energy += Math.floor((effectiveSpeed / 110) * ENERGY_PER_TICK * (100 / playerSpeed))

    // Process actions while monster has enough energy
    while (monster.energy >= BASE_ENERGY_COST && !game.character.isDead) {
      monster.energy -= BASE_ENERGY_COST

      // Get AI decision and execute
      const monsterAction = getMonsterAction(game, monster)

      if (monsterAction) {
        const monsterEvents = executeMonsterAction(game, monster, monsterAction)
        events.push(...monsterEvents)
      }
    }

    // Tick debuffs and buffs at end of monster's turn
    tickMonsterDebuffs(monster)
    tickMonsterBuffs(monster)
  }

  return events
}

/**
 * Get monster AI decision
 *
 * Uses the full monster AI module for detection, pathfinding, and decision making.
 */
function getMonsterAction(
  game: GameState,
  monster: Monster
): { type: 'move'; direction: Direction } | { type: 'attack'; targetId?: string } | null {
  // Mark monster as seen if visible to player (for UI purposes)
  const tile = getTile(game.currentLevel, monster.position.x, monster.position.y)
  if (tile?.visible && !monster.seen) {
    monster.seen = true
  }

  // Use the full monster AI decision system
  // This handles: detection, waking up, pathfinding, and attack decisions
  const action = decideAction(monster, game)

  if (!action) {
    return null
  }

  // Convert GameAction to the expected format
  if (action.type === 'attack') {
    return { type: 'attack', targetId: action.targetId }
  }

  if (action.type === 'move') {
    return { type: 'move', direction: action.direction }
  }

  return null
}

/**
 * Execute a monster action
 */
function executeMonsterAction(
  game: GameState,
  monster: Monster,
  action: { type: 'move'; direction: Direction } | { type: 'attack'; targetId?: string }
): GameEvent[] {
  const events: GameEvent[] = []

  if (action.type === 'attack') {
    // Check if targeting a minion
    if (action.targetId && action.targetId !== game.character.id) {
      const minion = game.minions.find((m) => m.id === action.targetId)
      if (minion && minion.hp > 0) {
        // Roll damage using monster's first attack dice (or fallback to 1d6)
        const attackDice = monster.template.attacks?.[0]?.dice ?? '1d6'
        let damage = Math.max(1, rollDice(attackDice))

        // Apply monster damage balance modifier
        if (game.balance.monsterDamagePercent !== 100) {
          damage = Math.max(1, Math.floor((damage * game.balance.monsterDamagePercent) / 100))
        }

        const killed = damageMinionById(game, minion.id, damage)
        addTaggedMessage(
          game,
          `The ${monster.template.name} attacks your ${minion.name} for ${damage} damage!`,
          'combat',
          { tags: ['combat.hit'], importance: 2 }
        )

        if (killed) {
          addTaggedMessage(game, `Your ${minion.name} is slain!`, 'danger', {
            tags: ['damage.taken'],
            importance: 3,
          })
        }

        events.push({
          type: 'attack',
          attackerId: monster.id,
          defenderId: minion.id,
          damage,
          killed,
        })
        return events
      }
    }

    // Check if monster should cast a spell instead of melee
    if (shouldCastSpell(monster)) {
      const spellResult = executeMonsterSpell(game, monster)
      if (spellResult.success) {
        if (spellResult.message) {
          addTaggedMessage(game, spellResult.message, 'combat', {
            tags: ['combat.hit'],
            importance: 2,
          })
        }
        if (spellResult.damage > 0) {
          // Apply monster damage balance modifier
          let damage = spellResult.damage
          if (game.balance.monsterDamagePercent !== 100) {
            damage = Math.max(1, Math.floor((damage * game.balance.monsterDamagePercent) / 100))
          }
          applyDamage(game.character, damage)
          game.stats.damageTaken += damage
          game.stats.damageByMethod.spell += damage
          incrementStat(game.stats.damageTakenByMonster, monster.template.name, damage)

          // Check for close call
          checkCloseCall(game.stats, game.character.hp, game.character.maxHp)

          // Check for Second Wind
          checkSecondWind(game, addTaggedMessage)

          // Add death message if player was killed
          if (game.character.isDead) {
            addTaggedMessage(game, `The ${monster.template.name} kills you!`, 'danger', {
              tags: ['damage.taken'],
              importance: 5,
            })
          }

          events.push({
            type: 'attack',
            attackerId: monster.id,
            defenderId: game.character.id,
            damage,
            killed: game.character.isDead,
          })
        }
        return events
      }
      // If spell failed, fall through to melee
    }

    // Compute knowledge bonuses and resolve monster melee attacks
    const knowledgeBonuses = getKnowledgeBonuses(
      monster.template.name,
      game.bestiary,
      game.balance.bestiaryBonusPercent,
      game.upgradeBonuses?.bestiaryCapPercent
    )
    const attackResult = resolveMonsterAttacks(monster, game.character, knowledgeBonuses)

    // Apply monster damage balance modifier
    let totalDamage = attackResult.totalDamage
    if (totalDamage > 0 && game.balance.monsterDamagePercent !== 100) {
      totalDamage = Math.max(1, Math.floor((totalDamage * game.balance.monsterDamagePercent) / 100))
    }

    // Format and display message
    const message = formatMonsterAttackMessage(monster.template.name, attackResult)
    addTaggedMessage(game, message, 'combat', { tags: ['combat.hit'], importance: 2 })

    // Track attacks dodged (misses from monster attacks)
    const hitCount = attackResult.hits.filter((h) => h.hit).length
    const missCount = attackResult.hits.length - hitCount
    game.stats.attacksDodged += missCount

    // Track status effects inflicted by monster attacks
    for (const status of attackResult.statusEffectsInflicted) {
      incrementStat(game.stats.statusEffectsSuffered, status, 1)
    }

    if (totalDamage > 0) {
      applyDamage(game.character, totalDamage)
      game.stats.damageTaken += totalDamage
      game.stats.damageByMethod.melee += totalDamage
      incrementStat(game.stats.damageTakenByMonster, monster.template.name, totalDamage)

      // Track physical damage (monster melee attacks are physical)
      incrementStat(game.stats.damageByElement, 'physical', totalDamage)

      // Check for close call
      checkCloseCall(game.stats, game.character.hp, game.character.maxHp)

      // Check for Second Wind booster (auto-heal when critical)
      checkSecondWind(game, addTaggedMessage)

      // Add death message if player was killed
      if (game.character.isDead) {
        addTaggedMessage(game, `The ${monster.template.name} kills you!`, 'danger', {
          tags: ['damage.taken'],
          importance: 5,
        })
      }

      events.push({
        type: 'attack',
        attackerId: monster.id,
        defenderId: game.character.id,
        damage: totalDamage,
        killed: game.character.isDead,
      })
    }
  } else if (action.type === 'move') {
    const delta = DIRECTION_VECTORS[action.direction]
    const newX = monster.position.x + delta.x
    const newY = monster.position.y + delta.y

    // Check if position is valid
    const targetTile = getTile(game.currentLevel, newX, newY)

    if (targetTile && isWalkable(targetTile)) {
      // Check if another monster is there
      const blockingMonster = game.monsters.find(
        (m) => m.id !== monster.id && m.position.x === newX && m.position.y === newY
      )

      // Check if player is there
      const playerBlocking =
        game.character.position.x === newX && game.character.position.y === newY

      if (!blockingMonster && !playerBlocking) {
        const oldPos = { ...monster.position }
        monster.position = { x: newX, y: newY }

        events.push({
          type: 'move',
          entityId: monster.id,
          from: oldPos,
          to: monster.position,
        })
      }
    }
  }

  return events
}
