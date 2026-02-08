/**
 * Unified game types for Borglike
 *
 * Core type definitions for game state, entities, and events.
 * Data types (Race, GameClass, etc.) are re-exported from data modules.
 */

// Import data types for use in this file
import type { Race, RaceAbility, StatModifiers } from './data/races'
import type { GameClass } from './data/classes'
import type { MonsterTemplate } from './data/monsters'
import type { ItemTemplate } from './data/items'
import type { ArtifactTemplate } from './data/artifacts'
import type { UpgradeBonuses } from './upgrade-effects'
import type { BoosterBonuses } from './booster-effects'
import type { FountainTemplate, AltarTemplate } from './data/features'
import type { MerchantTemplate } from './data/merchants'
import type { GoldPileTemplate } from './data/gold'
import type { TrapTemplate } from './data/traps'
import type { VaultPlacement, GeneratorType } from './dungeon/types'
import type {
  BestiaryEntry,
  BotCapabilities,
  BotToggles,
  SweepLevelRange,
  SurfLevelRange,
} from '@/types/progression'
import type { PersonalityConfig } from '@bot/types'

// Re-export data types
export type {
  Race,
  RaceAbility,
  StatModifiers,
  GameClass,
  MonsterTemplate,
  ItemTemplate,
  ArtifactTemplate,
  UpgradeBonuses,
  BoosterBonuses,
  FountainTemplate,
  AltarTemplate,
  MerchantTemplate,
  GoldPileTemplate,
  TrapTemplate,
  BestiaryEntry,
  GeneratorType,
}

// ============================================================================
// GAME CONSTANTS
// ============================================================================

/** Maximum dungeon depth */
export const MAX_DEPTH = 50

/** Field of view radius */
export const FOV_RADIUS = 8

// ============================================================================
// COORDINATES & POSITIONING
// ============================================================================

/** 2D coordinate */
export interface Point {
  x: number
  y: number
}

// ============================================================================
// POINT & DISTANCE UTILITIES
// ============================================================================

/** Convert point to string key for Map/Set usage */
export function posKey(p: Point): string {
  return `${p.x},${p.y}`
}

/** Chebyshev distance (king's move / diagonal distance) */
export function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/** Manhattan distance (taxicab / 4-directional distance) */
export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/** Check if two points are the same */
export function isSamePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

/** Check if two points are adjacent (including diagonals, excluding same point) */
export function isAdjacent(a: Point, b: Point): boolean {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  return dx <= 1 && dy <= 1 && dx + dy > 0
}

// ============================================================================
// DIRECTIONS
// ============================================================================

/** Direction for movement (8-directional + wait) */
export type Direction = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'wait'

/** Direction vectors */
export const DIRECTION_VECTORS: Record<Direction, Point> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
  wait: { x: 0, y: 0 },
}

/**
 * Convert delta movement to direction
 */
export function getDirectionFromDelta(dx: number, dy: number): Direction | null {
  if (dx === 0 && dy === -1) return 'n'
  if (dx === 0 && dy === 1) return 's'
  if (dx === 1 && dy === 0) return 'e'
  if (dx === -1 && dy === 0) return 'w'
  if (dx === 1 && dy === -1) return 'ne'
  if (dx === -1 && dy === -1) return 'nw'
  if (dx === 1 && dy === 1) return 'se'
  if (dx === -1 && dy === 1) return 'sw'
  return null
}

// ============================================================================
// TILES & DUNGEON
// ============================================================================

/** Tile types in the dungeon */
export type TileType =
  | 'wall'
  | 'floor'
  | 'door_closed'
  | 'door_open'
  | 'stairs_down'
  | 'stairs_up'
  | 'fountain'
  | 'fountain_empty'
  | 'altar'
  | 'portal' // Active town portal
  | 'dungeon_entrance' // Town stairs to depth 1
  | 'healer' // Healer NPC tile
  // Town decorative tiles
  | 'cobblestone' // Town floor with visual variety
  | 'town_door' // Shop entrance (visual marker)
  | 'rubble' // Decorative debris
  | 'town_fountain' // Town fountain (decorative)

/** A single tile in the dungeon */
export interface Tile {
  type: TileType
  explored: boolean
  visible: boolean
}

