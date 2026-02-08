/**
 * Safety Flow - Inverted Dijkstra Maps for Flee Behavior
 *
 * Implements the "inverted Dijkstra" technique from "The Incredible Power of Dijkstra Maps":
 * 1. Compute distance map FROM all monster positions (multi-source BFS)
 * 2. Multiply all values by -1.2 (inversion coefficient)
 * 3. Re-scan to create flow toward safety maxima
 * 4. Bot "rolls downhill" toward intelligent escape routes
 *
 * The -1.2 coefficient (not -1.0) creates preference for global safety maxima
 * over local ones - a cornered bot recognizes that sprinting PAST danger
 * to a door is better than backing into a corner.
 *
 * Performance (Pass 4): Typed arrays (Int16Array) + binary min-heap + circular
 * BFS buffer. Replaces Map<string,number> keys, queue.sort() Dijkstra, and
 * queue.shift() BFS from the original implementation.
 */

import type { DungeonLevel, Point, Monster } from '../types'
import type { SafetyFlowResult } from './types'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Inversion coefficient scaled by 5 for exact integer math.
 * Original: -1.2 → scaled: -6 (dist * -6)
 * Step cost: 1 → 5, Anchor threshold: 3 → 15
 */
const SCALED_INVERSION = -6
const SCALED_STEP_COST = 5
const SCALED_ANCHOR_THRESHOLD = 15

/** Maximum steps to look ahead when rolling downhill */
const MAX_ESCAPE_LOOKAHEAD = 10

/** Sentinel for unreachable tiles (fits comfortably in Int16) */
const MAX_COST = 30000

/** Maximum BFS expansion distance from monsters */
const MAX_BFS_DIST = 50

/** Direction offsets for 8-way movement */
const DX = [-1, 0, 1, -1, 1, -1, 0, 1]
const DY = [-1, -1, -1, 0, 0, 1, 1, 1]

// ============================================================================
// PRE-ALLOCATED BFS CIRCULAR BUFFER
// ============================================================================

const BFS_CAP = 3200 // 80x40 max level size

const bfsXs = new Uint16Array(BFS_CAP)
const bfsYs = new Uint16Array(BFS_CAP)
const bfsDists = new Int16Array(BFS_CAP)
let bfsHead = 0
let bfsTail = 0

// ============================================================================
// PRE-ALLOCATED BINARY MIN-HEAP (for Dijkstra rescan)
// ============================================================================

const HEAP_CAP = 3200

const heapXs = new Uint16Array(HEAP_CAP)
const heapYs = new Uint16Array(HEAP_CAP)
const heapCosts = new Int16Array(HEAP_CAP)
let heapSize = 0

function heapPush(x: number, y: number, cost: number): void {
  let i = heapSize
  heapXs[i] = x
  heapYs[i] = y
  heapCosts[i] = cost
  heapSize++

  // Sift up
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heapCosts[parent]! <= heapCosts[i]!) break
    let tmp: number
    tmp = heapXs[i]!
    heapXs[i] = heapXs[parent]!
    heapXs[parent] = tmp
    tmp = heapYs[i]!
    heapYs[i] = heapYs[parent]!
    heapYs[parent] = tmp
    tmp = heapCosts[i]!
    heapCosts[i] = heapCosts[parent]!
    heapCosts[parent] = tmp
    i = parent
  }
}

/** Pop minimum and write to popX/popY/popCost (avoids object allocation) */
let popX = 0
let popY = 0
let popCost = 0

function heapPop(): void {
  popX = heapXs[0]!
  popY = heapYs[0]!
  popCost = heapCosts[0]!

  heapSize--
  if (heapSize > 0) {
    heapXs[0] = heapXs[heapSize]!
    heapYs[0] = heapYs[heapSize]!
    heapCosts[0] = heapCosts[heapSize]!

    // Sift down
    let i = 0
    for (;;) {
      const left = 2 * i + 1
      const right = 2 * i + 2
      let smallest = i

      if (left < heapSize && heapCosts[left]! < heapCosts[smallest]!) smallest = left
      if (right < heapSize && heapCosts[right]! < heapCosts[smallest]!) smallest = right

      if (smallest === i) break

      let tmp: number
      tmp = heapXs[i]!
      heapXs[i] = heapXs[smallest]!
      heapXs[smallest] = tmp
      tmp = heapYs[i]!
      heapYs[i] = heapYs[smallest]!
      heapYs[smallest] = tmp
      tmp = heapCosts[i]!
      heapCosts[i] = heapCosts[smallest]!
      heapCosts[smallest] = tmp
      i = smallest
    }
  }
}

// ============================================================================
// CORE ALGORITHM
// ============================================================================

/**
 * Compute safety flow and find escape target.
 *
 * All intermediate grids use Int16Array indexed by y * width + x.
 * BFS uses circular buffer, Dijkstra uses binary min-heap.
 */
