/**
 * Artifact data extracted from Angband 4.2.6 gamedata/artifact.txt
 * 8-10 iconic artifacts spanning early, mid, and late game
 */

export interface ArtifactTemplate {
  name: string
  baseType: string
  slot: 'weapon' | 'body' | 'shield' | 'helm' | 'gloves' | 'boots' | 'ring' | 'amulet' | 'light'
  minDepth: number
  damage?: string
  protection?: number
  weight: number
  bonuses: Record<string, number>
  abilities: string[]
  description: string
}

export const ARTIFACTS: ArtifactTemplate[] = [
  // ============================================================================
  // EARLY GAME (depth 10-20)
  // ============================================================================

  {
    name: 'Phial of Galadriel',
    baseType: 'Phial',
    slot: 'light',
    minDepth: 5,
    weight: 10,
    bonuses: {
      LIGHT: 4,
    },
    abilities: ['Activation: Illuminate Area'],
    description:
      "A small crystal phial containing the light of Earendil's Star. Its light is imperishable, and near it darkness cannot endure.",
  },

  {
    name: 'Sting',
    baseType: 'Short Sword',
    slot: 'weapon',
    minDepth: 20,
    damage: '1d7',
    weight: 75,
    bonuses: {
      STR: 1,
      DEX: 1,
      CON: 1,
      SPEED: 3,
      BLOWS: 2,
      LIGHT: 1,
      toHit: 7,
      toDam: 8,
    },
    abilities: [
      'Slay Evil',
      'Slay Undead x3',
      'Slay Orc x3',
      'Slay Animal',
      'Resist Light',
      'Protection from Fear',
      'Free Action',
    ],
    description:
      '"I will give you a name, and I shall call you Sting." The perfect size for Bilbo, this sturdy little blade grants combat prowess and survival abilities.',
  },

  {
    name: 'Elvagil',
    baseType: 'Long Sword',
    slot: 'weapon',
    minDepth: 10,
    damage: '2d5',
    weight: 130,
    bonuses: {
      DEX: 2,
      toHit: 12,
      toDam: 12,
    },
    abilities: ['Slay Troll x3', 'Slay Orc x3'],
    description:
      'The "Singing Blade", whose wearer can slay Orcs and Trolls in the hidden and secret places of the earth.',
  },

  {
    name: 'Thengel',
    baseType: 'Metal Cap',
    slot: 'helm',
    minDepth: 10,
    protection: 3,
    weight: 20,
    bonuses: {
      WIS: 3,
      toAC: 12,
    },
    abilities: ['Protection from Confusion'],
    description:
      'A ridged helmet made of steel and embossed with scenes of valor. It grants the wearer nobility and understanding.',
  },

  {
    name: 'Eriril',
    baseType: 'Quarterstaff',
    slot: 'weapon',
    minDepth: 15,
    damage: '1d9',
    weight: 150,
    bonuses: {
      INT: 4,
      WIS: 4,
      LIGHT: 1,
      toHit: 13,
      toDam: 15,
    },
    abilities: ['Slay Evil', 'Resist Light'],
    description:
      "The radiant golden staff of an Istar of legend, this wizard's companion grants keen sight and clear knowledge of many hidden things.",
  },

  // ============================================================================
  // MID GAME (depth 20-35)
  // ============================================================================

  {
    name: 'Totila',
    baseType: 'Flail',
    slot: 'weapon',
    minDepth: 20,
    damage: '3d6',
    weight: 150,
    bonuses: {
      SPEED: 2,
      toHit: 16,
      toDam: 12,
    },
    abilities: [
      'Slay Evil',
      'Brand Fire',
      'Resist Fire',
      'Protection from Confusion',
      'Activation: Blind Monsters',
    ],
    description:
      'A flail whose head befuddles those who stare as you whirl it round and becomes a fiery comet as you bring it down.',
  },

  {
    name: 'Firestar',
    baseType: 'Morning Star',
    slot: 'weapon',
    minDepth: 20,
    damage: '2d6',
    weight: 150,
    bonuses: {
      toHit: 15,
      toDam: 17,
      toAC: 2,
    },
    abilities: ['Brand Fire', 'Resist Fire x3', 'Activation: Fire Ball (72 damage)'],
    description:
      'A famed battle-lord of old with a head as ruddy as embers that can yet rise up in wrath.',
  },

  {
    name: 'Staff of Olorin',
    baseType: 'Quarterstaff',
    slot: 'weapon',
    minDepth: 30,
    damage: '2d9',
    weight: 150,
    bonuses: {
      INT: 4,
      WIS: 4,
      toHit: 10,
      toDam: 13,
    },
    abilities: [
      'Slay Evil',
      'Slay Demon x5',
      'Slay Troll x3',
      'Slay Orc x3',
      'Brand Fire',
      'Resist Fire',
      'Hold Life',
    ],
    description:
      'The mighty staff of Gandalf the Grey, imbued with the power of the Istari. It blazes with fire against the servants of darkness.',
  },

  {
    name: 'Glamdring',
    baseType: 'Broad Sword',
    slot: 'weapon',
    minDepth: 20,
    damage: '2d5',
    weight: 150,
    bonuses: {
      LIGHT: 1,
      toHit: 10,
      toDam: 15,
    },
    abilities: [
      'Slay Evil',
      'Slay Orc x3',
      'Slay Demon x3',
      'Brand Fire',
      'Resist Fire',
      'Resist Light',
    ],
    description:
      'This fiery, shining blade, mate to Orcrist, earned its sobriquet "Beater" from dying orcs who dared to behold hidden Gondolin.',
  },

  {
    name: 'Anduril',
    baseType: 'Long Sword',
    slot: 'weapon',
    minDepth: 20,
    damage: '3d5',
    weight: 130,
    bonuses: {
      STR: 4,
      DEX: 4,
      toHit: 10,
      toDam: 15,
      toAC: 10,
    },
    abilities: [
      'Slay Evil',
      'Slay Troll x3',
      'Slay Orc x3',
      'Slay Undead x3',
      'Brand Fire',
      'Resist Fire',
      'Free Action',
      'Protection from Fear',
      'Sustain STR',
      'Sustain DEX',
      'Activation: Fire Ball (72 damage)',
    ],
    description:
      'The famed "Flame of the West", the Sword that was Broken and is forged again. It glows with the essence of fire.',
  },

  {
    name: 'Holhenneth',
    baseType: 'Iron Helm',
    slot: 'helm',
    minDepth: 20,
    protection: 7,
    weight: 50,
    bonuses: {
      INT: 2,
      WIS: 2,
      toAC: 10,
    },
    abilities: ['Protection from Blindness', 'Protection from Confusion'],
    description: 'A famous forged iron helm granting extraordinary powers of mind and awareness.',
  },

  {
    name: 'Thalkettoth',
    baseType: 'Leather Scale Mail',
    slot: 'body',
    minDepth: 30,
    protection: 20,
    weight: 60,
    bonuses: {
      DEX: 3,
      SPEED: 3,
      toAC: 25,
    },
    abilities: ['Resist Acid', 'Free Action'],
    description:
      'An amazingly light tunic and skirt sewn with thick, overlapping scales of hardened leather. Those who wear it move with agility and assurance.',
  },

  // ============================================================================
  // LATE GAME (depth 35-50)
  // ============================================================================

  {
    name: 'Ringil',
    baseType: 'Long Sword',
    slot: 'weapon',
    minDepth: 20,
    damage: '4d5',
    weight: 130,
    bonuses: {
      SPEED: 10,
      LIGHT: 1,
      toHit: 22,
      toDam: 25,
    },
    abilities: [
      'Slay Evil',
      'Slay Undead x3',
      'Slay Troll x3',
      'Slay Demon x5',
      'Brand Cold',
      'Resist Cold',
      'Resist Light',
      'Free Action',
      'Protection from Fear',
      'Regeneration',
      'Activation: Cold Ball (100 damage)',
    ],
    description:
      'The weapon of Fingolfin, High King of the Noldor; it shines like a column of ice lit by light unquenchable. Morgoth came but unwillingly to meet it of old.',
  },

  {
    name: 'Boots of Feanor',
    baseType: 'Leather Boots',
    slot: 'boots',
    minDepth: 40,
    protection: 2,
    weight: 20,
    bonuses: {
      SPEED: 15,
      toAC: 20,
    },
    abilities: ['Activation: Haste Self'],
    description:
      "This wondrous pair of leather boots once sped Feanor, creator of the Silmarils and the mightiest of the Eldar, to fulfill his hero's challenge.",
  },

  {
    name: 'Hammer of Aule',
    baseType: 'Great Hammer',
    slot: 'weapon',
    minDepth: 40,
    damage: '18d1',
    weight: 120,
    bonuses: {
      WIS: 4,
      toHit: 19,
      toDam: 21,
      toAC: 5,
    },
    abilities: [
      'Slay Dragon x5',
      'Slay Evil',
      'Slay Undead x3',
      'Slay Demon x3',
      'Brand Acid',
      'Resist Acid',
      'Resist Lightning',
      'Resist Fire',
      'Resist Cold',
      'Free Action',
      'Protection from Fear',
    ],
    description:
      'The wondrous hammer of Aule, creator of the wise Dwarven lords of old. It bears demolishing magics that no serpent or demon can withstand.',
  },

  {
    name: 'Dor-Lomin',
    baseType: 'Iron Helm',
    slot: 'helm',
    minDepth: 40,
    protection: 7,
    weight: 50,
    bonuses: {
      STR: 4,
      DEX: 2,
      CON: 4,
      toAC: 20,
    },
    abilities: [
      'Resist Acid',
      'Resist Lightning',
      'Resist Fire',
      'Resist Cold',
      'Protection from Fear',
    ],
    description:
      'The legendary Dragon-helm, forged by one of the legendary Dwarven smiths of the First Age. The visage of mighty Glaurung forms its crest.',
  },
]

