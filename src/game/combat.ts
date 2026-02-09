/**
 * Combat System for Borglike
 *
 * Handles attack resolution, damage calculation, and combat messages.
 * Functions are pure where possible - actual state mutation happens in the game loop.
 */

import type { Character, Monster, ResistanceType, Point, Item, Element } from './types'
import type { KnowledgeBonuses } from './knowledge-effects'
import { random } from './rng'
import { rollDice } from './dice'
import { calculateAttackCount, calculateRangedAttackCount } from './character'
import { getClassById } from './data/classes'
import { getFormById, hasLifedrain } from './data/forms'
import { getAverageDamage } from './data/monsters'

// ============================================================================
// TYPES
// ============================================================================

export interface AttackResult {
  hit: boolean
  damage: number
  critical: boolean
  killed: boolean
}

/** Result of a multi-attack melee action */
export interface MultiAttackResult {
  /** Number of attacks performed */
  attackCount: number
  /** Number of attacks that hit */
  hits: number
  /** Total damage dealt across all attacks */
  totalDamage: number
  /** Number of critical hits */
  criticals: number
  /** Whether the target was killed */
  killed: boolean
  /** Individual attack results for message formatting */
  attacks: AttackResult[]
}

interface AttackerStats {
  accuracy: number
  damage: number
}

interface DefenderStats {
  evasion: number
  armor: number
}

/** Incoming damage to resolve against a character's defenses */
export interface IncomingDamage {
  /** Raw damage before defense reductions */
  rawDamage: number
  /** Damage element for resistance checks. Undefined = physical (no resist check). */
  element?: Element
  /** Armor penetration value (reduces effective armor) */
  penetration?: number
  /** Skip armor reduction (for spells/breath that bypass physical armor) */
  skipArmor?: boolean
  /** Attacking monster (needed for PFE evil/level check) */
  attackerMonster?: Monster
  /** Knowledge bonuses from bestiary (damage reduction from familiarity) */
  knowledgeBonuses?: KnowledgeBonuses
}

