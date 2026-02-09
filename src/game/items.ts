/**
 * Item Spawning and Management for Borglike
 *
 * Handles item creation, spawning on dungeon levels, and ground item management.
 */

import type { Item, Point, DungeonLevel, GroundItem } from './types'
import type { ItemTemplate } from './data/items'
import type { BoosterBonuses } from './booster-effects'
import { DEFAULT_BOOSTER_BONUSES } from './booster-effects'
import type { ArtifactTemplate } from './data/artifacts'
import { getItemsForDepth, POTIONS, SCROLLS, ALL_EQUIPMENT, BOWS, LIGHTS } from './data/index'
import { getArtifactsForDepth } from './data/artifacts'
import { findOpenPositions, getTile } from './dungeon'
import { random, randomInt } from './rng'

// ============================================================================
// UNIQUE ID GENERATION
// ============================================================================

let itemIdCounter = 0

/**
 * Generate a unique item ID
 */
function generateItemId(): string {
  return `item_${++itemIdCounter}`
}

/**
 * Reset the item ID counter (useful for testing)
 */
export function resetItemIdCounter(): void {
  itemIdCounter = 0
}

// Note: GroundItem is now defined in types.ts and imported above

// ============================================================================
// ITEM CREATION
// ============================================================================

/**
 * Create an item instance from a template
 *
 * @param template - The item template to create from
 * @param enchantment - Optional enchantment bonus (default 0)
 * @returns A new Item instance
 */
export function createItem(template: ItemTemplate, enchantment: number = 0): Item {
  return {
    id: generateItemId(),
    template,
    enchantment,
    artifact: null,
  }
}

/**
 * Create an artifact item from a template
 *
 * @param artifact - The artifact template
 * @returns A new artifact Item instance
 */
export function createArtifact(artifact: ArtifactTemplate): Item {
  // Map artifact slot to item type
  const slotToType: Record<string, ItemTemplate['type']> = {
    weapon: 'weapon',
    body: 'armor',
    shield: 'shield',
    helm: 'helm',
    gloves: 'gloves',
    boots: 'boots',
    ring: 'ring',
    amulet: 'amulet',
    light: 'light',
  }

  // Create base item from artifact's base type
  const baseTemplate: ItemTemplate = {
    name: artifact.name,
    type: slotToType[artifact.slot] ?? 'weapon',
    slot: artifact.slot,
    tier: 4, // Artifacts are always top tier
    damage: artifact.damage,
    protection: artifact.protection,
    weight: artifact.weight,
    effect: artifact.abilities.join(', '),
    minDepth: artifact.minDepth,
  }

  return {
    id: generateItemId(),
    template: baseTemplate,
    enchantment: 0,
    artifact,
  }
}

/**
 * Create a ground item (item with position)
 *
 * @param item - The item to place on the ground
 * @param position - Where to place it
 * @returns A GroundItem
 */
export function createGroundItem(item: Item, position: Point): GroundItem {
  return {
    ...item,
    position: { ...position },
  }
}

// ============================================================================
// ITEM SPAWNING
// ============================================================================

/**
 * Number of items to spawn per level (scales with depth)
 */
function getItemCountForLevel(depth: number): number {
  // 3-5 items on early levels, scaling up to 8-10 on deep levels
  return Math.floor(3 + depth * 0.15)
}

/**
 * Spawn items for a dungeon level
 *
 * Spawns a mix of equipment and consumables appropriate for the depth.
 * Has a small chance to spawn artifacts.
 *
 * @param level - The dungeon level to spawn items on
 * @param depth - The dungeon depth (affects item types)
 * @returns Array of ground items
 */
