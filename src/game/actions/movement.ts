/**
 * Movement Action Handlers for Borglike
 *
 * Handles player movement, ascending, and descending stairs.
 */

import type {
  GameState,
  ActionResult,
  Direction,
  FountainState,
  AltarState,
  TrapState,
  DungeonLevel,
  Point,
} from '../types'
import { DIRECTION_VECTORS as DirectionVectors, MAX_DEPTH } from '../types'
import { calculateLightRadius } from '../lighting'
import {
  generateLevel,
  getTile,
  isWalkable,
  computeFOV,
  setAllTilesVisible,
  findOpenPosition,
  getAdjacentPositions,
} from '../dungeon'
import { spawnMonstersForLevel } from '../monster-ai'
import { spawnItemsForLevel, generateMerchantInventory } from '../items'
import { triggerTrap, checkTrapDetection, initializeFeaturesFromVault } from '../features'
import { touchLevelCache, evictOldLevels, LEVEL_CACHE_MAX_SIZE } from '../level-cache'
import { isInTown, initializeTown } from '../town'
import { addTaggedMessage } from './helpers'
import { handleAttack } from './combat'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base energy cost for actions (100 = 1 turn) */
export const BASE_ENERGY_COST = 100

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Find the dungeon entrance tile in a level (used for town)
 */
function findDungeonEntrance(level: DungeonLevel): Point | null {
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y]
    if (!row) continue
    for (let x = 0; x < level.width; x++) {
      const tile = row[x]
      if (tile?.type === 'dungeon_entrance') {
        return { x, y }
      }
    }
  }
  return null
}

/**
 * Teleport minions to positions adjacent to the player on level transition
 */
function teleportMinionsToPlayer(game: GameState): void {
  if (game.minions.length === 0) return

  const playerPos = game.character.position
  const adjacentPositions = getAdjacentPositions(playerPos)

  // Filter to walkable, unoccupied positions
  const validPositions: Point[] = []
  for (const pos of adjacentPositions) {
    const tile = getTile(game.currentLevel, pos.x, pos.y)
    if (!tile || !isWalkable(tile)) continue
    // Check not occupied by monster
    if (game.monsters.some((m) => m.position.x === pos.x && m.position.y === pos.y)) continue
    validPositions.push(pos)
  }

  // Place each minion in an available position
  let posIndex = 0
  for (const minion of game.minions) {
    if (posIndex < validPositions.length) {
      const pos = validPositions[posIndex]!
      minion.position = { x: pos.x, y: pos.y }
      posIndex++
    } else {
      // No room - place on player position (will move next turn)
      minion.position = { x: playerPos.x, y: playerPos.y }
    }
  }
}

// ============================================================================
// MOVEMENT
// ============================================================================

/**
 * Handle movement action
 *
 * Checks if target tile is walkable, handles bump-attack on monsters
 */
export function handleMove(game: GameState, direction: Direction): ActionResult {
  if (direction === 'wait') {
    return handleWait(game)
  }

  const delta = DirectionVectors[direction]
  const newX = game.character.position.x + delta.x
  const newY = game.character.position.y + delta.y

  // Check for monster at target position (bump attack)
  const monsterAtTarget = game.monsters.find((m) => m.position.x === newX && m.position.y === newY)

  if (monsterAtTarget) {
    return handleAttack(game, monsterAtTarget.id)
  }

  // Check if target tile is walkable
  const targetTile = getTile(game.currentLevel, newX, newY)

  if (!targetTile) {
    return { success: false, message: 'You cannot move there.', energyCost: 0 }
  }

  // Handle closed doors - open them instead of moving
  if (targetTile.type === 'door_closed') {
    targetTile.type = 'door_open'
    addTaggedMessage(game, 'You open the door.', 'info', { tags: ['interaction'], importance: 1 })
    return { success: true, energyCost: BASE_ENERGY_COST }
  }

  if (!isWalkable(targetTile)) {
    return { success: false, message: 'You cannot move there.', energyCost: 0 }
  }

  // Execute move
  game.character.position = { x: newX, y: newY }

  // Check for trap at new position
  triggerTrap(game, { x: newX, y: newY })

  // Check for trap detection nearby
  checkTrapDetection(game)

  return { success: true, energyCost: BASE_ENERGY_COST }
}

