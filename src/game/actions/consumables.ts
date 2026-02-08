/**
 * Consumable Action Handlers for Borglike
 *
 * Handles item use (potions, scrolls, etc.) using structured item data.
 */

import type { GameState, ActionResult, Item } from '../types'
import { randomInt } from '../rng'
import { calculateLightRadius } from '../lighting'
import { getTile, isWalkable, findOpenPosition, computeFOV } from '../dungeon'
import {
  addStatusEffect,
  addTempResistance,
  clearPoison,
  removeStatusEffect,
  removeAllDebuffs,
} from '../status-effects'
import { createTownPortal, enterTown, isInTown } from '../town'
import { addTaggedMessage, BASE_ENERGY_COST, getHealAmount } from './helpers'
import { handleAscend } from './movement'
import { incrementStat } from '../stats-helpers'

// ============================================================================
// TYPES
// ============================================================================

/** Effect handler for consumables */
type ConsumableEffect = (game: GameState, item: Item) => EffectResult

/** Result of applying an effect */
interface EffectResult {
  success: boolean
  message?: string
  /** If true, don't consume the item */
  preventConsume?: boolean
}

// ============================================================================
// POTION EFFECTS
// ============================================================================

/** Resistance duration for temp resistance potions */
const RESISTANCE_DURATION = 40
const RESISTANCE_VALUE = 50

/**
 * Apply potion effects using structured item data
 * No more string parsing - all data comes from ItemTemplate fields
 */