/** Dungeon level */
export interface DungeonLevel {
  depth: number
  width: number
  height: number
  tiles: Tile[][]
  stairsUp: Point | null
  stairsDown: Point | null
  /** Incrementally maintained count of explored tiles (avoids full-scan) */
  exploredCount: number
  /** Total passable tiles (set at generation, immutable). Exploration progress denominator. */
  passableCount: number
  /** Explored passable tiles (incremented alongside exploredCount). Exploration progress numerator. */
  exploredPassableCount: number
  /** Pre-computed passability bitmap: 1 = walkable/door, indexed by y * width + x */
  passable: Uint8Array
  /** Explored bitmap: 1 = explored, indexed by y * width + x. Updated alongside tile.explored */
  explored: Uint8Array
  /** Generator type used to create this level (labyrinth, cavern, classic) */
  generatorType?: GeneratorType
  /** Vault placement data (if a vault was placed on this level) */
  vault?: VaultPlacement | null
}

// ============================================================================
// RESISTANCES
// ============================================================================

/** Types of damage/effects that can be resisted */
export type ResistanceType =
  | 'POISON'
  | 'FIRE'
  | 'COLD'
  | 'ACID'
  | 'LIGHTNING'
  | 'LIGHT'
  | 'DARK'
  | 'DRAIN'

/**
 * Resistance values for different damage types
 * 0 = none, 50 = half damage, 100 = immune, -50/-100 = vulnerable
 */
export type Resistances = Partial<Record<ResistanceType, number>>

// ============================================================================
// STATUS EFFECTS
// ============================================================================

/** Types of temporary status effects (buffs and debuffs) */
export type StatusEffectType =
  | 'speed'
  | 'heroism'
  | 'berserk'
  | 'blessing'
  | 'protection'
  | 'prot_from_evil' // Halves damage from EVIL monsters (priest)
  | 'stun'
  | 'immunity_fear'
  | 'active_form'
  | 'enhanced_light' // +2 FOV radius from Light Orb spell
  | 'sneak_attack' // Rogue's post-teleport 2.5x damage buff (consumed on attack)
  | 'damage_bonus' // Flat damage bonus from buff spells (e.g. warrior shout)
  | 'ac_bonus' // Flat AC bonus from buff spells (e.g. stone skin)
  // Debuffs (from monster attacks)
  | 'blind'
  | 'confused'
  | 'paralyzed'
  | 'slowed'
  | 'terrified'
  | 'drained'
  | 'poisoned' // DOT effect, value = damage per turn

// ============================================================================
// MONSTER ATTACK TYPES
// ============================================================================

/** How the monster delivers the attack */
export type MonsterAttackMethod =
  | 'HIT'
  | 'BITE'
  | 'CLAW'
  | 'TOUCH'
  | 'STING'
  | 'CRUSH'
  | 'GAZE'
  | 'ENGULF'

/** Elemental damage types */
export type Element = 'FIRE' | 'COLD' | 'ELEC' | 'ACID' | 'POISON' | 'DARK'

/** Effect of a monster attack */
export type AttackEffect =
  | { type: 'HURT' }
  | { type: 'ELEMENTAL'; element: Element }
  | { type: 'PARALYZE' }
  | { type: 'BLIND' }
  | { type: 'CONFUSE' }
  | { type: 'TERRIFY' }
  | { type: 'SLOW' }
  | { type: 'DRAIN' }

/** A single monster attack definition */
export interface MonsterAttack {
  method: MonsterAttackMethod
  dice: string // "2d6", "1d8+2"
  effect: AttackEffect
}

/** Monster spell types (for casters, breathers) */
export type MonsterSpell =
  | 'BR_FIRE'
  | 'BR_COLD'
  | 'BR_ELEC'
  | 'BR_ACID'
  | 'BR_POISON'
  | 'BR_DARK'
  | 'BO_FIRE'
  | 'BO_COLD'
  | 'BO_ELEC'
  | 'BO_ACID'
  | 'HEAL'
  | 'BLINK'
  | 'HASTE'
  | 'SUMMON'
  | 'BLIND'
  | 'SLOW'
  | 'CONFUSE'
  | 'SCARE'
  | 'HOLD'
  | 'BRAIN_SMASH'

/** Monster spellcasting capability */
export interface MonsterSpells {
  freq: number // 1-in-N chance each turn
  list: MonsterSpell[]
}

