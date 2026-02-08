/**
 * Monster Data for Angband-Lite
 *
 * Extracted from Angband 4.2.6 source (monster.txt)
 *
 * === SCALING ANALYSIS ===
 * Based on analysis of Angband monster.txt, here's how stats scale with depth:
 *
 * HP Scaling (approximate ranges):
 * - Depth 1-5:    2-60 HP (avg ~15)
 * - Depth 6-10:   10-180 HP (avg ~50)
 * - Depth 11-20:  30-500 HP (avg ~150)
 * - Depth 21-30:  100-1400 HP (avg ~400)
 * - Depth 31-40:  200-1400 HP (avg ~600)
 * - Depth 41-50:  300-2500 HP (avg ~1000)
 * - Depth 50+:    500-20000 HP (uniques/bosses)
 *
 * Speed (110 is normal, player base):
 * - Early (1-10):  100-120 (mostly 110)
 * - Mid (11-30):   100-130 (faster enemies appear)
 * - Deep (31-50):  110-140 (many fast enemies)
 *
 * Armor Class:
 * - Depth 1-10:   1-50 AC
 * - Depth 11-25:  20-100 AC
 * - Depth 26-40:  40-150 AC
 * - Depth 41-50:  60-200 AC
 *
 * Damage (per attack, monsters have 1-4 attacks):
 * - Depth 1-5:    1d1 to 1d8 (~2-5 avg per hit)
 * - Depth 6-15:   1d5 to 3d6 (~5-10 avg per hit)
 * - Depth 16-30:  2d5 to 4d8 (~10-20 avg per hit)
 * - Depth 31-45:  3d6 to 8d8 (~15-35 avg per hit)
 * - Depth 46-50:  4d6 to 10d12 (~20-60 avg per hit)
 * - Bosses:       6d12 to 20d10 (~40-110 avg per hit)
 *
 * Experience (base, multiplied by depth / player level):
 * - Depth 1-10:   1-50 exp
 * - Depth 11-25:  25-500 exp
 * - Depth 26-40:  200-3000 exp
 * - Depth 41-50:  500-10000 exp
 * - Uniques:      Often 2-5x normal for depth
 */

import type { MonsterAttack, MonsterSpells, Element } from '../types'

export interface MonsterTemplate {
  name: string
  char: string
  color: string
  minDepth: number
  hp: number
  speed: number
  armor: number
  experience: number
  flags: string[]
  /** Spawn weight (default 1.0). Lower = rarer. Uniques use 0.1-0.15 */
  rarity?: number

  // Structured attack system
  /** Monster's melee attacks (1-4 attacks per round) */
  attacks: MonsterAttack[]
  /** Monster's spellcasting capability */
  spells?: MonsterSpells
  /** Elements the monster resists (50% damage) */
  resist?: Element[]
  /** Elements the monster is immune to (0 damage) */
  immune?: Element[]
}

// Color mapping from Angband color codes to readable names
export const COLORS: Record<string, string> = {
  d: 'black',
  w: 'white',
  s: 'slate',
  o: 'orange',
  r: 'red',
  g: 'green',
  b: 'blue',
  u: 'umber',
  D: 'lightDark',
  W: 'lightSlate',
  P: 'lightPurple',
  y: 'yellow',
  R: 'lightRed',
  G: 'lightGreen',
  B: 'lightBlue',
  U: 'lightUmber',
  p: 'purple',
  v: 'violet',
}

