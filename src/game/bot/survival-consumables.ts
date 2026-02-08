/**
 * Consumable Usage Logic
 *
 * Handles decisions about when to use healing potions, escape scrolls,
 * buff potions, resistance potions, and utility items.
 */

import type { GameState, GameAction, Monster } from '../types'
import { VICTORY_BOSS_NAME } from '../data/monsters'
import { countExploredTiles } from '../dungeon'
import type { PersonalityConfig, DangerMap, BotState } from './types'
import { isPoisoned } from '../status-effects'
import {
  getLocalDanger,
  calculateAvoidance,
  getDangerTier,
  getImmediateDanger,
  getImmediateDangerTier,
  getMonsterThreat,
} from './danger'
import { isInCombat, countAdjacentMonsters } from './combat'
import {
  findHealingPotion,
  findEscapeScroll,
  findPhaseDoorScroll,
  findFullTeleportScroll,
  findSpeedPotion,
  findBuffPotion,
  findResistancePotion,
  findNeutralizePoison,
  findBlessingScroll,
  findProtectionScroll,
  findMappingScroll,
  findEnchantScroll,
  findTownPortalScroll,
  findDetectStairsScroll,
  findTeleportLevelScroll,
  hasStatusEffect,
  hasTempResistance,
  findCureFor,
} from './items'
import {
  shouldUseTownPortal,
  evaluatePhaseDoorSafety,
  shouldEscapeOverHeal,
} from './survival-retreat'
import { hasAbility } from '../data/monsters'
import { profile } from './profiler'

// ============================================================================
// SURVIVAL CONSUMABLES
// ============================================================================

/**
 * Check if we should use a consumable for survival
 * Returns an action if we should use something, null otherwise
 *
 * Decision flow (Angband-inspired 4-tier system):
 * 1. Cure poison (unchanged - always priority)
 * 2. Calculate avoidance and danger tier
 * 3. If CRITICAL and shouldEscapeOverHeal:
 *    → Try full teleport (always safe - goes anywhere)
 *    → Try phase door (skip safety check - desperate)
 * 4. If DANGER or higher with healing available:
 *    → Use healing potion
 * 5. If CAUTION or higher, no healing, has escape:
 *    → Check phase door safety
 *    → Use escape if safe OR use full teleport
 * 6. If twitchCounter > 30 and has escape:
 *    → Use escape to break stuck state
 * 7. Return null
 */