/** Fixed durations for debuff status effects (in turns) */
export const STATUS_DURATIONS: Record<string, number> = {
  blind: 3,
  confused: 3,
  paralyzed: 2,
  slowed: 4,
  terrified: 3,
  drained: 10,
}

/** A temporary status effect on the character */
export interface StatusEffect {
  type: StatusEffectType
  turnsRemaining: number
  /** Effect strength. For 'poisoned', this is damage per turn. */
  value: number
}

/** A temporary resistance granted by consumables */
export interface TempResistance {
  type: ResistanceType
  turnsRemaining: number
  value: number
}

// ============================================================================
// STATS & DERIVED VALUES
// ============================================================================

/** Core character stats */
export interface Stats {
  str: number // Strength - melee damage, carry capacity
  int: number // Intelligence - mana, magic device skill
  wis: number // Wisdom - mana regen, saving throws
  dex: number // Dexterity - accuracy, evasion, speed
  con: number // Constitution - HP, regen
}

/** Derived combat stats */
export interface CombatStats {
  maxHp: number
  maxMp: number
  armor: number // Damage reduction
  accuracy: number // Hit chance modifier
  evasion: number // Dodge chance modifier
  meleeDamage: number // Base melee damage
  rangedDamage: number // DEX-based bow damage
  rangedAccuracy: number // DEX-based hit bonus for ranged
  speed: number // Action speed (100 = normal)
}

// ============================================================================
// ITEMS & EQUIPMENT
// ============================================================================

/** Equipment slot names */
export type EquipSlot =
  | 'weapon'
  | 'bow'
  | 'armor'
  | 'shield'
  | 'helm'
  | 'gloves'
  | 'boots'
  | 'ring1'
  | 'ring2'
  | 'amulet'
  | 'light'

/** An item instance in the game (not just template) */
export interface Item {
  id: string
  template: ItemTemplate
  /** For equipment: bonus beyond base (e.g., +2 sword) */
  enchantment: number
  /** Is this an artifact? */
  artifact: ArtifactTemplate | null
  /** Shop price (set when item is from merchant) */
  shopPrice?: number
  /** For gold items: the gold pile template */
  goldTemplate?: GoldPileTemplate
  /** For gold items: pre-rolled gold value */
  goldValue?: number
}

/** Item on the ground with position information */
export interface GroundItem extends Item {
  position: Point
}

/** Player's equipped items */
export type Equipment = Partial<Record<EquipSlot, Item>>

// ============================================================================
// CHARACTER
// ============================================================================

/** A player character */
export interface Character {
  // Identity
  id: string
  name: string
  raceId: string
  classId: string

  // Core stats (base + race + class modifiers)
  baseStats: Stats
  stats: Stats // Computed with all modifiers

  // Resources
  hp: number
  maxHp: number
  mp: number
  maxMp: number

  // Progression
  level: number
  xp: number
  xpToNextLevel: number

  // Combat derived stats
  combat: CombatStats

  // Resistances (from race + equipment)
  resistances: Resistances

  // Status effects (includes 'poisoned' which deals DOT damage)
  statusEffects: StatusEffect[]
  tempResistances: TempResistance[]

  // Inventory
  equipment: Equipment
  inventory: Item[]
  gold: number

  // Position
  position: Point
  depth: number

  // State
  isDead: boolean

  // Upgrade bonuses (stored for recalculation on level up/equip)
  upgradeBonuses?: UpgradeBonuses

  // HP scaling fraction (from balance config, stored for recalculation)
  baseHpFraction: number

  // Spells
  knownSpells: string[]
  spellCooldowns: Record<string, number> // spellId -> turn when spell becomes available

  // SHAPESHIFTING: Active form ID for Druid/Necromancer (null = normal form)
  activeFormId: string | null

  // ACTIVATIONS: Cooldown tracking for artifact/racial abilities
  activationCooldowns: Record<string, number> // activationId -> turn when available
  racialAbilityLastUse: number // Turn of last racial ability use
}

// ============================================================================
// MONSTERS
// ============================================================================

/** A debuff effect on a monster */
export interface MonsterDebuff {
  type: 'slow' | 'weaken' | 'blind'
  turnsRemaining: number
  value: number
}

