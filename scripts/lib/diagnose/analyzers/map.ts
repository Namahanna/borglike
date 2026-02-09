/**
 * Map Visualizer
 *
 * Renders ASCII dungeon maps for debugging:
 * - Explored vs unexplored tiles
 * - Bot position and goal target
 * - Stairs locations
 * - Frontier tiles
 * - Monster positions
 */

import type {
  Analyzer,
  AnalyzerResult,
  DiagnosticIssue,
  TurnContext,
  EndReason,
} from '../types'
import type { GameState } from '@game/types'
import type { BotState } from '@bot/types'
import { findFrontierTiles } from '@bot/exploration'

/** Configuration for map visualization */
export interface MapVisualizerConfig {
  /** Capture map every N turns (0 = only at end) */
  captureInterval: number
  /** Also capture on specific events */
  captureOnDescent: boolean
  captureOnDeath: boolean
  /** Include frontier tiles in visualization */
  showFrontier: boolean
  /** Include monsters in visualization */
  showMonsters: boolean
  /** Maximum maps to store */
  maxMaps: number
  /** Show full map (all tiles revealed) instead of explored only */
  showFullMap: boolean
  /** Capture both explored and full map in each snapshot */
  captureBothMaps: boolean
}

const DEFAULT_CONFIG: MapVisualizerConfig = {
  captureInterval: 0,
  captureOnDescent: true,
  captureOnDeath: true,
  showFrontier: true,
  showMonsters: true,
  maxMaps: 10,
  showFullMap: false,
  captureBothMaps: false,
}

/** A captured map snapshot */
export interface MapSnapshot {
  turn: number
  depth: number
  reason: string
  /** Explored map (or full map if showFullMap config is true) */
  map: string
  /** Full map (all tiles revealed) - only populated if captureBothMaps is true */
  fullMap?: string
  stats: {
    explored: number
    total: number
    stairsFound: boolean
  }
}

export class MapVisualizer implements Analyzer {
  readonly name = 'map'
  private config: MapVisualizerConfig
  private issues: DiagnosticIssue[] = []

  // Captured maps
  private maps: MapSnapshot[] = []

  constructor(config: Partial<MapVisualizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  onStart(_game: GameState, _botState: BotState): void {
    this.issues = []
    this.maps = []

  }

  onTurn(ctx: TurnContext): void {
    // Capture at interval
    if (
      this.config.captureInterval > 0 &&
      ctx.turn > 0 &&
      ctx.turn % this.config.captureInterval === 0
    ) {
      this.captureMap(ctx.game, ctx.botState, ctx.turn, `turn ${ctx.turn}`)
    }
  }

  onLevelChange(game: GameState, oldDepth: number, newDepth: number): void {
    if (this.config.captureOnDescent) {
      this.captureMap(game, null, game.turn, `descended ${oldDepth} → ${newDepth}`)
    }
  }

  onEnd(game: GameState, reason: EndReason): void {
    // Always capture final map
    this.captureMap(game, null, game.turn, `end: ${reason}`)

    if (reason === 'death' && this.config.captureOnDeath) {
      // Already captured above
    }
  }

  private captureMap(
    game: GameState,
    botState: BotState | null,
    turn: number,
    reason: string
  ): void {
    if (this.maps.length >= this.config.maxMaps) {
      // Remove oldest non-end map
      const idx = this.maps.findIndex((m) => !m.reason.startsWith('end'))
      if (idx >= 0) {
        this.maps.splice(idx, 1)
      } else {
        return // Don't overflow
      }
    }

    const map = this.renderMap(game, botState)
    const stats = this.getMapStats(game)

    // Capture full map as well if configured
    const fullMap = this.config.captureBothMaps
      ? this.renderMap(game, botState, true)
      : undefined

    this.maps.push({
      turn,
      depth: game.character.depth,
      reason,
      map,
      fullMap,
      stats,
    })

    // Map captured at this turn
  }

  private renderMap(game: GameState, botState: BotState | null, fullMap?: boolean): string {
    const level = game.currentLevel
    const pos = game.character.position
    const goal = botState?.currentGoal?.target
    const showFull = fullMap ?? this.config.showFullMap

    // Get frontier tiles if enabled (only for explored view)
    const frontierSet = new Set<string>()
    if (this.config.showFrontier && !showFull) {
      const frontier = findFrontierTiles(game)
      for (const f of frontier.slice(0, 20)) {
        frontierSet.add(`${f.position.x},${f.position.y}`)
      }
    }

    // Get monster positions if enabled
    const monsterSet = new Set<string>()
    if (this.config.showMonsters) {
      for (const m of game.monsters) {
        if (m.hp > 0) {
          monsterSet.add(`${m.position.x},${m.position.y}`)
        }
      }
    }

    const lines: string[] = []

    for (let y = 0; y < level.height; y++) {
      let row = ''
      for (let x = 0; x < level.width; x++) {
        const tile = level.tiles[y]?.[x]
        const key = `${x},${y}`

        // Priority: player > goal > monster > stairs > frontier > tile
        if (x === pos.x && y === pos.y) {
          row += '@'
        } else if (goal && x === goal.x && y === goal.y) {
          row += '*'
        } else if (monsterSet.has(key)) {
          row += 'M'
        } else if (level.stairsDown && x === level.stairsDown.x && y === level.stairsDown.y) {
          row += '>'
        } else if (level.stairsUp && x === level.stairsUp.x && y === level.stairsUp.y) {
          row += '<'
        } else if (frontierSet.has(key)) {
          row += '?'
        } else if (!tile) {
          row += ' '
        } else if (!showFull && !tile.explored) {
          row += '#'
        } else if (tile.type === 'wall') {
          row += '█'
        } else if (tile.type === 'door_closed') {
          row += '+'
        } else if (tile.type === 'door_open') {
          row += '/'
        } else if (tile.type === 'floor') {
          row += '.'
        } else if (tile.type === 'fountain' || tile.type === 'fountain_empty') {
          row += '~'
        } else if (tile.type === 'altar') {
          row += '_'
        } else {
          row += '.'
        }
      }
      lines.push(row)
    }

    return lines.join('\n')
  }

  /** Render the full map (all tiles revealed) for a game state */
  renderFullMap(game: GameState, botState: BotState | null): string {
    return this.renderMap(game, botState, true)
  }

  /** Render the explored map only */
  renderExploredMap(game: GameState, botState: BotState | null): string {
    return this.renderMap(game, botState, false)
  }

  private getMapStats(game: GameState): MapSnapshot['stats'] {
    const level = game.currentLevel
    let explored = 0
    let total = 0

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const tile = level.tiles[y]?.[x]
        if (tile && tile.type !== 'wall') {
          total++
          if (tile.explored) {
            explored++
          }
        }
      }
    }