/**
 * Get artifacts appropriate for a given depth
 */
export function getArtifactsForDepth(depth: number): ArtifactTemplate[] {
  return ARTIFACTS.filter((artifact) => artifact.minDepth <= depth)
}

/**
 * Get artifacts by slot type
 */
export function getArtifactsBySlot(slot: ArtifactTemplate['slot']): ArtifactTemplate[] {
  return ARTIFACTS.filter((artifact) => artifact.slot === slot)
}

/**
 * Get artifact by name
 */
export function getArtifactByName(name: string): ArtifactTemplate | undefined {
  return ARTIFACTS.find((artifact) => artifact.name === name)
}

/**
 * Get early game artifacts (depth 10-20)
 */
export function getEarlyGameArtifacts(): ArtifactTemplate[] {
  return ARTIFACTS.filter((a) => a.minDepth >= 5 && a.minDepth <= 20)
}

/**
 * Get mid game artifacts (depth 20-35)
 */
export function getMidGameArtifacts(): ArtifactTemplate[] {
  return ARTIFACTS.filter((a) => a.minDepth > 20 && a.minDepth <= 35)
}

/**
 * Get late game artifacts (depth 35-50)
 */
export function getLateGameArtifacts(): ArtifactTemplate[] {
  return ARTIFACTS.filter((a) => a.minDepth > 35)
}