function applyPotionEffect(game: GameState, item: Item): EffectResult {
  const template = item.template
  const character = game.character
  const messages: string[] = []
  let isHealingPotion = false
  let isBuffPotion = false

  // 1. Apply healing
  if (template.healBase !== undefined || template.healPerLevel !== undefined) {
    let healAmount = getHealAmount(template, character.level)
    // RACIAL: Hobbit "Second Breakfast" - +25% potion healing
    if (character.raceId === 'hobbit') {
      healAmount = Math.floor(healAmount * 1.25)
    }
    const oldHp = character.hp
    character.hp = Math.min(character.hp + healAmount, character.maxHp)
    const actualHeal = character.hp - oldHp
    game.stats.healingBySource.potions += actualHeal
    isHealingPotion = true
    messages.push('You feel better')
  }

  // 2. Cure status effects
  if (template.curesAll) {
    const removed = removeAllDebuffs(character)
    clearPoison(character)
    if (removed.length > 0) {
      messages.push('your ailments fade')
    }
  } else if (template.cures && template.cures.length > 0) {
    // All curable statuses are now proper StatusEffectTypes (including 'poisoned')
    for (const status of template.cures) {
      removeStatusEffect(character, status)
    }
  }

  // 3. Apply buff
  if (template.buff) {
    const duration = randomInt(template.buff.durationMin, template.buff.durationMax)
    addStatusEffect(character, {
      type: template.buff.type,
      turnsRemaining: duration,
      value: template.buff.value,
    })
    isBuffPotion = true
    switch (template.buff.type) {
      case 'speed':
        messages.push('you feel yourself moving faster')
        break
      case 'heroism':
        messages.push('you feel like a hero')
        break
      case 'berserk':
        messages.push('you feel a berserker rage')
        break
    }
  }

  // 4. Grant temporary resistance
  if (template.grantsResistance) {
    addTempResistance(character, {
      type: template.grantsResistance,
      turnsRemaining: RESISTANCE_DURATION,
      value: RESISTANCE_VALUE,
    })
    const resistName = template.grantsResistance.toLowerCase()
    messages.push(`you feel resistant to ${resistName}`)
  }

  // 5. Restore mana
  if (template.restoresMana) {
    character.mp = character.maxMp
    messages.push('your mana is restored')
  }

  // Track consumable usage
  if (isHealingPotion) {
    game.stats.consumablesUsed.healingPotions++
  }
  if (isBuffPotion) {
    game.stats.consumablesUsed.buffPotions++
  }

  // Build message
  let message: string
  if (messages.length === 0) {
    message = `You drink the ${template.name}.`
  } else if (messages.length === 1) {
    message = `You drink the ${template.name}. ${capitalize(messages[0]!)}!`
  } else {
    const last = messages.pop()!
    message = `You drink the ${template.name}. ${capitalize(messages.join(', '))} and ${last}!`
  }

  return { success: true, message }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ============================================================================
// SCROLL EFFECTS
// ============================================================================

/** Registry of scroll effects by keyword in effect description */
const SCROLL_EFFECTS: Array<{
  match: (effect: string) => boolean
  apply: ConsumableEffect
}> = [
  // Town Portal scroll
  {
    match: (e) => e.includes('Opens portal to town'),
    apply: (game) => {
      // Cannot use in town
      if (isInTown(game)) {
        return { success: false, message: 'Cannot use Town Portal in town', preventConsume: true }
      }
      // Cannot use if portal already active
      if (game.townPortal) {
        return { success: false, message: 'A portal is already active', preventConsume: true }
      }
      // Create portal and enter town
      game.townPortal = createTownPortal(game)
      enterTown(game)
      // Note: Message handled by applyScrollEffect wrapper with tagged message
      return { success: true, message: 'You open a portal to town!' }
    },
  },

  // Teleport Level - go UP one level (escape scroll)
  // Changed from going down to going up - makes it useful as an emergency escape
  {
    match: (e) => e.includes('Teleport') && e.includes('adjacent dungeon level'),
    apply: (game) => {
      const newDepth = game.character.depth - 1
      if (newDepth >= 1) {
        handleAscend(game)
        return { success: true, message: 'You feel yourself yanked upward!' }
      } else {
        // Already at depth 1, can't go higher
        return { success: true, message: 'You read the scroll, but nothing happens.' }
      }
    },
  },

  // Phase Door - short range teleport (10 squares)
  {
    match: (e) => e.includes('Teleport') && e.includes('10 squares'),
    apply: (game, item) => {
      const attempts = 20
      let newPos = { ...game.character.position }
      for (let i = 0; i < attempts; i++) {
        const dx = randomInt(-10, 10)
        const dy = randomInt(-10, 10)
        const testX = game.character.position.x + dx
        const testY = game.character.position.y + dy
        const tile = getTile(game.currentLevel, testX, testY)
        if (tile && isWalkable(tile)) {
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist <= 10 && dist > 0) {
            newPos = { x: testX, y: testY }
            break
          }
        }
      }
      game.character.position = newPos
      const lightRadius = calculateLightRadius(game.character, game.character.depth)
      computeFOV(game.currentLevel, newPos, lightRadius)
      return { success: true, message: `You read the ${item.template.name}. You blink!` }
    },
  },

  // Full teleport - random location
  {
    match: (e) => e.includes('Teleport') && e.includes('random location'),
    apply: (game, item) => {
      const newPos = findOpenPosition(game.currentLevel)
      game.character.position = newPos
      const lightRadius = calculateLightRadius(game.character, game.character.depth)
      computeFOV(game.currentLevel, newPos, lightRadius)
      return { success: true, message: `You read the ${item.template.name}. You teleport!` }
    },
  },

  // Default teleport (fallback)
  {
    match: (e) => e.includes('Teleport') && !e.includes('adjacent'),
    apply: (game, item) => {
      const newPos = findOpenPosition(game.currentLevel)
      game.character.position = newPos
      const lightRadius = calculateLightRadius(game.character, game.character.depth)
      computeFOV(game.currentLevel, newPos, lightRadius)
      return { success: true, message: `You read the ${item.template.name}. You teleport!` }
    },
  },

  // Detect Stairs - reveals only the stairs location
  {
    match: (e) => e.includes('Reveals stairs'),
    apply: (game, item) => {
      const stairs = game.currentLevel.stairsDown
      if (stairs) {
        const tile = getTile(game.currentLevel, stairs.x, stairs.y)
        if (tile && !tile.explored) {
          tile.explored = true
          const idx = stairs.y * game.currentLevel.width + stairs.x
          game.currentLevel.explored[idx] = 1
          game.currentLevel.exploredCount++
          if (game.currentLevel.passable[idx]) game.currentLevel.exploredPassableCount++
        }
      }
      return {
        success: true,
        message: `You read the ${item.template.name}. You sense the way down!`,
      }
    },
  },

  // Magic Mapping
  {
    match: (e) => e.includes('Magic Mapping') || e.includes('reveal level'),
    apply: (game, item) => {
      let newlyExplored = 0
      for (let y = 0; y < game.currentLevel.height; y++) {
        const row = game.currentLevel.tiles[y]
        if (row) {
          for (let x = 0; x < game.currentLevel.width; x++) {
            const tile = row[x]
            if (tile && !tile.explored) {
              tile.explored = true
              const idx = y * game.currentLevel.width + x
              game.currentLevel.explored[idx] = 1
              newlyExplored++
              if (game.currentLevel.passable[idx]) game.currentLevel.exploredPassableCount++
            }
          }
        }
      }
      game.currentLevel.exploredCount += newlyExplored
      return {
        success: true,
        message: `You read the ${item.template.name}. The level is revealed!`,
      }
    },
  },

  // Enchant Weapon
  {
    match: (e) => e.includes('+1') && e.includes('weapon'),
    apply: (game) => {
      const weapon = game.character.equipment.weapon
      if (weapon) {
        weapon.enchantment += 1
        return {
          success: true,
          message: `Your ${weapon.template.name} glows! (+${weapon.enchantment})`,
        }
      } else {
        return { success: false, message: 'You have no weapon equipped.', preventConsume: true }
      }
    },
  },

  // Enchant Armour
  {
    match: (e) => e.includes('+1') && e.includes('armor'),
    apply: (game) => {
      const armor = game.character.equipment.armor
      if (armor) {
        armor.enchantment += 1
        return {
          success: true,
          message: `Your ${armor.template.name} glows! (+${armor.enchantment})`,
        }
      } else {
        return { success: false, message: 'You have no armor equipped.', preventConsume: true }
      }
    },
  },

  // Blessing scroll (+5 to hit, +5 AC)
  {
    match: (e) => e.includes('+5 to hit') && e.includes('+5 AC'),
    apply: (game) => {
      const duration = randomInt(6, 17)
      addStatusEffect(game.character, { type: 'blessing', turnsRemaining: duration, value: 5 })
      return { success: true, message: 'You feel righteous!' }
    },
  },

  // Protection from Evil
  {
    match: (e) => e.includes('Protection from evil'),
    apply: (game) => {
      const duration = randomInt(24, 47)
      addStatusEffect(game.character, { type: 'protection', turnsRemaining: duration, value: 50 })
      return { success: true, message: 'You feel protected from evil!' }
    },
  },
]

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle item use (potions, scrolls, etc.)
 */