/** A buff effect on a monster */
export interface MonsterBuff {
  type: 'haste'
  turnsRemaining: number
  /** Speed bonus percentage (e.g., 50 = +50% speed) */
  value: number
}

/** A monster instance in the game */
export interface Monster {
  id: string
  template: MonsterTemplate
  hp: number
  maxHp: number
  position: Point
  /** Turns until monster acts (for speed system) */
  energy: number
  /** Is the monster aware of the player? */
  isAwake: boolean
  /** Has this monster been seen by the player? */
  seen: boolean
  /** Active debuffs on this monster */
  debuffs: MonsterDebuff[]
  /** Active buffs on this monster */
  buffs: MonsterBuff[]
}

/** Check if monster is a boss or unique (dangerous target) */
export function isBossOrUnique(m: Monster): boolean {
  return m.template.flags?.includes('UNIQUE') || m.template.flags?.includes('BOSS') || false
}

/** Check if a living monster occupies the given position */
export function isMonsterAt(monsters: Monster[], pos: Point): boolean {
  return monsters.some((m) => m.position.x === pos.x && m.position.y === pos.y && m.hp > 0)
}

/** Get the living monster at the given position, if any */
export function getMonsterAt(monsters: Monster[], pos: Point): Monster | undefined {
  return monsters.find((m) => m.position.x === pos.x && m.position.y === pos.y && m.hp > 0)
}

// ============================================================================
// MINIONS (Player Pets/Summons)
// ============================================================================

/** Minion type (determines behavior and appearance) */
export type MinionType = 'wolf' | 'skeleton' | 'bear'

/** A minion/pet instance controlled by the player */
export interface Minion {
  id: string
  type: MinionType
  name: string
  hp: number
  maxHp: number
  position: Point
  /** Base damage dealt by this minion */
  damage: number
  /** Turns until minion acts (for speed system) */
  energy: number
  /** Is this a permanent pet (wolf) or temporary summon (skeleton)? */
  permanent: boolean
  /** For temporary summons, turns remaining before it expires */
  turnsRemaining?: number
}

/** Minion template for spawning */
export interface MinionTemplate {
  type: MinionType
  name: string
  maxHp: number
  damage: number
  speed: number // Energy cost per action (100 = normal)
  permanent: boolean
  maxCount: number // Max alive at once (1 for wolf/bear, 2 for skeleton)
  duration?: number // Turns for temporary summons
}

/** Default minion templates */
export const MINION_TEMPLATES: Record<MinionType, MinionTemplate> = {
  wolf: {
    type: 'wolf',
    name: 'Wolf Companion',
    maxHp: 30,
    damage: 6,
    speed: 110, // Fast
    permanent: true,
    maxCount: 1,
  },
  skeleton: {
    type: 'skeleton',
    name: 'Skeletal Warrior',
    maxHp: 20,
    damage: 4,
    speed: 100,
    permanent: true,
    maxCount: 2,
  },
  bear: {
    type: 'bear',
    name: 'Bear Companion',
    maxHp: 60,
    damage: 12,
    speed: 90, // Slower but tanky
    permanent: true,
    maxCount: 1,
  },
}

// ============================================================================
// UNIQUE TRACKING
// ============================================================================

/** State for tracking unique monster spawns and kills within a run */
export interface UniqueState {
  /** Unique names that have spawned this run (spawn once per run) */
  spawned: Set<string>
  /** Unique names killed this run */
  killed: Set<string>
}

/** Get list of unique names that are spawned but not yet killed */
export function getLivingUniques(state: UniqueState): string[] {
  return [...state.spawned].filter((name) => !state.killed.has(name))
}

/** Check if a specific unique is alive (spawned and not killed) */
export function isUniqueAlive(state: UniqueState, name: string): boolean {
  return state.spawned.has(name) && !state.killed.has(name)
}

// ============================================================================
// GAME STATE
// ============================================================================

/** In-engine run statistics accumulator */
export interface RunTally {
  kills: number
  goldCollected: number
  goldSpent: number
  damageDealt: number
  damageTaken: number
  itemsFound: number
  itemsBought: number
  itemsSold: number
  spellsCast: number
  abilitiesUsed: number
  turnsPlayed: number
  deepestDepth: number
  startTime: number
  endTime: number | null
  monsterKills: Record<string, number> // monster name → kill count
  itemsDiscovered: Record<string, { depth: number; isArtifact: boolean }> // item name → discovery info

