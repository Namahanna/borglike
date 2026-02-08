/**
 * Town Data and Layout
 *
 * Village square design with corner buildings facing a central plaza.
 * The town is a safe zone with healer, 5 specialized shops, and dungeon entrance.
 */

import type { Point } from '../types'

// ============================================================================
// TOWN LAYOUT
// ============================================================================

/**
 * Fixed ASCII town layout (48x16) - Village square with corner buildings
 *
 * Legend:
 * # = Wall (permanent)
 * + = Door (walkable, visual marker)
 * , = Cobblestone floor (walkable)
 * : = Rubble/debris (walkable, decorative)
 * ~ = Fountain (walkable, decorative)
 * 1-5 = Shop keeper positions (General, Armory, Weapons, Alchemy, Magic)
 * H = Healer position
 * < = Dungeon entrance (stairs to depth 1)
 * @ = Player spawn / portal spawn area
 */
export const TOWN_LAYOUT = `
################################################
##########,,,,,,,,,,,,,,,,,,,,,,,,,,,,##########
##      ##,,,,,,,,,,,,,,,,,,,,,,,,,,,,##      ##
##  1    +,,,,,,,,,,,,,,,,,,,,,,,,,,,,+    H  ##
##      ##,,,,,,,,,,,,,,,~,,,,,,,,,,,,##      ##
##########,,,,,,,,,,,,,,,,,,,,,,,,,,,,##########
######,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,######
#,,,,,,,,,,,,,,,,<,,,,,,,,,,@,,,,,,,,,,,,,,,,,,#
######,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,######
##########,,,,,,,,,,,,,,,,,,,,,,,,,,,,##########
##      ##,,,,,,,,:::,,,,,,:::,,,,,,,,##      ##
##  2    +,,,,,,,,:::,,,,,,:::,,,,,,,,+    5  ##
##  3    +,,,,,,,,,,,,,,,,,,,,,,,,,,,,+    4  ##
##      ##,,,,,,,,,,,,,,,,,,,,,,,,,,,,##      ##
##########,,,,,,,,,,,,,,,,,,,,,,,,,,,,##########
################################################
`.trim()

// ============================================================================
// TOWN DIMENSIONS
// ============================================================================

export const TOWN_WIDTH = 48
export const TOWN_HEIGHT = 16

// ============================================================================
// SHOP CONFIGURATION
// ============================================================================

/** Town shop IDs in order (1-5) */
export const TOWN_SHOP_IDS = [
  'town_general',
  'town_armory',
  'town_weapons',
  'town_alchemy',
  'town_magic',
] as const

export type TownShopId = (typeof TOWN_SHOP_IDS)[number]

/**
 * Shop positions indexed by shop ID
 *
 * Layout (village square):
 * - Top-left building: General Store (1)
 * - Top-right building: Healer (H)
 * - Bottom-left building: Armory (2) and Weapons (3)
 * - Bottom-right building: Alchemy (4) and Magic (5)
 */
export const TOWN_SHOP_POSITIONS: Record<TownShopId, Point> = {
  town_general: { x: 4, y: 3 }, // Top-left building
  town_armory: { x: 4, y: 11 }, // Bottom-left, upper floor
  town_weapons: { x: 4, y: 12 }, // Bottom-left, lower floor
  town_alchemy: { x: 43, y: 12 }, // Bottom-right, lower floor
  town_magic: { x: 43, y: 11 }, // Bottom-right, upper floor
}

// ============================================================================
// NPC AND FEATURE POSITIONS
// ============================================================================

/** Healer NPC position (H in layout) - Top-right building */
export const HEALER_POSITION: Point = { x: 43, y: 3 }

/** Dungeon entrance position (< in layout) - Left side of central plaza */
export const DUNGEON_ENTRANCE_POSITION: Point = { x: 17, y: 7 }

/** Player/portal spawn position (@ in layout) - Right side of central plaza */
export const PORTAL_SPAWN_POSITION: Point = { x: 28, y: 7 }

/** Fountain position (~ in layout) - Center of upper plaza */
export const WELL_POSITION: Point = { x: 25, y: 4 }

// ============================================================================
// HEALER COSTS
// ============================================================================

/** Gold cost per HP healed (cheaper than potions) */
export const HEALER_COST_PER_HP = 0.25

// ============================================================================
// PORTAL CONSTANTS
// ============================================================================

/** Number of turns a town portal lasts */
export const PORTAL_DURATION = 1000
