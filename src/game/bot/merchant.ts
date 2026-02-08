/**
 * Bot Merchant Interaction
 *
 * Handles bot selling and buying at merchants (town or traveling).
 */

import type { GameState, Point } from '../types'
import type { BotGoal, BotContext, BotState } from './types'
import { findAdjacentMerchant, sellToMerchant, buyFromMerchant } from '../features'
import { countHealingPotions, findOutdatedHealingPotions, isManaDependent } from './preparation'
import { getAdjacentPositions, getTile, isWalkable } from '../dungeon'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find an adjacent walkable position to a target (for impassable features like altars)
 */
function findAdjacentWalkable(game: GameState, target: Point): Point | null {
  const adjacent = getAdjacentPositions(target)
  for (const pos of adjacent) {
    const tile = getTile(game.currentLevel, pos.x, pos.y)
    if (tile && isWalkable(tile)) {
      return pos
    }
  }
  return null
}

/**
 * Get slot priority multiplier for gear buying decisions
 * Higher priority slots = more willing to spend gold
 */
function getSlotPriority(slot: string): number {
  switch (slot) {
    case 'weapon':
      return 1.0 // Weapons are highest priority
    case 'armor':
      return 0.95 // Body armor second
    case 'shield':
      return 0.85 // Shield important for defense
    case 'helm':
      return 0.8
    case 'gloves':
      return 0.75
    case 'boots':
      return 0.75
    case 'ring':
      return 0.7
    case 'amulet':
      return 0.7
    default:
      return 0.6
  }
}

// countHealingPotions moved to preparation.ts (deduplicated)

// ============================================================================
// BOT MERCHANT ACTIONS
// ============================================================================

/**
 * Bot sells all sellable items to adjacent merchant.
 *
 * Sells:
 * 1. Equipment (weapons, armor, accessories) - not consumables
 * 2. Outdated healing potions (based on depth - T1 useless at depth 15+, etc.)
 * 3. Items explicitly marked for sale in botState.consumablesToSell
 *
 * Returns number of items sold.
 */
export function botSellItems(game: GameState, botState?: BotState): number {
  const merchant = findAdjacentMerchant(game)
  if (!merchant) return 0

  const merchantIndex = game.merchants.indexOf(merchant)
  if (merchantIndex < 0) return 0

  const depth = game.character.depth

  // Find outdated healing potions to sell
  const outdatedHealingIds = new Set(
    findOutdatedHealingPotions(game.character.inventory, depth).map((item) => item.id)
  )

  // Get items marked for sale from botState
  const markedForSale = botState?.consumablesToSell ?? new Set<string>()

  // Find sellable items
  const sellableIndices: number[] = []
  for (let i = 0; i < game.character.inventory.length; i++) {
    const item = game.character.inventory[i]
    if (!item) continue

    // Equipment (has a slot) that isn't a consumable
    const isEquipment = item.template.slot !== undefined
    const isConsumable = item.template.type === 'potion' || item.template.type === 'scroll'

    if (isEquipment && !isConsumable) {
      sellableIndices.push(i)
      continue
    }

    // Outdated healing potions
    if (outdatedHealingIds.has(item.id)) {
      sellableIndices.push(i)
      continue
    }

    // Explicitly marked for sale (tier upgrades replaced lower tier)
    if (markedForSale.has(item.id)) {
      sellableIndices.push(i)
    }
  }

  if (sellableIndices.length === 0) return 0

  // Sell items in reverse order to preserve indices
  let soldCount = 0
  for (let i = sellableIndices.length - 1; i >= 0; i--) {
    const invIndex = sellableIndices[i]!
    const item = game.character.inventory[invIndex]
    const success = sellToMerchant(game, merchantIndex, invIndex)
    if (success) {
      soldCount++
      // Clear from marked-for-sale set
      if (item && markedForSale.has(item.id)) {
        markedForSale.delete(item.id)
      }
    }
  }

  return soldCount
}

/**
 * Bot buys supplies from adjacent merchant
 *
 * Priority:
 * 1. Town Portal Scrolls (want 1-2)
 * 2. Healing potions (want 2-3)
 * 3. Phase Door / Teleport scrolls (want 2-3)
 * 4. Gear upgrades (if merchant sells equipment)
 *
 * Returns number of items bought.
 */