  // === DAMAGE DEALT BREAKDOWN ===
  damageBySource: {
    melee: number
    ranged: number
    spell: Record<string, number> // spell name -> damage
    ability: Record<string, number> // ability name -> damage
    minion: number
  }

  // === DAMAGE TAKEN BREAKDOWN ===
  damageByElement: Record<string, number> // physical|fire|cold|elec|poison|acid|dark -> damage
  damageByMethod: { melee: number; breath: number; spell: number; trap: number }
  damageTakenByMonster: Record<string, number> // monster name -> damage

  // === RESOURCE USAGE ===
  spellUsage: Record<string, { casts: number; damage: number; mana: number }> // by spell name
  abilityUsage: Record<string, { uses: number; damage: number }> // by ability name
  consumablesUsed: { healingPotions: number; buffPotions: number; scrolls: Record<string, number> }

  // === COMBAT ACCURACY ===
  meleeHits: number
  meleeMisses: number
  rangedHits: number
  rangedMisses: number
  criticalHits: number
  attacksDodged: number

  // === SURVIVAL ===
  healingBySource: {
    potions: number
    spells: number
    regen: number
    lifesteal: number
    other: number
  }
  statusEffectsSuffered: Record<string, number> // effect type -> count
  closeCalls: number // HP dropped below 20%
}

/** Active fountain state */
export interface FountainState {
  template: FountainTemplate
  position: Point
  usesRemaining: number
}

/** Active altar state */
export interface AltarState {
  template: AltarTemplate
  position: Point
}

/** Active merchant state */
export interface MerchantState {
  template: MerchantTemplate
  position: Point
  /** Items for sale */
  inventory: Item[]
  /** Gold the merchant has for buying items */
  gold: number
}

/** Active trap state */
export interface TrapState {
  template: TrapTemplate
  position: Point
  /** Has the trap been revealed to the player? */
  revealed: boolean
  /** Has the trap been triggered? */
  triggered: boolean
  /** Turn when trap will rearm (null = won't rearm or already ready) */
  rearmTurn: number | null
}

/** Cached entity state for a dungeon level (monsters, items, features) */
export interface LevelEntityState {
  monsters: Monster[]
  items: GroundItem[]
  fountains: Map<string, FountainState>
  altars: Map<string, AltarState>
  merchants: MerchantState[]
  traps: Map<string, TrapState>
}

/** Town portal state - tracks active portal between town and dungeon */
export interface TownPortalState {
  /** Position in dungeon where portal was opened */
  dungeonPosition: Point
  /** Dungeon depth where portal was opened */
  dungeonDepth: number
  /** Turn when portal was created */
  createdTurn: number
  /** Turns remaining before portal expires */
  turnsRemaining: number
  /** Position of portal in town */
  townPosition: Point
  /** Original tile type at dungeon position (to restore when portal closes) */
  originalTileType: TileType
}

/** Healer NPC state in town */
export interface HealerState {
  /** Position of healer in town */
  position: Point
  /** Gold cost per HP healed */
  costPerHP: number
}

/** Complete game state for a single run */
export interface GameState {
  // Run identity
  runId: string
  seed: number // RNG seed for reproducibility

  // Player
  character: Character

  // Dungeon
  currentLevel: DungeonLevel
  /** Cache of generated levels (for returning to previous depths) */
  levelCache: Map<number, DungeonLevel>
  /** Cache of entity state per level (monsters, items, features) */
  entityCache: Map<number, LevelEntityState>

  // Entities on current level
  monsters: Monster[]
  items: GroundItem[] // Items on the ground
  minions: Minion[] // Player's pets/summons

  // Features on current level (keyed by "x,y")
  fountains: Map<string, FountainState>
  altars: Map<string, AltarState>
  merchants: MerchantState[]
  traps: Map<string, TrapState>

  // Town portal system
  townPortal: TownPortalState | null
  healer: HealerState | null

  // Game state
  turn: number
  isRunning: boolean
  isPaused: boolean
  isVictory: boolean

  // Statistics
  stats: RunTally

  // Message log (recent messages)
  messages: GameMessage[]

  // Meta-progression bonuses (from upgrades)
  upgradeBonuses?: UpgradeBonuses