export function getSurvivalConsumableAction(
  game: GameState,
  config: PersonalityConfig,
  dangers: DangerMap,
  botState?: BotState,
  personality?: string,
  healsPriority: boolean = false,
  townPortalEnabled: boolean = true
): GameAction | null {
  const character = game.character
  const hpRatio = character.hp / character.maxHp
  const adjacentCount = countAdjacentMonsters(game, character.position)
  const inCombat = isInCombat(game)
  const hasHealing = findHealingPotion(character) !== null

  // 1. Cure status effects by priority (highest priority first)
  // Priority: PARALYZED > POISON > CONFUSED > BLIND > SLOWED > TERRIFIED > DRAINED

  // 1a. Cure paralysis immediately - can't act at all!
  if (hasStatusEffect(character, 'paralyzed')) {
    const cure = findCureFor(character, 'paralyzed')
    if (cure) {
      return { type: 'use', itemId: cure.id }
    }
  }

  // 1b. Cure poison - ongoing damage
  if (isPoisoned(character)) {
    const antidote = findNeutralizePoison(character)
    if (antidote) {
      return { type: 'use', itemId: antidote.id }
    }
    // Also check resistance potion which cures poison
    const resistPotion = findResistancePotion(character, 'poison')
    if (resistPotion) {
      return { type: 'use', itemId: resistPotion.id }
    }
  }

  // 1c. Cure confusion - random actions are dangerous
  if (hasStatusEffect(character, 'confused')) {
    const cure = findCureFor(character, 'confused')
    if (cure) {
      return { type: 'use', itemId: cure.id }
    }
  }

  // 1d. Cure blind - can't see threats
  if (hasStatusEffect(character, 'blind')) {
    const cure = findCureFor(character, 'blind')
    if (cure) {
      return { type: 'use', itemId: cure.id }
    }
  }

  // 1e. Cure slow - combat disadvantage (only cure if in combat)
  if (hasStatusEffect(character, 'slowed') && inCombat) {
    const cure = findCureFor(character, 'slowed')
    if (cure) {
      return { type: 'use', itemId: cure.id }
    }
  }

  // 1f. Cure terrified - can't fight back (only cure if in combat)
  if (hasStatusEffect(character, 'terrified') && inCombat) {
    const cure = findCureFor(character, 'terrified')
    if (cure) {
      return { type: 'use', itemId: cure.id }
    }
  }

  // 1g. Cure drained - stat reduction (lower priority, cure when safe)
  if (hasStatusEffect(character, 'drained') && !inCombat) {
    const cure = findCureFor(character, 'drained')
    if (cure) {
      return { type: 'use', itemId: cure.id }
    }
  }

  // 2. Calculate BOTH danger scopes (Angband two-scope pattern)
  // Local danger: for pathfinding and general threat assessment
  const localDanger = getLocalDanger(dangers, character.position)
  const avoidance = calculateAvoidance(game, config)
  const localTier = getDangerTier(localDanger, avoidance)

  // Immediate danger: ONLY adjacent monsters - for consumable decisions
  // This prevents wasting items on distant threats
  const immediateDanger = getImmediateDanger(game)
  const immediateTier = getImmediateDangerTier(immediateDanger, character.hp, character.maxHp)

  // 3. If CRITICAL and shouldEscapeOverHeal: escape takes priority
  // Use LOCAL tier for this (retreat from dangerous area)
  if (localTier === 'CRITICAL' && shouldEscapeOverHeal(game, localTier, adjacentCount)) {
    // Try full teleport first (always safe - random destination)
    const fullTeleport = findFullTeleportScroll(character)
    if (fullTeleport) {
      return { type: 'use', itemId: fullTeleport.id }
    }
    // Try phase door (skip safety check - desperate mode)
    const phaseDoor = findPhaseDoorScroll(character)
    if (phaseDoor) {
      return { type: 'use', itemId: phaseDoor.id }
    }
    // Fall back to any escape scroll
    const anyEscape = findEscapeScroll(character)
    if (anyEscape) {
      return { type: 'use', itemId: anyEscape.id }
    }
  }

  // 4. Healing decision based on IMMEDIATE danger and HP ratio
  // Don't heal at full HP just because distant monsters exist
  // Following Angband borg: heal when HP missing AND threat is REAL (adjacent)

  // Check if fighting Morgoth - needs aggressive healing (at 50% not 75%)
  const fightingMorgoth = game.monsters.some(
    (m) =>
      m.template.name === VICTORY_BOSS_NAME &&
      m.hp > 0 &&
      Math.max(
        Math.abs(m.position.x - character.position.x),
        Math.abs(m.position.y - character.position.y)
      ) <= 2
  )

  // Boss fight healing threshold: 50% (aggressive) vs normal 75%
  const healingThreshold = fightingMorgoth ? 0.5 : 0.75

  const shouldHeal =
    // Must have taken some damage (not at 100% HP)
    hpRatio < 0.95 &&
    // Actual adjacent monster AND HP below threshold
    ((adjacentCount > 0 && hpRatio < healingThreshold) ||
      // OR immediate danger could kill us (threat > 70% of current HP)
      // Threat is damage*2, so compare against hp*1.4 (70% threshold)
      immediateDanger > character.hp * 1.4 ||
      // OR we're in local CRITICAL with HP below 65% (retreat situation)
      (localTier === 'CRITICAL' && hpRatio < 0.65) ||
      // MORGOTH SPECIAL: heal more aggressively - at 50% HP regardless of other factors
      (fightingMorgoth && hpRatio < 0.5))

  if (shouldHeal) {
    // healsPriority classes (priest/paladin) should use heal spells first
    // Only use potions when mana is low (<20%) or in CRITICAL emergency
    const manaRatio = character.maxMp > 0 ? character.mp / character.maxMp : 0
    const shouldReservePotions = healsPriority && manaRatio >= 0.2 && immediateTier !== 'CRITICAL'

    if (!shouldReservePotions) {
      // Against Morgoth: always use best potions available
      // Normal: try stronger potions when more hurt
      const minTier = fightingMorgoth ? 4 : hpRatio < 0.25 ? 2 : 1
      const potion = findHealingPotion(character, minTier) ?? findHealingPotion(character, 1)
      if (potion) {
        return { type: 'use', itemId: potion.id }
      }
    }
  }

  // 4b. Town Portal decision - use when not adjacent to monsters
  // This is a strategic escape/resupply - not for immediate combat
  // Skip if portal already active (would fail and loop forever)
  // Skip if town portal capability disabled (no benefit from town visit)
  if (adjacentCount === 0 && personality && !game.townPortal && townPortalEnabled) {
    const portalDecision = shouldUseTownPortal(game, config, personality)
    if (portalDecision.shouldUse) {
      const scroll = findTownPortalScroll(character)
      if (scroll) {
        // Store reason for diagnostics
        if (botState) {
          botState.lastTownPortalReason = portalDecision.reason
        }
        return { type: 'use', itemId: scroll.id }
      }
    }
  }

  // 5. Escape decision based on IMMEDIATE danger
  // Don't escape from distant monsters - only from actual adjacent threats
  // CAUTION tier from distance-2 monsters is NOT enough to trigger escape
  const shouldEscape =
    // Actual adjacent monsters present AND no healing AND damaged
    (adjacentCount > 0 && !hasHealing && hpRatio < 0.8) ||
    // OR immediate danger is CRITICAL (could die this turn)
    immediateTier === 'CRITICAL' ||
    // OR surrounded (2+ adjacent)
    (adjacentCount >= 2 && hpRatio < 0.9) ||
    // OR local CRITICAL with no healing and significantly damaged
    (localTier === 'CRITICAL' && !hasHealing && hpRatio < 0.7)

  if (shouldEscape) {
    // Try full teleport (always safe)
    const fullTeleport = findFullTeleportScroll(character)
    if (fullTeleport) {
      return { type: 'use', itemId: fullTeleport.id }
    }

    // Try phase door with safety check
    const phaseDoor = findPhaseDoorScroll(character)
    if (phaseDoor) {
      const safety = profile('evaluatePhaseDoorSafety', () =>
        evaluatePhaseDoorSafety(game, dangers, avoidance)
      )
      if (safety.isSafe) {
        return { type: 'use', itemId: phaseDoor.id }
      }
    }

    // Try town portal as escape when not adjacent (safe to cast)
    // This is a valid escape - returns us to town for healing
    // Skip if portal already active (would fail and loop forever)
    if (adjacentCount === 0 && !game.townPortal) {
      const townPortal = findTownPortalScroll(character)
      if (townPortal) {
        // Store reason for diagnostics
        if (botState) {
          botState.lastTownPortalReason = 'Emergency escape (no teleport)'
        }
        return { type: 'use', itemId: townPortal.id }
      }
    }

    // Use speed potion to outrun enemies if no teleport available
    // Only when not adjacent (already disengaged, now fleeing)
    if (adjacentCount === 0 && !hasStatusEffect(character, 'speed')) {
      const speedPotion = findSpeedPotion(character)
      if (speedPotion) {
        return { type: 'use', itemId: speedPotion.id }
      }
    }
  }

  // 6. Twitchy escape: if stuck for 30+ turns, use escape to break deadlock
  const TWITCH_THRESHOLD = 30
  if (botState && botState.twitchCounter > TWITCH_THRESHOLD) {
    const fullTeleport = findFullTeleportScroll(character)
    if (fullTeleport) {
      return { type: 'use', itemId: fullTeleport.id }
    }
    const phaseDoor = findPhaseDoorScroll(character)
    if (phaseDoor) {
      return { type: 'use', itemId: phaseDoor.id }
    }
    // Town portal can break stuck state too (skip if portal already active)
    if (!game.townPortal) {
      const townPortal = findTownPortalScroll(character)
      if (townPortal) {
        // Store reason for diagnostics
        if (botState) {
          botState.lastTownPortalReason = `Stuck escape (twitch=${botState.twitchCounter})`
        }
        return { type: 'use', itemId: townPortal.id }
      }
    }
    const anyEscape = findEscapeScroll(character)
    if (anyEscape) {
      return { type: 'use', itemId: anyEscape.id }
    }
  }

  // 7. Also check for basic healing outside of combat when HP is low
  // healsPriority classes should still use spells - only potion if mana depleted
  if (!inCombat && hpRatio < 0.4) {
    const manaRatio = character.maxMp > 0 ? character.mp / character.maxMp : 0
    const canUseSpell = healsPriority && manaRatio >= 0.1
    if (!canUseSpell) {
      const potion = findHealingPotion(character, 1)
      if (potion) {
        return { type: 'use', itemId: potion.id }
      }
    }
  }

  return null
}

