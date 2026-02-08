/**
 * Feature interaction module
 *
 * Handles interactions with dungeon features:
 * - Fountains (healing, mana, buffs)
 * - Altars (blessings, identification, enchantment)
 * - Merchants (buying/selling items)
 */

import type {
  GameState,
  DungeonLevel,
  Point,
  FountainState,
  AltarState,
  MerchantState,
  TrapState,
  Item,
  GameMessage,
  MessageTag,
  MessageImportance,
} from './types'
import { random, randomInt } from './rng'
import { getTile, findOpenPosition } from './dungeon'
import { getFountainById, getAltarById } from './data/features'
import { getMerchantById, getDialogue } from './data/merchants'
import { selectGoldPile, rollGoldValue, getDefaultGoldDrop, rollMonsterGold } from './data/gold'
import { getTrapById } from './data/traps'
import type { MonsterTemplate } from './data/monsters'
import { DEFAULT_BONUSES } from './upgrade-effects'
import { addStatusEffect, clearPoison, isPoisoned, applyPoison } from './status-effects'
import { incrementStat, checkCloseCall } from './stats-helpers'

// ============================================================================
// MESSAGE HELPERS
// ============================================================================

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
  if (game.messages.length > 100) {
    game.messages.shift()
  }
}

// ============================================================================
// FOUNTAIN INTERACTIONS
// ============================================================================

/**
 * Use a fountain at the player's current position
 */
export function useFountain(game: GameState): boolean {
  const pos = game.character.position
  const key = `${pos.x},${pos.y}`
  const fountain = game.fountains.get(key)

  if (!fountain) {
    addTaggedMessage(game, 'There is no fountain here.', 'info', {
      tags: ['interaction'],
      importance: 1,
    })
    return false
  }

  if (fountain.usesRemaining === 0) {
    addTaggedMessage(game, 'The fountain is dry.', 'info', {
      tags: ['interaction'],
      importance: 1,
    })
    return false
  }

  const char = game.character
  const template = fountain.template

  switch (template.effect) {
    case 'heal': {
      const healAmount = Math.floor((char.maxHp * template.power) / 100)
      const healed = Math.min(healAmount, char.maxHp - char.hp)
      char.hp += healed
      addTaggedMessage(game, `The ${template.name} heals you for ${healed} HP!`, 'good', {
        tags: ['healing'],
        importance: 3,
      })
      break
    }
    case 'mana': {
      const restored = Math.floor((char.maxMp * template.power) / 100)
      char.mp = Math.min(char.maxMp, char.mp + restored)
      addTaggedMessage(game, `The ${template.name} restores your mana!`, 'good', {
        tags: ['mana'],
        importance: 2,
      })
      break
    }
    case 'buff': {
      // Apply blessing status effect
      const duration = 20 + Math.floor(template.power / 2)
      addStatusEffect(char, {
        type: 'blessing',
        turnsRemaining: duration,
        value: Math.floor(template.power / 4),
      })
      addTaggedMessage(game, `You feel blessed by the ${template.name}!`, 'good', {
        tags: ['buff'],
        importance: 3,
      })
      break
    }
    case 'cure': {
      // Clear poison status
      if (isPoisoned(char)) {
        clearPoison(char)
        addTaggedMessage(
          game,
          `The ${template.name} purifies you! The poison is cleansed!`,
          'good',
          { tags: ['healing'], importance: 3 }
        )
      } else {
        addTaggedMessage(game, `The ${template.name} purifies you!`, 'good', {
          tags: ['healing'],
          importance: 3,
        })
      }
      break
    }
    case 'random': {
      applyRandomFountainEffect(game)
      break
    }
    default:
      addTaggedMessage(game, `You drink from the ${template.name}.`, 'info', {
        tags: ['interaction'],
        importance: 1,
      })
  }

  // Decrement uses
  if (fountain.usesRemaining > 0) {
    fountain.usesRemaining--
    if (fountain.usesRemaining === 0) {
      addTaggedMessage(game, 'The fountain runs dry.', 'info', {
        tags: ['interaction'],
        importance: 1,
      })
      // Mark tile as empty
      const tile = getTile(game.currentLevel, pos.x, pos.y)
      if (tile) tile.type = 'fountain_empty'
    }
  }

  return true
}