export function computeSafetyFlow(
  level: DungeonLevel,
  monsters: Monster[],
  playerPos: Point,
  turn: number
): SafetyFlowResult {
  if (monsters.length === 0) {
    return { target: null, computedAt: turn }
  }

  const { width, height } = level
  const size = width * height

  // ── Step 1: Multi-source BFS from monsters → distance grid ──
  const distGrid = new Int16Array(size)
  distGrid.fill(MAX_COST)

  bfsHead = 0
  bfsTail = 0

  for (const monster of monsters) {
    if (monster.hp <= 0) continue
    const { x, y } = monster.position
    const idx = y * width + x
    if (distGrid[idx] === MAX_COST) {
      distGrid[idx] = 0
      bfsXs[bfsTail] = x
      bfsYs[bfsTail] = y
      bfsDists[bfsTail] = 0
      bfsTail = (bfsTail + 1) % BFS_CAP
    }
  }

  while (bfsHead !== bfsTail) {
    const cx = bfsXs[bfsHead]!
    const cy = bfsYs[bfsHead]!
    const cd = bfsDists[bfsHead]!
    bfsHead = (bfsHead + 1) % BFS_CAP

    if (cd >= MAX_BFS_DIST) continue
    const nextDist = cd + 1

    for (let i = 0; i < 8; i++) {
      const nx = cx + DX[i]!
      const ny = cy + DY[i]!
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue

      const nIdx = ny * width + nx
      if (distGrid[nIdx] !== MAX_COST) continue

      if (!level.passable[nIdx]) continue

      distGrid[nIdx] = nextDist
      bfsXs[bfsTail] = nx
      bfsYs[bfsTail] = ny
      bfsDists[bfsTail] = nextDist
      bfsTail = (bfsTail + 1) % BFS_CAP
    }
  }

  // ── Step 2: Invert in-place (scaled by 5 for integer precision) ──
  // dist * -6 preserves the -1.2 ratio exactly for integer distances
  let globalMin = 0
  for (let i = 0; i < size; i++) {
    if (distGrid[i] !== MAX_COST) {
      const inverted = distGrid[i]! * SCALED_INVERSION
      distGrid[i] = inverted
      if (inverted < globalMin) globalMin = inverted
    }
  }

  // ── Step 3: Find anchors, Dijkstra rescan → safety grid ──
  const anchorThreshold = globalMin + SCALED_ANCHOR_THRESHOLD
  const safetyGrid = new Int16Array(size)
  safetyGrid.fill(MAX_COST)

  heapSize = 0
  for (let i = 0; i < size; i++) {
    if (distGrid[i] !== MAX_COST && distGrid[i]! <= anchorThreshold) {
      safetyGrid[i] = distGrid[i]!
      heapPush(i % width, (i / width) | 0, distGrid[i]!)
    }
  }

  if (heapSize === 0) {
    // No anchors — copy inverted grid as-is for escape step
    for (let i = 0; i < size; i++) {
      if (distGrid[i] !== MAX_COST) {
        safetyGrid[i] = distGrid[i]!
      }
    }
  } else {
    // Dijkstra expansion from anchors
    while (heapSize > 0) {
      heapPop()
      const idx = popY * width + popX

      // Skip stale entries (already found better path)
      if (safetyGrid[idx]! < popCost) continue

      for (let i = 0; i < 8; i++) {
        const nx = popX + DX[i]!
        const ny = popY + DY[i]!
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue

        const nIdx = ny * width + nx
        if (distGrid[nIdx] === MAX_COST) continue // Only expand to reachable tiles

        if (!level.passable[nIdx]) continue

        const newCost = popCost + SCALED_STEP_COST
        if (newCost < safetyGrid[nIdx]!) {
          safetyGrid[nIdx] = newCost
          heapPush(nx, ny, newCost)
        }
      }
    }
  }

  // ── Step 4: Roll downhill to find escape target ──
  const target = findEscapeTarget(level, safetyGrid, width, height, playerPos, monsters)

  return { target, computedAt: turn }
}

/**
 * Roll downhill from player position to find escape target.
 * Follows decreasing safety values (more negative = safer).
 */
function findEscapeTarget(
  level: DungeonLevel,
  safetyGrid: Int16Array,
  gridWidth: number,
  gridHeight: number,
  playerPos: Point,
  monsters: Monster[]
): Point | null {
  // Monster positions as grid indices for O(1) lookup
  const monsterSet = new Set<number>()
  for (const monster of monsters) {
    if (monster.hp > 0) {
      monsterSet.add(monster.position.y * gridWidth + monster.position.x)
    }
  }

  let cx = playerPos.x
  let cy = playerPos.y
  let currentCost = safetyGrid[cy * gridWidth + cx] ?? MAX_COST

  // Visited tracking (zero-initialized by default)
  const visited = new Uint8Array(gridWidth * gridHeight)
  visited[cy * gridWidth + cx] = 1

  let moved = false

  for (let step = 0; step < MAX_ESCAPE_LOOKAHEAD; step++) {
    let bestX = -1
    let bestY = -1
    let bestCost = currentCost

    for (let i = 0; i < 8; i++) {
      const nx = cx + DX[i]!
      const ny = cy + DY[i]!
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue

      const nIdx = ny * gridWidth + nx
      if (visited[nIdx]) continue
      if (monsterSet.has(nIdx)) continue

      if (!level.passable[nIdx]) continue

      const nCost = safetyGrid[nIdx]!
      if (nCost < bestCost) {
        bestCost = nCost
        bestX = nx
        bestY = ny
      }
    }

    if (bestX === -1) break

    cx = bestX
    cy = bestY
    currentCost = bestCost
    visited[cy * gridWidth + cx] = 1
    moved = true
  }

  return moved ? { x: cx, y: cy } : null
}