// ============================================================================
// PRE-COMBAT BUFFS
// ============================================================================

/**
 * Check if we should use a pre-combat buff when approaching dangerous enemies
 *
 * This is for consumables like blessing scrolls that should be used BEFORE
 * engaging in melee, not during active combat (wasting a turn mid-fight).
 *
 * Triggers when:
 * - Tactics L2+ capability is enabled
 * - Visible dangerous monster approaching (threat > 100)
 * - Not yet in melee (adjacentCount == 0)
 * - Don't already have the buff active
 *
 * Special handling for Morgoth: apply ALL buffs (speed + berserk + blessing)
 */
export function getPreCombatBuffAction(
  game: GameState,
  _config: PersonalityConfig,
  visibleMonsters: Monster[],
  tacticsLevel: number = 3
): GameAction | null {
  // Gate behind tactics L2 (buffs)
  if (tacticsLevel < 2) return null

  const character = game.character
  const adjacentCount = countAdjacentMonsters(game, character.position)

  // Only use pre-combat buffs when NOT in melee yet
  if (adjacentCount > 0) return null

  // No visible monsters, no need to buff
  if (visibleMonsters.length === 0) return null

  // Check if Morgoth is visible - triggers full buffing protocol
  const morgothVisible = visibleMonsters.some((m) => m.template.name === VICTORY_BOSS_NAME)

  // Check if already buffed
  const hasBlessing = hasStatusEffect(character, 'blessing')
  const hasProtection = hasStatusEffect(character, 'protection')
  const hasSpeed = hasStatusEffect(character, 'speed')
  const hasBerserk = hasStatusEffect(character, 'berserk')
  const hasHeroism = hasStatusEffect(character, 'heroism')

  // MORGOTH PROTOCOL: Full buff stack before engaging
  if (morgothVisible) {
    // 1. Speed first - critical for matching Morgoth's 140 speed
    if (!hasSpeed) {
      const speedPotion = findSpeedPotion(character)
      if (speedPotion) {
        return { type: 'use', itemId: speedPotion.id }
      }
    }

    // 2. Berserk for damage boost (or heroism if no berserk)
    if (!hasBerserk && !hasHeroism) {
      const buffPotion = findBuffPotion(character)
      if (buffPotion) {
        return { type: 'use', itemId: buffPotion.id }
      }
    }

    // 3. Blessing for accuracy
    if (!hasBlessing) {
      const blessingScroll = findBlessingScroll(character)
      if (blessingScroll) {
        return { type: 'use', itemId: blessingScroll.id }
      }
    }

    // 4. Protection from evil
    if (!hasProtection) {
      const protScroll = findProtectionScroll(character)
      if (protScroll) {
        return { type: 'use', itemId: protScroll.id }
      }
    }

    // Fully buffed for Morgoth, proceed to combat
    return null
  }

  // STANDARD ENEMIES: Normal buffing logic
  // Check if any visible monster is dangerous enough to warrant buffing
  const THREAT_THRESHOLD = 100
  const hasDangerousMonster = visibleMonsters.some((m) => {
    const threat = getMonsterThreat(m, character)
    return threat >= THREAT_THRESHOLD
  })

  if (!hasDangerousMonster) return null

  // For ranged classes with bow: speed is highest priority pre-combat buff
  // Speed gives huge kiting advantage - more actions to shoot and reposition
  const hasBow = character.equipment.bow !== null
  if (hasBow && !hasSpeed) {
    const speedPotion = findSpeedPotion(character)
    if (speedPotion) {
      return { type: 'use', itemId: speedPotion.id }
    }
  }

  // Use blessing scroll before engaging dangerous enemy
  if (!hasBlessing) {
    const blessingScroll = findBlessingScroll(character)
    if (blessingScroll) {
      return { type: 'use', itemId: blessingScroll.id }
    }
  }

  // Use protection from evil in deep dungeon before engaging
  if (!hasProtection && character.depth >= 15) {
    const protScroll = findProtectionScroll(character)
    if (protScroll) {
      return { type: 'use', itemId: protScroll.id }
    }
  }

  return null
}