function applyRandomFountainEffect(game: GameState): void {
  const roll = random()
  const char = game.character

  if (roll < 0.25) {
    // Full heal
    char.hp = char.maxHp
    addTaggedMessage(game, 'You feel completely restored!', 'good', {
      tags: ['healing'],
      importance: 3,
    })
  } else if (roll < 0.4) {
    // Damage
    const damage = Math.floor(char.maxHp * 0.2)
    char.hp = Math.max(1, char.hp - damage)
    addTaggedMessage(game, 'The water burns! You lose ' + damage + ' HP!', 'danger', {
      tags: ['damage.taken'],
      importance: 3,
    })
  } else if (roll < 0.55) {
    // Gold
    const gold = randomInt(50, 199)
    char.gold += gold
    game.stats.goldCollected += gold
    addTaggedMessage(game, `You find ${gold} gold coins in the water!`, 'good', {
      tags: ['loot.gold'],
      importance: 2,
    })
  } else if (roll < 0.7) {
    // Mana restore
    char.mp = char.maxMp
    addTaggedMessage(game, 'Your mana is fully restored!', 'good', {
      tags: ['mana'],
      importance: 2,
    })
  } else if (roll < 0.85) {
    // Small heal
    const heal = Math.floor(char.maxHp * 0.3)
    char.hp = Math.min(char.maxHp, char.hp + heal)
    addTaggedMessage(game, `You feel refreshed. Healed ${heal} HP.`, 'good', {
      tags: ['healing'],
      importance: 3,
    })
  } else {
    // Nothing
    addTaggedMessage(game, 'The water tastes stale. Nothing happens.', 'info', {
      tags: ['interaction'],
      importance: 1,
    })
  }
}

/**
 * Check if player is standing on a usable fountain
 */
export function isOnFountain(game: GameState): boolean {
  const pos = game.character.position
  const key = `${pos.x},${pos.y}`
  const fountain = game.fountains.get(key)
  return fountain !== undefined && fountain.usesRemaining > 0
}

/**
 * Get fountain at position
 */
export function getFountainAt(game: GameState, pos: Point): FountainState | null {
  const key = `${pos.x},${pos.y}`
  return game.fountains.get(key) ?? null
}

// ============================================================================
// ALTAR INTERACTIONS
// ============================================================================

/**
 * Find altar adjacent to player
 */
export function findAdjacentAltar(game: GameState): AltarState | null {
  const pos = game.character.position

  for (const altar of game.altars.values()) {
    const dx = Math.abs(altar.position.x - pos.x)
    const dy = Math.abs(altar.position.y - pos.y)
    if (dx <= 1 && dy <= 1) {
      return altar
    }
  }

  return null
}

/**
 * Use an altar adjacent to the player
 */
export function useAltar(game: GameState): boolean {
  const altar = findAdjacentAltar(game)

  if (!altar) {
    addTaggedMessage(game, 'There is no altar nearby.', 'info', {
      tags: ['interaction'],
      importance: 1,
    })
    return false
  }

  const char = game.character
  const template = altar.template

  // Check if player can afford the cost
  if (template.cost > 0 && char.gold < template.cost) {
    addTaggedMessage(game, `The ${template.name} requires ${template.cost} gold.`, 'info', {
      tags: ['interaction'],
      importance: 1,
    })
    return false
  }

  // Deduct cost
  if (template.cost > 0) {
    char.gold -= template.cost
  }

  switch (template.effect) {
    case 'bless': {
      // Heal and buff
      char.hp = char.maxHp
      char.mp = char.maxMp
      addTaggedMessage(game, `The ${template.name} blesses you! You are fully restored.`, 'good', {
        tags: ['healing'],
        importance: 3,
      })
      break
    }
    case 'enchant': {
      // Enchant equipped weapon
      const weapon = char.equipment.weapon
      if (weapon) {
        weapon.enchantment += 1
        addTaggedMessage(
          game,
          `Your ${weapon.template.name} glows! It is now +${weapon.enchantment}!`,
          'good',
          { tags: ['buff'], importance: 3 }
        )
      } else {
        addTaggedMessage(game, 'You have no weapon to enchant.', 'info', {
          tags: ['interaction'],
          importance: 1,
        })
        // Refund
        char.gold += template.cost
      }
      break
    }
    default:
      addTaggedMessage(game, `You pray at the ${template.name}.`, 'info', {
        tags: ['interaction'],
        importance: 1,
      })
  }

  return true
}