export function spawnItemsForLevel(
  level: DungeonLevel,
  depth: number,
  potionRatePercent = 100,
  enchantRatePercent = 100,
  itemRatePercent = 100
): GroundItem[] {
  const items: GroundItem[] = []
  const baseItemCount = getItemCountForLevel(depth)
  const itemCount = Math.max(1, Math.floor((baseItemCount * itemRatePercent) / 100))

  // Get available templates for this depth
  const availableItems = getItemsForDepth(depth)
  if (availableItems.length === 0) {
    return items
  }

  // Find open positions, excluding stairs
  const allOpenPositions = findOpenPositions(level, itemCount + 10)
  const validPositions = allOpenPositions.filter((pos) => {
    const tile = getTile(level, pos.x, pos.y)
    if (!tile) return false
    return tile.type !== 'stairs_up' && tile.type !== 'stairs_down'
  })

  // Spawn items at available positions
  const spawnCount = Math.min(itemCount, validPositions.length)
  for (let i = 0; i < spawnCount; i++) {
    const template = pickRandomItem(availableItems, depth)
    const pos = validPositions[i]

    if (template && pos) {
      // Determine enchantment (deeper = higher chance of enchantment)
      // Only equipment gets enchantment - consumables don't benefit from it
      const isEquipment = template.slot !== undefined
      const enchantment = isEquipment ? rollEnchantment(depth, enchantRatePercent) : 0
      const item = createItem(template, enchantment)
      const groundItem = createGroundItem(item, pos)
      items.push(groundItem)
    }
  }

  // Spawn bonus potions based on potion rate (100 = normal, 200 = double)
  if (potionRatePercent !== 100 && POTIONS.length > 0) {
    // Base: 1-2 potions per level, scale by rate
    const basePotionCount = 1 + Math.floor(depth * 0.1)
    const scaledCount = Math.floor((basePotionCount * potionRatePercent) / 100)
    const bonusPotions = scaledCount - basePotionCount

    // Find more open positions if needed
    const potionPositions = findOpenPositions(level, Math.abs(bonusPotions) + 5)
    const validPotionPositions = potionPositions.filter((pos) => {
      const tile = getTile(level, pos.x, pos.y)
      if (!tile) return false
      // Exclude stairs and positions already used
      return (
        tile.type !== 'stairs_up' &&
        tile.type !== 'stairs_down' &&
        !items.some((item) => item.position.x === pos.x && item.position.y === pos.y)
      )
    })

    if (bonusPotions > 0) {
      // Spawn extra potions
      for (let i = 0; i < bonusPotions && i < validPotionPositions.length; i++) {
        const potionTemplate = POTIONS[randomInt(0, POTIONS.length - 1)]
        const pos = validPotionPositions[i]
        if (potionTemplate && pos) {
          const potion = createItem(potionTemplate, 0)
          items.push(createGroundItem(potion, pos))
        }
      }
    }
  }

  // Small chance to spawn an artifact (1% per 10 depth levels)
  const artifactChance = Math.min(0.1, depth * 0.01)
  if (random() < artifactChance) {
    const artifact = pickRandomArtifact(depth)
    const artifactPos = validPositions[spawnCount]
    if (artifact && artifactPos) {
      const artifactItem = createArtifact(artifact)
      const groundArtifact = createGroundItem(artifactItem, artifactPos)
      items.push(groundArtifact)
    }
  }

  return items
}

/**
 * Pick a random item template, weighted by depth appropriateness
 *
 * Favors items closer to the current depth's minDepth.
 * Town Portal scrolls get 2x weight to ensure availability at deep levels.
 * Depth penalty is capped at 25 levels with gentler coefficient (0.25 vs 0.5).
 *
 * @param templates - Available templates to choose from
 * @param depth - Current dungeon depth
 * @returns A randomly selected template
 */
function pickRandomItem(templates: ItemTemplate[], depth: number): ItemTemplate | null {
  if (templates.length === 0) return null

  // Weight selection toward items appropriate for this depth
  // Items with minDepth closer to current depth are more common
  const weighted: { template: ItemTemplate; weight: number }[] = templates.map((t) => {
    const minDepth = t.minDepth ?? 0
    const depthDiff = Math.abs(depth - minDepth)
    // Cap depth penalty at 25 levels, use gentler coefficient (was 0.5)
    const effectiveDepthDiff = Math.min(25, depthDiff)
    let weight = Math.max(1, 10 - effectiveDepthDiff * 0.25)

    // Double drop rate for Town Portal scrolls (critical for deep dungeon survival)
    if (t.name === 'Scroll of Town Portal') {
      weight *= 2
    }

    return { template: t, weight }
  })

  // Weighted random selection
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0)
  let roll = random() * totalWeight

  for (const w of weighted) {
    roll -= w.weight
    if (roll <= 0) {
      return w.template
    }
  }

  // Fallback to first item
  return templates[0] ?? null
}

/**
 * Pick a random artifact for the given depth
 *
 * @param depth - Current dungeon depth
 * @returns An artifact template or null
 */
