/**
 * UI Event types for communication between game engine and stores
 */

/**
 * Events emitted by the game runner for UI state updates.
 * These are simplified versions of game events for the runs store.
 */
export type AngbandEvent =
  | { type: 'depth'; level: number }
  | { type: 'hp'; current: number; max: number }
  | { type: 'mp'; current: number; max: number }
  | { type: 'gold'; total: number }
  | { type: 'xp'; current: number }
  | { type: 'kill'; monsterId?: string; monsterName?: string }
  | { type: 'tick'; turn: number }
  | { type: 'death'; cause?: string }
  | { type: 'victory' }
  | { type: 'levelUp'; level: number }
  | { type: 'item'; action: 'pickup' | 'drop' | 'equip'; itemName: string }

/**
 * Personality display constants and type
 */
export const PERSONALITY_DISPLAY = {
  cautious: { label: 'CAU', color: 'var(--blue)', name: 'Cautious', desc: 'Retreats early, uses items freely' },
  aggressive: { label: 'AGG', color: 'var(--red)', name: 'Aggressive', desc: 'Fights to low HP, hoards items' },
  greedy: { label: 'GRD', color: 'var(--amber)', name: 'Greedy', desc: 'Prioritizes gold/items over safety' },
  speedrunner: { label: 'SPD', color: 'var(--cyan)', name: 'Speedrunner', desc: 'Beelines for stairs' },
  custom: { label: 'CUS', color: 'var(--purple)', name: 'Custom', desc: 'Fine-tuned behavior sliders' },
} as const

export type Personality = keyof typeof PERSONALITY_DISPLAY

/**
 * Configuration for starting a new run
 */
export interface RunRequest {
  race: string
  class: string
  personality?: Personality
  seed?: number
}
