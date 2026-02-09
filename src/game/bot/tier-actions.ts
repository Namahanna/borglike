/**
 * Urgency-Gated Tier Actions
 *
 * Decision trees for each danger tier. Each tier has different priority orderings
 * based on immediate threat level (Angband borg inspired):
 *
 * - CRITICAL: escape > heal > desperate attack
 * - DANGER:   heal > attack > escape
 * - CAUTION:  attack > proactive heal
 * - SAFE:     normal flow (combat > items > movement)
 */

import type { GameState, GameAction, BotPersonality, Direction } from '../types'
import { isBossOrUnique } from '../types'
import { canRangedAttack } from '../combat'

import type { BotState, BotContext, DangerResult, DangerTier } from './types'
import { getEffectiveCapabilities } from './types'
import { recordProgress, setGoal, resetAfterTeleport } from './state'
import { isSamePoint } from '../types'
import {
  getLocalDanger,
  getDangerThreshold,
  getImmediateDanger,
  getImmediateDangerTier,
} from './danger'
import {
  findAdjacentMonster,
  hasRangedWeapon,
  findBestRangedTarget,
  findKitePosition,
  countAdjacentMonsters,
} from './combat'
import { findEquipmentUpgrades, isTeleportAction, findManaPotion } from './items'
import {
  getSurvivalConsumableAction,
  getCombatBuffAction,
  getPreCombatBuffAction,
  getUtilityConsumableAction,
} from './survival'
import {
  getHealingSpellAction,
  getDamageSpellAction,
  getBuffSpellAction,
  getEscapeSpellAction,
  getPhaseDoorSpellAction,
  getDebuffSpellAction,
  getSmartDebuffAction,
  getSummonSpellAction,
  getRootShotAction,
  classShouldSummon,
  getLightOrbSpellAction,
  getDimensionDoorKiteAction,
  getShadowStepAction,
} from './spells'
import { isShapeshifterClass, getDruidTierAction } from './shapeshift'
import { getAOEActivationAction, getHasteActivationAction } from './activations'

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Calculate immediate danger tier from game state.
 * Used by tick.ts to determine which tier handler to invoke.
 */
export function calculateImmediateTier(game: GameState): DangerTier {
  const immediateDanger = getImmediateDanger(game)
  const hasAdjacentMonster = findAdjacentMonster(game) !== null
  return getImmediateDangerTier(
    immediateDanger,
    game.character.hp,
    game.character.maxHp,
    hasAdjacentMonster
  )
}

/**
 * Select action based on immediate danger tier.
 * Dispatches to the appropriate tier handler.
 */
export function selectActionByTier(
  game: GameState,
  context: BotContext,
  botState: BotState,
  dangerResult: DangerResult,
  personality: BotPersonality,
  tier: DangerTier
): GameAction | null {
  switch (tier) {
    case 'CRITICAL':
      return handleCriticalTier(game, context, botState, dangerResult, personality)
    case 'DANGER':
      return handleDangerTier(game, context, botState, dangerResult, personality)
    case 'CAUTION':
      return handleCautionTier(game, context, botState, dangerResult, personality)
    case 'SAFE':
      return handleSafeTier(game, context, botState, dangerResult, personality)
  }
}

// ============================================================================
// TIER HANDLERS
// ============================================================================

/**
 * CRITICAL tier: Might die this turn
 *
 * Priority: escape > heal > ranged attack (if ranged class) > desperate melee
 */