function pickRandomArtifact(depth: number): ArtifactTemplate | null {
  const artifacts = getArtifactsForDepth(depth)
  if (artifacts.length === 0) return null

  const index = randomInt(0, artifacts.length - 1)
  return artifacts[index] ?? null
}

/**
 * Roll for item enchantment
 *
 * Higher depths have better chance of positive enchantment.
 *
 * @param depth - Current dungeon depth
 * @returns Enchantment bonus (0 to +3 typically)
 */
function rollEnchantment(depth: number, enchantRatePercent = 100): number {
  // Base 30% chance of enchantment, scaled by enchantRatePercent
  const enchantChance = (0.3 * enchantRatePercent) / 100
  if (random() > enchantChance) {
    return 0
  }

  // 20% chance of +1
  if (random() > 0.5) {
    return 1
  }

  // 8% chance of +2
  if (random() > 0.5 || depth < 20) {
    return 2
  }

  // 2% chance of +3 (only in deep dungeon)
  if (depth >= 30) {
    return 3
  }

  return 2
}

// ============================================================================
// GROUND ITEM UTILITIES
// ============================================================================

/**
 * Get all items at a specific position
 *
 * @param items - Array of ground items
 * @param position - Position to check
 * @returns Array of items at that position
 */
export function getItemsAtPosition(items: GroundItem[], position: Point): GroundItem[] {
  return items.filter((item) => item.position.x === position.x && item.position.y === position.y)
}

/**
 * Find an item by ID in the ground items array
 *
 * @param items - Array of ground items
 * @param itemId - ID to find
 * @returns The item or undefined
 */
export function findGroundItemById(items: GroundItem[], itemId: string): GroundItem | undefined {
  return items.find((item) => item.id === itemId)
}

/**
 * Remove an item from the ground items array
 *
 * @param items - Array of ground items (mutated)
 * @param itemId - ID of item to remove
 * @returns The removed item or undefined
 */
export function removeGroundItem(items: GroundItem[], itemId: string): GroundItem | undefined {
  const index = items.findIndex((item) => item.id === itemId)
  if (index >= 0) {
    const removed = items.splice(index, 1)[0]
    return removed
  }
  return undefined
}

/**
 * Add an item to the ground at a position
 *
 * @param items - Array of ground items (mutated)
 * @param item - Item to drop
 * @param position - Position to drop at
 * @returns The created ground item
 */
export function dropItemOnGround(items: GroundItem[], item: Item, position: Point): GroundItem {
  const groundItem = createGroundItem(item, position)
  items.push(groundItem)
  return groundItem
}

// ============================================================================
// ITEM DISPLAY HELPERS
// ============================================================================

/**
 * Get display name for an item (including enchantment and artifact status)
 *
 * @param item - The item
 * @returns Display string
 */
export function getItemDisplayName(item: Item): string {
  const parts: string[] = []

  // Enchantment prefix
  if (item.enchantment > 0) {
    parts.push(`+${item.enchantment}`)
  } else if (item.enchantment < 0) {
    parts.push(`${item.enchantment}`)
  }

  // Name (artifact name takes precedence)
  if (item.artifact) {
    parts.push(item.artifact.name)
  } else {
    parts.push(item.template.name)
  }

  return parts.join(' ')
}

/**
 * Get the ASCII character for an item type
 *
 * @param item - The item
 * @returns Single character for display
 */
export function getItemGlyph(item: Item): string {
  switch (item.template.type) {
    case 'weapon':
      return '/'
    case 'bow':
      return '}'
    case 'armor':
      return '['
    case 'shield':
      return ')'
    case 'helm':
      return ']'
    case 'gloves':
      return '('
    case 'boots':
      return '{'
    case 'ring':
      return '='
    case 'amulet':
      return '"'
    case 'light':
      return '~'
    case 'potion':
      return '!'
    case 'scroll':
      return '?'
    default:
      return '*'
  }
}

/**
 * Get the color for an item based on tier
 *
 * @param item - The item
 * @returns Color name for display
 */
export function getItemColor(item: Item): string {
  // Artifacts are always gold
  if (item.artifact) {
    return 'gold'
  }

  // Color by tier
  switch (item.template.tier) {
    case 1:
      return 'white'
    case 2:
      return 'green'
    case 3:
      return 'blue'
    case 4:
      return 'purple'
    default:
      return 'white'
  }
}

// ============================================================================
// CONSUMABLE HELPERS
// ============================================================================