/**
 * Handle wait action
 */
export function handleWait(game: GameState): ActionResult {
  // Waiting allows HP/MP regen (simplified)
  if (game.character.hp < game.character.maxHp) {
    const regenAmount = Math.max(1, Math.floor(game.character.maxHp * 0.01))
    game.character.hp = Math.min(game.character.hp + regenAmount, game.character.maxHp)
  }

  return { success: true, energyCost: BASE_ENERGY_COST }
}

// ============================================================================
// STAIRS
// ============================================================================

/**
 * Handle descending stairs
 *
 * Check if on stairs down or dungeon entrance (from town), generate/load next level
 */
export function handleDescend(game: GameState): ActionResult {
  const currentTile = getTile(
    game.currentLevel,
    game.character.position.x,
    game.character.position.y
  )

  // Allow descending from stairs_down OR dungeon_entrance (town exit)
  const canDescend =
    currentTile && (currentTile.type === 'stairs_down' || currentTile.type === 'dungeon_entrance')

  if (!canDescend) {
    return { success: false, message: 'There are no stairs here.', energyCost: 0 }
  }

  // From dungeon_entrance (town, depth 0), always go to depth 1
  const newDepth = currentTile?.type === 'dungeon_entrance' ? 1 : game.character.depth + 1

  if (newDepth > MAX_DEPTH) {
    return { success: false, message: 'You cannot go any deeper.', energyCost: 0 }
  }

  // NOTE: Entity caching removed - entities regenerate on level entry (Angband-style)
  // Layout is cached in levelCache, but monsters/items are freshly spawned

  // Get or generate new level
  let newLevel = game.levelCache.get(newDepth)

  if (!newLevel) {
    newLevel = generateLevel(newDepth)
    game.levelCache.set(newDepth, newLevel)
    // Evict old levels to limit memory usage
    evictOldLevels(game.levelCache, newDepth, LEVEL_CACHE_MAX_SIZE)
  } else {
    // Touch the level to mark it as recently used
    touchLevelCache(game.levelCache, newDepth)
  }

  // Update game state
  game.currentLevel = newLevel
  game.character.depth = newDepth

  // Place character at stairs up
  if (newLevel.stairsUp) {
    game.character.position = { ...newLevel.stairsUp }
  } else {
    game.character.position = findOpenPosition(newLevel)
  }

  // ENTITY REGENERATION: Always spawn fresh entities on level entry
  // Layout is cached, but monsters/items regenerate (Angband-style)
  // UniqueState ensures unique monsters don't respawn
  game.monsters = spawnMonstersForLevel(
    newLevel,
    newDepth,
    game.balance.monsterHpPercent,
    game.uniqueState
  )
  game.items = spawnItemsForLevel(
    newLevel,
    newDepth,
    game.balance.potionRatePercent,
    game.balance.enchantRatePercent,
    game.balance.itemRatePercent
  )

  // Teleport minions to follow player
  teleportMinionsToPlayer(game)

  // Reset features for level entry
  game.fountains = new Map<string, FountainState>()
  game.altars = new Map<string, AltarState>()
  game.merchants = []
  game.traps = new Map<string, TrapState>()

  // Initialize features from vault data (if vault was placed on this level)
  initializeFeaturesFromVault(
    newLevel,
    newDepth,
    game.fountains,
    game.altars,
    game.merchants,
    game.traps,
    generateMerchantInventory
  )

  // Update stats
  if (newDepth > game.stats.deepestDepth) {
    game.stats.deepestDepth = newDepth
  }

  // Update FOV (dynamic light radius)
  const lightRadius = calculateLightRadius(game.character, newDepth)
  computeFOV(newLevel, game.character.position, lightRadius)

  // Clear town-specific state when leaving town
  if (isInTown(game) || currentTile?.type === 'dungeon_entrance') {
    game.healer = null
  }

  const message =
    currentTile?.type === 'dungeon_entrance'
      ? 'You enter the dungeon.'
      : `You descend to depth ${newDepth}.`
  addTaggedMessage(game, message, 'info', { tags: ['progress'], importance: 4 })

  return { success: true, energyCost: BASE_ENERGY_COST }
}

