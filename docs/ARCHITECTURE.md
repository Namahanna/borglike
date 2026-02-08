# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vue UI Layer                            │
│   RunPanel, DungeonGrid, UpgradeList, Sidebar, Feed, Modals    │
└────────────────────────────────┬────────────────────────────────┘
                                 │ reactive bindings
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Pinia Stores (7 files)                     │
│  ┌─────────────┐ ┌──────────┐ ┌────────────┐ ┌────────┐       │
│  │ progression │ │   runs   │ │ persistence│ │settings│       │
│  │ essence     │ │ grid[][] │ │ IndexedDB  │ │ prefs  │       │
│  │ upgrades    │ │ stats    │ │ auto-save  │ │        │       │
│  │ unlocks     │ │ state    │ │ backup     │ │        │       │
│  └─────────────┘ └──────────┘ └────────────┘ └────────┘       │
│  ┌──────────────┐ ┌──────────┐                                 │
│  │ engine-state │ │   feed   │                                 │
│  └──────────────┘ └──────────┘                                 │
└────────────────────────────────┬────────────────────────────────┘
                                 │ extracted metrics only
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Instance Manager                             │
│         (src/engine/instance-manager.ts, 1127 lines)           │
│  • Manages 1-4 game instances                                  │
│  • Tick loop (100ms base, 20ms turbo)                          │
│  • Syncs game state → stores                                   │
│  • Renders viewport (80x24)                                    │
│  • Auto-restart handling                                       │
└────────────────────────────────┬────────────────────────────────┘
                                 │ step()
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Game Runner                                │
│              (src/game/game-runner.ts, 374 lines)              │
│  • Orchestrates bot + turn processing                          │
│  • Tracks run state and stats                                  │
│  • Calculates essence on completion                            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
┌──────────────────────┐             ┌──────────────────────┐
│      Bot AI          │             │     Game Loop        │
│  (src/game/bot/)     │             │ (src/game/game-loop) │
│  27 files            │             │  521 lines           │
│                      │             │                      │
│  • Flow pathfinding  │             │  • Turn processing   │
│  • Danger grid       │             │  • Action handlers   │
│  • Goal selection    │             │  • Monster AI        │
│  • Class profiles    │             │  • Level management  │
│  • Survival logic    │             │  • Status effects    │
│  • Farming strategy  │             │                      │
│  • Spell selection   │             │                      │
└──────────────────────┘             └──────────────────────┘
              │                                     │
              └──────────────────┬───────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Systems                               │
│  character.ts │ combat.ts │ dungeon/ │ items.ts │ monster-ai.ts │
│  spell-resolution.ts │ features.ts │ town.ts │ status-effects  │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Game Data (19 files)                       │
│        (src/game/data/)                                        │
│  races │ classes │ monsters │ items │ spells │ upgrades        │
│  boosters │ features │ merchants │ traps │ gold │ vaults       │
│  bot-upgrades │ artifacts │ activations │ forms │ achievements │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Turn Flow
```
Instance Manager tick()
    │
    ├─► runner.step()
    │       │
    │       ├─► Bot AI decides action (runBotTick)
    │       │       └─► buildContext → selectGoal → computeFlow → selectStep
    │       │
    │       └─► Game Loop processes turn (processTurn)
    │               ├─► Execute player action
    │               ├─► Process monster turns (energy-based)
    │               ├─► Tick status effects, poison, regen
    │               └─► Update FOV
    │
    ├─► updateRunFromGame()  →  runs store (stats, equipment)
    ├─► renderGameToGrid()   →  runs store (grid cells)
    └─► processMessages()    →  feed store (filtered messages)
```

### Run Completion Flow
```
Game ends (death/victory)
    │
    ├─► runner.getResult() calculates essence
    │
    ├─► handleRunCompletion()
    │       ├─► Convert to RunStats
    │       ├─► Apply prestige multiplier
    │       ├─► Check milestone unlocks
    │       └─► Record to stores
    │
    └─► Auto-restart check (if enabled)
```

## Key Patterns

### Two-Layer State
Full GameState stays in engine. Pinia stores hold extracted display data only. One-way flow prevents state sync issues.

### Energy-Based Speed
Monsters accumulate energy each player turn: `energy += (speed/110) * 100`. Act when `energy >= 100`. Fast monsters get multiple actions.

### Flow-Based Pathfinding
Reverse BFS from goal. Each tile stores distance. Bot follows decreasing costs. Cached for ~10 turns.

### Danger Grid
Per-tile threat score from nearby monsters. Distance falloff: 2x at monster → 0.2x at distance 4+. High danger tiles excluded from pathing.

### LRU Level Cache
Max 12 levels cached. Protects current depth ±1 from eviction. Prevents memory bloat.

### Persistence Strategy
- **Primary:** IndexedDB via `idb` library
- **Backup:** localStorage on `beforeunload`
- **Critical saves:** Immediate (essence, purchases)
- **Auto-save:** 500ms debounce
- **Recovery:** Compares `lifetimeEssence` to detect newer backup

## Module Structure