export function handleUse(game: GameState, itemId: string): ActionResult {
  const itemIndex = game.character.inventory.findIndex((i) => i.id === itemId)

  if (itemIndex < 0) {
    return { success: false, message: 'You do not have that item.', energyCost: 0 }
  }

  const item = game.character.inventory[itemIndex]!

  // Check if item is consumable
  if (item.template.type !== 'potion' && item.template.type !== 'scroll') {
    return { success: false, message: 'You cannot use that item.', energyCost: 0 }
  }

  const effect = item.template.effect || ''
  const template = item.template

  // VAMPIRE RESTRICTION: Cannot drink healing potions (use structured data)
  if (
    game.character.raceId === 'vampire' &&
    template.type === 'potion' &&
    (template.healBase !== undefined || template.healPerLevel !== undefined)
  ) {
    return {
      success: false,
      message: 'Vampires cannot drink healing potions.',
      energyCost: 0,
    }
  }

  // GOLEM RESTRICTION: Cannot use scrolls (no magic)
  if (game.character.raceId === 'golem' && template.type === 'scroll') {
    return {
      success: false,
      message: 'Golems cannot use scrolls.',
      energyCost: 0,
    }
  }

  // Apply effect based on item type
  let result: EffectResult | null = null

  if (template.type === 'potion') {
    // Use structured potion data
    result = applyPotionEffect(game, item)
  } else if (template.type === 'scroll') {
    // Find matching scroll effect
    for (const handler of SCROLL_EFFECTS) {
      if (handler.match(effect)) {
        result = handler.apply(game, item)
        break
      }
    }

    // Default scroll message if no specific handler
    if (!result) {
      result = { success: true, message: `You read the ${item.template.name}.` }
    }
  }

  // Handle result
  if (!result) {
    return { success: false, message: 'Unknown item effect.', energyCost: 0 }
  }

  if (!result.success && result.preventConsume) {
    if (result.message) {
      addTaggedMessage(game, result.message, 'info', { tags: ['interaction'], importance: 1 })
    }
    return { success: false, message: result.message, energyCost: 0 }
  }

  // Show message - determine tags based on item type and result
  if (result.message) {
    // Determine appropriate tags based on consumable type
    const isPotion = template.type === 'potion'
    const isHealingPotion =
      isPotion && (template.healBase !== undefined || template.healPerLevel !== undefined)
    const isBuffItem =
      isPotion && template.buff !== undefined && template.healBase === undefined && !isHealingPotion

    if (isHealingPotion) {
      addTaggedMessage(game, result.message, 'good', { tags: ['healing'], importance: 3 })
    } else if (isBuffItem || template.grantsResistance) {
      addTaggedMessage(game, result.message, 'good', { tags: ['buff'], importance: 3 })
    } else if (template.type === 'scroll' && effect.includes('Opens portal')) {
      addTaggedMessage(game, result.message, 'good', { tags: ['progress'], importance: 3 })
    } else if (template.type === 'scroll' && effect.includes('Teleport')) {
      addTaggedMessage(game, result.message, 'good', { tags: ['buff'], importance: 3 })
    } else if (template.type === 'scroll' && effect.includes('+1')) {
      addTaggedMessage(game, result.message, 'good', { tags: ['buff'], importance: 3 })
    } else {
      addTaggedMessage(game, result.message, result.success ? 'good' : 'info', {
        tags: ['buff'],
        importance: 3,
      })
    }
  }

  // Remove item from inventory if consumed
  if (!result.preventConsume) {
    game.character.inventory.splice(itemIndex, 1)

    // Track scroll usage
    if (template.type === 'scroll') {
      incrementStat(game.stats.consumablesUsed.scrolls, template.name, 1)
    }
  }

  return { success: true, energyCost: BASE_ENERGY_COST }
}