/**
 * Handle ascending stairs
 *
 * Check if on stairs up, load previous level
 */
export function handleAscend(game: GameState): ActionResult {
  const currentTile = getTile(
    game.currentLevel,
    game.character.position.x,
    game.character.position.y
  )

  if (!currentTile || currentTile.type !== 'stairs_up') {
    return { success: false, message: 'There are no stairs here.', energyCost: 0 }
  }

  if (game.character.depth < 1) {
    return { success: false, message: 'You are already in town.', energyCost: 0 }
  }

  const newDepth = game.character.depth - 1

  // NOTE: Entity caching removed - entities regenerate on level entry (Angband-style)

  // Load previous level (or town at depth 0)
  let previousLevel = game.levelCache.get(newDepth)

  // Town (depth 0) might not be in cache if evicted - regenerate it
  if (!previousLevel && newDepth === 0) {
    previousLevel = generateLevel(0)
    game.levelCache.set(0, previousLevel)
  }

  if (!previousLevel) {
    return { success: false, message: 'Previous level not found.', energyCost: 0 }
  }

  // Touch the level to mark it as recently used (LRU)
  touchLevelCache(game.levelCache, newDepth)

  // Update game state
  game.currentLevel = previousLevel
  game.character.depth = newDepth

  // Place character: at dungeon entrance for town, at stairs down otherwise
  if (newDepth === 0) {
    // Find dungeon entrance tile in town
    const entrance = findDungeonEntrance(previousLevel)
    if (entrance) {
      game.character.position = { ...entrance }
    } else {
      game.character.position = findOpenPosition(previousLevel)
    }
  } else if (previousLevel.stairsDown) {
    game.character.position = { ...previousLevel.stairsDown }
  } else {
    game.character.position = findOpenPosition(previousLevel)
  }

  // Town (depth 0) has special initialization
  if (newDepth === 0) {
    // Town has no monsters or items
    game.monsters = []
    game.items = []

    // Initialize town features (healer, shops)
    initializeTown(game)

    // Town is always fully visible
    setAllTilesVisible(previousLevel)

    // Teleport minions to follow player
    teleportMinionsToPlayer(game)

    addTaggedMessage(game, 'You return to town.', 'info', { tags: ['progress'], importance: 4 })
  } else {
    // ENTITY REGENERATION: Always spawn fresh entities on level entry
    // Layout is cached, but monsters/items regenerate (Angband-style)
    // UniqueState ensures unique monsters don't respawn
    game.monsters = spawnMonstersForLevel(
      previousLevel,
      newDepth,
      game.balance.monsterHpPercent,
      game.uniqueState
    )
    game.items = spawnItemsForLevel(
      previousLevel,
      newDepth,
      game.balance.potionRatePercent,
      game.balance.enchantRatePercent,
      game.balance.itemRatePercent
    )

    // Teleport minions to follow player
    teleportMinionsToPlayer(game)

    // Reset features for level entry
    game.fountains = new Map<string, FountainState>()
    game.altars = new Map<string, AltarState>()
    game.merchants = []
    game.traps = new Map<string, TrapState>()

    // Initialize features from vault data (if vault was placed on this level)
    initializeFeaturesFromVault(
      previousLevel,
      newDepth,
      game.fountains,
      game.altars,
      game.merchants,
      game.traps,
      generateMerchantInventory
    )

    // Update FOV (dynamic light radius)
    const lightRadius = calculateLightRadius(game.character, newDepth)
    computeFOV(previousLevel, game.character.position, lightRadius)

    addTaggedMessage(game, `You ascend to depth ${newDepth}.`, 'info', {
      tags: ['progress'],
      importance: 4,
    })
  }

  return { success: true, energyCost: BASE_ENERGY_COST }
}