/**
 * Spawn a specific number of healing potions (for starting equipment)
 */
export function createHealingPotions(count: number): Item[] {
  const healingPotion = POTIONS.find((p) => p.name === 'Potion of Cure Light Wounds')
  if (!healingPotion) return []

  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    items.push(createItem(healingPotion, 0))
  }
  return items
}

/**
 * Create a random potion (for Lucky Start booster)
 */
export function createRandomPotion(): Item | null {
  if (POTIONS.length === 0) return null
  const index = randomInt(0, POTIONS.length - 1)
  const potion = POTIONS[index]
  if (!potion) return null
  return createItem(potion, 0)
}

/**
 * Spawn a specific number of teleport scrolls (for starting equipment)
 */
export function createTeleportScrolls(count: number): Item[] {
  const teleportScroll = SCROLLS.find((s) => s.name === 'Scroll of Phase Door')
  if (!teleportScroll) return []

  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    items.push(createItem(teleportScroll, 0))
  }
  return items
}

/**
 * Create Town Portal scrolls
 *
 * @param count - Number of scrolls to create
 * @returns Array of Town Portal scroll items
 */
export function createTownPortalScrolls(count: number): Item[] {
  const tpScroll = SCROLLS.find((s) => s.name === 'Scroll of Town Portal')
  if (!tpScroll) return []

  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    items.push(createItem(tpScroll, 0))
  }
  return items
}

/**
 * Create Detect Stairs scrolls
 *
 * @param count - Number of scrolls to create
 * @returns Array of Detect Stairs scroll items
 */
export function createDetectStairsScrolls(count: number): Item[] {
  const detectStairsScroll = SCROLLS.find((s) => s.name === 'Scroll of Detect Stairs')
  if (!detectStairsScroll) return []

  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    items.push(createItem(detectStairsScroll, 0))
  }
  return items
}

/**
 * Create starting equipment for a character based on class
 *
 * @param classId - The character's class ID
 * @param boosterBonuses - Optional booster bonuses for equipment enchantments
 * @returns Array of starting items
 */
export function createStartingEquipment(
  classId: string,
  boosterBonuses?: BoosterBonuses,
  startingPotions = 3
): Item[] {
  const items: Item[] = []
  const bonuses = boosterBonuses ?? DEFAULT_BOOSTER_BONUSES

  // Get enchantment bonuses from boosters
  const weaponEnchant = bonuses.startingWeaponBonus
  const armorEnchant = bonuses.startingArmorBonus

  // Basic weapon based on class
  const weaponName = getStartingWeaponForClass(classId)
  const weapon = ALL_EQUIPMENT.find((e) => e.name === weaponName)
  if (weapon) {
    items.push(createItem(weapon, weaponEnchant))
  }

  // Class-specific armor
  const armorName = getStartingArmorForClass(classId)
  const armor = ALL_EQUIPMENT.find((e) => e.name === armorName)
  if (armor) {
    items.push(createItem(armor, armorEnchant))
  }

  // Starting bow for ranged classes
  const bowName = getStartingBowForClass(classId)
  if (bowName) {
    const bow = BOWS.find((b) => b.name === bowName)
    if (bow) {
      items.push(createItem(bow, 0))
    }
  }

  // Starting torch for light
  const torch = LIGHTS.find((l) => l.name === 'Wooden Torch')
  if (torch) {
    items.push(createItem(torch, 0))
  }

  // Some potions and scrolls
  items.push(...createHealingPotions(startingPotions))
  items.push(...createTeleportScrolls(2))

  // Town Portal scroll (always start with 1)
  items.push(...createTownPortalScrolls(1))

  // Detect Stairs scroll (always start with 1)
  items.push(...createDetectStairsScrolls(1))

  return items
}

/**
 * Get the starting weapon name for a class
 */
function getStartingWeaponForClass(classId: string): string {
  switch (classId) {
    // Heavy melee fighters - short sword
    case 'warrior':
    case 'paladin':
    case 'berserker':
    case 'blackguard':
      return 'Short Sword'
    // Casters - wooden staff
    case 'mage':
    case 'necromancer':
    case 'archmage':
      return 'Wooden Staff'
    // Holy classes - blessed mace
    case 'priest':
    case 'druid':
      return 'Blessed Mace'
    // Dex-based classes - dagger
    case 'rogue':
    case 'ranger':
    case 'artificer':
      return 'Dagger'
    default:
      return 'Dagger'
  }
}