  // Per-run booster bonuses
  boosterBonuses?: BoosterBonuses

  // Run configuration (for history tracking)
  personality?: BotPersonality
  boosterIds?: string[]

  // Second Wind tracking (auto-heal once when critical)
  usedSecondWind?: boolean

  // Unique monster tracking (spawn once per run)
  uniqueState: UniqueState

  // Permanent progression metric for merchant scaling
  // This is the deepest level the player has EVER reached across all runs
  maxDepthEver: number

  // Bestiary data (injected from progression store for knowledge bonuses)
  bestiary?: Record<string, BestiaryEntry>

  // Balance overrides for A/B testing (merged with defaults)
  balance: BalanceOverrides
}

/** Message tags for semantic filtering */
export type MessageTag =
  | 'combat.hit' // Player/minion deals damage
  | 'combat.kill' // Monster killed
  | 'combat.miss' // Misses (either direction)
  | 'damage.taken' // Player takes damage
  | 'damage.poison' // Poison tick damage
  | 'damage.trap' // Trap damage
  | 'healing' // HP restored (any source)
  | 'mana' // MP restored
  | 'buff' // Positive status effects
  | 'loot.item' // Item pickup/equip/drop
  | 'loot.gold' // Gold acquisition
  | 'progress' // Level up, depth change, victory, death
  | 'interaction' // Doors, fountains, merchants, altars

/** Message importance for feed filtering (1=noise, 5=critical) */
export type MessageImportance = 1 | 2 | 3 | 4 | 5

/** A message in the game log */
export interface GameMessage {
  turn: number
  text: string
  type: 'info' | 'combat' | 'item' | 'danger' | 'good'
  tags?: MessageTag[]
  importance?: MessageImportance
}

// ============================================================================
// SPELLS
// ============================================================================

/** Spell schools - determine which stat affects power */
export type SpellSchool = 'arcane' | 'divine' | 'nature' | 'shadow'

/** Types of spell effects */
export type SpellEffectType =
  | 'damage'
  | 'aoe_damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'lifedrain'
  | 'teleport'
  | 'teleport_other'
  | 'targeted_teleport'
  | 'shadow_step' // Rogue: teleport adjacent to target monster
  | 'summon'

/** Damage types for spells */
export type SpellDamageType = 'fire' | 'cold' | 'lightning' | 'holy' | 'dark' | 'nature' | 'arcane'

// ============================================================================
// ACTIONS
// ============================================================================

/** Actions the player/bot can take */
export type GameAction =
  | { type: 'move'; direction: Direction }
  | { type: 'attack'; targetId: string }
  | { type: 'ranged_attack'; targetId: string }
  | { type: 'pickup'; itemId: string }
  | { type: 'drop'; itemId: string }
  | { type: 'equip'; itemId: string }
  | { type: 'unequip'; slot: EquipSlot }
  | { type: 'use'; itemId: string }
  | { type: 'descend' }
  | { type: 'ascend' }
  | { type: 'wait' }
  // Feature interactions
  | { type: 'use_fountain' }
  | { type: 'use_altar' }
  // Merchant interactions
  | { type: 'shop_buy'; merchantIndex: number; itemIndex: number }
  | { type: 'shop_sell'; merchantIndex: number; inventoryIndex: number }
  // Spell casting
  | { type: 'cast'; spellId: string; targetId?: string }
  // Town portal interactions
  | { type: 'use_return_portal' }
  | { type: 'use_healer' }
  // Rogue ability
  | { type: 'steal'; targetId: string }
  // Druid/Necromancer shapeshifting
  | { type: 'shapeshift'; formId: string }
  // Artifact/Racial activations
  | { type: 'activate'; itemId: string; targetId?: string }
  | { type: 'racial_ability'; targetId?: string }

/** Result of processing an action (unified type for all game actions including spells) */
export interface ActionResult {
  success: boolean
  message?: string
  /** Energy cost of the action (for speed system). Required for action handlers, optional for internal functions. */
  energyCost?: number
  /** Damage dealt (for combat/spell actions) */
  damage?: number
  /** HP healed (for healing actions) */
  healed?: number
  /** Monster IDs affected (for targeted/AOE actions) */
  targets?: string[]
  /** Events generated by this action (for UI updates) */
  events?: GameEvent[]
}

