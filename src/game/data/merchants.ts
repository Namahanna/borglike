/**
 * Merchant templates for traveling traders and shops
 *
 * Merchants appear in special vault rooms and offer items for sale.
 */

import { random, randomInt } from '../rng'

export type ShopType =
  | 'general'
  | 'weapon'
  | 'armor'
  | 'potion'
  | 'scroll'
  | 'mixed'
  | 'blackmarket'

export interface MerchantDialogue {
  greeting: string[]
  purchase: string[]
  sell: string[]
  farewell: string[]
  tooExpensive: string[]
  cantAfford: string[]
}

export interface MerchantTemplate {
  id: string
  name: string
  char: string
  color: number
  shopType: ShopType
  /** Buy price = item value * this */
  priceMultiplier: number
  /** Sell price = item value * this */
  sellMultiplier: number
  /** Inventory size range [min, max] */
  inventorySize: [number, number]
  /** Item tier range [min, max] */
  tierRange: [number, number]
  minDepth: number
  /** Base gold the merchant has for buying items */
  baseGold: number
  dialogue: MerchantDialogue
}

export const MERCHANTS: MerchantTemplate[] = [
  // ============================================================================
  // TOWN SHOPS (minDepth: 0) - Always available in town
  // ============================================================================
  {
    id: 'town_general',
    name: 'General Store',
    char: '1',
    color: 0xfbbf24, // amber
    shopType: 'mixed',
    priceMultiplier: 2.0,
    sellMultiplier: 0.35,
    inventorySize: [8, 12],
    tierRange: [1, 2],
    minDepth: 0,
    baseGold: 2500,
    dialogue: {
      greeting: [
        'Welcome to my humble shop!',
        'Take a look around, adventurer!',
        'I have a bit of everything!',
      ],
      purchase: ['Thank you kindly!', 'A wise purchase!', 'May it serve you well!'],
      sell: ["I'll take it off your hands.", 'Fair enough, deal!', 'This will sell nicely.'],
      farewell: ['Safe travels!', 'Come back anytime!', 'Good luck in the dungeon!'],
      tooExpensive: ['That one is a bit pricey.', 'Perhaps something more affordable?'],
      cantAfford: ["I can't pay that much right now.", 'My gold reserves are limited.'],
    },
  },
  {
    id: 'town_armory',
    name: 'Armory',
    char: '2',
    color: 0x64748b, // slate
    shopType: 'armor',
    priceMultiplier: 2.0,
    sellMultiplier: 0.4,
    inventorySize: [6, 10],
    tierRange: [1, 2],
    minDepth: 0,
    baseGold: 3000,
    dialogue: {
      greeting: [
        'The finest protection in town!',
        'Armor saves lives, friend!',
        'Looking to bolster your defenses?',
      ],
      purchase: ['May it turn aside many blows!', 'Solid choice!', 'Wear it well!'],
      sell: ['Good craftsmanship here.', 'I can repair and resell this.', 'Decent condition.'],
      farewell: [
        'Stay protected!',
        'Armor up before you head down!',
        'Come back when you need repairs!',
      ],
      tooExpensive: ['Quality protection costs gold.', 'Your life is worth the price.'],
      cantAfford: ['Bring me armor, not trinkets.', 'I deal in protective gear.'],
    },
  },
  {
    id: 'town_weapons',
    name: 'Weapon Smithy',
    char: '3',
    color: 0xef4444, // red
    shopType: 'weapon',
    priceMultiplier: 2.0,
    sellMultiplier: 0.4,
    inventorySize: [6, 10],
    tierRange: [1, 2],
    minDepth: 0,
    baseGold: 3000,
    dialogue: {
      greeting: [
        'Looking for something sharp?',
        'The best blades in town!',
        'Arm yourself properly, adventurer!',
      ],
      purchase: ['Strike true!', 'May it serve you in battle!', 'A fine weapon indeed!'],
      sell: ["A warrior's blade deserves respect.", 'This has seen battle.', 'Good steel here.'],
      farewell: ['Fight well!', 'May your enemies fall!', 'Sharpen your skills and your blade!'],
      tooExpensive: ['Quality steel costs gold.', 'These are battle-tested weapons.'],
      cantAfford: ['I need weapons or coin, friend.', 'Bring me something of value.'],
    },
  },
  {
    id: 'town_alchemy',
    name: 'Alchemy Shop',
    char: '4',
    color: 0x8b5cf6, // purple
    shopType: 'potion',
    priceMultiplier: 1.8,
    sellMultiplier: 0.3,
    inventorySize: [10, 15],
    tierRange: [1, 4], // T4 Healing potions needed for depth 30+ survival
    minDepth: 0,
    baseGold: 2000,
    dialogue: {
      greeting: [
        'Potions and elixirs, fresh brewed!',
        'What ails you? I have the cure!',
        'Step right up for magical brews!',
      ],
      purchase: ['Drink responsibly!', 'One sip makes all the difference!', 'Excellent choice!'],
      sell: ['Hmm, I can recycle this.', 'The ingredients may be useful.', 'Acceptable quality.'],
      farewell: [
        'Stay healthy!',
        "Don't forget your healing potions!",
        'May your flasks never run dry!',
      ],
      tooExpensive: ["Quality ingredients aren't cheap!", 'Alchemy is an expensive art.'],
      cantAfford: ['Bring me potions or gold.', 'Empty flasks are worthless.'],
    },
  },
  {
    id: 'town_magic',
    name: 'Magic Shop',
    char: '5',
    color: 0x3b82f6, // blue
    shopType: 'scroll',
    priceMultiplier: 2.2,
    sellMultiplier: 0.35,
    inventorySize: [8, 12],
    tierRange: [1, 2],
    minDepth: 0,
    baseGold: 2500,
    dialogue: {
      greeting: [
        'Scrolls of ancient power!',
        'Knowledge and magic await!',
        'Seeking arcane assistance?',
      ],
      purchase: ['Use it wisely!', 'The words hold great power!', 'A sage choice!'],
      sell: ['Ah, more texts for my collection.', 'The ink is still legible.', 'Interesting...'],
      farewell: ['May the arcane guide you!', 'Magic protects!', 'Return for more scrolls!'],
      tooExpensive: ['Wisdom has its price.', 'These scrolls are quite rare.'],
      cantAfford: ['Bring me scrolls or gold.', 'I deal in knowledge, not junk.'],
    },
  },
  // ============================================================================
  // DUNGEON MERCHANTS (minDepth > 0) - Found in dungeon vaults
  // ============================================================================
  {
    id: 'wandering_trader',
    name: 'Wandering Trader',
    char: '@',
    color: 0x22c55e, // green
    shopType: 'mixed',
    priceMultiplier: 2.5,
    sellMultiplier: 0.3,
    inventorySize: [4, 8],
    tierRange: [1, 2],
    minDepth: 5,
    baseGold: 500,
    dialogue: {
      greeting: [
        'Welcome, traveler! Care to browse my wares?',
        'Ah, a customer! Take a look around.',
        'Greetings! I have just what you need.',
      ],
      purchase: ['A fine choice!', "You won't regret it!", 'Pleasure doing business!'],
      sell: ['I can work with this.', "Fair enough, it's a deal.", 'This will sell nicely.'],
      farewell: ['Safe travels!', 'Come back anytime!', 'May fortune favor you!'],
      tooExpensive: ['Come back when you have more gold.', 'Perhaps something cheaper?'],
      cantAfford: ["I can't afford that right now.", 'My purse is too light for that.'],
    },
  },
  {
    id: 'arms_dealer',
    name: 'Arms Dealer',
    char: '@',
    color: 0xef4444, // red
    shopType: 'weapon',
    priceMultiplier: 2.0,
    sellMultiplier: 0.4,
    inventorySize: [3, 6],
    tierRange: [1, 3],
    minDepth: 12,
    baseGold: 800,
    dialogue: {
      greeting: [
        'Looking for something with an edge?',
        'The finest blades this side of the dungeon!',
      ],
      purchase: ['May it serve you well in battle!', 'Strike true!'],
      sell: ["A warrior's blade deserves respect.", 'This has seen some action.'],
      farewell: ['Fight well!', 'May your enemies fall before you!'],
      tooExpensive: ['Quality costs gold, friend.', 'These are battle-tested weapons.'],
      cantAfford: ['I deal in weapons, not trinkets.', 'Bring me something of value.'],
    },
  },
  {
    id: 'armorer',
    name: 'Traveling Armorer',
    char: '@',
    color: 0x64748b, // slate
    shopType: 'armor',
    priceMultiplier: 2.0,
    sellMultiplier: 0.35,
    inventorySize: [3, 5],
    tierRange: [1, 3],
    minDepth: 10,
    baseGold: 700,
    dialogue: {
      greeting: ['Protection is priceless!', 'The best armor in the depths!'],
      purchase: ['May it turn aside many blows!', 'Wear it well!'],
      sell: ['Still has some life in it.', 'I can repair this.'],
      farewell: ['Stay safe down there!', 'Armor saves lives!'],
      tooExpensive: ['Good armor is worth every coin.', 'Your life is worth the price.'],
      cantAfford: ['Bring me armor, not junk.', 'I only deal in quality goods.'],
    },
  },
  {
    id: 'alchemist',
    name: 'Dungeon Alchemist',
    char: '@',
    color: 0x8b5cf6, // purple
    shopType: 'potion',
    priceMultiplier: 1.8,
    sellMultiplier: 0.25,
    inventorySize: [5, 10],
    tierRange: [1, 3],
    minDepth: 8,
    baseGold: 400,
    dialogue: {
      greeting: ['Potions! Elixirs! Brewed fresh!', 'What ails you? I have the cure!'],
      purchase: ['Drink responsibly!', 'One sip and you will feel the difference!'],
      sell: ['Hmm, I can recycle this.', 'The ingredients may be useful.'],
      farewell: ["Don't forget to hydrate!", 'May your flasks never run dry!'],
      tooExpensive: ["Quality ingredients aren't cheap!", 'Alchemy is an expensive art.'],
      cantAfford: ['I need potions or gold.', 'Empty flasks are worthless to me.'],
    },
  },
  {
    id: 'scroll_merchant',
    name: 'Mystic Scribe',
    char: '@',
    color: 0xfbbf24, // amber
    shopType: 'scroll',
    priceMultiplier: 2.2,
    sellMultiplier: 0.3,
    inventorySize: [4, 8],
    tierRange: [1, 3],
    minDepth: 10,
    baseGold: 600,
    dialogue: {
      greeting: ['Knowledge is power!', 'Ancient scrolls, arcane wisdom!'],
      purchase: ['Use it wisely!', 'The words hold great power!'],
      sell: ['Ah, more texts for my collection.', 'The ink is still legible.'],
      farewell: ['May the words guide you!', 'Knowledge protects!'],
      tooExpensive: ['Wisdom has its price.', 'These scrolls are quite rare.'],
      cantAfford: ['Bring me scrolls or gold.', 'I deal in knowledge, not junk.'],
    },
  },
  {
    id: 'black_market',
    name: 'Shady Dealer',
    char: '@',
    color: 0x6b21a8, // dark purple
    shopType: 'blackmarket',
    priceMultiplier: 4.0,
    sellMultiplier: 0.5, // Better sell prices
    inventorySize: [3, 5],
    tierRange: [3, 4], // High-tier items only
    minDepth: 30,
    baseGold: 2000,
    dialogue: {
      greeting: ["*whispers* You didn't see me here...", 'Looking for something... special?'],
      purchase: ['Pleasure doing business.', '*nods* Good choice.'],
      sell: ['No questions asked.', "*examines* I'll take it."],
      farewell: ['Forget we ever met.', '*disappears into shadows*'],
      tooExpensive: ['These are rare goods. The price is firm.', 'Take it or leave it.'],
      cantAfford: ["I don't deal in common goods.", 'Bring me something valuable.'],
    },
  },
]

/**
 * Get merchants available at a given depth
 */
export function getMerchantsForDepth(depth: number): MerchantTemplate[] {
  return MERCHANTS.filter((m) => m.minDepth <= depth)
}

/**
 * Select a random merchant for a depth
 */
export function selectMerchant(depth: number): MerchantTemplate | null {
  const available = getMerchantsForDepth(depth)
  if (available.length === 0) return null

  // Weight towards general merchants, rare for specialized
  const weights = available.map((m) => {
    if (m.shopType === 'mixed' || m.shopType === 'general') return 3
    if (m.shopType === 'blackmarket') return 1
    return 2
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let roll = random() * totalWeight

  for (let i = 0; i < available.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return available[i]!
  }

  return available[0]!
}

/**
 * Get merchant by ID
 */
export function getMerchantById(id: string): MerchantTemplate | undefined {
  return MERCHANTS.find((m) => m.id === id)
}

/**
 * Get a random dialogue line
 */
export function getDialogue(template: MerchantTemplate, type: keyof MerchantDialogue): string {
  const lines = template.dialogue[type]
  return lines[randomInt(0, lines.length - 1)] ?? ''
}
