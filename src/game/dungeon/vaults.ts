/**
 * Vault system - pre-designed special rooms
 *
 * Vaults are special rooms with predefined layouts that can contain:
 * - Treasure (loot, gold)
 * - Monsters
 * - Features (fountains, altars)
 * - Merchants
 */

import type { Tile, Point } from '../types'
import type { VaultTemplate, VaultPlacement, RoomData } from './types'
import { random, randomInt } from '../rng'

/** Available vault templates */
export const VAULTS: VaultTemplate[] = [
  // ========== TREASURE VAULTS ==========
  {
    id: 'small_treasure',
    name: 'Treasure Alcove',
    minDepth: 10,
    width: 5,
    height: 5,
    layout: ['#####', '#...#', '#.*.#', '#...#', '##.##'],
    monsterDensity: 0.5,
  },
  {
    id: 'guard_room',
    name: 'Guard Chamber',
    minDepth: 15,
    width: 7,
    height: 7,
    layout: ['#######', '#M...M#', '#.....#', '#..*..#', '#.....#', '#M...M#', '###.###'],
    monsterDensity: 1.5,
  },
  {
    id: 'cross_vault',
    name: 'Cross Vault',
    minDepth: 20,
    width: 9,
    height: 9,
    layout: [
      '####.####',
      '####.####',
      '##.....##',
      '##..*..##',
      '.........',
      '##..*..##',
      '##.....##',
      '####.####',
      '####.####',
    ],
    monsterDensity: 1.0,
  },
  {
    id: 'pillared_hall',
    name: 'Pillared Hall',
    minDepth: 25,
    width: 11,
    height: 9,
    layout: [
      '###########',
      '#.........#',
      '#.#.#.#.#.#',
      '#.........#',
      '#.#.*.*.#.#',
      '#.........#',
      '#.#.#.#.#.#',
      '#.........#',
      '#####.#####',
    ],
    monsterDensity: 1.2,
  },
  {
    id: 'monster_pit',
    name: 'Monster Pit',
    minDepth: 30,
    width: 9,
    height: 9,
    layout: [
      '#########',
      '#MMMMMMM#',
      '#MMMMMMM#',
      '#MMM*MMM#',
      '#MMMMMMM#',
      '#MMMMMMM#',
      '#MMMMMMM#',
      '#...+...#',
      '#########',
    ],
    monsterDensity: 3.0,
  },
  {
    id: 'dragon_lair',
    name: 'Dragon Lair',
    minDepth: 40,
    width: 13,
    height: 11,
    layout: [
      '#############',
      '##.........##',
      '#...........#',
      '#....***....#',
      '#....*M*....#',
      '#....***....#',
      '#...........#',
      '##.........##',
      '###.......###',
      '####.....####',
      '#####...#####',
    ],
    monsterDensity: 2.0,
  },

  // ========== GOLD/TREASURY VAULTS ==========
  {
    id: 'small_treasury',
    name: 'Hidden Treasury',
    minDepth: 8,
    width: 7,
    height: 5,
    layout: ['#######', '#$$$$$#', '#$$$$$#', '#.....#', '###.###'],
    monsterDensity: 0,
  },
  {
    id: 'guarded_treasury',
    name: 'Guarded Treasury',
    minDepth: 20,
    width: 9,
    height: 7,
    layout: [
      '#########',
      '#$.$.$.$#',
      '#.......#',
      '#M.$.$.M#',
      '#.......#',
      '#$.$.$.$#',
      '####.####',
    ],
    monsterDensity: 1.5,
  },
  {
    id: 'trapped_treasury',
    name: 'Trapped Treasury',
    minDepth: 12,
    width: 9,
    height: 7,
    layout: [
      '#########',
      '#$^$^$^$#',
      '#^.....^#',
      '#$..*..$#',
      '#^.....^#',
      '#$^$^$^$#',
      '####.####',
    ],
    monsterDensity: 0,
    features: { trapId: 'spike_trap' },
  },

  // ========== FOUNTAIN VAULTS ==========
  {
    id: 'fountain_shrine',
    name: 'Healing Shrine',
    minDepth: 5,
    width: 7,
    height: 7,
    layout: ['#######', '#.....#', '#.....#', '#..F..#', '#.....#', '#.....#', '###.###'],
    monsterDensity: 0,
    safeZone: true,
    features: { fountainId: 'healing_fountain' },
  },
  {
    id: 'mystic_pool',
    name: 'Mystic Pool',
    minDepth: 15,
    width: 9,
    height: 9,
    layout: [
      '#########',
      '#.......#',
      '#.#####.#',
      '#.#FFF#.#',
      '#.#FFF#.#',
      '#.#####.#',
      '#.......#',
      '#.......#',
      '####.####',
    ],
    monsterDensity: 0.3,
    features: { fountainId: 'restoration_fountain' },
  },
  {
    id: 'mysterious_grotto',
    name: 'Mysterious Grotto',
    minDepth: 10,
    width: 9,
    height: 7,
    layout: [
      '#########',
      '#.......#',
      '#..F.F..#',
      '#.......#',
      '#..F.F..#',
      '#.......#',
      '####.####',
    ],
    monsterDensity: 0.2,
    features: { fountainId: 'mysterious_fountain' },
  },

  // ========== MERCHANT VAULTS ==========
  {
    id: 'traveling_merchant',
    name: 'Merchant Camp',
    minDepth: 8,
    width: 11,
    height: 9,
    layout: [
      '###########',
      '#.........#',
      '#.#.....#.#',
      '#.........#',
      '#....@....#',
      '#.........#',
      '#.%.%.%.%.#',
      '#.........#',
      '#####.#####',
    ],
    monsterDensity: 0,
    safeZone: true,
    features: { merchantId: 'wandering_trader' },
  },
  {
    id: 'arms_dealer_camp',
    name: 'Arms Dealer',
    minDepth: 15,
    width: 9,
    height: 7,
    layout: [
      '#########',
      '#].].].]#',
      '#.......#',
      '#...@...#',
      '#.......#',
      '#].].].]#',
      '####.####',
    ],
    monsterDensity: 0,
    safeZone: true,
    features: { merchantId: 'arms_dealer' },
  },
  {
    id: 'alchemist_lab',
    name: 'Alchemist Lab',
    minDepth: 10,
    width: 9,
    height: 7,
    layout: [
      '#########',
      '#!.!.!.!#',
      '#.......#',
      '#...@...#',
      '#.......#',
      '#!.!.!.!#',
      '####.####',
    ],
    monsterDensity: 0,
    safeZone: true,
    features: { merchantId: 'alchemist' },
  },
  {
    id: 'black_market_den',
    name: 'Black Market Den',
    minDepth: 30,
    width: 11,
    height: 9,
    layout: [
      '###########',
      '##.......##',
      '#..%.%.%..#',
      '#.........#',
      '#....@....#',
      '#.........#',
      '#..%.%.%..#',
      '##.......##',
      '#####.#####',
    ],
    monsterDensity: 0,
    safeZone: true,
    features: { merchantId: 'black_market' },
  },

  // ========== LIBRARY VAULTS ==========
  {
    id: 'ancient_library',
    name: 'Ancient Library',
    minDepth: 12,
    width: 11,
    height: 9,
    layout: [
      '###########',
      '#?#?#?#?#?#',
      '#.........#',
      '#?#.....#?#',
      '#....*....#',
      '#?#.....#?#',
      '#.........#',
      '#?#?#?#?#?#',
      '#####.#####',
    ],
    monsterDensity: 0.3,
    features: { itemType: 'scroll', itemTier: 2 },
  },
  {
    id: 'scriptorium',
    name: 'Scriptorium',
    minDepth: 20,
    width: 9,
    height: 7,
    layout: [
      '#########',
      '#?.?.?.?#',
      '#.......#',
      '#?.?.?.?#',
      '#.......#',
      '#?.?.?.?#',
      '####.####',
    ],
    monsterDensity: 0.2,
    features: { itemType: 'scroll', itemTier: 3 },
  },

  // ========== ARMORY VAULTS ==========
  {
    id: 'abandoned_armory',
    name: 'Abandoned Armory',
    minDepth: 10,
    width: 9,
    height: 7,
    layout: [
      '#########',
      '#].].].]#',
      '#.......#',
      '#].].].]+',
      '#.......#',
      '#].].].]#',
      '#########',
    ],
    monsterDensity: 0.8,
    features: { itemType: 'equipment' },
  },
  {
    id: 'weapon_cache',
    name: 'Weapon Cache',
    minDepth: 18,
    width: 7,
    height: 7,
    layout: ['#######', '#]...]#', '#.....#', '#].M.]#', '#.....#', '#]...]#', '###.###'],
    monsterDensity: 1.0,
    features: { itemType: 'equipment' },
  },

  // ========== ALTAR VAULTS ==========
  {
    id: 'forgotten_altar',
    name: 'Forgotten Altar',
    minDepth: 15,
    width: 9,
    height: 9,
    layout: [
      '#########',
      '#.......#',
      '#.#####.#',
      '#.#...#.#',
      '#.#._.#.#',
      '#.#...#.#',
      '#.##.##.#',
      '#.......#',
      '####.####',
    ],
    monsterDensity: 0,
    safeZone: true,
    features: { altarId: 'blessing_altar' },
  },
  {
    id: 'temple_ruins',
    name: 'Temple Ruins',
    minDepth: 25,
    width: 11,
    height: 9,
    layout: [
      '###########',
      '#.........#',
      '#.#.#.#.#.#',
      '#.........#',
      '#...._.....#',
      '#.........#',
      '#.#.#.#.#.#',
      '#.........#',
      '#####.#####',
    ],
    monsterDensity: 0.5,
    features: { altarId: 'enchantment_altar' },
  },

  // ========== POTION VAULTS ==========
  {
    id: 'alchemist_stash',
    name: 'Alchemist Stash',
    minDepth: 8,
    width: 7,
    height: 5,
    layout: ['#######', '#!.!.!#', '#.....#', '#!.!.!#', '###.###'],
    monsterDensity: 0.2,
    features: { itemType: 'potion' },
  },
]