export function botBuySupplies(game: GameState, targetMerchantId?: string | null): number {
  // Find specific merchant by ID, or fall back to any adjacent merchant
  let merchant = targetMerchantId
    ? game.merchants.find((m) => m.template.id === targetMerchantId)
    : null
  if (!merchant) {
    merchant = findAdjacentMerchant(game)
  }
  if (!merchant) return 0

  const merchantIndex = game.merchants.indexOf(merchant)
  if (merchantIndex < 0) return 0

  // Analyze current inventory
  const inventory = game.character.inventory
  const char = game.character
  const classId = (char as { classId?: string }).classId
  const needsMana = isManaDependent(classId)

  let tpScrollCount = 0
  let healingPotionCount = 0
  let manaPotionCount = 0
  let escapeScrollCount = 0

  for (const item of inventory) {
    const template = item.template
    const effect = template.effect || ''
    const name = template.name

    if (name.includes('Town Portal')) {
      tpScrollCount++
    } else if (
      template.type === 'potion' &&
      (template.healBase !== undefined || template.healPerLevel !== undefined)
    ) {
      healingPotionCount++
    } else if (template.type === 'potion' && template.restoresMana) {
      manaPotionCount++
    } else if (
      template.type === 'scroll' &&
      (effect.includes('Teleport') || name.includes('Phase Door'))
    ) {
      escapeScrollCount++
    }
  }

  // Dynamic consumable targets - scale with gold but cap to avoid inventory bloat
  const baseTP = 2
  const baseHealing = 3
  const baseMana = 2 // Pure casters need mana pots for DD kite loop
  const baseEscape = 2
  const goldBonus = Math.min(2, Math.floor(char.gold / 3000))

  const wantedTP = Math.max(0, baseTP + goldBonus - tpScrollCount) // max 4
  const wantedHealing = Math.max(0, baseHealing + goldBonus - healingPotionCount) // max 5
  const wantedMana = needsMana ? Math.max(0, baseMana + goldBonus - manaPotionCount) : 0 // max 4, mana-dependent classes
  const wantedEscape = Math.max(0, baseEscape + Math.floor(goldBonus / 2) - escapeScrollCount) // max 3

  // Build priority buy list
  interface BuyCandidate {
    index: number
    category: 'tp' | 'healing' | 'mana' | 'escape' | 'gear'
    priority: number
    price: number
    name: string
  }

  const candidates: BuyCandidate[] = []

  for (let i = 0; i < merchant.inventory.length; i++) {
    const item = merchant.inventory[i]
    if (!item) continue

    const price = item.shopPrice ?? 0
    const effect = item.template.effect || ''
    const name = item.template.name
    const template = item.template

    // Town Portal Scrolls - highest priority
    if (name.includes('Town Portal')) {
      if (wantedTP > 0) {
        candidates.push({ index: i, category: 'tp', priority: 1, price, name })
      }
    }
    // Healing potions - second priority
    // Higher tier = lower priority number = bought FIRST (T4 Healing > T1 Cure Light)
    else if (
      template.type === 'potion' &&
      (template.healBase !== undefined || template.healPerLevel !== undefined)
    ) {
      if (wantedHealing > 0) {
        // T4 gets priority 1.4, T1 gets 1.85 - prefer high-tier potions
        const tierBonus = template.tier * 0.15
        candidates.push({ index: i, category: 'healing', priority: 2 - tierBonus, price, name })
      }
    }
    // Mana potions - third priority (casters only, critical for DD kite loop)
    else if (template.type === 'potion' && template.restoresMana) {
      if (wantedMana > 0) {
        candidates.push({ index: i, category: 'mana', priority: 2.5, price, name })
      }
    }
    // Phase Door / Escape scrolls - fourth priority
    else if (
      template.type === 'scroll' &&
      (effect.includes('Teleport') || name.includes('Phase Door'))
    ) {
      if (wantedEscape > 0) {
        const phaseDoorBonus = name.includes('Phase Door') ? 0.1 : 0
        candidates.push({ index: i, category: 'escape', priority: 3 - phaseDoorBonus, price, name })
      }
    }
    // Gear upgrades - depth-aware budget with quadratic value calculation
    else if (template.slot) {
      const slotKey = template.slot as keyof typeof char.equipment
      const currentGear = char.equipment[slotKey]

      // Quadratic value: tier² * 10 + enchant² * 20
      const currentTier = currentGear?.template.tier ?? 0
      const currentEnchant = currentGear?.enchantment ?? 0
      const currentValue = currentTier * currentTier * 10 + currentEnchant * currentEnchant * 20

      const newTier = template.tier
      const newEnchant = item.enchantment
      const newValue = newTier * newTier * 10 + newEnchant * newEnchant * 20

      const upgradeValue = newValue - currentValue
      if (upgradeValue <= 0) continue // Not an upgrade

      // Depth-aware consumable reserve (100g base + 15g per depth)
      const depth = game.character.depth
      const consumableReserve = 100 + depth * 15

      // Available budget after reserve
      const availableBudget = Math.max(0, char.gold - consumableReserve)

      // Slot priority affects max spend
      const slotPriority = getSlotPriority(template.slot)
      const maxSpend = availableBudget * slotPriority

      // Efficiency: upgrade value per 100g spent (higher = better deal)
      const efficiency = price > 0 ? upgradeValue / (price / 100) : 0

      // Buy if affordable and efficient (at least 0.3 value per 100g)
      if (price <= maxSpend && efficiency > 0.3) {
        // Lower priority = bought sooner; better upgrades and better slots get lower priority
        candidates.push({
          index: i,
          category: 'gear',
          priority: 4 - upgradeValue * 0.05 - (1 - slotPriority) * 0.5,
          price,
          name,
        })
      }
    }
  }

  // Sort by priority, then price
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.price - b.price
  })

  // Buy items
  let boughtCount = 0
  let boughtTP = 0
  let boughtHealing = 0
  let boughtMana = 0
  let boughtEscape = 0

  for (const candidate of candidates) {
    // Consumables use type-specific caps (wantedTP, wantedHealing, wantedMana, wantedEscape)
    // No total inventory check needed - caps are enforced below
    if (game.character.gold < candidate.price) continue

    if (candidate.category === 'tp' && boughtTP >= wantedTP) continue
    if (candidate.category === 'healing' && boughtHealing >= wantedHealing) continue
    if (candidate.category === 'mana' && boughtMana >= wantedMana) continue
    if (candidate.category === 'escape' && boughtEscape >= wantedEscape) continue

    // Find current index (may have shifted)
    const currentIndex = merchant.inventory.findIndex(
      (item) =>
        item && item.template.name === candidate.name && (item.shopPrice ?? 0) === candidate.price
    )
    if (currentIndex < 0) continue

    const success = buyFromMerchant(game, merchantIndex, currentIndex)
    if (success) {
      boughtCount++
      switch (candidate.category) {
        case 'tp':
          boughtTP++
          break
        case 'healing':
          boughtHealing++
          break
        case 'mana':
          boughtMana++
          break
        case 'escape':
          boughtEscape++
          break
      }
    }
  }

  return boughtCount
}

