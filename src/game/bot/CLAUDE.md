# Bot Module Architecture

Angband-inspired auto-player with goal-based decision making, personality-driven behavior, and class-specific strategies.

## Code Organization Pattern

Each domain module follows this structure:

```
TYPES (if domain-specific)
CONSTANTS
STATE TRANSITIONS   →  enterX, exitX, advanceX, resetX
QUERIES            →  shouldX, isX, findX, getX, countX
GOAL CREATORS      →  getXGoal
HELPERS (private)
```

### Naming Conventions

| Category | Pattern | Examples |
|----------|---------|----------|
| **State Transitions** | `enterXMode`, `exitXMode`, `advanceX`, `resetX` | `enterFarmingMode`, `exitSweepMode`, `resetCorridorFollowing` |
| **Predicates** | `shouldX`, `isX`, `hasX`, `canX` | `shouldFlee`, `isUnderLeveled`, `hasRangedWeapon` |
| **Finders** | `findX`, `getX`, `selectX`, `countX` | `findEscapeRoute`, `getDescentBlocker`, `selectTarget`, `countHealingPotions` |
| **Goal Creators** | `getXGoal` | `getFleeGoal`, `getKillGoal`, `getExploreGoal` |
| **Legacy** | `evaluateX` | Deprecated wrappers, remove when touching file |

### Goal Creator Pattern

```typescript
export function getXGoal(context: BotContext): BotGoal | null {
  const { game, botState } = context

  // 1. Early returns for preconditions
  if (!precondition) return null

  // 2. Find target/calculate values
  const target = findTarget(context)
  if (!target) return null

  // 3. Exit mode if goal completes the mode (pragmatic mutation)
  if (modeComplete) exitXMode(botState)

  // 4. Return goal object
  return {
    type: 'GOAL_TYPE',
    target,
    targetId: target.id ?? null,
    reason: `Descriptive reason`,
    startTurn: game.turn,
  }
}
```

## Module Responsibilities

| Module | Purpose | Key Patterns |
|--------|---------|--------------|
| **progression.ts** | Descent, farming, tether, sweep modes | State machine with 3 modes |
| **combat.ts** | Engagement decisions, target selection | Class-aware scoring, kite vs kill |
| **survival-retreat.ts** | Flee, recover, escape decisions | Personality-driven thresholds |
| **items.ts** | Item evaluation, pickup, equipment | 19 specialized item finders |
| **exploration.ts** | Frontier detection, target selection | Caching, persistence bonus |
| **merchant.ts** | Town shop interactions | Priority buying, tier-aware |
| **preparation.ts** | Depth readiness, consumable requirements | Class-aware level requirements |
| **survival-consumables.ts** | Consumable usage timing | 7-step priority, Morgoth special |
| **spells.ts** | Spell selection and casting | Mana efficiency, AOE targeting |
| **stuck.ts** | Stuck detection and recovery | 6-level twitch system |

## Dependency Hierarchy

```
Low-level (pure mechanics):
  preparation.ts, danger.ts, items.ts, combat.ts, flow.ts

Mid-level (compound decisions):
  exploration.ts, survival-retreat.ts, merchant.ts, spells.ts

High-level (orchestration):
  progression.ts, stuck.ts, survival-consumables.ts, goals.ts, tick.ts
```

Cross-module imports flow downward. Avoid circular dependencies.

## Key Architectural Decisions

**Mode State**: Lives in BotState (`farmingMode`, `sweepMode`, `tetheredOrigin`, etc.). State transitions are explicit functions, not inline mutations.

**Goal Mutations**: Goal creators may call `exitXMode()` when completing a mode. This is pragmatic - the alternative (caller handles all state) adds complexity without benefit.

**Legacy Evaluators**: `evaluateX` functions are deprecated wrappers around `getXGoal`. Remove them when significantly modifying a file.

**Context Usage**: Destructure what you need from BotContext. Pass minimal parameters to pure queries.

## Class-Specific Behavior

| Class Tier | Level Requirement | Special Handling |
|------------|-------------------|------------------|
| TANK (warrior, berserker) | depth - 4 | Berserker ignores retreat |
| MEDIUM (paladin, rogue, ranger) | depth | Standard behavior |
| SQUISHY (mage, necromancer) | depth + 5 | Sweep mode instead of stair-surfing |

## Testing Considerations

- **Queries**: Pure functions, test with mock GameState/BotState
- **Goal Creators**: Test preconditions return null, valid goals returned
- **State Transitions**: Verify state changes, test enter/exit pairs
- **Integration**: Run 4 bots (warrior, mage, rogue, ranger) to verify behavior

## When Modifying This Module

1. Follow the naming conventions above
2. Remove legacy `evaluateX` wrappers when touching a file
3. Keep queries pure when possible
4. Add state transitions for new modes (enter/exit pairs)
5. Document non-obvious thresholds in constants section
