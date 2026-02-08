# Extending the Diagnostic Toolkit

## Code Structure

```
scripts/
├── diagnose.ts              # CLI entry point (keep thin!)
└── lib/diagnose/
    ├── index.ts             # Main exports
    ├── types.ts             # Analyzer interface, config types
    ├── runner.ts            # Game loop with analyzer hooks
    ├── output.ts            # Formatting utilities
    ├── baseline.ts          # Baseline mode implementation
    ├── debug-explore.ts     # Debug-explore mode implementation
    └── analyzers/
        ├── index.ts         # Factory functions
        ├── stuck.ts
        ├── movement.ts
        ├── pathing.ts
        ├── exploration.ts
        ├── combat.ts
        ├── goal.ts
        ├── goal-distance.ts # Detects short-distance goal thrashing
        ├── oscillation.ts   # Detects directional oscillation
        ├── jitter.ts
        ├── frontier.ts      # Frontier reachability analysis
        ├── stats.ts         # Worker metrics aggregation
        ├── map.ts
        └── personality.ts   # Cross-personality comparison
```

**Keep the entrypoint thin!** New functionality belongs in `lib/diagnose/`, not `diagnose.ts`. The entrypoint should only handle CLI argument parsing and dispatch to lib functions.

## Current Analyzers

All analyzers in `scripts/lib/diagnose/analyzers/`:

- **stuck** - Repeated actions, waits, twitch counter issues
- **movement** - Oscillation (A-B-A-B patterns), move rate
- **pathing** - Path efficiency, unreachable targets, goal completion
- **exploration** - Stairs discovery, exploration %, frontier stagnation
- **combat** - Damage, kills, retreats, death causes
- **goal** - Goal lifecycle, persistence, type distribution
- **goal-distance** - Short-distance goal thrashing detection
- **oscillation** - Direction reversals, position revisits
- **jitter** - Bot confined to small area (bounding box analysis)
- **frontier** - Frontier reachability, door blocking patterns, goal generation failures
- **stats** - Worker metrics aggregation for parallel batch runs
- **step-debug** - Per-step debugging info for detailed analysis
- **map** - Dungeon map snapshots (ASCII visualization)
- **personality** - Cross-personality comparison (not a standard analyzer)

## Adding a New Analyzer

### Step 1: Create the Analyzer File

Create `scripts/lib/diagnose/analyzers/myanalyzer.ts`:

```typescript
import type { Analyzer, AnalyzerResult, TurnContext, PostTurnContext } from '../types'
import type { GameState } from '../../../../src/game/types'
import type { BotState } from '../../../../src/game/bot/types'

export interface MyAnalyzerConfig {
  threshold: number
}

export class MyAnalyzer implements Analyzer {
  readonly name = 'myanalyzer'
  private config: MyAnalyzerConfig
  private issues: DiagnosticIssue[] = []
  // ... tracking state

  constructor(config: Partial<MyAnalyzerConfig> = {}) {
    this.config = { threshold: 10, ...config }
  }

  onStart(game: GameState, botState: BotState): void {
    // Initialize tracking state
  }

  onTurn(ctx: TurnContext): void {
    // Called before action is processed
    // ctx.game, ctx.botState, ctx.action, ctx.turn
  }

  onPostTurn(ctx: PostTurnContext): void {
    // Called after action is processed
    // ctx.moved, ctx.previousPosition, ctx.previousHP, ctx.previousDepth
  }

  onLevelChange(game: GameState, oldDepth: number, newDepth: number): void {
    // Called when depth changes
  }

  onEnd(game: GameState, reason: EndReason): void {
    // Called when run ends ('death' | 'victory' | 'max_turns' | 'circuit_breaker')
  }

  summarize(): AnalyzerResult {
    return {
      name: this.name,
      metrics: { /* key-value pairs */ },
      issues: this.issues,
      details: [ /* human-readable strings */ ],
    }
  }
}

export function createMyAnalyzer(config?: Partial<MyAnalyzerConfig>): MyAnalyzer {
  return new MyAnalyzer(config)
}
```