```
src/
├── engine/
│   ├── instance-manager.ts    # Multi-run orchestration (1127 lines)
│   └── renderer.ts            # Grid rendering
│
├── game/
│   ├── bot/                   # Auto-player (27 files)
│   │   ├── tick.ts            # Main entry: runBotTick (810 lines)
│   │   ├── index.ts           # Re-exports
│   │   ├── types.ts           # Bot types
│   │   ├── context.ts         # BotContext builder
│   │   ├── goals.ts           # Goal selection (726 lines)
│   │   ├── danger.ts          # Threat calculation
│   │   ├── flow.ts            # Reverse BFS pathfinding
│   │   ├── movement.ts        # Step selection
│   │   ├── combat.ts          # Fight decisions (996 lines)
│   │   ├── exploration.ts     # Frontier detection (1128 lines)
│   │   ├── farming.ts         # Farm loops and sweep (1199 lines)
│   │   ├── spells.ts          # Spell selection (1277 lines)
│   │   ├── items.ts           # Item management (1054 lines)
│   │   ├── survival.ts        # Survival coordinator
│   │   ├── survival-retreat.ts    # Retreat logic (978 lines)
│   │   ├── survival-consumables.ts # Consumable usage (715 lines)
│   │   ├── merchant.ts        # Shopping logic
│   │   ├── personality.ts     # 4 personalities
│   │   ├── class-profiles.ts  # 11 class behaviors
│   │   ├── stuck.ts           # Anti-stuck recovery
│   │   ├── progression.ts     # Depth readiness
│   │   ├── preparation.ts     # Pre-descent prep
│   │   ├── safety-flow.ts     # Safe pathing
│   │   ├── shapeshift.ts      # Form management
│   │   ├── tier-actions.ts    # Tiered action selection
│   │   ├── state.ts           # Bot state tracking
│   │   └── profiler.ts        # Performance profiling
│   │
│   ├── dungeon/               # Level generation (9 files)
│   │   ├── index.ts           # Main generator
│   │   ├── classic.ts         # rot.js Digger
│   │   ├── cavern.ts          # Cellular automata
│   │   ├── labyrinth.ts       # IceyMaze
│   │   ├── vaults.ts          # 21 templates
│   │   ├── doors.ts           # Door placement
│   │   ├── profiles.ts        # Depth scaling
│   │   ├── validation.ts      # Level validation
│   │   └── types.ts           # Dungeon types
│   │
│   ├── data/                  # Static data (19 files)
│   │
│   ├── game-loop.ts           # Turn processing (521 lines)
│   ├── game-runner.ts         # Run orchestration (374 lines)
│   ├── character.ts           # Character creation (711 lines)
│   ├── combat.ts              # Attack resolution (1198 lines)
│   ├── spell-resolution.ts    # Spell effects (1441 lines)
│   ├── monster-ai.ts          # Monster decisions (964 lines)
│   ├── features.ts            # Fountains, altars, etc. (941 lines)
│   ├── items.ts               # Item system (756 lines)
│   ├── town.ts                # Town generation (874 lines)
│   ├── types.ts               # Game types (1016 lines)
│   └── ...                    # + 14 more (status-effects, lighting, etc.)
│
├── stores/
│   ├── progression.ts         # Meta-progression (1054 lines)
│   ├── persistence.ts         # IndexedDB layer (1304 lines)
│   ├── runs.ts                # Active run display (310 lines)
│   ├── feed.ts                # Event filtering (291 lines)
│   ├── settings.ts            # User preferences
│   ├── engine-state.ts        # Engine lifecycle
│   └── index.ts               # Re-exports
│
├── core/
│   ├── formulas.ts            # Progression math
│   └── run-completion-service.ts
│
└── ui/components/             # 37 Vue components
    ├── DungeonGridCanvas.vue  # Canvas-based dungeon renderer
    ├── RunPanel.vue           # Run display card
    ├── RunArea.vue            # Multi-run layout
    ├── Sidebar.vue            # Meta-progression sidebar
    ├── game/                  # Game-specific (EmptySlot, LoadoutEditor, RunPanelExpanded)
    ├── meta/                  # Upgrades & unlocks (UpgradeList, UpgradeItem, UnlockList, UnlockItem)
    ├── layout/                # App chrome (AppHeader, AppFeed, FeedModal)
    ├── common/                # Shared (CollapsibleSection, PanelFrame, ProgressBar)
    ├── bestiary/              # Monster encyclopedia
    ├── codex/                 # Race & class viewer
    ├── armory/                # Item encyclopedia
    ├── achievements/          # Achievement display
    ├── analytics/             # Run summaries
    ├── history/               # Run history
    ├── help/                  # Help modal
    ├── overlay/               # Catch-up overlay
    └── settings/              # Settings panel
```

## External Dependencies

| Package | Purpose |
|---------|---------|
| rot-js | Dungeon generation (Digger, Cellular, IceyMaze), FOV, pathfinding |
| vue | UI framework |
| pinia | State management |
| idb | IndexedDB wrapper |
| @vueuse/core | Reactive utilities |