/**
 * Get the starting bow name for a class (null if class doesn't start with a bow)
 */
function getStartingBowForClass(classId: string): string | null {
  switch (classId) {
    case 'ranger':
      return 'Short Bow'
    default:
      return null
  }
}

/**
 * Get the starting armor name for a class
 */
function getStartingArmorForClass(classId: string): string {
  switch (classId) {
    // Heavy fighters - studded leather
    case 'warrior':
    case 'paladin':
    case 'berserker':
    case 'blackguard':
      return 'Studded Leather Armour'
    // Light fighters - soft leather
    case 'rogue':
    case 'ranger':
    case 'artificer':
      return 'Soft Leather Armour'
    // Casters and nature classes - robe
    case 'mage':
    case 'necromancer':
    case 'archmage':
    case 'priest':
    case 'druid':
      return 'Robe'
    default:
      return 'Robe'
  }
}

// ============================================================================
// MERCHANT INVENTORY
// ============================================================================

/**
 * Generate inventory for a merchant based on their type and dungeon depth
 *
 * @param merchantId - The merchant's ID (determines shop type)
 * @param depth - Current dungeon depth (affects item quality)
 * @returns Array of items for the merchant's inventory
 */
export function generateMerchantInventory(merchantId: string, depth: number): Item[] {
  const items: Item[] = []
  const itemCount = 4 + Math.floor(depth / 10) // 4-9 items based on depth

  // Determine shop type from merchant ID
  const isWeaponShop = merchantId.includes('weapon') || merchantId.includes('smith')
  const isArmorShop = merchantId.includes('armor') || merchantId.includes('armour')
  const isPotionShop = merchantId.includes('potion') || merchantId.includes('alchemist')
  const isScrollShop = merchantId.includes('scroll') || merchantId.includes('magic')
  const isGeneralShop = !isWeaponShop && !isArmorShop && !isPotionShop && !isScrollShop

  // Get items appropriate for shop type
  const availableItems = getItemsForDepth(depth)
  let shopItems: ItemTemplate[] = []

  if (isWeaponShop) {
    shopItems = availableItems.filter((i) => i.type === 'weapon' || i.type === 'bow')
  } else if (isArmorShop) {
    shopItems = availableItems.filter((i) =>
      ['armor', 'shield', 'helm', 'gloves', 'boots'].includes(i.type)
    )
  } else if (isPotionShop) {
    shopItems = POTIONS.filter((p) => (p.minDepth ?? 0) <= depth)
  } else if (isScrollShop) {
    shopItems = SCROLLS.filter((s) => (s.minDepth ?? 0) <= depth)
  } else if (isGeneralShop) {
    // Mix of everything
    const potions = POTIONS.filter((p) => (p.minDepth ?? 0) <= depth)
    const scrolls = SCROLLS.filter((s) => (s.minDepth ?? 0) <= depth)
    shopItems = [...availableItems.slice(0, 5), ...potions.slice(0, 3), ...scrolls.slice(0, 3)]
  }

  if (shopItems.length === 0) {
    shopItems = availableItems.slice(0, 5)
  }

  // Generate items with markup
  for (let i = 0; i < itemCount && shopItems.length > 0; i++) {
    const template = shopItems[randomInt(0, shopItems.length - 1)]
    if (!template) continue

    // Only equipment gets enchantment - consumables don't benefit from it
    const isEquipment = template.slot !== undefined
    const enchantment = isEquipment ? rollEnchantmentForShop(depth) : 0
    const item = createItem(template, enchantment)

    // Calculate shop price using quadratic scaling
    // Tier: tier² * 50, Enchant: enchant² * 100
    const tierCost = template.tier * template.tier * 50
    const enchantCost = enchantment * enchantment * 100
    const markup = 1.5 + random() * 0.5 // 1.5x to 2.0x markup
    item.shopPrice = Math.floor((tierCost + enchantCost) * markup)

    items.push(item)
  }

  return items
}

/**
 * Roll enchantment for shop items (slightly better than random drops)
 */
function rollEnchantmentForShop(depth: number): number {
  const roll = random()
  if (roll > 0.6) return 0 // 40% no enchantment
  if (roll > 0.3 || depth < 10) return 1 // 30% +1
  if (roll > 0.1 || depth < 20) return 2 // 20% +2
  return 3 // 10% +3 (only deep levels)
}