function handleCriticalTier(
  game: GameState,
  context: BotContext,
  botState: BotState,
  dangerResult: DangerResult,
  personality: BotPersonality
): GameAction | null {
  const { config, classProfile, visibleMonsters } = context
  const pos = game.character.position
  const localDanger = getLocalDanger(dangerResult.dangers, pos)
  const adjacentMonster = findAdjacentMonster(game)

  // 1. Try escape spell first (renewable resource)
  const escapeSpell = getEscapeSpellAction(game, config, dangerResult.dangers)
  if (escapeSpell) {
    resetAfterTeleport(botState)
    recordProgress(botState, game.turn)
    return escapeSpell
  }

  // 2. Try escape consumable (teleport scroll, phase door)
  const effective = getEffectiveCapabilities(context)
  const survivalAction = getSurvivalConsumableAction(
    game,
    config,
    dangerResult.dangers,
    botState,
    personality,
    classProfile.healsPriority,
    effective.town >= 1
  )
  if (survivalAction) {
    if (isTeleportAction(game.character, survivalAction)) {
      resetAfterTeleport(botState)
    }
    recordProgress(botState, game.turn)
    return survivalAction
  }

  // 3. Try healing spell
  const healSpell = getHealingSpellAction(game, config, localDanger, classProfile.healsPriority)
  if (healSpell) {
    recordProgress(botState, game.turn)
    return healSpell
  }

  // 4. For ranged classes: try to kite away or attack from distance
  if (classProfile.prefersRanged) {
    // Try to kite away if adjacent (physical movement works for all ranged classes)
    // Requires kiting L2+ for active repositioning
    if (adjacentMonster && effective.kiting >= 2) {
      const optimalRange = effective.kiting >= 3 ? classProfile.engageDistance || 3 : 3
      const kiteDir = findKitePosition(game, adjacentMonster, optimalRange)
      if (kiteDir && setKiteGoal(context, adjacentMonster, kiteDir)) {
        recordProgress(botState, game.turn)
        return { type: 'move', direction: kiteDir }
      }
    }

    // Ranged attack if not adjacent and have targets
    if (!adjacentMonster) {
      if (hasRangedWeapon(game)) {
        // Bow attack for rangers
        const rangedTarget = findBestRangedTarget(game, visibleMonsters)
        if (rangedTarget && canRangedAttack(game.character, rangedTarget.position)) {
          recordProgress(botState, game.turn)
          return { type: 'ranged_attack', targetId: rangedTarget.id }
        }
      } else {
        // Damage spell for casters (mage, archmage, necromancer)
        const damageSpell = getDamageSpellAction(game, config, visibleMonsters)
        if (damageSpell) {
          recordProgress(botState, game.turn)
          return damageSpell
        }
      }
    }
  }

  // 5. Druid shapeshifting: Raven escape takes priority over desperate melee
  if (isShapeshifterClass(game.character.classId)) {
    const druidAction = getDruidTierAction(
      game,
      context,
      botState,
      dangerResult,
      'CRITICAL',
      adjacentMonster
    )
    if (druidAction) {
      recordProgress(botState, game.turn)
      return druidAction
    }
  }

  // 6. Desperate melee attack if cornered (no escape, no heal, can't kite)
  if (adjacentMonster) {
    setKillGoal(botState, adjacentMonster, game.turn, 'Desperate attack')
    recordProgress(botState, game.turn)
    return { type: 'attack', targetId: adjacentMonster.id }
  }

  // 7. Try to move away from danger
  return null // Let fallback handle movement
}

/**
 * DANGER tier: Can take maybe 1 hit
 *
 * Priority for ranged classes: kite > ranged attack > heal > melee fallback
 * Priority for melee classes: heal > attack > escape
 */
