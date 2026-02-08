/**
 * Game data exports
 *
 * Re-exports all game data (races, classes, items, monsters, etc.)
 */

// Stat modifiers type (canonical export from races)
export type { StatModifiers } from './races'

// Races
export {
  races,
  startingRaces,
  unlockableRaces,
  prestigeRaces,
  getRaceById,
  type Race,
  type RaceAbility,
} from './races'

// Classes
export {
  classes,
  startingClasses,
  unlockableClasses,
  prestigeClasses,
  getClassById,
  calculateHitdie,
  type GameClass,
} from './classes'

// Monsters
export {
  monsters,
  COLORS,
  MONSTER_COUNTS,
  VICTORY_BOSS_NAME,
  getMonstersForDepth,
  getSpawnableMonsters,
  getMonsterByName,
  getUniques,
  type MonsterTemplate,
} from './monsters'

// Items
export {
  WEAPONS,
  BOWS,
  ARMOR,
  SHIELDS,
  HELMS,
  GLOVES,
  BOOTS,
  RINGS,
  AMULETS,
  LIGHTS,
  POTIONS,
  SCROLLS,
  ALL_EQUIPMENT,
  ALL_CONSUMABLES,
  ALL_ITEMS,
  getItemsByTier,
  getItemsByType,
  getItemsForDepth,
  type ItemTemplate,
} from './items'

// Artifacts
export {
  ARTIFACTS,
  getArtifactsForDepth,
  getArtifactsBySlot,
  getArtifactByName,
  getEarlyGameArtifacts,
  getMidGameArtifacts,
  getLateGameArtifacts,
  type ArtifactTemplate,
} from './artifacts'

// Gold
export {
  GOLD_PILES,
  selectGoldPile,
  rollGoldValue,
  getDefaultGoldDrop,
  rollMonsterGold,
  type GoldPileTemplate,
  type MonsterGoldDrop,
} from './gold'

// Features (Fountains & Altars)
export {
  FOUNTAINS,
  ALTARS,
  getFountainById,
  getAltarById,
  getFountainsForDepth,
  getAltarsForDepth,
  selectFountain,
  selectAltar,
  type FountainTemplate,
  type AltarTemplate,
} from './features'

// Merchants
export {
  MERCHANTS,
  getMerchantsForDepth,
  selectMerchant,
  getMerchantById,
  getDialogue,
  type MerchantTemplate,
  type MerchantDialogue,
  type ShopType,
} from './merchants'

// Traps
export {
  TRAPS,
  getTrapsForDepth,
  selectTrap,
  getTrapById,
  type TrapTemplate,
  type TrapEffect,
} from './traps'

// Upgrades
export {
  upgrades,
  getUpgradeById,
  calculateUpgradeCost,
  calculateUpgradeEffect,
  type UpgradeDefinition,
} from './upgrades'

// Boosters
export {
  boosters,
  boostersByCategory,
  getBoosterById,
  canUnlockBooster,
  getBoostersDependingOn,
  type BoosterDefinition,
  type BoosterCategory,
  type BoosterEffect,
} from './boosters'

// Spells
export {
  SPELLS,
  ALL_SPELLS,
  getSpellById,
  getSpellsBySchool,
  getSpellsByMaxLevel,
  getSchoolStat,
  type SpellTemplate,
  type SpellBuff,
  type SpellDebuff,
} from './spells'

// Class Spell Lists
export {
  CLASS_SPELL_LISTS,
  NON_CASTER_CLASSES,
  getClassSpellList,
  classCanCast,
  getSpellsForLevel,
  getSpellIdsForLevel,
  getNewSpellsAtLevel,
  getClassPrimarySchool,
  type ClassSpellEntry,
  type ClassSpellList,
} from './class-spells'

// Achievements
export {
  achievements,
  getAchievementById,
  getAchievementsByCategory,
  getTotalAchievementRewards,
  type Achievement,
} from './achievements'