/**
 * Get vaults available at a given depth
 */
export function getAvailableVaults(depth: number): VaultTemplate[] {
  return VAULTS.filter((v) => v.minDepth <= depth)
}

/**
 * Try to place a vault in the level
 * Returns null if no suitable location found
 */
export function tryPlaceVault(
  tiles: Tile[][],
  rooms: RoomData[],
  width: number,
  height: number,
  depth: number,
  vaultChance: number
): VaultPlacement | null {
  // Check if we should place a vault
  if (random() > vaultChance) return null

  const available = getAvailableVaults(depth)
  if (available.length === 0) return null

  // Pick a random vault (weighted towards non-merchant vaults)
  const weights = available.map((v) => {
    if (v.features?.merchantId) return 0.5 // Merchants are rarer
    if (v.safeZone) return 0.7 // Safe zones slightly rarer
    return 1.0
  })
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let roll = random() * totalWeight

  let vault: VaultTemplate = available[0]!
  for (let i = 0; i < available.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) {
      vault = available[i]!
      break
    }
  }

  // Try to find a placement location
  const position = findVaultPlacement(tiles, vault, width, height, rooms)
  if (!position) return null

  // Place the vault
  return placeVault(tiles, vault, position)
}

/**
 * Find a suitable position for a vault
 */