// ============================================================================
// COMBAT BUFFS
// ============================================================================

/**
 * Check if we should use a combat buff during high-danger situations
 *
 * This handles:
 * - Heroism/Berserk potions for tough fights (high localDanger)
 * - Resistance potions when facing elemental monsters
 * - MORGOTH: Maintain speed + berserk buffs throughout the fight
 *
 * Note: Speed and Blessing are handled elsewhere:
 * - Speed: escape logic (outrun enemies) or speedrunner utility
 * - Blessing: pre-combat buff (before engaging)
 */
export function getCombatBuffAction(
  game: GameState,
  _config: PersonalityConfig,
  dangers: DangerMap,
  tacticsLevel: number = 3
): GameAction | null {
  // Gate behind tactics L2 (buffs)
  if (tacticsLevel < 2) return null

  const character = game.character
  const inCombat = isInCombat(game)
  const localDanger = getLocalDanger(dangers, character.position)

  // Only use buffs when in combat or approaching strong enemies
  if (!inCombat && localDanger < 30) return null

  // Check if already buffed
  const hasHeroism = hasStatusEffect(character, 'heroism')
  const hasBerserk = hasStatusEffect(character, 'berserk')
  const hasSpeed = hasStatusEffect(character, 'speed')

  // MORGOTH: Maintain buff stack during fight
  // This is critical - Morgoth fight is long and buffs may wear off
  const fightingMorgoth = game.monsters.some(
    (m) =>
      m.template.name === VICTORY_BOSS_NAME &&
      m.hp > 0 &&
      Math.max(
        Math.abs(m.position.x - character.position.x),
        Math.abs(m.position.y - character.position.y)
      ) <= 3
  )

  if (fightingMorgoth) {
    // Maintain speed - critical for matching Morgoth's 140 speed
    if (!hasSpeed) {
      const speedPotion = findSpeedPotion(character)
      if (speedPotion) {
        return { type: 'use', itemId: speedPotion.id }
      }
    }

    // Maintain berserk/heroism for damage boost
    if (!hasBerserk && !hasHeroism) {
      const buffPotion = findBuffPotion(character)
      if (buffPotion) {
        return { type: 'use', itemId: buffPotion.id }
      }
    }
  }

  // Use buff potion (heroism/berserk) for tough fights
  if (!hasHeroism && !hasBerserk && localDanger > 50) {
    const buffPotion = findBuffPotion(character)
    if (buffPotion) {
      return { type: 'use', itemId: buffPotion.id }
    }
  }

  // Use resistance potions based on nearby monster types
  const nearbyMonsters = game.monsters.filter((m) => {
    const dx = Math.abs(m.position.x - character.position.x)
    const dy = Math.abs(m.position.y - character.position.y)
    return dx <= 3 && dy <= 3 && m.hp > 0
  })

  for (const monster of nearbyMonsters) {
    // Fire resistance for fire-breathing monsters
    if (hasAbility(monster.template, 'FIRE') && !hasTempResistance(character, 'FIRE')) {
      const firePotion = findResistancePotion(character, 'fire')
      if (firePotion) {
        return { type: 'use', itemId: firePotion.id }
      }
    }

    // Cold resistance for frost monsters
    if (hasAbility(monster.template, 'COLD') && !hasTempResistance(character, 'COLD')) {
      const coldPotion = findResistancePotion(character, 'cold')
      if (coldPotion) {
        return { type: 'use', itemId: coldPotion.id }
      }
    }

    // Poison resistance for venomous monsters
    if (hasAbility(monster.template, 'POISON') && !hasTempResistance(character, 'POISON')) {
      const poisonPotion = findResistancePotion(character, 'poison')
      if (poisonPotion) {
        return { type: 'use', itemId: poisonPotion.id }
      }
    }
  }

  return null
}

