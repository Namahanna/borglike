/**
 * Dungeon generation types
 */

/** Generator type determines the algorithm used */
export type GeneratorType = 'classic' | 'cavern' | 'labyrinth'

/** Depth-based profile controlling generation parameters */
export interface DepthProfile {
  /** Weighted probabilities for generator selection (should sum to 1) */
  generatorWeights: {
    classic: number
    cavern: number
    labyrinth: number
  }
  /** Room count range [min, max] */
  roomCount: [number, number]
  /** Room size range [min, max] for width/height */
  roomSize: [number, number]
  /** Corridor length range [min, max] */
  corridorLength: [number, number]
  /** Target percentage of level to dig (0-1) */
  dugPercentage: number
  /** Probability of placing a door at valid positions (0-1) */
  doorChance: number
  /** Probability of attempting vault placement (0-1) */
  vaultChance: number
}

/** Room data extracted from generators */
export interface RoomData {
  /** Top-left X coordinate */
  x: number
  /** Top-left Y coordinate */
  y: number
  /** Room width */
  width: number
  /** Room height */
  height: number
  /** Center point */
  center: { x: number; y: number }
}

/** Feature configuration for vault templates */
export interface VaultFeatureConfig {
  /** Fountain ID to place (for 'F' chars) */
  fountainId?: string
  /** Altar ID to place (for '_' chars) */
  altarId?: string
  /** Merchant ID to place (for '@' chars) */
  merchantId?: string
  /** Trap ID to place (for '^' chars) */
  trapId?: string
  /** Item type for '%' positions */
  itemType?: 'scroll' | 'potion' | 'equipment' | 'any'
  /** Item tier override for loot positions */
  itemTier?: number
}

/** Vault template for special pre-designed rooms */
export interface VaultTemplate {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Minimum depth to spawn */
  minDepth: number
  /** Template width */
  width: number
  /** Template height */
  height: number
  /**
   * ASCII layout where:
   * '#' = wall
   * '.' = floor
   * '+' = door (closed)
   * '*' = loot position (floor with guaranteed item)
   * 'M' = monster spawn position
   * '$' = gold pile position
   * 'F' = fountain position
   * '_' = altar position
   * '@' = merchant position
   * '%' = shop item position
   * '?' = scroll spawn position
   * '!' = potion spawn position
   * ']' = equipment spawn position
   * '^' = trap position
   */
  layout: string[]
  /** Monster density multiplier (1.0 = normal) */
  monsterDensity: number
  /** Feature configuration */
  features?: VaultFeatureConfig
  /** Is this a safe zone (no monster spawns nearby) */
  safeZone?: boolean
}

/** Result of vault placement */
export interface VaultPlacement {
  /** The vault that was placed */
  vault: VaultTemplate
  /** Top-left position where it was placed */
  position: { x: number; y: number }
  /** Positions marked for loot spawning */
  lootPositions: { x: number; y: number }[]
  /** Positions marked for monster spawning */
  monsterPositions: { x: number; y: number }[]
  /** Positions for gold piles */
  goldPositions: { x: number; y: number }[]
  /** Fountain positions with IDs */
  fountainPositions: { x: number; y: number; fountainId: string }[]
  /** Altar positions with IDs */
  altarPositions: { x: number; y: number; altarId: string }[]
  /** Merchant positions with IDs */
  merchantPositions: { x: number; y: number; merchantId: string }[]
  /** Shop item positions */
  shopItemPositions: { x: number; y: number }[]
  /** Scroll spawn positions */
  scrollPositions: { x: number; y: number }[]
  /** Potion spawn positions */
  potionPositions: { x: number; y: number }[]
  /** Equipment spawn positions */
  equipmentPositions: { x: number; y: number }[]
  /** Trap positions with IDs */
  trapPositions: { x: number; y: number; trapId: string }[]
}