### Step 2: Export from Index

Update `analyzers/index.ts`:

```typescript
export { MyAnalyzer, createMyAnalyzer } from './myanalyzer'
export type { MyAnalyzerConfig } from './myanalyzer'

// Add to createAllAnalyzers() if it should run by default
// Add to createAnalyzers() factory map
```

### Step 3: Update CLI

Update `diagnose.ts`:
- Add to `ALL_ANALYZERS` array (if it should run by default)
- Update help text (if it's user-facing)
- Keep the entrypoint thin - complex logic belongs in lib!

## Analyzer Lifecycle

```
onStart()           # Once at run start
  ↓
┌─────────────────┐
│ onTurn()        │  # Before action
│ [action runs]   │
│ onPostTurn()    │  # After action
│ onLevelChange() │  # If depth changed
└────────┬────────┘
         │ (repeat until end)
         ↓
onEnd()             # Once at run end
summarize()         # Generate report
```

## Programmatic Usage

```typescript
import {
  runDiagnosis,
  runDeepDiagnosis,
  runBatchDiagnosis,
  createAllAnalyzers,
  createAnalyzers,
  formatResult,
  comparePersonalities,
} from './lib/diagnose'

// Single run
const result = runDiagnosis({
  seed: 12345,
  personality: 'aggressive',
  maxTurns: 1000,
  analyzers: createAllAnalyzers(),
})

console.log(result.hasErrors)  // Quick check
console.log(formatResult(result))  // Full output

// Deep dive with turn log
const deep = runDeepDiagnosis({ seed: 12345, analyzers: createAllAnalyzers() })
console.log(deep.turnLog)  // Array of TurnLogEntry

// Batch
const batch = runBatchDiagnosis({ runs: 100, personality: 'cautious' })
console.log(batch.aggregateMetrics)
console.log(batch.problemRuns)

// Personality comparison
const compare = comparePersonalities({ runsPerPersonality: 20 })
console.log(compare.distinctiveness.score)
```

## TurnContext Properties

Available in `onTurn()`:
- `ctx.game` - Current GameState
- `ctx.botState` - Current BotState
- `ctx.action` - Action about to execute
- `ctx.turn` - Turn number

## PostTurnContext Properties

Available in `onPostTurn()`:
- All TurnContext properties plus:
- `ctx.moved` - Whether position changed
- `ctx.previousPosition` - Position before action
- `ctx.previousHP` - HP before action
- `ctx.previousDepth` - Depth before action

## EndReason Values

- `'death'` - Character died
- `'victory'` - Killed Morgoth
- `'max_turns'` - Hit turn limit
- `'circuit_breaker'` - Stuck detection triggered

## DiagnosticIssue Format

```typescript
interface DiagnosticIssue {
  severity: 'error' | 'warning'
  message: string
  turn?: number
  data?: Record<string, unknown>
}
```

## Metrics Best Practices

- Use descriptive metric names: `stuckRate`, `avgGoalDistance`
- Include counts and rates where applicable
- Add turn numbers to issues for debugging
- Keep summary concise but informative

## Adding New Modes

When adding specialized modes (like `baseline`, `debug-explore`):

1. **Create a new file** in `lib/diagnose/` (e.g., `baseline.ts`, `debug-explore.ts`)
2. **Export a main function** that handles the mode logic
3. **Import and call** from `diagnose.ts` entrypoint
4. **Update types** if needed in `types.ts`

Example structure for a new mode:

```typescript
// lib/diagnose/mymode.ts
export interface MyModeConfig {
  runs: number
  // ... other config
}

export async function runMyMode(config: MyModeConfig): Promise<void> {
  // Mode implementation here
}
```

Then in `diagnose.ts`:
```typescript
import { runMyMode } from './lib/diagnose/mymode'

// In main() switch statement:
case 'mymode': {
  await runMyMode({ runs: args.runs })
  break
}
```

This keeps the entrypoint focused on CLI parsing and dispatch.