// ============================================================================
// GOAL CREATION (merchant domain)
// ============================================================================

/**
 * Calculate minimum gold buffer for emergencies (consumables, escapes).
 * Scales with depth: 100g base + 15g per depth level.
 */
function getGoldBuffer(depth: number): number {
  return 100 + depth * 15
}

/**
 * Get USE_ALTAR goal - use dungeon altars for benefits.
 *
 * Priority order:
 * 1. Enchantment Altar (200g) - +1 to weapon, best gold sink
 * 2. Blessing Altar (50g) - Full heal + mana restore
 * 3. Knowledge Altar (25g) - Identify all items
 */
export function getUseAltarGoal(
  context: BotContext,
  dangerThreshold: number,
  localDanger: number
): BotGoal | null {
  const { game, visibleAltars, visibleMonsters } = context
  const character = game.character
  const goldBuffer = getGoldBuffer(character.depth)

  // Don't use altars if monsters are visible
  if (visibleMonsters.length > 0) return null

  // Don't use altars if in danger
  if (localDanger > dangerThreshold * 0.3) return null

  // No altars visible
  if (visibleAltars.length === 0) return null

  // Evaluate each visible altar
  let bestAltar = null
  let bestPriority = -1
  let bestReason = ''

  for (const altar of visibleAltars) {
    const template = altar.template
    const cost = template.cost

    // Can we afford this altar while keeping buffer?
    if (character.gold < cost + goldBuffer) continue

    // Evaluate based on altar type
    let priority = 0
    let reason = ''

    switch (template.effect) {
      case 'enchant': {
        // Enchantment altar: +1 to weapon
        // Highest priority gold sink - always use if affordable
        const weapon = character.equipment.weapon
        if (weapon) {
          // Higher priority for lower enchantment (bigger relative gain)
          priority = 100 - weapon.enchantment * 5
          reason = `Enchanting ${weapon.template.name} (+${weapon.enchantment} → +${weapon.enchantment + 1})`
        }
        break
      }

      case 'bless': {
        // Blessing altar: Full heal + mana
        // Use if HP < 70% or MP < 50%
        const hpRatio = character.hp / character.maxHp
        const mpRatio = character.maxMp > 0 ? character.mp / character.maxMp : 1
        if (hpRatio < 0.7 || mpRatio < 0.5) {
          priority = 50
          reason = `Blessing (HP: ${Math.round(hpRatio * 100)}%, MP: ${Math.round(mpRatio * 100)}%)`
        }
        break
      }
    }

    if (priority > bestPriority) {
      bestPriority = priority
      bestAltar = altar
      bestReason = reason
    }
  }

  if (!bestAltar || bestPriority <= 0) return null

  // Find adjacent walkable position (altars are impassable)
  const adjacentPos = findAdjacentWalkable(game, bestAltar.position)
  if (!adjacentPos) return null

  return {
    type: 'USE_ALTAR',
    target: adjacentPos,
    targetId: bestAltar.template.id,
    reason: bestReason,
    startTurn: game.turn,
  }
}