/** Result of defense resolution */
export interface DefenseResult {
  finalDamage: number
  pfeApplied: boolean
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an entity is a Character
 */
export function isCharacter(entity: Character | Monster): entity is Character {
  return 'classId' in entity && 'raceId' in entity
}

/**
 * Type guard to check if an entity is a Monster
 */
export function isMonster(entity: Character | Monster): entity is Monster {
  return 'template' in entity
}

// ============================================================================
// WEAPON BRANDS
// ============================================================================

/**
 * Calculate damage multiplier from weapon brand against a monster
 *
 * Brands apply elemental damage bonuses:
 * - 2.0x damage if monster has no resistance
 * - 1.5x damage if monster has resistance
 * - 1.0x damage if monster is immune
 *
 * @param weapon - Equipped weapon (may be null)
 * @param target - Monster being attacked
 * @returns Damage multiplier (1.0 if no applicable brand)
 */
export function calculateBrandMultiplier(weapon: Item | undefined, target: Monster): number {
  if (!weapon?.artifact?.abilities) return 1

  // Map brand abilities to element types
  const brandMap: Record<string, Element> = {
    'Brand Fire': 'FIRE',
    'Brand Cold': 'COLD',
    'Brand Acid': 'ACID',
    'Brand Poison': 'POISON',
  }

  for (const ability of weapon.artifact.abilities) {
    const element = brandMap[ability]
    if (!element) continue

    // Check target immunity
    if (target.template.immune?.includes(element)) {
      continue // No bonus vs immune targets
    }

    // Check target resistance
    if (target.template.resist?.includes(element)) {
      return 1.5 // Reduced bonus vs resistant targets
    }

    // Full bonus vs vulnerable targets
    return 2.0
  }

  return 1
}

// ============================================================================
// WEAPON SLAYS
// ============================================================================

/** Monster flag types that can be targeted by slays */
type SlayFlag = 'EVIL' | 'UNDEAD' | 'ORC' | 'TROLL' | 'DEMON' | 'DRAGON' | 'ANIMAL'

/**
 * Calculate damage multiplier from weapon slay abilities against a monster
 *
 * Slay multipliers:
 * - "Slay X" = 1.5x damage
 * - "Slay X x3" = 2.5x damage
 * - "Slay X x5" = 3.5x damage
 *
 * Returns the highest applicable multiplier (slays don't stack).
 *
 * @param weapon - Equipped weapon (may be null)
 * @param target - Monster being attacked
 * @returns Damage multiplier (1.0 if no applicable slay)
 */
export function calculateSlayMultiplier(weapon: Item | undefined, target: Monster): number {
  // Check both artifact abilities and template abilities
  const abilities: string[] = []
  if (weapon?.artifact?.abilities) {
    abilities.push(...weapon.artifact.abilities)
  }
  if (weapon?.template.abilities) {
    abilities.push(...weapon.template.abilities)
  }
  if (abilities.length === 0) return 1

  // Map slay ability prefixes to monster flags
  const slayMap: Record<string, SlayFlag> = {
    'Slay Evil': 'EVIL',
    'Slay Undead': 'UNDEAD',
    'Slay Orc': 'ORC',
    'Slay Troll': 'TROLL',
    'Slay Demon': 'DEMON',
    'Slay Dragon': 'DRAGON',
    'Slay Animal': 'ANIMAL',
  }

  let bestMultiplier = 1

  for (const ability of abilities) {
    // Parse slay ability: "Slay X" or "Slay X xN"
    for (const [slayPrefix, flag] of Object.entries(slayMap)) {
      if (!ability.startsWith(slayPrefix)) continue

      // Check if monster has this flag
      if (!target.template.flags.includes(flag)) continue

      // Parse multiplier: "Slay Evil x3" -> 3, "Slay Evil" -> 1
      let multiplier = 1.5 // Base slay = 1.5x
      const xMatch = ability.match(/x(\d+)$/)
      if (xMatch?.[1]) {
        const xValue = parseInt(xMatch[1], 10)
        // xN means (N-1)*0.5 + 1.5: x3 = 2.5x, x5 = 3.5x
        multiplier = 1.5 + (xValue - 1) * 0.5
      }

      bestMultiplier = Math.max(bestMultiplier, multiplier)
    }
  }

  return bestMultiplier
}

// ============================================================================
// STAT EXTRACTION
// ============================================================================

/**
 * Extract attacker stats from a character or monster
 * For characters: uses combat stats
 * For monsters: uses template damage and derives accuracy from speed
 */
export function getAttackerStats(entity: Character | Monster): AttackerStats {
  if (isCharacter(entity)) {
    return {
      accuracy: entity.combat.accuracy,
      damage: entity.combat.meleeDamage,
    }
  } else {
    // Monster: accuracy derived from speed (faster = more accurate)
    // Base accuracy of 50, modified by speed (110 is normal)
    const speedBonus = Math.floor((entity.template.speed - 110) / 2)
    let accuracy = 50 + speedBonus
    let damage = getAverageDamage(entity.template)

    // Apply weaken debuff (reduces damage)
    const weakenDebuff = entity.debuffs?.find((d) => d.type === 'weaken')
    if (weakenDebuff) {
      damage = Math.floor((damage * (100 - weakenDebuff.value)) / 100)
    }

    // Apply blind debuff (reduces accuracy)
    const blindDebuff = entity.debuffs?.find((d) => d.type === 'blind')
    if (blindDebuff) {
      accuracy = Math.floor((accuracy * (100 - blindDebuff.value)) / 100)
    }

    return {
      accuracy,
      damage,
    }
  }
}

/**
 * Extract defender stats from a character or monster
 * For characters: uses combat stats
 * For monsters: uses template armor and derives evasion from speed
 */
export function getDefenderStats(entity: Character | Monster): DefenderStats {
  if (isCharacter(entity)) {
    return {
      evasion: entity.combat.evasion,
      armor: entity.combat.armor,
    }
  } else {
    // Monster: evasion derived from speed (faster = harder to hit)
    const speedBonus = Math.floor((entity.template.speed - 110) / 2)
    return {
      evasion: 20 + speedBonus,
      armor: entity.template.armor,
    }
  }
}

// Status effect bonuses (accuracy, armor, speed, etc.) are now baked into
// character.combat via the modifier system in @game/modifiers/collectors.ts.
// Berserk damage is the exception: applied inline in attack/rangedAttack
// since it adds to actual dice-based damage, not the average-based stat.

/**
 * Get total resistance including temporary resistances
 */
export function getTotalResistance(character: Character, type: ResistanceType): number {
  const base = character.resistances[type] ?? 0
  const temp = character.tempResistances.find((r) => r.type === type)
  return base + (temp?.value ?? 0)
}

// ============================================================================
// DEADLINESS CALCULATION
// ============================================================================

/**
 * Compute deadliness damage percentage multiplier
 *
 * Based on Angband's non-linear scaling where higher deadliness
 * gives increasingly better returns. Each "decade" (0-9, 10-19, etc.)
 * has a consistent increment that grows by 1 per decade.
 *
 * @param deadliness - Deadliness value (0-150)
 * @returns Damage percentage (100 = 1x, 200 = 2x, 1000 = 10x, etc.)
 */
function computeDeadlinessMultiplier(deadliness: number): number {
  if (deadliness <= 0) return 100
  if (deadliness >= 150) return 1250 // 12.5x theoretical max

  // Main scaling curve (0-120): each decade's increment grows by 1
  // Decade 0: +2 per point, Decade 1: +3 per point, etc.
  if (deadliness <= 120) {
    const decade = Math.floor(deadliness / 10)
    const position = deadliness % 10
    const increment = decade + 2
    const base = 100 + 5 * decade * (3 + decade)
    return base + position * increment
  }

  // Diminishing returns past 10x damage (121-150)
  if (deadliness <= 130) return 1000 + (deadliness - 120) * 10
  if (deadliness <= 140) return 1100 + (deadliness - 130) * 8
  return 1180 + (deadliness - 140) * 7
}

/**
 * Calculate character's melee deadliness value
 *
 * Deadliness comes from:
 * - Weapon enchantment (to-damage): +2 deadliness per point
 * - STR bonus: +1 deadliness per point of STR above 10 (finesse: max(STR, DEX))
 * - Level bonus: +0.5 deadliness per level
 *
 * @param character - The character
 * @returns Deadliness value (0-150)
 */
export function calculateDeadliness(character: Character): number {
  let deadliness = 0

  // Weapon enchantment bonus (each +1 enchant = +2 deadliness)
  const weapon = character.equipment.weapon
  if (weapon) {
    deadliness += weapon.enchantment * 2
  }

  // STR bonus (each point above 10 = +1 deadliness)
  // FINESSE: Rogues use max(STR, DEX) for melee deadliness
  const gameClass = getClassById(character.classId)
  const meleeStat = gameClass?.finesse
    ? Math.max(character.stats.str, character.stats.dex)
    : character.stats.str
  const strBonus = Math.max(0, meleeStat - 10)
  deadliness += strBonus

  // Level bonus (level / 2)
  deadliness += Math.floor(character.level / 2)

  // Cap at 150 (table maximum)
  return Math.min(150, deadliness)
}

/**
 * Calculate character's ranged deadliness value
 *
 * Similar to melee but uses:
 * - Bow enchantment: +2 deadliness per point
 * - DEX bonus: +1 deadliness per point of DEX above 10
 * - Level bonus: +0.5 deadliness per level
 *
 * @param character - The character
 * @returns Deadliness value (0-150)
 */
export function calculateRangedDeadliness(character: Character): number {
  let deadliness = 0

  // Bow enchantment bonus (each +1 enchant = +2 deadliness)
  const bow = character.equipment.bow
  if (bow) {
    deadliness += bow.enchantment * 2
  }

  // DEX bonus for ranged (each point above 10 = +1 deadliness)
  const dexBonus = Math.max(0, character.stats.dex - 10)
  deadliness += dexBonus

  // Level bonus (level / 2)
  deadliness += Math.floor(character.level / 2)

  // Cap at 150 (table maximum)
  return Math.min(150, deadliness)
}

/**
 * Calculate character's spell deadliness value
 *
 * Spell deadliness comes from:
 * - Primary stat bonus: +1 deadliness per point of INT/WIS above 10
 * - Level bonus: +0.5 deadliness per level
 * - Staff spell power: +1 deadliness per 5% spell power
 *
 * This gives casters the same scaling curve as melee/ranged,
 * fixing the mid-game damage gap where spell flat bonuses fall behind.
 *
 * @param character - The character
 * @returns Deadliness value (0-150)
 */
export function calculateSpellDeadliness(character: Character): number {
  let deadliness = 0

  // Use higher of INT or WIS (casters typically max one)
  const intBonus = Math.max(0, character.stats.int - 10)
  const wisBonus = Math.max(0, character.stats.wis - 10)
  deadliness += Math.max(intBonus, wisBonus)

  // Level bonus (level / 2, same as melee/ranged)
  deadliness += Math.floor(character.level / 2)

  // Staff spell power bonus (+1 deadliness per 5% spell power)
  const weapon = character.equipment.weapon
  if (weapon?.template.spellPower) {
    deadliness += Math.floor(weapon.template.spellPower / 5)
  }

  // Cap at 150 (table maximum)
  return Math.min(150, deadliness)
}

/**
 * Apply deadliness damage multiplier
 *
 * @param baseDamage - Base damage before deadliness
 * @param deadliness - Deadliness value (0-150)
 * @returns Modified damage with deadliness applied
 */
export function applyDeadliness(baseDamage: number, deadliness: number): number {
  const multiplier = computeDeadlinessMultiplier(deadliness)
  return Math.floor((baseDamage * multiplier) / 100)
}

// ============================================================================
// SCALED CRITICAL SYSTEM
// ============================================================================

/**
 * Critical hit result with damage multiplier tier
 * Based on Angband's weight/level scaled criticals
 */
export interface CriticalResult {
  /** Whether a critical hit occurred */
  isCritical: boolean
  /** Damage multiplier (1 = no crit, 2/3/4 = tiered crit) */
  multiplier: number
  /** Crit tier name for messaging */
  tier: 'none' | 'good' | 'great' | 'superb'
}

/**
 * Calculate scaled critical hit based on weapon weight and character level
 *
 * Angband-inspired formula:
 * - Crit chance = (weight/10 + level * 3) / 100, capped at 50%
 * - On crit, roll determines tier:
 *   - 0-50%: good hit (2x damage)
 *   - 50-85%: great hit (3x damage)
 *   - 85-100%: superb hit (4x damage)
 *
 * @param weaponWeight - Weapon weight in 0.1 lbs (e.g., 120 = 12 lbs)
 * @param characterLevel - Character level
 * @returns CriticalResult with multiplier and tier
 */
export function calculateScaledCritical(
  weaponWeight: number,
  characterLevel: number,
  bonusCritChance = 0
): CriticalResult {
  // Base crit chance from weight (heavier = more crits)
  // Weight is in 0.1 lbs, so 120 = 12% base
  const weightBonus = weaponWeight / 10

  // Level bonus (3% per level)
  const levelBonus = characterLevel * 3

  // Total crit chance, capped at 50% (bonus can exceed cap)
  const critChance = Math.min(50, weightBonus + levelBonus) + bonusCritChance

  // Roll for crit
  const critRoll = random() * 100
  if (critRoll >= critChance) {
    return { isCritical: false, multiplier: 1, tier: 'none' }
  }

  // Critical hit! Roll for tier
  const tierRoll = random() * 100
  if (tierRoll < 50) {
    // Good hit: 2x damage
    return { isCritical: true, multiplier: 2, tier: 'good' }
  } else if (tierRoll < 85) {
    // Great hit: 3x damage
    return { isCritical: true, multiplier: 3, tier: 'great' }
  } else {
    // Superb hit: 4x damage
    return { isCritical: true, multiplier: 4, tier: 'superb' }
  }
}

// ============================================================================
// SHARED COMBAT HELPERS
// ============================================================================

/**
 * Calculate hit chance from accuracy vs evasion
 * Base 50%, clamped to 5-95% range
 */
function calculateHitChance(accuracy: number, evasion: number): number {
  return Math.max(5, Math.min(95, 50 + accuracy - evasion))
}

/**
 * Apply armor reduction to damage
 * Percentage-based: each point of armor = 0.5% reduction, max 50%
 */
function applyArmorReduction(
  damage: number,
  armor: number,
  penetration: number,
  penPercent = 0
): number {
  const afterPercent = armor * (1 - penPercent / 100)
  const effectiveArmor = Math.max(0, afterPercent - penetration)
  const reduction = Math.min(effectiveArmor / 2, 50)
  return Math.floor((damage * (100 - reduction)) / 100)
}

/**
 * Estimate damage after character's armor reduction for bot tactical decisions.
 * character.combat.armor already includes status effect bonuses (blessing, protection).
 */
export function estimateDamageAfterArmor(rawDamage: number, character: Character): number {
  return Math.max(1, applyArmorReduction(rawDamage, character.combat.armor, 0))
}

/** Map monster Element to character ResistanceType (only ELEC→LIGHTNING differs) */
function elementToResistanceType(element: Element): ResistanceType {
  if (element === 'ELEC') return 'LIGHTNING'
  return element as ResistanceType
}

/**
 * Resolve defense reductions for incoming damage against a character.
 *
 * Applies in order:
 * 1. Armor reduction: min(effectiveArmor/2, 50)% with penetration support
 * 2. Elemental resistance: perm + temp, capped at 90% (100+ = immune)
 * 3. Protection from Evil: halves damage from EVIL monsters if level check passes
 * 4. Knowledge reduction: bestiary familiarity reduces damage taken
 * 5. Minimum damage: max(1, damage) unless immune
 */
export function resolveDefense(character: Character, incoming: IncomingDamage): DefenseResult {
  let damage = incoming.rawDamage

  // 1. Armor reduction (already includes status effect bonuses)
  // Skipped for spells/breath weapons which bypass physical armor
  if (!incoming.skipArmor) {
    damage = applyArmorReduction(damage, character.combat.armor, incoming.penetration ?? 0)
  }

  // 2. Elemental resistance
  let isImmune = false
  if (incoming.element) {
    const resistType = elementToResistanceType(incoming.element)
    const rawResist = getTotalResistance(character, resistType)
    if (rawResist >= 100) {
      isImmune = true
      damage = 0
    } else {
      const cappedResist = Math.min(90, rawResist)
      damage = Math.floor((damage * (100 - cappedResist)) / 100)
      damage = Math.max(0, damage)
    }
  }

  // 3. Protection from Evil
  let pfeApplied = false
  if (incoming.attackerMonster) {
    const hasPFE = character.statusEffects.some((e) => e.type === 'prot_from_evil')
    const isEvil = incoming.attackerMonster.template.flags.includes('EVIL')
    const levelCheck = character.level >= incoming.attackerMonster.template.minDepth
    if (hasPFE && isEvil && levelCheck) {
      damage = Math.floor(damage * 0.5)
      pfeApplied = true
    }
  }

  // 4. Knowledge reduction (bestiary familiarity)
  if (incoming.knowledgeBonuses && incoming.knowledgeBonuses.reductionPercent > 0) {
    damage = Math.floor(damage * (1 - incoming.knowledgeBonuses.reductionPercent / 100))
  }

  // 5. Minimum damage (1 on hit, 0 if immune)
  if (!isImmune) {
    damage = Math.max(1, damage)
  }

  return { finalDamage: damage, pfeApplied }
}

/** Gnome "Lucky" racial: +5% crit chance */
function getGnomeCritBonus(character: Character): number {
  return character.raceId === 'gnome' ? 5 : 0
}

/**
 * Get character's passive damage multiplier from race/class/status effects
 * Excludes random per-attack effects (shield bash) and weapon-based effects (brands/slays)
 */
function getPassiveDamageMultiplier(character: Character): number {
  let mult = 1.0

  // Half-Orc "Berserker Rage": +20% when below 30% HP
  if (character.raceId === 'half_orc' && character.hp < character.maxHp * 0.3) {
    mult *= 1.2
  }

  // Rogue "Sneak Attack": 2.5x after Shadow Step teleport
  if (character.statusEffects.some((e) => e.type === 'sneak_attack')) {
    mult *= 2.5
  }

  // damage_bonus status effect: Envenom, Shadow Dance, Hunter's Mark, Dark Pact
  const damageBuff = character.statusEffects.find((e) => e.type === 'damage_bonus')
  if (damageBuff) {
    mult *= 1 + damageBuff.value / 100
  }

  return mult
}

/** Miss result constant to avoid repeated object creation */
const MISS_RESULT: AttackResult = { hit: false, damage: 0, critical: false, killed: false }

// ============================================================================
// COMBAT RESOLUTION
// ============================================================================

/**
 * Resolve a character's melee attack against a monster
 *
 * Hit chance: accuracy (includes status bonuses) - evasion (clamped 5-95%)
 * Damage: weapon dice + STR/3 + enchant + artifact + berserk
 *   × deadliness × shield bash × brand/slay × passive multipliers
 * Defense: applyArmorReduction(monsterArmor, penetration)
 *   × crit multiplier × knowledge bonus
 * Min: max(1, damage)
 */
export function attack(
  attacker: Character,
  defender: Monster,
  knowledgeBonuses?: KnowledgeBonuses,
  armorPenetration = 0,
  armorPenPercent = 0
): AttackResult {
  const attackerStats = getAttackerStats(attacker)
  const defenderStats = getDefenderStats(defender)

  // Berserk damage bonus: applied to actual dice-based damage, not the average-based stat
  const berserk = attacker.statusEffects.find((e) => e.type === 'berserk')
  const berserkDamage = berserk ? Math.floor(berserk.value * 0.5) : 0

  // Accuracy already includes status effect bonuses (heroism, blessing) via modifier system
  const hitChance = calculateHitChance(attackerStats.accuracy, defenderStats.evasion)

  if (random() * 100 >= hitChance) {
    return MISS_RESULT
  }

  // Roll actual weapon dice for character attacks
  const weapon = attacker.equipment.weapon
  const weaponDice = weapon?.template.damage
  const weaponDamage = weaponDice ? rollDice(weaponDice) : 0
  const enchantBonus = weapon?.enchantment ?? 0

  // Add artifact damage if present
  let artifactDamage = 0
  if (weapon?.artifact?.damage) {
    artifactDamage = rollDice(weapon.artifact.damage)
  }
  if (weapon?.artifact?.bonuses?.toDam) {
    artifactDamage += weapon.artifact.bonuses.toDam
  }

  // Base damage: STR/3 + weapon dice + enchantment + artifact + berserk bonus
  // FINESSE: Rogues use max(STR, DEX) for melee damage
  const meleeClass = getClassById(attacker.classId)
  const meleeStatDmg = meleeClass?.finesse
    ? Math.max(attacker.stats.str, attacker.stats.dex)
    : attacker.stats.str
  let baseDamage =
    Math.floor(meleeStatDmg / 3) + weaponDamage + enchantBonus + artifactDamage + berserkDamage

  // Apply deadliness multiplier
  const deadliness = calculateDeadliness(attacker)
  baseDamage = applyDeadliness(baseDamage, deadliness)

  // SHIELD_BASH: 20% chance for +50% damage with shield
  if (attacker.equipment.shield) {
    const gameClass = getClassById(attacker.classId)
    if (gameClass?.canShieldBash && random() < 0.2) {
      baseDamage = Math.floor(baseDamage * 1.5)
    }
  }

  // WEAPON BRANDS & SLAYS: Apply damage multipliers vs monsters
  const brandMult = calculateBrandMultiplier(attacker.equipment.weapon, defender)
  const slayMult = calculateSlayMultiplier(attacker.equipment.weapon, defender)
  baseDamage = Math.floor(baseDamage * Math.max(brandMult, slayMult))

  // Apply passive racial/status damage multipliers
  baseDamage = Math.floor(baseDamage * getPassiveDamageMultiplier(attacker))

  // Apply monster armor reduction
  let damage = applyArmorReduction(
    baseDamage,
    defenderStats.armor,
    armorPenetration,
    armorPenPercent
  )

  // Check for critical hit (scaled by weapon weight and level)
  const weaponWeight = attacker.equipment.weapon?.template.weight ?? 50
  const critResult = calculateScaledCritical(
    weaponWeight,
    attacker.level,
    getGnomeCritBonus(attacker)
  )
  const critical = critResult.isCritical
  if (critical) {
    damage *= critResult.multiplier
  }

  // Apply knowledge bonus from bestiary (player attacking monster: bonus damage)
  if (knowledgeBonuses) {
    damage = Math.floor(damage * (1 + knowledgeBonuses.damagePercent / 100))
  }

  // Ensure minimum damage of 1 on a hit
  damage = Math.max(1, damage)

  // Check if defender would be killed
  const killed = damage >= defender.hp

  return {
    hit: true,
    damage,
    critical,
    killed,
  }
}

/**
 * Generic multi-attack loop - executes multiple attacks and accumulates results
 *
 * @param defender - Target monster
 * @param attackCount - Number of attacks to perform
 * @param performSingleAttack - Callback that performs one attack given remaining HP
 */
function executeMultiAttack(
  defender: Monster,
  attackCount: number,
  performSingleAttack: (tempDefender: Monster) => AttackResult
): MultiAttackResult {
  const attacks: AttackResult[] = []
  let hits = 0
  let totalDamage = 0
  let criticals = 0
  let killed = false
  let remainingHp = defender.hp

  for (let i = 0; i < attackCount && remainingHp > 0; i++) {
    const result = performSingleAttack({ ...defender, hp: remainingHp })
    attacks.push(result)

    if (result.hit) {
      hits++
      totalDamage += result.damage
      remainingHp -= result.damage
      if (result.critical) criticals++
      if (remainingHp <= 0) killed = true
    }
  }

  return { attackCount, hits, totalDamage, criticals, killed, attacks }
}

/**
 * Perform a full melee attack action with multiple attacks
 */
export function meleeAttack(
  attacker: Character,
  defender: Monster,
  knowledgeBonuses?: KnowledgeBonuses,
  armorPenetration = 0,
  armorPenPercent = 0
): MultiAttackResult {
  return executeMultiAttack(defender, calculateAttackCount(attacker), (tempDefender) =>
    attack(attacker, tempDefender, knowledgeBonuses, armorPenetration, armorPenPercent)
  )
}

/**
 * Format a multi-attack result into a single message
 * @param projectile - Optional projectile name ("arrow" for ranged), omit for melee
 */
export function formatMultiAttackMessage(
  defenderName: string,
  result: MultiAttackResult,
  projectile?: string
): string {
  const single = projectile ? `Your ${projectile}` : 'You'
  const plural = projectile ? `Your ${projectile}s` : 'You'
  const killVerb = projectile && result.attackCount === 1 ? 'kills' : 'kill'

  if (result.hits === 0) {
    return result.attackCount === 1
      ? `${single} miss${projectile ? 'es' : ''} ${defenderName}.`
      : `${plural} miss ${defenderName} ${result.attackCount} times.`
  }

  const isSingle = result.attackCount === 1
  const subject = isSingle ? single : plural
  const critText = !isSingle && result.criticals > 0 ? ` (${result.criticals} crit)` : ''

  if (result.killed) {
    if (isSingle) {
      return result.criticals > 0
        ? `${subject} critically hit${projectile ? 's' : ''} ${defenderName} for ${result.totalDamage} damage and ${killVerb} it!`
        : `${subject} hit${projectile ? 's' : ''} ${defenderName} for ${result.totalDamage} damage and ${killVerb} it!`
    }
    return `${subject} hit ${defenderName} ${result.hits}x for ${result.totalDamage} total damage and ${killVerb} it!`
  }

  if (isSingle) {
    return result.criticals > 0
      ? `${subject} critically hit${projectile ? 's' : ''} ${defenderName} for ${result.totalDamage} damage!`
      : `${subject} hit${projectile ? 's' : ''} ${defenderName} for ${result.totalDamage} damage.`
  }
  return `${subject} hit ${defenderName} ${result.hits}/${result.attackCount}x for ${result.totalDamage} damage${critText}.`
}

// ============================================================================
// DAMAGE APPLICATION
// ============================================================================

/**
 * Apply damage to an entity
 *
 * Handles HP reduction and sets death flags.
 * For characters: sets isDead flag
 * For monsters: should be removed from monster list by caller
 *
 * @param entity - The entity taking damage
 * @param damage - Amount of damage to apply
 * @returns true if the entity was killed
 */
export function applyDamage(entity: Character | Monster, damage: number): boolean {
  entity.hp = Math.max(0, entity.hp - damage)

  const killed = entity.hp <= 0

  if (killed && isCharacter(entity)) {
    entity.isDead = true
  }

  return killed
}

// ============================================================================
// COMBAT MESSAGES
// ============================================================================

/**
 * Format an attack message for display in the game log
 *
 * @param attackerName - Name of the attacker (e.g., "You" or "the Orc")
 * @param defenderName - Name of the defender (e.g., "You" or "the Orc")
 * @param result - The attack result
 * @returns Formatted message string
 */
export function formatAttackMessage(
  attackerName: string,
  defenderName: string,
  result: AttackResult
): string {
  const isPlayerAttacker = attackerName.toLowerCase() === 'you'
  const isPlayerDefender = defenderName.toLowerCase() === 'you'

  if (!result.hit) {
    // Miss message
    if (isPlayerAttacker) {
      return `You miss ${defenderName}.`
    } else {
      return `${attackerName} misses ${isPlayerDefender ? 'you' : defenderName}.`
    }
  }

  // Hit message
  let message: string

  if (result.killed) {
    // Kill message
    if (isPlayerAttacker) {
      message = `You kill ${defenderName}!`
    } else if (isPlayerDefender) {
      message = `${attackerName} kills you!`
    } else {
      message = `${attackerName} kills ${defenderName}!`
    }
  } else if (result.critical) {
    // Critical hit message
    if (isPlayerAttacker) {
      message = `You critically hit ${defenderName} for ${result.damage} damage!`
    } else {
      message = `${attackerName} critically hits ${isPlayerDefender ? 'you' : defenderName} for ${result.damage} damage!`
    }
  } else {
    // Normal hit message
    if (isPlayerAttacker) {
      message = `You hit ${defenderName} for ${result.damage} damage.`
    } else {
      message = `${attackerName} hits ${isPlayerDefender ? 'you' : defenderName} for ${result.damage} damage.`
    }
  }

  return message
}

/**
 * Convenience function to format attack message using entity objects
 */
export function formatAttackMessageFromEntities(
  attacker: Character | Monster,
  defender: Character | Monster,
  result: AttackResult
): string {
  const attackerName = isCharacter(attacker) ? 'You' : `The ${attacker.template.name}`
  const defenderName = isCharacter(defender) ? 'you' : `the ${defender.template.name}`

  return formatAttackMessage(attackerName, defenderName, result)
}

// ============================================================================
// RANGED COMBAT
// ============================================================================

/** Minimum range for ranged attacks (can't shoot adjacent targets) */
const MIN_RANGED_RANGE = 2

/** Maximum range for ranged attacks (bow range) */
const MAX_RANGED_RANGE = 8

/**
 * Check if character can perform a ranged attack on target
 *
 * Requirements:
 * - Has a bow equipped
 * - Target is not adjacent (distance >= 2)
 * - Target is within range (distance <= 8)
 */
export function canRangedAttack(character: Character, targetPos: Point): boolean {
  // Must have a bow equipped
  const bow = character.equipment.bow
  if (!bow) return false

  // Calculate distance
  const dx = Math.abs(targetPos.x - character.position.x)
  const dy = Math.abs(targetPos.y - character.position.y)
  const distance = Math.max(dx, dy) // Chebyshev distance

  // Must be at least MIN_RANGED_RANGE tiles away (not adjacent)
  if (distance < MIN_RANGED_RANGE) return false

  // Must be within bow range
  const range = bow.template.range ?? MAX_RANGED_RANGE
  if (distance > range) return false

  return true
}

/**
 * Get the range of the equipped bow
 */
export function getBowRange(character: Character): number {
  const bow = character.equipment.bow
  if (!bow) return 0
  return bow.template.range ?? MAX_RANGED_RANGE
}

/**
 * Resolve a ranged attack between character and monster
 *
 * Similar to melee attack but:
 * - Uses rangedDamage and rangedAccuracy
 * - Distance penalty: -5% hit chance per tile beyond 2
 * - Knowledge bonuses apply to damage
 */
export function rangedAttack(
  attacker: Character,
  defender: Monster,
  distance: number,
  knowledgeBonuses?: KnowledgeBonuses,
  armorPenetration = 0,
  armorPenPercent = 0
): AttackResult {
  // Ranged accuracy already includes status effect bonuses via modifier system
  let accuracy = attacker.combat.rangedAccuracy

  // Berserk damage bonus: applied to actual dice-based damage, not the average-based stat
  const berserk = attacker.statusEffects.find((e) => e.type === 'berserk')
  const berserkDamage = berserk ? Math.floor(berserk.value * 0.5) : 0

  // Distance penalty: -5% hit chance per tile beyond 2
  const distancePenalty = Math.max(0, distance - 2) * 5
  accuracy -= distancePenalty

  // Get defender stats and calculate hit chance
  const defenderStats = getDefenderStats(defender)
  const hitChance = calculateHitChance(accuracy, defenderStats.evasion)

  if (random() * 100 >= hitChance) {
    return MISS_RESULT
  }

  // Roll actual bow dice for damage
  const bow = attacker.equipment.bow
  const bowDice = bow?.template.damage
  let bowDamage = bowDice ? rollDice(bowDice) : 0
  const enchantBonus = bow?.enchantment ?? 0

  // Apply launcher multiplier (Angband-style: multiplies dice damage)
  const launcherMult = bow?.template.multiplier ?? 1
  bowDamage *= launcherMult

  // Add artifact damage if present
  let artifactDamage = 0
  if (bow?.artifact?.damage) {
    artifactDamage = rollDice(bow.artifact.damage) * launcherMult
  }
  if (bow?.artifact?.bonuses?.toDam) {
    artifactDamage += bow.artifact.bonuses.toDam
  }

  // Base damage: DEX/3 + (bow dice × multiplier) + enchantment + artifact + berserk bonus
  let baseDamage =
    Math.floor(attacker.stats.dex / 3) + bowDamage + enchantBonus + artifactDamage + berserkDamage

  // Apply ranged deadliness multiplier (from bow enchantment + DEX + level)
  const deadliness = calculateRangedDeadliness(attacker)
  baseDamage = applyDeadliness(baseDamage, deadliness)

  // damage_bonus status effect (Hunter's Mark, etc.)
  const rangedDamageBuff = attacker.statusEffects.find((e) => e.type === 'damage_bonus')
  if (rangedDamageBuff) {
    baseDamage = Math.floor(baseDamage * (1 + rangedDamageBuff.value / 100))
  }

  // Apply armor reduction
  let finalDamage = applyArmorReduction(
    baseDamage,
    defenderStats.armor,
    armorPenetration,
    armorPenPercent
  )

  // Check for critical hit using scaled system (bow weight + level)
  const bowWeight = attacker.equipment.bow?.template.weight ?? 30
  const critResult = calculateScaledCritical(bowWeight, attacker.level, getGnomeCritBonus(attacker))
  const critical = critResult.isCritical
  if (critical) {
    finalDamage *= critResult.multiplier
  }

  // Apply knowledge bonus from bestiary (player attacking monster)
  if (knowledgeBonuses) {
    finalDamage = Math.floor(finalDamage * (1 + knowledgeBonuses.damagePercent / 100))
  }

  // Ensure minimum damage of 1 on a hit
  finalDamage = Math.max(1, finalDamage)

  // Check if defender would be killed
  const killed = finalDamage >= defender.hp

  return {
    hit: true,
    damage: finalDamage,
    critical,
    killed,
  }
}

/**
 * Format ranged attack message
 */
export function formatRangedAttackMessage(defenderName: string, result: AttackResult): string {
  if (!result.hit) {
    return `Your arrow misses ${defenderName}.`
  }

  if (result.killed) {
    return `Your arrow kills ${defenderName}!`
  }

  if (result.critical) {
    return `Your arrow critically hits ${defenderName} for ${result.damage} damage!`
  }

  return `Your arrow hits ${defenderName} for ${result.damage} damage.`
}

/**
 * Perform a full ranged attack action with multiple shots
 */
export function multiRangedAttack(
  attacker: Character,
  defender: Monster,
  distance: number,
  knowledgeBonuses?: KnowledgeBonuses,
  armorPenetration = 0,
  armorPenPercent = 0
): MultiAttackResult {
  return executeMultiAttack(defender, calculateRangedAttackCount(attacker), (tempDefender) =>
    rangedAttack(
      attacker,
      tempDefender,
      distance,
      knowledgeBonuses,
      armorPenetration,
      armorPenPercent
    )
  )
}

// ============================================================================
// COMBAT LIFESTEAL
// ============================================================================

/**
 * Calculate lifesteal amount for a character based on damage dealt
 *
 * Sources of lifesteal:
 * - VAMPIRE: Vampires heal 20% of melee damage dealt (race ability)
 * - COMBAT_REGEN: Blackguard heals 10% of melee damage dealt (class ability)
 * - SHAPESHIFTING: Shadow Form grants 10% lifedrain (form ability)
 *
 * @param character - The attacking character
 * @param damage - Damage dealt to the enemy
 * @returns Amount of HP to heal (0 if no lifesteal source)
 */
export function calculateLifesteal(character: Character, damage: number): number {
  let lifestealPercent = 0

  // VAMPIRE: Race ability - 20% lifesteal
  if (character.raceId === 'vampire') {
    lifestealPercent += 20
  }

  // COMBAT_REGEN: Blackguard class ability
  const gameClass = getClassById(character.classId)
  if (gameClass?.combatLifesteal) {
    lifestealPercent += gameClass.combatLifesteal
  }

  // SHAPESHIFTING: Shadow Form lifedrain
  if (character.activeFormId) {
    const form = getFormById(character.activeFormId)
    if (form && hasLifedrain(form)) {
      lifestealPercent += 10 // Shadow Form grants 10% lifedrain
    }
  }

  if (lifestealPercent <= 0) return 0
  return Math.floor((damage * lifestealPercent) / 100)
}
