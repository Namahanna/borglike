<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { GridCell } from '@/stores/runs'
import { useSettingsStore, FONT_OPTIONS } from '@/stores/settings'

const props = defineProps<{
  grid: GridCell[][]
  cursorX: number
  cursorY: number
  width?: number
  height?: number
}>()

const settingsStore = useSettingsStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// CSS font-family string derived from user setting
const fontCss = computed(() => {
  const opt = FONT_OPTIONS.find((f) => f.id === settingsStore.settings.fontFamily)
  return opt?.css ?? 'monospace'
})

// Grid dimensions
const COLS = props.width || 80
const ROWS = props.height || 24

// Character cell size (will be calculated based on container)
let cellWidth = 10
let cellHeight = 16
let fontSize = 14

// Canvas context
let ctx: CanvasRenderingContext2D | null = null

// Colors
const CURSOR_BG = 'rgba(99, 102, 241, 0.3)'
const PLAYER_CURSOR_BG = 'rgba(34, 197, 94, 0.2)'

function colorToHex(color: number): string {
  if (color === 0) return '#475569'
  return '#' + color.toString(16).padStart(6, '0')
}

/** Measure actual character width/height ratio for the current font */
function measureCharAspect(): number {
  if (!canvasRef.value) return 0.6
  const tempCtx = canvasRef.value.getContext('2d')
  if (!tempCtx) return 0.6
  const sampleSize = 100
  tempCtx.font = `${sampleSize}px ${fontCss.value}`
  return tempCtx.measureText('M').width / sampleSize
}

function calculateSize() {
  if (!containerRef.value || !canvasRef.value) return

  const container = containerRef.value
  const rect = container.getBoundingClientRect()

  // Measure real character aspect ratio from the active font
  const charAspect = measureCharAspect()

  // Calculate cell size to fit container while maintaining character aspect ratio
  // Try fitting by height first
  const cellByHeight = Math.floor(rect.height / ROWS)
  const widthByHeight = cellByHeight * charAspect

  // Try fitting by width
  const cellWidthByWidth = Math.floor(rect.width / COLS)
  const cellByWidth = cellWidthByWidth / charAspect

  // Use whichever fits (smaller of the two)
  if (widthByHeight * COLS <= rect.width) {
    // Height-constrained
    cellHeight = cellByHeight
    cellWidth = Math.floor(widthByHeight)
  } else {
    // Width-constrained
    cellWidth = cellWidthByWidth
    cellHeight = Math.floor(cellByWidth)
  }

  // Ensure minimum readable size
  cellHeight = Math.max(cellHeight, 12)
  cellWidth = Math.max(cellWidth, 7)

  fontSize = Math.floor(cellHeight * 0.85)

  // Set canvas size (resets context state)
  const canvas = canvasRef.value
  canvas.width = COLS * cellWidth
  canvas.height = ROWS * cellHeight

  // Re-apply context state after resize
  ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = `${fontSize}px ${fontCss.value}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
  }
}

function render() {
  if (!ctx || !canvasRef.value) return

  const canvas = canvasRef.value

  // Clear
  ctx.fillStyle = '#0a0a12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw cells
  for (let y = 0; y < ROWS && y < props.grid.length; y++) {
    const row = props.grid[y]
    if (!row) continue

    for (let x = 0; x < COLS && x < row.length; x++) {
      const cell = row[x]
      if (!cell || cell.char === ' ') continue

      const px = x * cellWidth
      const py = y * cellHeight

      // Draw cursor background
      if (x === props.cursorX && y === props.cursorY) {
        ctx.fillStyle = cell.char === '@' ? PLAYER_CURSOR_BG : CURSOR_BG
        ctx.fillRect(px, py, cellWidth, cellHeight)
      }

      // Draw character
      ctx.fillStyle = colorToHex(cell.color)
      ctx.fillText(cell.char, px + cellWidth / 2, py + cellHeight / 2)
    }
  }
}

// Resize observer for responsive sizing
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await document.fonts.ready
  calculateSize()
  render()

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      calculateSize()
      render()
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

// Debounced render using requestAnimationFrame
// This batches all the cell updates into a single frame
let renderScheduled = false
function scheduleRender() {
  if (renderScheduled) return
  renderScheduled = true
  requestAnimationFrame(() => {
    renderScheduled = false
    render()
  })
}

// Watch for grid reference change (deep:false - grid is replaced entirely each tick)
// This is O(1) instead of O(1920) for change detection
watch(() => props.grid, scheduleRender)
watch(() => props.cursorX, scheduleRender)
watch(() => props.cursorY, scheduleRender)

// Recalculate cell sizing + re-render when font changes (may load async from Google Fonts)
watch(fontCss, async () => {
  await document.fonts.ready
  calculateSize()
  render()
})
</script>

<template>
  <div ref="containerRef" class="dungeon-grid-canvas">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<style scoped>
.dungeon-grid-canvas {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0; /* Important for flex children to shrink */
  background: var(--bg-dark);
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