/**
 * Check if player is standing on an altar
 */
export function isOnAltar(game: GameState): boolean {
  const pos = game.character.position
  const key = `${pos.x},${pos.y}`
  return game.altars.has(key)
}

/**
 * Get altar at position
 */
export function getAltarAt(game: GameState, pos: Point): AltarState | null {
  const key = `${pos.x},${pos.y}`
  return game.altars.get(key) ?? null
}

// ============================================================================
// MERCHANT INTERACTIONS
// ============================================================================

/**
 * Find merchant adjacent to player
 */
export function findAdjacentMerchant(game: GameState): MerchantState | null {
  const pos = game.character.position

  for (const merchant of game.merchants) {
    const dx = Math.abs(merchant.position.x - pos.x)
    const dy = Math.abs(merchant.position.y - pos.y)
    if (dx <= 1 && dy <= 1) {
      return merchant
    }
  }

  return null
}

/**
 * Buy an item from a merchant
 */
export function buyFromMerchant(
  game: GameState,
  merchantIndex: number,
  itemIndex: number
): boolean {
  const merchant = game.merchants[merchantIndex]
  if (!merchant) {
    addTaggedMessage(game, 'No merchant found.', 'info', { tags: ['interaction'], importance: 1 })
    return false
  }

  const item = merchant.inventory[itemIndex]
  if (!item) {
    addTaggedMessage(game, 'Item not available.', 'info', { tags: ['interaction'], importance: 1 })
    return false
  }

  const basePrice = item.shopPrice ?? 0
  const bonuses = game.upgradeBonuses ?? DEFAULT_BONUSES
  const price = Math.floor(basePrice * (1 - bonuses.merchantDiscount / 100))
  if (game.character.gold < price) {
    addTaggedMessage(game, getDialogue(merchant.template, 'tooExpensive'), 'info', {
      tags: ['interaction'],
      importance: 1,
    })
    return false
  }

  // Check inventory space (max 20 equipment items)
  // Consumables (potions/scrolls) are tracked separately and don't count toward this limit
  const isConsumable = item.template.type === 'potion' || item.template.type === 'scroll'
  if (!isConsumable) {
    const equipmentCount = game.character.inventory.filter(
      (i) => i.template.type !== 'potion' && i.template.type !== 'scroll'
    ).length
    if (equipmentCount >= 20) {
      addTaggedMessage(game, 'Your inventory is full!', 'info', {
        tags: ['interaction'],
        importance: 1,
      })
      return false
    }
  }

  // Transaction
  game.character.gold -= price
  merchant.gold += basePrice // Merchant receives full price
  merchant.inventory.splice(itemIndex, 1)

  // Track stats
  game.stats.goldSpent += price
  game.stats.itemsBought++

  // Remove shop price before adding to inventory
  const purchasedItem = { ...item }
  delete purchasedItem.shopPrice
  game.character.inventory.push(purchasedItem)

  addTaggedMessage(game, `Bought ${item.template.name} for ${price} gold.`, 'item', {
    tags: ['loot.item'],
    importance: 2,
  })
  addTaggedMessage(game, getDialogue(merchant.template, 'purchase'), 'info', {
    tags: ['interaction'],
    importance: 1,
  })

  return true
}

/**
 * Sell an item to a merchant
 */