function findVaultPlacement(
  tiles: Tile[][],
  vault: VaultTemplate,
  width: number,
  height: number,
  rooms: RoomData[]
): Point | null {
  const attempts = 50

  for (let i = 0; i < attempts; i++) {
    const x = randomInt(2, width - vault.width - 3)
    const y = randomInt(2, height - vault.height - 3)

    if (isValidVaultPosition(tiles, x, y, vault, rooms)) {
      return { x, y }
    }
  }

  return null
}

/**
 * Check if a position is valid for vault placement
 */
function isValidVaultPosition(
  tiles: Tile[][],
  x: number,
  y: number,
  vault: VaultTemplate,
  rooms: RoomData[]
): boolean {
  // Check that at least 60% of the area is wall
  let wallCount = 0
  let total = 0

  for (let vy = 0; vy < vault.height; vy++) {
    for (let vx = 0; vx < vault.width; vx++) {
      const tile = tiles[y + vy]?.[x + vx]
      if (!tile) return false
      total++
      if (tile.type === 'wall') wallCount++
    }
  }

  if (wallCount / total < 0.6) return false

  // Check we're not overlapping existing rooms too much
  for (const room of rooms) {
    const overlapX = Math.max(
      0,
      Math.min(x + vault.width, room.x + room.width) - Math.max(x, room.x)
    )
    const overlapY = Math.max(
      0,
      Math.min(y + vault.height, room.y + room.height) - Math.max(y, room.y)
    )
    const overlapArea = overlapX * overlapY

    if (overlapArea > room.width * room.height * 0.3) {
      return false
    }
  }

  return true
}