    const stairsFound = level.stairsDown
      ? level.tiles[level.stairsDown.y]?.[level.stairsDown.x]?.explored ?? false
      : false

    return { explored, total, stairsFound }
  }

  summarize(): AnalyzerResult {
    return {
      name: this.name,
      metrics: {
        mapsCaptured: this.maps.length,
      },
      issues: this.issues,
      details: this.maps.map(
        (m) =>
          `[Turn ${m.turn}, Depth ${m.depth}] ${m.reason} - ` +
          `${m.stats.explored}/${m.stats.total} explored, stairs: ${m.stats.stairsFound}`
      ),
    }
  }

  /** Get all captured maps */
  getMaps(): MapSnapshot[] {
    return this.maps
  }

  /** Get the last captured map */
  getLastMap(): MapSnapshot | null {
    return this.maps[this.maps.length - 1] ?? null
  }
}

/** Create a map visualizer with default config */
export function createMapVisualizer(config?: Partial<MapVisualizerConfig>): MapVisualizer {
  return new MapVisualizer(config)
}

export interface FormatMapOptions {
  /** Show only explored map (default) */
  showExplored?: boolean
  /** Show full map (all tiles revealed) */
  showFull?: boolean
}

/** Format a map snapshot for output */
export function formatMapSnapshot(
  snapshot: MapSnapshot,
  options: FormatMapOptions = {}
): string {
  const { showExplored = true, showFull = false } = options
  const lines: string[] = []

  lines.push(`Map at turn ${snapshot.turn} (depth ${snapshot.depth}) - ${snapshot.reason}`)
  lines.push(
    `Explored: ${snapshot.stats.explored}/${snapshot.stats.total} ` +
      `(${((snapshot.stats.explored / snapshot.stats.total) * 100).toFixed(1)}%) ` +
      `Stairs: ${snapshot.stats.stairsFound ? 'found' : 'not found'}`
  )
  lines.push('')
  lines.push('Legend: @ = player, * = goal, M = monster, > = stairs down, < = stairs up')
  lines.push('        ? = frontier, # = unexplored, █ = wall, . = floor, + = door')

  // Show full map if requested and available
  if (showFull && snapshot.fullMap) {
    lines.push('')
    lines.push('=== FULL MAP (all tiles revealed) ===')
    lines.push('')
    lines.push(snapshot.fullMap)
  }

  // Show explored map if requested
  if (showExplored) {
    if (showFull && snapshot.fullMap) {
      lines.push('')
      lines.push('=== EXPLORED MAP ===')
    }
    lines.push('')
    lines.push(snapshot.map)
  }

  return lines.join('\n')
}

/** Format only the full map from a snapshot */
export function formatFullMapSnapshot(snapshot: MapSnapshot): string | null {
  if (!snapshot.fullMap) return null

  const lines: string[] = []
  lines.push(`Full Map at turn ${snapshot.turn} (depth ${snapshot.depth}) - ${snapshot.reason}`)
  lines.push(
    `Explored: ${snapshot.stats.explored}/${snapshot.stats.total} ` +
      `(${((snapshot.stats.explored / snapshot.stats.total) * 100).toFixed(1)}%)`
  )
  lines.push('')
  lines.push('Legend: @ = player, * = goal, M = monster, > = stairs down, < = stairs up')
  lines.push('        █ = wall, . = floor, + = closed door, / = open door')
  lines.push('')
  lines.push(snapshot.fullMap)
  return lines.join('\n')
}