export function sellToMerchant(
  game: GameState,
  merchantIndex: number,
  inventoryIndex: number
): boolean {
  const merchant = game.merchants[merchantIndex]
  if (!merchant) {
    addTaggedMessage(game, 'No merchant found.', 'info', { tags: ['interaction'], importance: 1 })
    return false
  }

  const item = game.character.inventory[inventoryIndex]
  if (!item) {
    addTaggedMessage(game, 'Invalid item.', 'info', { tags: ['interaction'], importance: 1 })
    return false
  }

  // Calculate sell price
  const baseValue = getItemValue(item)
  const baseSellPrice = Math.floor(baseValue * merchant.template.sellMultiplier)
  const bonuses = game.upgradeBonuses ?? DEFAULT_BONUSES
  const sellPrice = Math.floor(baseSellPrice * (1 + bonuses.merchantDiscount / 100))

  if (sellPrice <= 0) {
    addTaggedMessage(game, 'The merchant is not interested in that.', 'info', {
      tags: ['interaction'],
      importance: 1,
    })
    return false
  }

  if (merchant.gold < sellPrice) {
    addTaggedMessage(game, getDialogue(merchant.template, 'cantAfford'), 'info', {
      tags: ['interaction'],
      importance: 1,
    })
    return false
  }

  // Transaction
  game.character.gold += sellPrice
  merchant.gold -= baseSellPrice // Merchant pays base price
  game.character.inventory.splice(inventoryIndex, 1)

  // Track stats
  game.stats.itemsSold++

  addTaggedMessage(game, `Sold ${item.template.name} for ${sellPrice} gold.`, 'item', {
    tags: ['loot.item'],
    importance: 2,
  })
  addTaggedMessage(game, getDialogue(merchant.template, 'sell'), 'info', {
    tags: ['interaction'],
    importance: 1,
  })

  return true
}

/**
 * Get the base value of an item
 */
function getItemValue(item: Item): number {
  const template = item.template
  let value = template.tier * 50

  // Weapons and armor worth more
  if (template.type === 'weapon') {
    value *= 2
  } else if (template.type === 'armor') {
    value *= 1.5
  }

  // Enchantment adds value
  value += item.enchantment * 20

  // Artifacts are very valuable
  if (item.artifact) {
    value *= 5
  }

  return Math.floor(value)
}

// ============================================================================
// GOLD HANDLING
// ============================================================================

/**
 * Award gold from killing a monster
 */
export function awardMonsterGold(game: GameState, monster: MonsterTemplate): number {
  const drop = getDefaultGoldDrop(monster.minDepth)
  const bonuses = game.upgradeBonuses ?? DEFAULT_BONUSES
  const gold = rollMonsterGold(drop, bonuses.goldMultiplier)

  if (gold > 0) {
    game.character.gold += gold
    game.stats.goldCollected += gold
    addTaggedMessage(game, `Found ${gold} gold on the ${monster.name}.`, 'item', {
      tags: ['loot.gold'],
      importance: 2,
    })
  }

  return gold
}

/**
 * Create a gold pile item at a position
 */