// ============================================================================
// EVENTS (for UI updates)
// ============================================================================

/** Events emitted by the game for UI updates */
export type GameEvent =
  | { type: 'turn'; turn: number }
  | { type: 'move'; entityId: string; from: Point; to: Point }
  | { type: 'attack'; attackerId: string; defenderId: string; damage: number; killed: boolean }
  | { type: 'levelUp'; level: number }
  | { type: 'itemPickup'; item: Item }
  | { type: 'itemDrop'; item: Item }
  | { type: 'depthChange'; depth: number }
  | { type: 'message'; message: GameMessage }
  | { type: 'death'; character: Character }
  | { type: 'victory' }
  | { type: 'statChange'; stat: string; oldValue: number; newValue: number }

/** Event listener type */
export type GameEventListener = (event: GameEvent) => void

// ============================================================================
// BOT TYPES
// ============================================================================

/** Bot personality affecting decision making */
export type BotPersonality =
  | 'cautious' // Retreats early, uses items freely
  | 'aggressive' // Fights to low HP, hoards items
  | 'greedy' // Prioritizes gold/items over safety
  | 'speedrunner' // Beelines for stairs
  | 'custom' // Player-tuned sliders


// ============================================================================
// BALANCE OVERRIDES (for A/B testing)
// ============================================================================

/** Balance tuning overrides for diagnostic testing */
export interface BalanceOverrides {
  // Tier 1: High Impact
  monsterHpPercent: number // 100 = normal, 50 = half HP
  monsterDamagePercent: number // 100 = normal
  startingPotions: number // default 3
  potionRatePercent: number // 100 = normal spawn rate
  regenPer10Turns: number // 0 = disabled, 1+ = HP per 10 turns OOC
  armorPenetration: number // 0 = none, flat pen for player

  // Tier 2: Medium Impact
  enchantRatePercent: number // 100 = normal enchant chances
  itemRatePercent: number // 100 = normal items per level
  levelupHpPercent: number // 100 = normal HP gains

  // Tier 3: Tuning
  xpRatePercent: number // 100 = normal XP gains
  upgradePowerPercent: number // 100 = normal upgrade effects

  // Knowledge/Bestiary
  bestiaryBonusPercent: number // 0 = use actual kills, 1-25 = fixed bonus %

  // HP scaling
  baseHpFraction: number // 0.70 = 70% of base HP (Vitality restores the rest)
}

/** Default balance (no overrides) */
export const DEFAULT_BALANCE: BalanceOverrides = {
  monsterHpPercent: 100,
  monsterDamagePercent: 100,
  startingPotions: 3,
  potionRatePercent: 100,
  regenPer10Turns: 0,
  armorPenetration: 0,
  enchantRatePercent: 100,
  itemRatePercent: 100,
  levelupHpPercent: 100,
  xpRatePercent: 100,
  upgradePowerPercent: 100,
  bestiaryBonusPercent: 0,
  baseHpFraction: 0.7,
}

// ============================================================================
// RUN CONFIGURATION
// ============================================================================

/** Configuration for starting a new run */
export interface RunConfig {
  raceId: string
  classId: string
  seed?: number // Optional seed for reproducibility
  botPersonality?: BotPersonality
  upgradeBonuses?: UpgradeBonuses // Meta-progression bonuses
  boosterBonuses?: BoosterBonuses // Per-run booster bonuses
  boosterIds?: string[] // Booster IDs for run history
  bestiary?: Record<string, BestiaryEntry> // Lifetime kill data for knowledge bonuses
  balanceOverrides?: Partial<BalanceOverrides> // A/B testing overrides
  maxDepthEver?: number // Permanent progression: deepest level ever reached (for merchant scaling)
  // Per-slot bot capabilities (training unlocks)
  botCapabilities?: BotCapabilities
  botToggles?: BotToggles
  // Per-slot level ranges for sweep/surf activation
  sweepLevelRange?: SweepLevelRange
  surfLevelRange?: SurfLevelRange
  // Custom personality config (used when botPersonality === 'custom')
  botPersonalityConfig?: PersonalityConfig
  // Depth gate offset: shifts class-based level requirement for descent (-5 to +5)
  depthGateOffset?: number
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Deep partial type for nested objects */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/** Make specific keys required */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>