function handleDangerTier(
  game: GameState,
  context: BotContext,
  botState: BotState,
  dangerResult: DangerResult,
  personality: BotPersonality
): GameAction | null {
  const { config, classProfile, visibleMonsters, capabilities } = context
  const pos = game.character.position
  const localDanger = getLocalDanger(dangerResult.dangers, pos)
  const adjacentMonster = findAdjacentMonster(game)

  // For ranged classes: prioritize repositioning and attacking from distance
  if (classProfile.prefersRanged) {
    // 1. If adjacent, try root_shot (rangers only) then kite away
    if (adjacentMonster) {
      // Root shot only for rangers who have it
      if (hasRangedWeapon(game)) {
        const rootAction = getRootShotAction(game, adjacentMonster)
        if (rootAction) {
          recordProgress(botState, game.turn)
          return rootAction
        }
      }

      // Casters: Try Dimension Door for tactical kiting (targeted escape + continue casting)
      // DD is preferred over Phase Door because it maintains combat engagement
      // Requires kiting L3 (advanced caster technique)
      if (!hasRangedWeapon(game)) {
        const ddAction = getDimensionDoorKiteAction(game, visibleMonsters, capabilities.kiting)
        if (ddAction && ddAction.type === 'cast' && ddAction.targetId) {
          // Update KITE goal target to DD destination - this IS the new kite position
          // Prevents bot from walking back to stale target after teleport
          if (botState.currentGoal?.type === 'KITE') {
            const parts = ddAction.targetId.split(',')
            const x = Number(parts[0])
            const y = Number(parts[1])
            if (!isNaN(x) && !isNaN(y)) {
              botState.currentGoal.target = { x, y }
              botState.goalTarget = { x, y }
            }
          }
          resetAfterTeleport(botState)
          recordProgress(botState, game.turn)
          return ddAction
        }
      }

      // Mage/Archmage/Rogue: Try Phase Door at DANGER tier (random tactical escape)
      // Fallback when DD not available
      // Only when actually threatened: HP < 50% OR surrounded (2+ adjacent)
      // Avoids disrupting exploration when bot could just fight
      // EXCEPTION: Skip phase door when close to stairs with DESCEND goal - push through
      // instead of repeatedly teleporting away and restarting the approach
      // NOTE: Rogue uses this for Shadow Step combat cycle (step in → attack → phase out)
      const classId = game.character.classId
      const hpRatio = game.character.hp / game.character.maxHp
      const adjacentCount = countAdjacentMonsters(game, pos)
      const goal = botState.currentGoal
      const closeToStairs =
        goal?.type === 'DESCEND' &&
        goal.target &&
        Math.max(Math.abs(pos.x - goal.target.x), Math.abs(pos.y - goal.target.y)) <= 15
      if (classId === 'mage' || classId === 'archmage' || classId === 'rogue') {
        if ((hpRatio < 0.5 || adjacentCount >= 2) && !closeToStairs) {
          const phaseDoorAction = getPhaseDoorSpellAction(game)
          if (phaseDoorAction) {
            resetAfterTeleport(botState)
            recordProgress(botState, game.turn)
            return phaseDoorAction
          }
        }
      }

      // Casters: Smart debuff (slow fast+dangerous monsters) - defense before damage
      // Only slow if: fast (speed > 110) AND high damage (4 hits to kill) AND not easily killed
      if (!hasRangedWeapon(game)) {
        const smartDebuff = getSmartDebuffAction(game, visibleMonsters, capabilities.tactics)
        if (smartDebuff) {
          recordProgress(botState, game.turn)
          return smartDebuff
        }
      }

      // 2. Kite away if adjacent (physical movement works for all ranged classes)
      // Requires kiting L2+ for active repositioning
      if (capabilities.kiting >= 2) {
        const optimalRange = capabilities.kiting >= 3 ? classProfile.engageDistance || 3 : 3
        const kiteDir = findKitePosition(game, adjacentMonster, optimalRange)
        if (kiteDir && setKiteGoal(context, adjacentMonster, kiteDir)) {
          recordProgress(botState, game.turn)
          return { type: 'move', direction: kiteDir }
        }
      }

      // 2b. Can't kite - casters should cast damage spell point-blank, not melee
      if (!hasRangedWeapon(game)) {
        const damageSpell = getDamageSpellAction(game, config, [adjacentMonster])
        if (damageSpell) {
          recordProgress(botState, game.turn)
          return damageSpell
        }
      }
    }

    // 3. Ranged attack if at safe distance
    if (!adjacentMonster) {
      if (hasRangedWeapon(game)) {
        // Bow attack for rangers
        const rangedTarget = findBestRangedTarget(game, visibleMonsters)
        if (rangedTarget && canRangedAttack(game.character, rangedTarget.position)) {
          recordProgress(botState, game.turn)
          return { type: 'ranged_attack', targetId: rangedTarget.id }
        }
      } else {
        // Casters: MP pot if low AND in combat (KITE/FLEE goal) - save pots for emergencies
        const manaRatio = game.character.maxMp > 0 ? game.character.mp / game.character.maxMp : 1
        const goalType = botState.currentGoal?.type
        const inCombatGoal = goalType === 'KITE' || goalType === 'FLEE'
        if (manaRatio < 0.3 && inCombatGoal) {
          const mpPot = findManaPotion(game.character)
          if (mpPot) {
            recordProgress(botState, game.turn)
            return { type: 'use', itemId: mpPot.id }
          }
        }
        // Damage spell for casters (mage, archmage, necromancer)
        const damageSpell = getDamageSpellAction(game, config, visibleMonsters)
        if (damageSpell) {
          recordProgress(botState, game.turn)
          return damageSpell
        }

        // AOE activation fallback (mana-free damage)
        const aoeActivation = getAOEActivationAction(game, context, visibleMonsters)
        if (aoeActivation) {
          recordProgress(botState, game.turn)
          return aoeActivation
        }
      }
    }
  }

  // 2b. Rogue escape after Sneak Attack cycle
  // Shadow Step combat cycle: step in → sneak attack → phase door out → heal → repeat
  // After consuming sneak attack buff (or when cornered), Rogue should escape
  if (game.character.classId === 'rogue' && adjacentMonster) {
    const hpRatio = game.character.hp / game.character.maxHp
    // Escape if: hurt (<60% HP) OR surrounded (2+ adjacent) OR facing boss
    const adjacentCount = countAdjacentMonsters(game, pos)
    const facingBoss =
      adjacentMonster.template.flags?.includes('UNIQUE') ||
      adjacentMonster.template.flags?.includes('BOSS')
    if (hpRatio < 0.6 || adjacentCount >= 2 || facingBoss) {
      const phaseDoorAction = getPhaseDoorSpellAction(game)
      if (phaseDoorAction) {
        resetAfterTeleport(botState)
        recordProgress(botState, game.turn)
        return phaseDoorAction
      }
    }
  }

  // 3. Non-ranged casters at DANGER: mix damage with healing
  // Priest/Paladin/Blackguard have potent damage spells but aren't routed
  // through the prefersRanged branch. Without damage-before-heal, the aggressive
  // healsPriority thresholds cause a heal-until-OOM spiral (zero DPS output).
  // HP > 50%: damage first (attack while healthy enough to take a hit)
  // HP ≤ 50%: heal first (survive, then resume attacking)
  // Targets any visible monster (not just adjacent) so ranged spells work against
  // monsters hitting from distance (Morgoth BRAIN_SMASH, dragon breath, etc.)
  if (!classProfile.prefersRanged && visibleMonsters.length > 0) {
    const hpRatio = game.character.hp / game.character.maxHp
    if (hpRatio > 0.5) {
      const targets = adjacentMonster ? [adjacentMonster] : visibleMonsters
      const damageSpell = getDamageSpellAction(game, config, targets)
      if (damageSpell) {
        if (adjacentMonster) {
          setKillGoal(botState, adjacentMonster, game.turn, 'Spell attack (danger)')
        }
        recordProgress(botState, game.turn)
        return damageSpell
      }
    }
  }

  // 3b. Healing spell (fires at ≤50% HP for non-ranged casters, anytime for others)
  const healSpell = getHealingSpellAction(game, config, localDanger, classProfile.healsPriority)
  if (healSpell) {
    recordProgress(botState, game.turn)
    return healSpell
  }

  // 3c. Non-ranged casters: damage fallback when heal isn't needed (HP high enough)
  if (!classProfile.prefersRanged && visibleMonsters.length > 0) {
    const targets = adjacentMonster ? [adjacentMonster] : visibleMonsters
    const damageSpell = getDamageSpellAction(game, config, targets)
    if (damageSpell) {
      if (adjacentMonster) {
        setKillGoal(botState, adjacentMonster, game.turn, 'Spell attack (danger)')
      }
      recordProgress(botState, game.turn)
      return damageSpell
    }

    // AOE activation fallback (mana-free damage when spells unavailable/OOM)
    const aoeActivation = getAOEActivationAction(game, context, visibleMonsters)
    if (aoeActivation) {
      recordProgress(botState, game.turn)
      return aoeActivation
    }
  }

  // 3d. Non-ranged casters: mana pot if dry — sustain spell casting
  // Without this, priest/paladin run out of MP and fall back to weak melee
  if (!classProfile.prefersRanged && game.character.maxMp > 0) {
    const manaRatio = game.character.mp / game.character.maxMp
    if (manaRatio < 0.15) {
      const mpPot = findManaPotion(game.character)
      if (mpPot) {
        recordProgress(botState, game.turn)
        return { type: 'use', itemId: mpPot.id }
      }
    }
  }

  // 4. Survival consumables (healing potion, antidote)
  const effective = getEffectiveCapabilities(context)
  const survivalAction = getSurvivalConsumableAction(
    game,
    config,
    dangerResult.dangers,
    botState,
    personality,
    classProfile.healsPriority,
    effective.town >= 1
  )
  if (survivalAction) {
    recordProgress(botState, game.turn)
    return survivalAction
  }

  // 5. Summon minion if missing (tanking help)
  if (classShouldSummon(game.character.classId)) {
    const summonAction = getSummonSpellAction(game, config, visibleMonsters)
    if (summonAction) {
      recordProgress(botState, game.turn)
      return summonAction
    }
  }

  // 6. Druid shapeshifting: Bear Form combat or Raven escape
  if (isShapeshifterClass(game.character.classId)) {
    const druidAction = getDruidTierAction(
      game,
      context,
      botState,
      dangerResult,
      'DANGER',
      adjacentMonster
    )
    if (druidAction) {
      recordProgress(botState, game.turn)
      return druidAction
    }
  }

  // 6b. Rogue with Sneak Attack buff: attack first to consume buff, then escape
  // This is the Shadow Step combat cycle: Shadow Step in -> Sneak Attack -> Phase Door out
  const hasSneakAttack = game.character.statusEffects.some((e) => e.type === 'sneak_attack')
  if (hasSneakAttack && adjacentMonster && game.character.classId === 'rogue') {
    setKillGoal(botState, adjacentMonster, game.turn, 'Sneak Attack (danger)')
    recordProgress(botState, game.turn)
    return { type: 'attack', targetId: adjacentMonster.id }
  }

  // 7. Melee attack if we must (or if melee class)
  if (adjacentMonster) {
    setKillGoal(botState, adjacentMonster, game.turn, 'Melee attack (danger)')
    recordProgress(botState, game.turn)
    return { type: 'attack', targetId: adjacentMonster.id }
  }

  // 8. Escape spell as fallback
  const escapeSpellFallback = getEscapeSpellAction(game, config, dangerResult.dangers)
  if (escapeSpellFallback) {
    resetAfterTeleport(botState)
    recordProgress(botState, game.turn)
    return escapeSpellFallback
  }

  return null
}