export function createGoldPile(depth: number): Item | null {
  const pileTemplate = selectGoldPile(depth)
  if (!pileTemplate) return null

  const goldValue = rollGoldValue(pileTemplate, depth)

  // Create a pseudo-item for the gold pile
  const item: Item = {
    id: `gold-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    template: {
      name: pileTemplate.name,
      type: 'gold',
      tier: pileTemplate.tier,
      weight: pileTemplate.weight,
      minDepth: pileTemplate.minDepth,
    },
    enchantment: 0,
    artifact: null,
    goldTemplate: pileTemplate,
    goldValue: goldValue,
  }

  return item
}

/**
 * Pick up a gold pile
 */
export function pickupGold(game: GameState, item: Item): boolean {
  if (!item.goldValue) return false

  const bonuses = game.upgradeBonuses ?? DEFAULT_BONUSES
  const gold = Math.floor(item.goldValue * bonuses.goldMultiplier)

  game.character.gold += gold
  game.stats.goldCollected += gold
  addTaggedMessage(game, `Picked up ${gold} gold!`, 'item', { tags: ['loot.gold'], importance: 2 })

  return true
}

// ============================================================================
// INITIALIZATION HELPERS
// ============================================================================

/**
 * Initialize a fountain from vault placement data
 */
export function initializeFountain(fountainId: string, position: Point): FountainState | null {
  const template = getFountainById(fountainId)
  if (!template) return null

  return {
    template,
    position,
    usesRemaining: template.uses,
  }
}

/**
 * Initialize an altar from vault placement data
 */
export function initializeAltar(altarId: string, position: Point): AltarState | null {
  const template = getAltarById(altarId)
  if (!template) return null

  return {
    template,
    position,
  }
}

/**
 * Initialize a merchant from vault placement data
 */
export function initializeMerchant(
  merchantId: string,
  position: Point,
  depth: number,
  generateInventory: (merchantId: string, depth: number) => Item[]
): MerchantState | null {
  const template = getMerchantById(merchantId)
  if (!template) return null

  return {
    template,
    position,
    inventory: generateInventory(merchantId, depth),
    gold: template.baseGold + depth * 50,
  }
}

// ============================================================================
// TRAP INTERACTIONS
// ============================================================================

/**
 * Initialize a trap from vault placement data
 */
export function initializeTrap(trapId: string, position: Point): TrapState | null {
  const template = getTrapById(trapId)
  if (!template) return null

  return {
    template,
    position,
    revealed: false,
    triggered: false,
    rearmTurn: null,
  }
}

/**
 * Check for trap detection around the player
 * Returns true if any new traps were revealed
 */
export function checkTrapDetection(game: GameState, trapVisionBonus: number = 0): boolean {
  const pos = game.character.position
  const detectionRange = 1 + trapVisionBonus
  let anyRevealed = false

  for (const trap of game.traps.values()) {
    if (trap.revealed || trap.triggered) continue

    // Check if trap is within detection range
    const dx = Math.abs(trap.position.x - pos.x)
    const dy = Math.abs(trap.position.y - pos.y)
    const distance = Math.max(dx, dy)

    if (distance <= detectionRange) {
      // Roll detection check
      // Base detection chance = 50% - trap difficulty + (character level * 2) + (trapVisionBonus * 10)
      const baseChance =
        50 - trap.template.baseDifficulty + game.character.level * 2 + trapVisionBonus * 10
      const roll = random() * 100

      if (roll < baseChance) {
        trap.revealed = true
        anyRevealed = true
        addTaggedMessage(game, `You spot a ${trap.template.name}!`, 'danger', {
          tags: ['damage.trap'],
          importance: 3,
        })
      }
    }
  }

  return anyRevealed
}

/**
 * Trigger a trap at a position
 * Returns true if a trap was triggered
 */
export function triggerTrap(game: GameState, position: Point): boolean {
  const key = `${position.x},${position.y}`
  const trap = game.traps.get(key)

  if (!trap) return false
  if (trap.triggered && trap.rearmTurn !== null && trap.rearmTurn > game.turn) {
    return false // Trap not yet rearmed
  }

  const char = game.character
  const template = trap.template

  // Mark as triggered
  trap.triggered = true
  trap.revealed = true // Always reveal when triggered

  // Set rearm time if applicable
  if (template.rearmTurns > 0) {
    trap.rearmTurn = game.turn + template.rearmTurns
  }

  switch (template.effect) {
    case 'damage': {
      const damage = template.damage
      char.hp -= damage
      game.stats.damageTaken += damage
      game.stats.damageByMethod.trap += damage
      incrementStat(game.stats.damageByElement, 'physical', damage)
      addTaggedMessage(
        game,
        `You trigger a ${template.name}! You take ${damage} damage!`,
        'danger',
        {
          tags: ['damage.trap'],
          importance: 4,
        }
      )

      // Check for close call
      checkCloseCall(game.stats, char.hp, char.maxHp)

      // Check for death
      if (char.hp <= 0) {
        char.hp = 0
        char.isDead = true
      }
      break
    }
    case 'poison': {
      const damage = template.damage
      char.hp -= damage
      game.stats.damageTaken += damage
      game.stats.damageByMethod.trap += damage
      incrementStat(game.stats.damageByElement, 'poison', damage)
      incrementStat(game.stats.statusEffectsSuffered, 'poisoned', 1)

      // Apply lingering poison
      const damagePerTurn = Math.max(1, Math.floor(template.damage / 4))
      const turnsRemaining = 3 + Math.floor(game.character.depth / 10)
      applyPoison(char, damagePerTurn, turnsRemaining)

      addTaggedMessage(
        game,
        `A ${template.name} hits you! You take ${damage} damage and are poisoned!`,
        'danger',
        { tags: ['damage.trap'], importance: 4 }
      )

      // Check for close call
      checkCloseCall(game.stats, char.hp, char.maxHp)

      if (char.hp <= 0) {
        char.hp = 0
        char.isDead = true
      }
      break
    }
    case 'teleport': {
      const newPos = findOpenPosition(game.currentLevel)
      char.position = newPos
      addTaggedMessage(game, `You trigger a ${template.name}! You are teleported!`, 'danger', {
        tags: ['damage.trap'],
        importance: 4,
      })
      break
    }
    case 'alarm': {
      // Wake all monsters on the level
      for (const monster of game.monsters) {
        monster.isAwake = true
      }
      addTaggedMessage(
        game,
        `You trigger an ${template.name}! You hear shouts in the distance!`,
        'danger',
        { tags: ['damage.trap'], importance: 4 }
      )
      break
    }
    case 'pit': {
      const damage = template.damage
      char.hp -= damage
      game.stats.damageTaken += damage
      game.stats.damageByMethod.trap += damage
      incrementStat(game.stats.damageByElement, 'physical', damage)
      incrementStat(game.stats.statusEffectsSuffered, 'stun', 1)

      // Apply stun (1-2 turns)
      addStatusEffect(char, {
        type: 'stun',
        turnsRemaining: randomInt(1, 2),
        value: 0,
      })

      addTaggedMessage(
        game,
        `You fall into a ${template.name}! You take ${damage} damage and are stunned!`,
        'danger',
        { tags: ['damage.trap'], importance: 4 }
      )

      // Check for close call
      checkCloseCall(game.stats, char.hp, char.maxHp)

      if (char.hp <= 0) {
        char.hp = 0
        char.isDead = true
      }
      break
    }
    default:
      addTaggedMessage(game, `You trigger a trap!`, 'danger', {
        tags: ['damage.trap'],
        importance: 4,
      })
  }

  return true
}

/**
 * Check if there's a revealed trap at position
 */
export function getRevealedTrapAt(game: GameState, pos: Point): TrapState | null {
  const key = `${pos.x},${pos.y}`
  const trap = game.traps.get(key)
  if (trap && trap.revealed && !trap.triggered) {
    return trap
  }
  // Check if trap has rearmed
  if (
    trap &&
    trap.revealed &&
    trap.triggered &&
    trap.rearmTurn !== null &&
    trap.rearmTurn <= game.turn
  ) {
    trap.triggered = false // Reset for next trigger
    return trap
  }
  return null
}

/**
 * Get trap at position (revealed or not)
 */
export function getTrapAt(game: GameState, pos: Point): TrapState | null {
  const key = `${pos.x},${pos.y}`
  return game.traps.get(key) ?? null
}

// ============================================================================
// VAULT FEATURE INITIALIZATION
// ============================================================================

/**
 * Initialize features (fountains, altars, merchants, traps) from vault data
 *
 * @param level - The dungeon level with vault data
 * @param depth - Current dungeon depth
 * @param fountains - Map to populate with fountain states
 * @param altars - Map to populate with altar states
 * @param merchants - Array to populate with merchant states
 * @param traps - Map to populate with trap states
 * @param generateInventory - Function to generate merchant inventory
 */
export function initializeFeaturesFromVault(
  level: DungeonLevel,
  depth: number,
  fountains: Map<string, FountainState>,
  altars: Map<string, AltarState>,
  merchants: MerchantState[],
  traps: Map<string, TrapState>,
  generateInventory: (merchantId: string, depth: number) => Item[]
): void {
  const vault = level.vault
  if (!vault) return

  // Initialize fountains
  for (const fp of vault.fountainPositions) {
    const state = initializeFountain(fp.fountainId, { x: fp.x, y: fp.y })
    if (state) {
      fountains.set(`${fp.x},${fp.y}`, state)
    }
  }

  // Initialize altars
  for (const ap of vault.altarPositions) {
    const state = initializeAltar(ap.altarId, { x: ap.x, y: ap.y })
    if (state) {
      altars.set(`${ap.x},${ap.y}`, state)
    }
  }

  // Initialize merchants
  for (const mp of vault.merchantPositions) {
    const state = initializeMerchant(mp.merchantId, { x: mp.x, y: mp.y }, depth, generateInventory)
    if (state) {
      merchants.push(state)
    }
  }

  // Initialize traps
  for (const tp of vault.trapPositions) {
    const state = initializeTrap(tp.trapId, { x: tp.x, y: tp.y })
    if (state) {
      traps.set(`${tp.x},${tp.y}`, state)
    }
  }
}