/**
 * Calculate minimum gold needed to make a merchant visit worthwhile.
 * Uses quadratic pricing: tier² * 50 for equipment base cost.
 * Consumables (potions/scrolls) use linear pricing and are always cheap.
 */
function getMinGoldForMerchant(depth: number, shopType: string): number {
  // Expected gear tier at this depth
  const tier = depth >= 30 ? 3 : depth >= 15 ? 2 : 1
  // Quadratic base cost with 2x shop markup
  const minGearCost = tier * tier * 50 * 2

  switch (shopType) {
    case 'blackmarket':
      // Black market has 4x markup on T3-4 gear
      // Need ~3x base cost to afford anything useful
      return Math.max(2000, minGearCost * 3)
    case 'weapon':
    case 'armor':
      return minGearCost
    case 'potion':
      // Potions are still cheap (linear pricing)
      return 150
    case 'scroll':
      return 100
    default:
      // Mixed/general
      return Math.max(200, minGearCost * 0.5)
  }
}

/**
 * Get VISIT_MERCHANT goal - visit dungeon merchants for supplies/gear.
 *
 * Priority scoring:
 * - Shady Dealer (black market) - highest priority for T3-4 gear
 * - Alchemist - high priority if low on healing potions
 * - Weapon/Armor dealers - moderate priority if gold available
 * - General/Mixed - low priority for general supplies
 *
 * Gold thresholds scale with depth using quadratic equipment pricing.
 */
export function getVisitMerchantGoal(
  context: BotContext,
  dangerThreshold: number,
  localDanger: number
): BotGoal | null {
  const { game, visibleMerchants, visibleMonsters } = context
  const character = game.character
  const depth = character.depth

  // Safety checks
  if (visibleMonsters.length > 0) return null
  if (localDanger > dangerThreshold * 0.3) return null
  if (visibleMerchants.length === 0) return null
  if (depth === 0) return null // Town handled separately

  // Score each merchant
  let bestMerchant = null
  let bestScore = 0
  let bestReason = ''

  for (const merchant of visibleMerchants) {
    // Skip merchants we've already visited this level
    if (context.botState.visitedDungeonMerchants.has(merchant.template.id)) continue

    const shopType = merchant.template.shopType
    const minGold = getMinGoldForMerchant(depth, shopType)

    let score = 0
    let reason = ''

    // Shady Dealer (black market) - highest priority for late-game gear
    if (merchant.template.id === 'black_market') {
      if (character.gold >= minGold) {
        score = 100
        reason = 'Black market (T3-4 gear)'
      }
    }
    // Alchemist - if low on healing (potions are cheap, always check if needed)
    else if (shopType === 'potion') {
      const healingCount = countHealingPotions(character.inventory)
      if (healingCount < 3) {
        score = 60
        reason = 'Need healing potions'
      } else if (character.gold >= minGold) {
        score = 20
        reason = 'Checking potion supplies'
      }
    }
    // Weapon/Armor dealers - if gold available for tier-appropriate gear
    else if (shopType === 'weapon' || shopType === 'armor') {
      if (character.gold >= minGold) {
        score = 40
        reason = `Checking ${shopType} upgrades`
      }
    }
    // Scroll merchant - if need escape/utility scrolls (cheap)
    else if (shopType === 'scroll') {
      if (character.gold >= minGold) {
        score = 35
        reason = 'Checking scroll supplies'
      }
    }
    // Mixed/general - moderate priority
    else {
      if (character.gold >= minGold) {
        score = 20
        reason = 'General supplies'
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMerchant = merchant
      bestReason = reason
    }
  }

  if (!bestMerchant || bestScore <= 0) return null

  return {
    type: 'VISIT_MERCHANT',
    target: bestMerchant.position,
    targetId: bestMerchant.template.id,
    reason: bestReason,
    startTurn: game.turn,
  }
}