// ============================================================================
// UTILITY CONSUMABLES
// ============================================================================

/**
 * Check if we should use a utility consumable (mapping, enchant, etc.)
 * Only when safe and not in combat
 *
 * @param personality - Optional personality name for personality-specific behavior
 */
export function getUtilityConsumableAction(
  game: GameState,
  _config: PersonalityConfig,
  dangers: DangerMap,
  personality?: string
): GameAction | null {
  const character = game.character
  const inCombat = isInCombat(game)
  const localDanger = getLocalDanger(dangers, character.position)

  // Only use utility items when safe
  if (inCombat || localDanger > 20) return null

  // Speedrunner: use speed potion when exploring safely to move faster
  if (personality === 'speedrunner' && !hasStatusEffect(character, 'speed')) {
    const speedPotion = findSpeedPotion(character)
    if (speedPotion) {
      return { type: 'use', itemId: speedPotion.id }
    }
  }

  // Use enchant scrolls when safe and have equipment
  const weapon = character.equipment.weapon
  const armor = character.equipment.armor

  // Enchant weapon if we have one equipped and a scroll
  if (weapon && weapon.enchantment < 5) {
    const enchantWeapon = findEnchantScroll(character, 'weapon')
    if (enchantWeapon) {
      return { type: 'use', itemId: enchantWeapon.id }
    }
  }

  // Enchant armor if we have one equipped and a scroll
  if (armor && armor.enchantment < 5) {
    const enchantArmor = findEnchantScroll(character, 'armor')
    if (enchantArmor) {
      return { type: 'use', itemId: enchantArmor.id }
    }
  }

  // Use mapping scroll if exploration is low (< 30%)
  const explorationRatio = calculateExplorationRatio(game)

  if (explorationRatio < 0.3) {
    const mappingScroll = findMappingScroll(character)
    if (mappingScroll) {
      return { type: 'use', itemId: mappingScroll.id }
    }
  }

  return null
}