/**
 * CAUTION tier: Can take 2+ hits, but should be careful
 *
 * Priority for ranged classes: kite > ranged attack > melee fallback > proactive heal
 * Priority for melee classes: buffs > melee > proactive heal
 */
function handleCautionTier(
  game: GameState,
  context: BotContext,
  botState: BotState,
  dangerResult: DangerResult,
  _personality: BotPersonality
): GameAction | null {
  const { config, classProfile, visibleMonsters, capabilities } = context
  const tacticsLevel = capabilities.tactics
  const pos = game.character.position
  const localDanger = getLocalDanger(dangerResult.dangers, pos)
  const adjacentMonster = findAdjacentMonster(game)
  const hpRatio = game.character.hp / game.character.maxHp

  // 1. For ranged classes: prioritize repositioning and attacking from distance FIRST
  if (classProfile.prefersRanged) {
    if (adjacentMonster) {
      // Try root_shot first (rangers only) to stun before kiting
      if (hasRangedWeapon(game)) {
        const rootAction = getRootShotAction(game, adjacentMonster)
        if (rootAction) {
          recordProgress(botState, game.turn)
          return rootAction
        }

        // Bow users: kite away (requires kiting L2+ for active repositioning)
        if (capabilities.kiting >= 2) {
          const optimalRange = capabilities.kiting >= 3 ? classProfile.engageDistance || 3 : 3
          const kiteDir = findKitePosition(game, adjacentMonster, optimalRange)
          if (kiteDir && setKiteGoal(context, adjacentMonster, kiteDir)) {
            recordProgress(botState, game.turn)
            return { type: 'move', direction: kiteDir }
          }
        }
      } else {
        // Casters: finish the kill with damage spell instead of futile kiting
        // With low visibility, kiting just delays - better to deal damage
        // If HP gets critical, DANGER tier will use phase door to escape
        const damageSpell = getDamageSpellAction(game, config, [adjacentMonster])
        if (damageSpell) {
          recordProgress(botState, game.turn)
          return damageSpell
        }
      }
    } else if (visibleMonsters.length > 0) {
      // Ranged attack from distance
      if (hasRangedWeapon(game)) {
        // Bow attack for rangers
        const rangedTarget = findBestRangedTarget(game, visibleMonsters)
        if (rangedTarget && canRangedAttack(game.character, rangedTarget.position)) {
          recordProgress(botState, game.turn)
          return { type: 'ranged_attack', targetId: rangedTarget.id }
        }
      } else {
        // Casters: MP pot if low AND in combat (KITE/FLEE goal) - save pots for emergencies
        const manaRatio = game.character.maxMp > 0 ? game.character.mp / game.character.maxMp : 1
        const goalType = botState.currentGoal?.type
        const inCombatGoal = goalType === 'KITE' || goalType === 'FLEE'
        if (manaRatio < 0.3 && inCombatGoal) {
          const mpPot = findManaPotion(game.character)
          if (mpPot) {
            recordProgress(botState, game.turn)
            return { type: 'use', itemId: mpPot.id }
          }
        }
        // Damage spell for casters (mage, archmage, necromancer)
        const damageSpell = getDamageSpellAction(game, config, visibleMonsters)
        if (damageSpell) {
          recordProgress(botState, game.turn)
          return damageSpell
        }
      }
    }
  }

  // 2. Combat buffs when approaching enemies
  if (visibleMonsters.length > 0 && !adjacentMonster) {
    const hasBossTarget = visibleMonsters.some(isBossOrUnique)

    // Rogue always buffs (Envenom is core DPS), others only for bosses/uniques
    if (hasBossTarget || game.character.classId === 'rogue') {
      const combatBuff = getCombatBuffAction(game, config, dangerResult.dangers, tacticsLevel)
      if (combatBuff) {
        recordProgress(botState, game.turn)
        return combatBuff
      }

      const preCombatBuff = getPreCombatBuffAction(game, config, visibleMonsters, tacticsLevel)
      if (preCombatBuff) {
        recordProgress(botState, game.turn)
        return preCombatBuff
      }

      const buffSpell = getBuffSpellAction(game, config, visibleMonsters, tacticsLevel)
      if (buffSpell) {
        recordProgress(botState, game.turn)
        return buffSpell
      }

      // Haste activation (mana-free speed buff after spell buffs)
      const hasteActivation = getHasteActivationAction(game, context, visibleMonsters)
      if (hasteActivation) {
        recordProgress(botState, game.turn)
        return hasteActivation
      }
    }
  }

  // 3. Druid shapeshifting: Gap-closing spells then Bear Form engage
  if (isShapeshifterClass(game.character.classId)) {
    const druidAction = getDruidTierAction(
      game,
      context,
      botState,
      dangerResult,
      'CAUTION',
      adjacentMonster
    )
    if (druidAction) {
      recordProgress(botState, game.turn)
      return druidAction
    }
  }

  // 3b. Rogue Shadow Step: gap-close to bosses/uniques for Sneak Attack
  if (game.character.classId === 'rogue' && visibleMonsters.length > 0) {
    const shadowStepAction = getShadowStepAction(game, visibleMonsters)
    if (shadowStepAction) {
      recordProgress(botState, game.turn)
      return shadowStepAction
    }
  }

  // 3c. Non-ranged casters: prefer damage spells over melee when adjacent
  if (!classProfile.prefersRanged && adjacentMonster) {
    const damageSpell = getDamageSpellAction(game, config, [adjacentMonster])
    if (damageSpell) {
      setKillGoal(botState, adjacentMonster, game.turn, 'Spell attack (caution)')
      recordProgress(botState, game.turn)
      return damageSpell
    }
  }

  // 4. Melee combat (fallback for ranged classes, primary for melee)
  if (adjacentMonster) {
    setKillGoal(botState, adjacentMonster, game.turn, 'Melee combat')
    recordProgress(botState, game.turn)
    return { type: 'attack', targetId: adjacentMonster.id }
  }

  // 5. Proactive healing when not in melee (if significantly hurt)
  if (hpRatio < 0.7) {
    const healSpell = getHealingSpellAction(game, config, localDanger, classProfile.healsPriority)
    if (healSpell) {
      recordProgress(botState, game.turn)
      return healSpell
    }

    // Only use consumables if no spell available and quite hurt
    if (hpRatio < 0.5) {
      const effective = getEffectiveCapabilities(context)
      const survivalAction = getSurvivalConsumableAction(
        game,
        config,
        dangerResult.dangers,
        botState,
        _personality,
        classProfile.healsPriority,
        effective.town >= 1
      )
      if (survivalAction) {
        recordProgress(botState, game.turn)
        return survivalAction
      }
    }
  }

  // 5. Summon minion if missing (tanking help)
  if (classShouldSummon(game.character.classId)) {
    const summonAction = getSummonSpellAction(game, config, visibleMonsters)
    if (summonAction) {
      recordProgress(botState, game.turn)
      return summonAction
    }
  }

  // 6. Damage/debuff spells for visible enemies
  if (visibleMonsters.length > 0) {
    // Casters should debuff (slow) tanky targets before blasting
    // Melee classes prefer damage over CC
    const isCaster = ['mage', 'archmage', 'necromancer'].includes(game.character.classId)
    if (isCaster) {
      const debuffSpell = getDebuffSpellAction(game, config, visibleMonsters, tacticsLevel)
      if (debuffSpell) {
        recordProgress(botState, game.turn)
        return debuffSpell
      }
    }

    const damageSpell = getDamageSpellAction(game, config, visibleMonsters)
    if (damageSpell) {
      recordProgress(botState, game.turn)
      return damageSpell
    }

    // AOE activation fallback (mana-free damage)
    const aoeActivation = getAOEActivationAction(game, context, visibleMonsters)
    if (aoeActivation) {
      recordProgress(botState, game.turn)
      return aoeActivation
    }

    // Non-casters still get debuffs as fallback
    if (!isCaster) {
      const debuffSpell = getDebuffSpellAction(game, config, visibleMonsters, tacticsLevel)
      if (debuffSpell) {
        recordProgress(botState, game.turn)
        return debuffSpell
      }
    }
  }

  return null
}