/**
 * Actually place a vault at the given position
 */
function placeVault(tiles: Tile[][], vault: VaultTemplate, position: Point): VaultPlacement {
  const lootPositions: Point[] = []
  const monsterPositions: Point[] = []
  const goldPositions: Point[] = []
  const fountainPositions: { x: number; y: number; fountainId: string }[] = []
  const altarPositions: { x: number; y: number; altarId: string }[] = []
  const merchantPositions: { x: number; y: number; merchantId: string }[] = []
  const shopItemPositions: Point[] = []
  const scrollPositions: Point[] = []
  const potionPositions: Point[] = []
  const equipmentPositions: Point[] = []
  const trapPositions: { x: number; y: number; trapId: string }[] = []

  const features = vault.features ?? {}

  for (let vy = 0; vy < vault.height; vy++) {
    const layoutRow = vault.layout[vy]
    if (!layoutRow) continue

    for (let vx = 0; vx < vault.width; vx++) {
      const char = layoutRow[vx]
      const worldX = position.x + vx
      const worldY = position.y + vy
      const tile = tiles[worldY]?.[worldX]

      if (!tile) continue

      switch (char) {
        case '#':
          tile.type = 'wall'
          break
        case '.':
          tile.type = 'floor'
          break
        case '+':
          tile.type = 'door_closed'
          break
        case '*':
          tile.type = 'floor'
          lootPositions.push({ x: worldX, y: worldY })
          break
        case 'M':
          tile.type = 'floor'
          monsterPositions.push({ x: worldX, y: worldY })
          break
        case '$':
          tile.type = 'floor'
          goldPositions.push({ x: worldX, y: worldY })
          break
        case 'F':
          tile.type = 'fountain'
          fountainPositions.push({
            x: worldX,
            y: worldY,
            fountainId: features.fountainId ?? 'healing_fountain',
          })
          break
        case '_':
          tile.type = 'altar'
          altarPositions.push({
            x: worldX,
            y: worldY,
            altarId: features.altarId ?? 'blessing_altar',
          })
          break
        case '@':
          tile.type = 'floor'
          merchantPositions.push({
            x: worldX,
            y: worldY,
            merchantId: features.merchantId ?? 'wandering_trader',
          })
          break
        case '%':
          tile.type = 'floor'
          shopItemPositions.push({ x: worldX, y: worldY })
          break
        case '?':
          tile.type = 'floor'
          scrollPositions.push({ x: worldX, y: worldY })
          break
        case '!':
          tile.type = 'floor'
          potionPositions.push({ x: worldX, y: worldY })
          break
        case ']':
          tile.type = 'floor'
          equipmentPositions.push({ x: worldX, y: worldY })
          break
        case '^':
          tile.type = 'floor'
          trapPositions.push({
            x: worldX,
            y: worldY,
            trapId: features.trapId ?? 'spike_trap',
          })
          break
      }
    }
  }

  return {
    vault,
    position,
    lootPositions,
    monsterPositions,
    goldPositions,
    fountainPositions,
    altarPositions,
    merchantPositions,
    shopItemPositions,
    scrollPositions,
    potionPositions,
    equipmentPositions,
    trapPositions,
  }
}
