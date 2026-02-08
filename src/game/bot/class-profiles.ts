/**
 * Class Behavior Profiles
 *
 * Defines how each class should behave in combat, including preferred range,
 * retreat behavior, and personality modifiers.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ClassBehaviorProfile {
  classId: string
  /** Prefers melee combat (Warriors, Berserkers, Paladins, Blackguards) */
  prefersMelee: boolean
  /** Prefers ranged combat (Rangers, Mages, Archmages) */
  prefersRanged: boolean
  /** Never retreats, fights to the death (Berserker) */
  neverRetreats: boolean
  /** Can use teleport spells for escape (Mage, Archmage) */
  usesTeleport: boolean
  /** Prioritizes healing over damage (Priest, Paladin) */
  healsPriority: boolean
  /** Aggression modifier (-30 to +30), adds to base personality aggression */
  aggressionMod: number
  /** Caution modifier (-30 to +30), adds to base personality caution */
  cautionMod: number
  /** Preferred engagement distance: 1=melee, 3-4=ranged, 0=no preference */
  engageDistance: number
  /** STEAL: Can attempt to steal gold from adjacent monsters (Rogue) */
  canSteal?: boolean
}

// ============================================================================
// CLASS PROFILES
// ============================================================================

const warrior: ClassBehaviorProfile = {
  classId: 'warrior',
  prefersMelee: true,
  prefersRanged: false,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: false,
  aggressionMod: 15,
  cautionMod: -10,
  engageDistance: 1,
}

const mage: ClassBehaviorProfile = {
  classId: 'mage',
  prefersMelee: false,
  prefersRanged: true,
  neverRetreats: false,
  usesTeleport: true,
  healsPriority: false,
  aggressionMod: 0,
  cautionMod: -5,
  engageDistance: 4,
}

const rogue: ClassBehaviorProfile = {
  classId: 'rogue',
  prefersMelee: true,
  prefersRanged: false,
  neverRetreats: false,
  usesTeleport: true, // Shadow Step + Phase Door
  healsPriority: false,
  aggressionMod: 5,
  cautionMod: 5,
  engageDistance: 1,
  canSteal: true,
}

const priest: ClassBehaviorProfile = {
  classId: 'priest',
  prefersMelee: false,
  prefersRanged: false,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: true,
  aggressionMod: -10,
  cautionMod: 15,
  engageDistance: 0,
}

const ranger: ClassBehaviorProfile = {
  classId: 'ranger',
  prefersMelee: false,
  prefersRanged: true,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: false,
  aggressionMod: 0,
  cautionMod: 10,
  engageDistance: 4,
}

const paladin: ClassBehaviorProfile = {
  classId: 'paladin',
  prefersMelee: true,
  prefersRanged: false,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: true,
  aggressionMod: 10,
  cautionMod: 5,
  engageDistance: 1,
}

const necromancer: ClassBehaviorProfile = {
  classId: 'necromancer',
  prefersMelee: false,
  prefersRanged: true,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: false,
  aggressionMod: 0,
  cautionMod: -5,
  engageDistance: 3,
}

const berserker: ClassBehaviorProfile = {
  classId: 'berserker',
  prefersMelee: true,
  prefersRanged: false,
  neverRetreats: true,
  usesTeleport: false,
  healsPriority: false,
  aggressionMod: 30,
  cautionMod: -30,
  engageDistance: 1,
}

const archmage: ClassBehaviorProfile = {
  classId: 'archmage',
  prefersMelee: false,
  prefersRanged: true,
  neverRetreats: false,
  usesTeleport: true,
  healsPriority: false,
  aggressionMod: 0,
  cautionMod: -5,
  engageDistance: 5,
}

const druid: ClassBehaviorProfile = {
  classId: 'druid',
  prefersMelee: false,
  prefersRanged: false,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: false,
  aggressionMod: 0,
  cautionMod: 10,
  engageDistance: 0,
}

const blackguard: ClassBehaviorProfile = {
  classId: 'blackguard',
  prefersMelee: true,
  prefersRanged: false,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: false,
  aggressionMod: 20,
  cautionMod: -15,
  engageDistance: 1,
}

// Default profile for unknown classes
const defaultProfile: ClassBehaviorProfile = {
  classId: 'default',
  prefersMelee: true,
  prefersRanged: false,
  neverRetreats: false,
  usesTeleport: false,
  healsPriority: false,
  aggressionMod: 0,
  cautionMod: 0,
  engageDistance: 1,
}

// ============================================================================
// PROFILE LOOKUP
// ============================================================================

const PROFILES: Record<string, ClassBehaviorProfile> = {
  warrior,
  mage,
  rogue,
  priest,
  ranger,
  paladin,
  necromancer,
  berserker,
  archmage,
  druid,
  blackguard,
}

/**
 * Get the behavior profile for a class
 */
export function getClassProfile(classId: string): ClassBehaviorProfile {
  return PROFILES[classId] ?? defaultProfile
}

/**
 * Check if a class prefers ranged combat
 */
export function prefersRangedCombat(classId: string): boolean {
  return getClassProfile(classId).prefersRanged
}

/**
 * Check if a class should never retreat
 */
export function shouldNeverRetreat(classId: string): boolean {
  return getClassProfile(classId).neverRetreats
}

/**
 * Get the preferred engagement distance for a class
 * Returns 1 for melee, 3-5 for ranged
 */
export function getEngageDistance(classId: string): number {
  return getClassProfile(classId).engageDistance
}

// ============================================================================
// EXPORTS
// ============================================================================

export { PROFILES as CLASS_PROFILES }