/**
 * SAFE tier: No immediate threats
 *
 * Priority: summons > items > utility > movement/exploration
 */
function handleSafeTier(
  game: GameState,
  context: BotContext,
  botState: BotState,
  dangerResult: DangerResult,
  personality: BotPersonality
): GameAction | null {
  const { config, effectiveConfig, visibleMonsters, classProfile, capabilities } = context
  const tacticsLevel = capabilities.tactics
  const pos = game.character.position
  const localDanger = getLocalDanger(dangerResult.dangers, pos)
  const dangerThreshold = getDangerThreshold(effectiveConfig.aggression, effectiveConfig.caution)
  const hpRatio = game.character.hp / game.character.maxHp

  // 0. Proactive summons (wolf for ranger, skeleton for necromancer)
  // These are high priority - we want minions out even when safe
  if (classShouldSummon(game.character.classId)) {
    const summonAction = getSummonSpellAction(game, config, visibleMonsters)
    if (summonAction) {
      recordProgress(botState, game.turn)
      return summonAction
    }
  }

  // 0b. Proactive Light Orb for mage/archmage - extended visibility helps exploration
  const lightOrbAction = getLightOrbSpellAction(game)
  if (lightOrbAction) {
    recordProgress(botState, game.turn)
    return lightOrbAction
  }

  // 1. Pick up items at current position
  const itemHere = game.items.find((item) => isSamePoint(item.position, game.character.position))
  if (itemHere && localDanger < dangerThreshold) {
    recordProgress(botState, game.turn)
    return { type: 'pickup', itemId: itemHere.id }
  }

  // 2. Equip upgrades
  if (localDanger < dangerThreshold) {
    const upgrades = findEquipmentUpgrades(game.character)
    if (upgrades.length > 0) {
      recordProgress(botState, game.turn)
      return { type: 'equip', itemId: upgrades[0]!.id }
    }
  }

  // 3. Out-of-combat healing when safe and hurt
  if (hpRatio < 0.6) {
    const healSpell = getHealingSpellAction(game, config, localDanger, classProfile.healsPriority)
    if (healSpell) {
      recordProgress(botState, game.turn)
      return healSpell
    }

    // Only use potions if quite hurt and safe
    if (hpRatio < 0.4) {
      const effective = getEffectiveCapabilities(context)
      const survivalAction = getSurvivalConsumableAction(
        game,
        config,
        dangerResult.dangers,
        botState,
        personality,
        classProfile.healsPriority,
        effective.town >= 1
      )
      if (survivalAction) {
        recordProgress(botState, game.turn)
        return survivalAction
      }
    }
  }

  // 4. Druid shapeshifting: Proactive form management
  if (isShapeshifterClass(game.character.classId)) {
    const druidAction = getDruidTierAction(game, context, botState, dangerResult, 'SAFE', null)
    if (druidAction) {
      recordProgress(botState, game.turn)
      return druidAction
    }
  }

  // 5. Pre-combat buffs only for bosses/uniques
  if (visibleMonsters.length > 0) {
    const hasBossTarget = visibleMonsters.some(isBossOrUnique)

    if (hasBossTarget) {
      const preCombatBuff = getPreCombatBuffAction(game, config, visibleMonsters, tacticsLevel)
      if (preCombatBuff) {
        recordProgress(botState, game.turn)
        return preCombatBuff
      }

      const buffSpell = getBuffSpellAction(game, config, visibleMonsters, tacticsLevel)
      if (buffSpell) {
        recordProgress(botState, game.turn)
        return buffSpell
      }
    }

    // Haste activation (mana-free speed buff)
    const hasteActivation = getHasteActivationAction(game, context, visibleMonsters)
    if (hasteActivation) {
      recordProgress(botState, game.turn)
      return hasteActivation
    }

    // Casters: debuff for control, then pot if low, then damage
    const isCaster = ['mage', 'archmage', 'necromancer'].includes(game.character.classId)
    if (isCaster) {
      // Debuff (slow) first for kite control - function checks duration to avoid over-applying
      const debuffSpell = getDebuffSpellAction(game, config, visibleMonsters, tacticsLevel)
      if (debuffSpell) {
        recordProgress(botState, game.turn)
        return debuffSpell
      }

      // MP pot if low AND in combat (KITE/FLEE goal) - save pots for emergencies
      const manaRatio = game.character.maxMp > 0 ? game.character.mp / game.character.maxMp : 1
      const goalType = botState.currentGoal?.type
      const inCombatGoal = goalType === 'KITE' || goalType === 'FLEE'
      if (manaRatio < 0.3 && inCombatGoal) {
        const mpPot = findManaPotion(game.character)
        if (mpPot) {
          recordProgress(botState, game.turn)
          return { type: 'use', itemId: mpPot.id }
        }
      }

      // Damage spell
      const damageSpell = getDamageSpellAction(game, config, visibleMonsters)
      if (damageSpell) {
        recordProgress(botState, game.turn)
        return damageSpell
      }
    }

    // Non-caster: engage distant enemies with spells
    const damageSpell = getDamageSpellAction(game, config, visibleMonsters)
    if (damageSpell) {
      recordProgress(botState, game.turn)
      return damageSpell
    }

    // AOE activation fallback (mana-free damage)
    const aoeActivation = getAOEActivationAction(game, context, visibleMonsters)
    if (aoeActivation) {
      recordProgress(botState, game.turn)
      return aoeActivation
    }

    // Ranged weapon attacks for ranged classes (rangers, etc.)
    if (classProfile.prefersRanged && hasRangedWeapon(game)) {
      const rangedTarget = findBestRangedTarget(game, visibleMonsters)
      if (rangedTarget && canRangedAttack(game.character, rangedTarget.position)) {
        recordProgress(botState, game.turn)
        return { type: 'ranged_attack', targetId: rangedTarget.id }
      }
    }
  }

  // 5. Utility consumables (enchants, mapping)
  if (localDanger < dangerThreshold) {
    const utilityAction = getUtilityConsumableAction(
      game,
      config,
      dangerResult.dangers,
      personality
    )
    if (utilityAction) {
      recordProgress(botState, game.turn)
      return utilityAction
    }
  }

  return null
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Set a KILL goal for an adjacent monster.
 * Ensures combat actions are tracked in the goal system.
 */
function setKillGoal(
  botState: BotState,
  monster: { id: string; position: { x: number; y: number }; template: { name: string } },
  turn: number,
  reason: string
): void {
  setGoal(botState, {
    type: 'KILL',
    target: monster.position,
    targetId: monster.id,
    reason: reason,
    startTurn: turn,
  })
}

/**
 * Set a KITE goal when tier-actions trigger kiting movement.
 * Prevents the goal system from overriding the kite with DESCEND/EXPLORE next tick.
 * Returns false if kite duration exceeded (caller should NOT kite).
 */
const MAX_KITE_DURATION = 100

function setKiteGoal(
  context: BotContext,
  monster: { id: string; position: { x: number; y: number }; template: { name: string } },
  kiteDir: Direction
): boolean {
  const { game, botState } = context

  // Track how long we've been kiting the same target.
  // If exceeded, refuse the kite so goal movement can trigger the ascend escape valve.
  if (botState.kiteTargetId !== monster.id) {
    botState.kiteTargetId = monster.id
    botState.kiteTargetStartTurn = game.turn
  }
  if (game.turn - botState.kiteTargetStartTurn > MAX_KITE_DURATION) {
    return false
  }

  const pos = game.character.position
  const dx =
    kiteDir === 'e' || kiteDir === 'ne' || kiteDir === 'se'
      ? 1
      : kiteDir === 'w' || kiteDir === 'nw' || kiteDir === 'sw'
        ? -1
        : 0
  const dy =
    kiteDir === 's' || kiteDir === 'se' || kiteDir === 'sw'
      ? 1
      : kiteDir === 'n' || kiteDir === 'ne' || kiteDir === 'nw'
        ? -1
        : 0
  setGoal(botState, {
    type: 'KITE',
    target: { x: pos.x + dx, y: pos.y + dy },
    targetId: monster.id,
    reason: `Kiting away from ${monster.template.name}`,
    startTurn: game.turn,
  })
  return true
}