// ============================================================================
// STUCK EXPLORATION CONSUMABLES
// ============================================================================

/**
 * Calculate the exploration ratio for the current level
 */
function calculateExplorationRatio(game: GameState): number {
  const totalTiles = game.currentLevel.width * game.currentLevel.height
  return countExploredTiles(game.currentLevel) / totalTiles
}

/**
 * Thresholds for stuck exploration actions (turns on level)
 * Working backwards from 1000-turn circuit breaker
 */
const STUCK_THRESHOLDS = {
  DETECT_STAIRS: 300, // First intervention: just find the stairs
  MAGIC_MAPPING: 500, // Second intervention: reveal whole map
  TELEPORT_LEVEL: 700, // Last resort: skip the floor entirely
} as const

/**
 * Check if we should use a scroll to help with stuck exploration
 *
 * Tiered system based on turns-on-level:
 * - 300+ turns: Use Detect Stairs if stairs not known
 * - 500+ turns: Use Magic Mapping if exploration < 60%
 * - 700+ turns: Use Teleport Level to skip floor
 *
 * This provides 3 escalating interventions before the 2000-turn circuit breaker.
 */
export function getStuckExplorationAction(game: GameState, botState: BotState): GameAction | null {
  const character = game.character

  // Don't use these scrolls while in combat
  if (countAdjacentMonsters(game, character.position) > 0) return null

  const turnsOnLevel = botState.turnsOnLevel
  const stairsKnown = botState.knownStairsDown !== null

  // Tier 1: Use Detect Stairs after 300 turns if stairs not found
  if (turnsOnLevel >= STUCK_THRESHOLDS.DETECT_STAIRS && !stairsKnown) {
    const detectStairs = findDetectStairsScroll(character)
    if (detectStairs) {
      return { type: 'use', itemId: detectStairs.id }
    }
  }

  // Tier 2: Use Magic Mapping after 500 turns if exploration is low
  if (turnsOnLevel >= STUCK_THRESHOLDS.MAGIC_MAPPING) {
    const explorationRatio = calculateExplorationRatio(game)
    if (explorationRatio < 0.6) {
      const mappingScroll = findMappingScroll(character)
      if (mappingScroll) {
        return { type: 'use', itemId: mappingScroll.id }
      }
    }
  }

  // Tier 3: Use Teleport Level after 700 turns (skip the floor)
  if (turnsOnLevel >= STUCK_THRESHOLDS.TELEPORT_LEVEL) {
    const teleportLevel = findTeleportLevelScroll(character)
    if (teleportLevel) {
      return { type: 'use', itemId: teleportLevel.id }
    }
  }

  return null
}