export const monsters: MonsterTemplate[] = [
  // ============================================
  // DEPTH 1-10: SHALLOW - Rats, kobolds, orcs
  // ============================================

  // Depth 1
  {
    name: 'Large White Snake',
    char: 'J',
    color: 'white',
    minDepth: 1,
    hp: 11,
    speed: 100,
    armor: 36,
    experience: 3,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '1d2', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '1d2', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Small Kobold',
    char: 'k',
    color: 'yellow',
    minDepth: 1,
    hp: 8,
    speed: 110,
    armor: 24,
    experience: 8,
    flags: [],
    attacks: [{ method: 'HIT', dice: '1d5', effect: { type: 'HURT' } }],
  },
  {
    name: 'Floating Eye',
    char: 'e',
    color: 'orange',
    minDepth: 1,
    hp: 11,
    speed: 110,
    armor: 7,
    experience: 22,
    flags: [],
    attacks: [{ method: 'GAZE', dice: '0d0', effect: { type: 'PARALYZE' } }],
  },
  {
    name: 'Wild Dog',
    char: 'C',
    color: 'lightUmber',
    minDepth: 1,
    hp: 3,
    speed: 110,
    armor: 3,
    experience: 2,
    flags: ['ANIMAL'],
    attacks: [{ method: 'BITE', dice: '1d2', effect: { type: 'HURT' } }],
  },

  // Depth 2
  {
    name: 'Kobold',
    char: 'k',
    color: 'lightGreen',
    minDepth: 2,
    hp: 12,
    speed: 110,
    armor: 24,
    experience: 7,
    flags: [],
    attacks: [{ method: 'HIT', dice: '1d8', effect: { type: 'HURT' } }],
  },
  {
    name: 'Cave Spider',
    char: 'S',
    color: 'purple',
    minDepth: 2,
    hp: 7,
    speed: 120,
    armor: 19,
    experience: 9,
    flags: ['ANIMAL'],
    attacks: [{ method: 'BITE', dice: '1d4', effect: { type: 'HURT' } }],
  },
  {
    name: 'White Jelly',
    char: 'j',
    color: 'white',
    minDepth: 2,
    hp: 36,
    speed: 120,
    armor: 1,
    experience: 12,
    flags: [],
    attacks: [{ method: 'TOUCH', dice: '1d4', effect: { type: 'ELEMENTAL', element: 'POISON' } }],
    immune: ['POISON'],
  },

  // Depth 3
  {
    name: 'Giant Rat',
    char: 'r',
    color: 'umber',
    minDepth: 3,
    hp: 8,
    speed: 120,
    armor: 15,
    experience: 5,
    flags: ['ANIMAL'],
    attacks: [{ method: 'BITE', dice: '1d3', effect: { type: 'HURT' } }],
  },
  {
    name: 'Centipede',
    char: 'c',
    color: 'lightRed',
    minDepth: 3,
    hp: 6,
    speed: 130,
    armor: 20,
    experience: 7,
    flags: ['ANIMAL'],
    attacks: [{ method: 'STING', dice: '1d4', effect: { type: 'ELEMENTAL', element: 'POISON' } }],
    immune: ['POISON'],
  },

  // Depth 4
  {
    name: 'Giant Bat',
    char: 'b',
    color: 'slate',
    minDepth: 4,
    hp: 10,
    speed: 130,
    armor: 18,
    experience: 8,
    flags: ['ANIMAL'],
    attacks: [{ method: 'BITE', dice: '1d4', effect: { type: 'HURT' } }],
  },
  {
    name: 'Orc',
    char: 'o',
    color: 'green',
    minDepth: 4,
    hp: 20,
    speed: 110,
    armor: 30,
    experience: 12,
    flags: ['ORC', 'EVIL'],
    attacks: [{ method: 'HIT', dice: '1d6', effect: { type: 'HURT' } }],
  },

  // Depth 5
  {
    name: 'Bullroarer the Hobbit',
    char: 'h',
    color: 'lightUmber',
    minDepth: 5,
    hp: 60,
    speed: 120,
    armor: 12,
    experience: 90,
    flags: ['UNIQUE'],
    attacks: [
      { method: 'HIT', dice: '1d8', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '1d8', effect: { type: 'HURT' } },
    ],
    rarity: 0.25,
  },
  {
    name: 'Large Kobold',
    char: 'k',
    color: 'blue',
    minDepth: 5,
    hp: 65,
    speed: 110,
    armor: 48,
    experience: 25,
    flags: [],
    attacks: [{ method: 'HIT', dice: '1d10', effect: { type: 'HURT' } }],
  },
  {
    name: 'Green Jelly',
    char: 'j',
    color: 'green',
    minDepth: 5,
    hp: 99,
    speed: 120,
    armor: 1,
    experience: 18,
    flags: [],
    attacks: [{ method: 'TOUCH', dice: '1d4', effect: { type: 'ELEMENTAL', element: 'ACID' } }],
    immune: ['ACID'],
  },

  // Depth 6
  {
    name: 'Snaga',
    char: 'o',
    color: 'lightUmber',
    minDepth: 6,
    hp: 36,
    speed: 110,
    armor: 48,
    experience: 15,
    flags: ['ORC', 'EVIL'],
    attacks: [{ method: 'HIT', dice: '1d8', effect: { type: 'HURT' } }],
  },
  {
    name: 'Manes',
    char: 'u',
    color: 'red',
    minDepth: 6,
    hp: 25,
    speed: 100,
    armor: 30,
    experience: 12,
    flags: ['DEMON', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '1d4', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '1d4', effect: { type: 'HURT' } },
    ],
    resist: ['FIRE'],
  },

  // Depth 7
  {
    name: 'Orc Scout',
    char: 'o',
    color: 'lightGreen',
    minDepth: 7,
    hp: 35,
    speed: 120,
    armor: 40,
    experience: 18,
    flags: ['ORC', 'EVIL'],
    attacks: [{ method: 'HIT', dice: '2d4', effect: { type: 'HURT' } }],
  },
  {
    name: 'Skeleton',
    char: 's',
    color: 'white',
    minDepth: 7,
    hp: 28,
    speed: 110,
    armor: 35,
    experience: 15,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [{ method: 'HIT', dice: '1d8', effect: { type: 'HURT' } }],
    resist: ['COLD'],
    immune: ['POISON'],
  },
  {
    name: 'Blue Jelly',
    char: 'j',
    color: 'blue',
    minDepth: 7,
    hp: 50,
    speed: 120,
    armor: 1,
    experience: 14,
    flags: [],
    attacks: [{ method: 'TOUCH', dice: '1d6', effect: { type: 'ELEMENTAL', element: 'COLD' } }],
    immune: ['COLD'],
  },

  // Depth 8
  {
    name: 'Wormtongue, Agent of Saruman',
    char: 'p',
    color: 'lightBlue',
    minDepth: 8,
    hp: 250,
    speed: 110,
    armor: 45,
    experience: 150,
    flags: ['UNIQUE', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '1d5', effect: { type: 'HURT' } },
      { method: 'TOUCH', dice: '1d5', effect: { type: 'ELEMENTAL', element: 'POISON' } },
    ],
    spells: { freq: 4, list: ['HEAL'] },
    rarity: 0.25,
  },

  // Depth 9
  {
    name: 'Cave Orc',
    char: 'o',
    color: 'lightUmber',
    minDepth: 9,
    hp: 54,
    speed: 110,
    armor: 48,
    experience: 20,
    flags: ['ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '1d10', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '1d10', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Cave Bear',
    char: 'q',
    color: 'umber',
    minDepth: 9,
    hp: 36,
    speed: 110,
    armor: 52,
    experience: 25,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'CLAW', dice: '1d6', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '1d6', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '1d8', effect: { type: 'HURT' } },
    ],
  },

  // Depth 10
  {
    name: 'Giant Spider',
    char: 'S',
    color: 'violet',
    minDepth: 10,
    hp: 55,
    speed: 110,
    armor: 24,
    experience: 35,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '2d4', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '2d4', effect: { type: 'ELEMENTAL', element: 'POISON' } },
    ],
    immune: ['POISON'],
  },
  {
    name: 'Wolf',
    char: 'C',
    color: 'umber',
    minDepth: 10,
    hp: 21,
    speed: 120,
    armor: 45,
    experience: 30,
    flags: ['ANIMAL'],
    attacks: [{ method: 'BITE', dice: '1d6', effect: { type: 'HURT' } }],
  },
  {
    name: 'Grishnakh, the Hill Orc',
    char: 'o',
    color: 'yellow',
    minDepth: 10,
    hp: 230,
    speed: 110,
    armor: 30,
    experience: 160,
    flags: ['UNIQUE', 'ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d5', effect: { type: 'HURT' } },
    ],
    rarity: 0.25,
  },

  // ============================================
  // DEPTH 11-25: MID - Trolls, ogres, undead
  // ============================================

  // Depth 11
  {
    name: 'Warg',
    char: 'C',
    color: 'slate',
    minDepth: 11,
    hp: 55,
    speed: 120,
    armor: 40,
    experience: 45,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '2d4', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '2d4', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Baby Multi-Hued Dragon',
    char: 'd',
    color: 'violet',
    minDepth: 11,
    hp: 114,
    speed: 110,
    armor: 36,
    experience: 45,
    flags: ['DRAGON'],
    attacks: [
      { method: 'CLAW', dice: '1d4', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '1d4', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '1d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 4, list: ['BR_FIRE', 'BR_COLD', 'BR_ELEC', 'BR_ACID', 'BR_POISON'] },
    resist: ['FIRE', 'COLD', 'ELEC', 'ACID', 'POISON'],
  },

  // Depth 12
  {
    name: 'Orc Warrior',
    char: 'o',
    color: 'lightRed',
    minDepth: 12,
    hp: 70,
    speed: 110,
    armor: 55,
    experience: 35,
    flags: ['ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Zombie',
    char: 'z',
    color: 'slate',
    minDepth: 12,
    hp: 80,
    speed: 100,
    armor: 40,
    experience: 30,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d4', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d4', effect: { type: 'HURT' } },
    ],
    resist: ['COLD'],
    immune: ['POISON'],
  },

  // Depth 13
  {
    name: 'Ghost',
    char: 'G',
    color: 'white',
    minDepth: 13,
    hp: 55,
    speed: 110,
    armor: 30,
    experience: 40,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'TOUCH', dice: '2d4', effect: { type: 'DRAIN' } },
      { method: 'TOUCH', dice: '2d4', effect: { type: 'DRAIN' } },
    ],
    resist: ['COLD'],
    immune: ['POISON'],
  },
  {
    name: 'Orc Shaman',
    char: 'o',
    color: 'violet',
    minDepth: 13,
    hp: 50,
    speed: 110,
    armor: 35,
    experience: 45,
    flags: ['ORC', 'EVIL'],
    attacks: [{ method: 'HIT', dice: '2d4', effect: { type: 'HURT' } }],
    spells: { freq: 4, list: ['HEAL'] },
  },

  // Depth 14
  {
    name: 'Wight',
    char: 'W',
    color: 'lightDark',
    minDepth: 14,
    hp: 85,
    speed: 110,
    armor: 50,
    experience: 60,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'TOUCH', dice: '1d6', effect: { type: 'DRAIN' } },
    ],
    resist: ['COLD'],
    immune: ['POISON'],
  },
  {
    name: 'Black Orc',
    char: 'o',
    color: 'black',
    minDepth: 14,
    hp: 90,
    speed: 110,
    armor: 60,
    experience: 55,
    flags: ['ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '3d4', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d4', effect: { type: 'HURT' } },
    ],
  },

  // Depth 15
  {
    name: 'Uruk',
    char: 'o',
    color: 'slate',
    minDepth: 15,
    hp: 76,
    speed: 110,
    armor: 60,
    experience: 40,
    flags: ['ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Ogre',
    char: 'O',
    color: 'lightUmber',
    minDepth: 15,
    hp: 90,
    speed: 110,
    armor: 45,
    experience: 50,
    flags: [],
    attacks: [{ method: 'HIT', dice: '2d8', effect: { type: 'HURT' } }],
  },

  // Depth 16
  {
    name: 'Stone Troll',
    char: 'T',
    color: 'slate',
    minDepth: 16,
    hp: 130,
    speed: 100,
    armor: 80,
    experience: 80,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '3d4', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d4', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Uruk Captain',
    char: 'o',
    color: 'lightPurple',
    minDepth: 16,
    hp: 100,
    speed: 110,
    armor: 70,
    experience: 70,
    flags: ['ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
    ],
  },

  // Depth 17
  {
    name: 'Wraith',
    char: 'W',
    color: 'slate',
    minDepth: 17,
    hp: 95,
    speed: 110,
    armor: 55,
    experience: 90,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'TOUCH', dice: '2d4', effect: { type: 'ELEMENTAL', element: 'COLD' } },
      { method: 'TOUCH', dice: '1d6', effect: { type: 'DRAIN' } },
    ],
    immune: ['COLD'],
  },
  {
    name: 'War Warg',
    char: 'C',
    color: 'lightRed',
    minDepth: 17,
    hp: 110,
    speed: 130,
    armor: 50,
    experience: 75,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'HURT' } },
    ],
  },

  // Depth 18
  {
    name: 'Hill Troll',
    char: 'T',
    color: 'umber',
    minDepth: 18,
    hp: 185,
    speed: 110,
    armor: 60,
    experience: 150,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d8', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d8', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Skeleton Troll',
    char: 's',
    color: 'white',
    minDepth: 18,
    hp: 144,
    speed: 110,
    armor: 60,
    experience: 120,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '2d6', effect: { type: 'HURT' } },
    ],
  },

  // Depth 19
  {
    name: 'Ghast',
    char: 'z',
    color: 'umber',
    minDepth: 19,
    hp: 140,
    speed: 110,
    armor: 48,
    experience: 130,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '2d4', effect: { type: 'PARALYZE' } },
      { method: 'CLAW', dice: '2d4', effect: { type: 'PARALYZE' } },
      { method: 'BITE', dice: '2d4', effect: { type: 'HURT' } },
    ],
    spells: { freq: 6, list: ['HOLD', 'SCARE'] },
  },
  {
    name: 'Killer Slicer Beetle',
    char: 'K',
    color: 'yellow',
    minDepth: 19,
    hp: 120,
    speed: 110,
    armor: 80,
    experience: 150,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '3d5', effect: { type: 'HURT' } },
    ],
  },

  // Depth 20
  {
    name: 'Bolg, Son of Azog',
    char: 'o',
    color: 'lightPurple',
    minDepth: 20,
    hp: 500,
    speed: 120,
    armor: 60,
    experience: 800,
    flags: ['UNIQUE', 'ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
    ],
    rarity: 0.2,
  },
  {
    name: '3-Headed Hydra',
    char: 'M',
    color: 'orange',
    minDepth: 20,
    hp: 300,
    speed: 120,
    armor: 97,
    experience: 350,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
    ],
    immune: ['POISON'],
  },
  {
    name: 'Werewolf',
    char: 'C',
    color: 'lightDark',
    minDepth: 20,
    hp: 230,
    speed: 110,
    armor: 36,
    experience: 150,
    flags: ['EVIL'],
    attacks: [
      { method: 'CLAW', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '2d8', effect: { type: 'HURT' } },
    ],
  },

  // Depth 21
  {
    name: 'Grave Wight',
    char: 'W',
    color: 'blue',
    minDepth: 21,
    hp: 130,
    speed: 110,
    armor: 50,
    experience: 200,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d5', effect: { type: 'HURT' } },
      { method: 'TOUCH', dice: '1d6', effect: { type: 'DRAIN' } },
    ],
    spells: { freq: 6, list: ['SCARE', 'BLIND'] },
  },
  {
    name: 'Manticore',
    char: 'H',
    color: 'yellow',
    minDepth: 21,
    hp: 200,
    speed: 120,
    armor: 40,
    experience: 220,
    flags: ['ANIMAL', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'STING', dice: '2d4', effect: { type: 'ELEMENTAL', element: 'POISON' } },
    ],
  },

  // Depth 22
  {
    name: 'Fire Elemental',
    char: 'E',
    color: 'red',
    minDepth: 22,
    hp: 170,
    speed: 120,
    armor: 50,
    experience: 260,
    flags: [],
    attacks: [
      { method: 'HIT', dice: '3d5', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
    ],
    spells: { freq: 5, list: ['BO_FIRE'] },
    immune: ['FIRE'],
  },
  {
    name: 'Ogre Mage',
    char: 'O',
    color: 'blue',
    minDepth: 22,
    hp: 220,
    speed: 110,
    armor: 55,
    experience: 280,
    flags: ['GIANT', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 4, list: ['CONFUSE', 'SLOW'] },
  },

  // Depth 23
  {
    name: 'Earth Elemental',
    char: 'E',
    color: 'umber',
    minDepth: 23,
    hp: 250,
    speed: 100,
    armor: 80,
    experience: 300,
    flags: [],
    attacks: [
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
    ],
    immune: ['FIRE', 'COLD', 'ELEC'],
  },
  {
    name: 'Cave Troll',
    char: 'T',
    color: 'umber',
    minDepth: 23,
    hp: 230,
    speed: 110,
    armor: 55,
    experience: 320,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'HURT' } },
    ],
  },

  {
    name: 'Azog, Enemy of the Dwarves',
    char: 'o',
    color: 'lightRed',
    minDepth: 23,
    hp: 900,
    speed: 120,
    armor: 96,
    experience: 1111,
    flags: ['UNIQUE', 'ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '5d4', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '5d4', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '5d4', effect: { type: 'HURT' } },
    ],
    rarity: 0.2,
  },

  // Depth 24
  {
    name: '5-Headed Hydra',
    char: 'M',
    color: 'lightGreen',
    minDepth: 24,
    hp: 450,
    speed: 120,
    armor: 100,
    experience: 400,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
    ],
    immune: ['POISON'],
  },

  // Depth 25
  {
    name: 'Dread',
    char: 'G',
    color: 'orange',
    minDepth: 25,
    hp: 300,
    speed: 120,
    armor: 50,
    experience: 450,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'TOUCH', dice: '2d6', effect: { type: 'DRAIN' } },
      { method: 'CLAW', dice: '2d4', effect: { type: 'HURT' } },
    ],
    immune: ['COLD'],
  },

  {
    name: 'Water Elemental',
    char: 'E',
    color: 'blue',
    minDepth: 25,
    hp: 200,
    speed: 110,
    armor: 45,
    experience: 380,
    flags: [],
    attacks: [
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
    ],
    spells: { freq: 5, list: ['BO_COLD', 'SLOW'] },
    immune: ['ACID', 'COLD'],
  },

  // Depth 26
  {
    name: 'Dark Elven Mage',
    char: 'h',
    color: 'purple',
    minDepth: 26,
    hp: 280,
    speed: 120,
    armor: 70,
    experience: 400,
    flags: ['EVIL'],
    attacks: [{ method: 'HIT', dice: '2d5', effect: { type: 'HURT' } }],
    spells: { freq: 3, list: ['BO_COLD', 'BLINK'] },
  },
  {
    name: 'Lugdush, Uruk Captain',
    char: 'o',
    color: 'lightRed',
    minDepth: 26,
    hp: 700,
    speed: 120,
    armor: 80,
    experience: 900,
    flags: ['UNIQUE', 'ORC', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
    ],
    rarity: 0.2,
  },

  // Depth 27
  {
    name: 'Stone Giant',
    char: 'P',
    color: 'slate',
    minDepth: 27,
    hp: 500,
    speed: 110,
    armor: 100,
    experience: 500,
    flags: ['GIANT'],
    attacks: [
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
    ],
  },

  {
    name: 'Master Vampire',
    char: 'V',
    color: 'green',
    minDepth: 27,
    hp: 300,
    speed: 120,
    armor: 60,
    experience: 550,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '3d4', effect: { type: 'DRAIN' } },
    ],
    spells: { freq: 4, list: ['HOLD', 'SCARE', 'CONFUSE', 'BR_DARK'] },
    immune: ['DARK'],
  },

  // ============================================
  // DEPTH 28-40: DEEP - Giants, dragons, demons
  // ============================================

  // Depth 28
  {
    name: 'Mind Flayer',
    char: 'h',
    color: 'lightPurple',
    minDepth: 28,
    hp: 132,
    speed: 110,
    armor: 72,
    experience: 200,
    flags: ['EVIL'],
    attacks: [
      { method: 'GAZE', dice: '2d4', effect: { type: 'HURT' } },
      { method: 'GAZE', dice: '2d4', effect: { type: 'HURT' } },
    ],
    spells: { freq: 2, list: ['BRAIN_SMASH', 'HOLD', 'CONFUSE'] },
  },
  {
    name: 'Snow Troll',
    char: 'T',
    color: 'white',
    minDepth: 28,
    hp: 132,
    speed: 110,
    armor: 67,
    experience: 200,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '2d4', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '2d4', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'COLD' } },
    ],
    immune: ['COLD'],
  },

  // Depth 29
  {
    name: 'Young Blue Dragon',
    char: 'd',
    color: 'blue',
    minDepth: 29,
    hp: 237,
    speed: 110,
    armor: 60,
    experience: 500,
    flags: ['DRAGON'],
    attacks: [
      { method: 'CLAW', dice: '1d6', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '1d6', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'ELEC' } },
    ],
    spells: { freq: 4, list: ['BR_ELEC'] },
    immune: ['ELEC'],
  },

  {
    name: 'Death Knight',
    char: 'p',
    color: 'lightDark',
    minDepth: 29,
    hp: 450,
    speed: 120,
    armor: 90,
    experience: 650,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '4d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
    ],
    spells: { freq: 5, list: ['BLIND', 'SCARE', 'BR_DARK'] },
    immune: ['COLD', 'DARK'],
  },

  // Depth 30
  {
    name: 'Olog-hai',
    char: 'T',
    color: 'black',
    minDepth: 30,
    hp: 400,
    speed: 115,
    armor: 70,
    experience: 550,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '3d6', effect: { type: 'HURT' } },
    ],
  },

  {
    name: 'Mountain Troll',
    char: 'T',
    color: 'red',
    minDepth: 30,
    hp: 550,
    speed: 110,
    armor: 85,
    experience: 700,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '4d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d5', effect: { type: 'HURT' } },
    ],
  },

  // Depth 31
  {
    name: 'Vampire Lord',
    char: 'V',
    color: 'blue',
    minDepth: 31,
    hp: 550,
    speed: 120,
    armor: 85,
    experience: 600,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'BITE', dice: '3d4', effect: { type: 'DRAIN' } },
      { method: 'TOUCH', dice: '2d6', effect: { type: 'DRAIN' } },
    ],
    spells: { freq: 4, list: ['HOLD', 'SCARE', 'HEAL'] },
    immune: ['COLD'],
  },

  // Depth 32
  {
    name: 'Storm Troll',
    char: 'T',
    color: 'lightBlue',
    minDepth: 32,
    hp: 420,
    speed: 120,
    armor: 75,
    experience: 650,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '3d4', effect: { type: 'ELEMENTAL', element: 'ELEC' } },
      { method: 'CLAW', dice: '3d4', effect: { type: 'ELEMENTAL', element: 'ELEC' } },
      { method: 'BITE', dice: '3d5', effect: { type: 'HURT' } },
    ],
    immune: ['ELEC'],
  },

  // Depth 33
  {
    name: 'Ice Troll',
    char: 'T',
    color: 'white',
    minDepth: 33,
    hp: 360,
    speed: 120,
    armor: 60,
    experience: 600,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '3d4', effect: { type: 'ELEMENTAL', element: 'COLD' } },
      { method: 'CLAW', dice: '3d4', effect: { type: 'ELEMENTAL', element: 'COLD' } },
      { method: 'BITE', dice: '3d6', effect: { type: 'ELEMENTAL', element: 'COLD' } },
    ],
    immune: ['COLD'],
  },

  // Depth 34
  {
    name: 'Fire Giant',
    char: 'P',
    color: 'red',
    minDepth: 34,
    hp: 520,
    speed: 110,
    armor: 90,
    experience: 700,
    flags: ['GIANT'],
    attacks: [
      { method: 'HIT', dice: '4d6', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
    ],
    immune: ['FIRE'],
  },
  {
    name: 'Eog Golem',
    char: 'g',
    color: 'umber',
    minDepth: 34,
    hp: 1050,
    speed: 100,
    armor: 187,
    experience: 1200,
    flags: [],
    attacks: [
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
    ],
  },

  // Depth 35
  {
    name: 'Lokkak, the Ogre Chieftain',
    char: 'O',
    color: 'violet',
    minDepth: 35,
    hp: 1500,
    speed: 120,
    armor: 120,
    experience: 1500,
    flags: ['UNIQUE', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '6d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '6d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '6d6', effect: { type: 'HURT' } },
    ],
    rarity: 0.2,
  },
  {
    name: 'Mumak',
    char: 'q',
    color: 'slate',
    minDepth: 35,
    hp: 495,
    speed: 110,
    armor: 82,
    experience: 2100,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'CRUSH', dice: '4d8', effect: { type: 'HURT' } },
      { method: 'CRUSH', dice: '4d8', effect: { type: 'HURT' } },
    ],
  },

  // Depth 36
  {
    name: 'Olog',
    char: 'T',
    color: 'yellow',
    minDepth: 36,
    hp: 440,
    speed: 115,
    armor: 60,
    experience: 450,
    flags: ['TROLL', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '3d4', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '3d4', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '3d6', effect: { type: 'HURT' } },
    ],
  },
  {
    name: 'Cloud Giant',
    char: 'P',
    color: 'blue',
    minDepth: 36,
    hp: 368,
    speed: 110,
    armor: 90,
    experience: 500,
    flags: ['GIANT'],
    attacks: [
      { method: 'HIT', dice: '8d6', effect: { type: 'ELEMENTAL', element: 'ELEC' } },
      { method: 'HIT', dice: '8d6', effect: { type: 'ELEMENTAL', element: 'ELEC' } },
    ],
    immune: ['ELEC'],
  },

  // Depth 39
  {
    name: 'Mature Green Dragon',
    char: 'd',
    color: 'green',
    minDepth: 39,
    hp: 700,
    speed: 110,
    armor: 90,
    experience: 1400,
    flags: ['DRAGON'],
    attacks: [
      { method: 'CLAW', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '2d6', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '4d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
    ],
    spells: { freq: 4, list: ['BR_POISON'] },
    immune: ['POISON'],
  },
  {
    name: '6-Headed Hydra',
    char: 'M',
    color: 'lightGreen',
    minDepth: 39,
    hp: 550,
    speed: 120,
    armor: 135,
    experience: 2000,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'ACID' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'HURT' } },
    ],
    resist: ['POISON', 'FIRE', 'ACID'],
  },

  // ============================================
  // DEPTH 41-50: ABYSS - Powerful creatures
  // ============================================

  // Depth 40
  {
    name: 'Beholder',
    char: 'e',
    color: 'lightUmber',
    minDepth: 40,
    hp: 1400,
    speed: 120,
    armor: 96,
    experience: 6000,
    flags: ['EVIL'],
    attacks: [
      { method: 'GAZE', dice: '2d6', effect: { type: 'DRAIN' } },
      { method: 'GAZE', dice: '2d6', effect: { type: 'BLIND' } },
      { method: 'GAZE', dice: '2d6', effect: { type: 'SLOW' } },
      { method: 'BITE', dice: '4d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 3, list: ['CONFUSE', 'SLOW', 'BLIND'] },
  },
  {
    name: '7-Headed Hydra',
    char: 'M',
    color: 'red',
    minDepth: 40,
    hp: 650,
    speed: 120,
    armor: 114,
    experience: 3000,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'ELEMENTAL', element: 'ACID' } },
      { method: 'BITE', dice: '2d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 4, list: ['BR_POISON', 'BR_FIRE', 'BR_ACID'] },
    resist: ['POISON', 'FIRE', 'ACID'],
  },
  {
    name: 'Vrock',
    char: 'U',
    color: 'slate',
    minDepth: 40,
    hp: 352,
    speed: 110,
    armor: 75,
    experience: 2000,
    flags: ['DEMON', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '4d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 4, list: ['BLIND', 'CONFUSE'] },
  },
  {
    name: 'Minotaur',
    char: 'H',
    color: 'slate',
    minDepth: 40,
    hp: 550,
    speed: 130,
    armor: 30,
    experience: 2100,
    flags: [],
    attacks: [
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '3d6', effect: { type: 'HURT' } },
    ],
  },

  // Depth 45
  {
    name: 'Nalfeshnee',
    char: 'U',
    color: 'red',
    minDepth: 45,
    hp: 792,
    speed: 110,
    armor: 60,
    experience: 5000,
    flags: ['DEMON', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '3d4', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '3d4', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '3d6', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
    ],
    spells: { freq: 3, list: ['BR_FIRE', 'SUMMON'] },
    immune: ['FIRE'],
  },
  {
    name: 'Undead Beholder',
    char: 'e',
    color: 'umber',
    minDepth: 45,
    hp: 2376,
    speed: 120,
    armor: 120,
    experience: 8000,
    flags: ['UNDEAD', 'EVIL'],
    attacks: [
      { method: 'GAZE', dice: '4d6', effect: { type: 'DRAIN' } },
      { method: 'GAZE', dice: '4d6', effect: { type: 'DRAIN' } },
      { method: 'BITE', dice: '6d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 3, list: ['BRAIN_SMASH', 'SUMMON'] },
  },
  {
    name: 'Berserker',
    char: 'p',
    color: 'umber',
    minDepth: 45,
    hp: 1320,
    speed: 120,
    armor: 96,
    experience: 2500,
    flags: [],
    attacks: [
      { method: 'HIT', dice: '6d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '6d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '6d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 5, list: ['HASTE'] },
  },
  {
    name: 'Cyclops',
    char: 'P',
    color: 'umber',
    minDepth: 45,
    hp: 1050,
    speed: 120,
    armor: 144,
    experience: 1500,
    flags: ['GIANT'],
    attacks: [
      { method: 'HIT', dice: '9d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '9d6', effect: { type: 'HURT' } },
    ],
  },

  // Depth 47
  {
    name: 'Marilith',
    char: 'U',
    color: 'yellow',
    minDepth: 47,
    hp: 1232,
    speed: 120,
    armor: 112,
    experience: 7000,
    flags: ['DEMON', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '4d6', effect: { type: 'HURT' } },
    ],
    spells: { freq: 4, list: ['SUMMON'] },
  },

  // Depth 48
  {
    name: 'Ancient Spider',
    char: 'S',
    color: 'red',
    minDepth: 48,
    hp: 1050,
    speed: 120,
    armor: 78,
    experience: 2500,
    flags: ['ANIMAL'],
    attacks: [
      { method: 'BITE', dice: '6d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'BITE', dice: '6d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
      { method: 'STING', dice: '4d6', effect: { type: 'ELEMENTAL', element: 'POISON' } },
    ],
    immune: ['POISON'],
  },

  // ============================================
  // UNIQUE/BOSS MONSTERS
  // ============================================

  // Depth 62 - Smaug
  {
    name: 'Smaug the Golden',
    char: 'D',
    color: 'lightRed',
    minDepth: 50, // Adjusted for our 50-level dungeon
    hp: 4200,
    speed: 120,
    armor: 195,
    experience: 30000,
    flags: ['UNIQUE', 'DRAGON', 'EVIL'],
    attacks: [
      { method: 'CLAW', dice: '6d8', effect: { type: 'HURT' } },
      { method: 'CLAW', dice: '6d8', effect: { type: 'HURT' } },
      { method: 'BITE', dice: '6d10', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'BITE', dice: '6d10', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
    ],
    spells: { freq: 3, list: ['BR_FIRE'] },
    immune: ['FIRE'],
    rarity: 0.05,
  },

  // Depth 95 - Gothmog
  {
    name: 'Gothmog, High Captain of Balrogs',
    char: 'U',
    color: 'violet',
    minDepth: 50, // Boss tier
    hp: 8000,
    speed: 130,
    armor: 168,
    experience: 43000,
    flags: ['UNIQUE', 'DEMON', 'EVIL'],
    attacks: [
      { method: 'HIT', dice: '8d8', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'HIT', dice: '8d8', effect: { type: 'ELEMENTAL', element: 'FIRE' } },
      { method: 'CRUSH', dice: '8d10', effect: { type: 'HURT' } },
      { method: 'CRUSH', dice: '8d10', effect: { type: 'HURT' } },
    ],
    spells: { freq: 3, list: ['BR_FIRE', 'SUMMON'] },
    immune: ['FIRE'],
    rarity: 0.05,
  },

  // Depth 99 - Sauron
  {
    name: 'Sauron, the Sorcerer',
    char: 'A',
    color: 'purple',
    minDepth: 50, // Pre-final boss
    hp: 8000,
    speed: 130,
    armor: 192,
    experience: 50000,
    flags: ['UNIQUE', 'EVIL'],
    attacks: [
      { method: 'TOUCH', dice: '8d8', effect: { type: 'DRAIN' } },
      { method: 'TOUCH', dice: '8d8', effect: { type: 'DRAIN' } },
      { method: 'HIT', dice: '6d10', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '6d10', effect: { type: 'HURT' } },
    ],
    spells: { freq: 2, list: ['BRAIN_SMASH', 'SUMMON', 'BLINK', 'HOLD', 'CONFUSE'] },
    rarity: 0.05,
  },

  // Depth 100 - Morgoth (Final Boss)
  {
    name: 'Morgoth, Lord of Darkness',
    char: 'P',
    color: 'lightDark',
    minDepth: 50, // Final boss
    hp: 20000,
    speed: 140,
    armor: 180,
    experience: 60000,
    flags: ['UNIQUE', 'EVIL'],
    attacks: [
      { method: 'CRUSH', dice: '20d8', effect: { type: 'HURT' } },
      { method: 'CRUSH', dice: '20d8', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '10d10', effect: { type: 'HURT' } },
      { method: 'HIT', dice: '10d10', effect: { type: 'HURT' } },
    ],
    spells: { freq: 2, list: ['BRAIN_SMASH', 'SUMMON', 'BR_DARK'] },
    immune: ['DARK'],
    rarity: 1, // Guaranteed spawn via boss logic, not random pool
  },
]

/** Victory boss name — used for win condition checks across the codebase */
export const VICTORY_BOSS_NAME = 'Morgoth, Lord of Darkness'

// Helper function to get monsters for a given depth range
export function getMonstersForDepth(minDepth: number, maxDepth: number): MonsterTemplate[] {
  return monsters.filter((m) => m.minDepth >= minDepth && m.minDepth <= maxDepth)
}

// Helper function to get monsters that can spawn at a specific depth
export function getSpawnableMonsters(depth: number): MonsterTemplate[] {
  // Monsters can spawn at their minDepth or deeper, within a 6-level window
  // This prevents early uniques from dominating mid-game (Bullroarer D:5 stops at D:11)
  return monsters.filter((m) => m.minDepth <= depth && m.minDepth >= depth - 6)
}

// Get a specific monster by name
export function getMonsterByName(name: string): MonsterTemplate | undefined {
  return monsters.find((m) => m.name === name)
}

// Get all unique/boss monsters
export function getUniques(): MonsterTemplate[] {
  return monsters.filter((m) => m.flags.includes('UNIQUE'))
}

// Get all dragon monster names (for prestige unlock tracking)
export function getDragonNames(): string[] {
  return monsters.filter((m) => m.flags.includes('DRAGON')).map((m) => m.name)
}

// Monster count summary
export const MONSTER_COUNTS = {
  total: monsters.length,
  depth1to10: monsters.filter((m) => m.minDepth >= 1 && m.minDepth <= 10).length,
  depth11to25: monsters.filter((m) => m.minDepth >= 11 && m.minDepth <= 25).length,
  depth26to40: monsters.filter((m) => m.minDepth >= 26 && m.minDepth <= 40).length,
  depth41to50: monsters.filter((m) => m.minDepth >= 41 && m.minDepth <= 50).length,
  uniques: monsters.filter((m) => m.flags.includes('UNIQUE')).length,
}

/**
 * Parse a dice notation string and return the components
 * Supports formats: "XdY", "XdY+Z", "XdY-Z"
 */
export function parseDice(dice: string): { count: number; sides: number; modifier: number } {
  const match = dice.match(/^(\d+)d(\d+)([+-]\d+)?$/)
  if (!match) return { count: 0, sides: 0, modifier: 0 }
  return {
    count: parseInt(match[1]!, 10),
    sides: parseInt(match[2]!, 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0,
  }
}

/**
 * Calculate average damage from a dice notation
 */
export function getDiceAverage(dice: string): number {
  const { count, sides, modifier } = parseDice(dice)
  return (count * (sides + 1)) / 2 + modifier
}

/**
 * Calculate the average total damage from a monster's attacks
 * This replaces the old `damage` field for combat calculations
 */
export function getAverageDamage(template: MonsterTemplate): number {
  if (!template.attacks || template.attacks.length === 0) return 0
  return template.attacks.reduce((total, attack) => {
    return total + getDiceAverage(attack.dice)
  }, 0)
}

/**
 * Check if a monster has a specific ability (for backwards compatibility and utility)
 * Checks both attacks (for effects like PARALYZE, DRAIN) and spells
 */
export function hasAbility(template: MonsterTemplate, ability: string): boolean {
  // Check attack effects
  const attackAbility =
    template.attacks?.some((attack) => {
      if (attack.effect.type === ability.toUpperCase()) return true
      if (attack.effect.type === 'ELEMENTAL' && attack.effect.element === ability.toUpperCase())
        return true
      return false
    }) ?? false

  if (attackAbility) return true

  // Check spells
  if (template.spells) {
    const spellAbility = ability.toUpperCase()
    // Map old ability names to spell names
    const abilityToSpell: Record<string, string[]> = {
      BREATH: ['BR_FIRE', 'BR_COLD', 'BR_ELEC', 'BR_ACID', 'BR_POISON', 'BR_DARK'],
      FIRE: ['BR_FIRE', 'BO_FIRE'],
      COLD: ['BR_COLD', 'BO_COLD'],
      ELEC: ['BR_ELEC', 'BO_ELEC'],
      ELECTRIC: ['BR_ELEC', 'BO_ELEC'],
      ACID: ['BR_ACID', 'BO_ACID'],
      POISON: ['BR_POISON'],
      DARK: ['BR_DARK'],
      HEAL: ['HEAL'],
      SUMMON: ['SUMMON'],
      BLINK: ['BLINK'],
      HASTE: ['HASTE'],
      BRAIN_SMASH: ['BRAIN_SMASH'],
      HOLD: ['HOLD'],
      CONFUSE: ['CONFUSE'],
      SCARE: ['SCARE'],
      BLIND: ['BLIND'],
      SLOW: ['SLOW'],
    }
    const matchingSpells = abilityToSpell[spellAbility] ?? [spellAbility]
    if (template.spells.list.some((s) => matchingSpells.includes(s))) return true
  }

  return false
}

/**
 * Get all "abilities" from a monster for display purposes
 * Returns a list of abilities derived from attacks and spells
 */
export function getAbilities(template: MonsterTemplate): string[] {
  const abilities: string[] = []

  // Collect unique effect types from attacks
  template.attacks?.forEach((attack) => {
    if (attack.effect.type === 'ELEMENTAL') {
      abilities.push(attack.effect.element)
    } else if (attack.effect.type !== 'HURT') {
      abilities.push(attack.effect.type)
    }
  })

  // Collect spell names
  template.spells?.list.forEach((spell) => {
    abilities.push(spell)
  })

  // Return unique abilities
  return [...new Set(abilities)]
}
