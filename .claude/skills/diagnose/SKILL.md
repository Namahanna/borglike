---
name: diagnose
description: Investigate bot behavior issues. Use when user mentions "stuck", "oscillating", "jittering", performance problems, or wants to analyze/debug bot runs.
---

# Bot Diagnostic Toolkit

Unified CLI for investigating bot behavior issues in Borglike. Replaces 35+ individual diagnostic scripts with a single entry point.

## Two Testing Contexts

**CRITICAL: Understand which context you're working in to avoid misleading results.**

| Context | Turns | Runs | Purpose | When to Use |
|---------|-------|------|---------|-------------|
| **Standard** | 20k | 50 | Bug hunting, quick iteration | Finding/fixing specific bugs |
| **Baseline** | 50k | 100 | Balance tracking, regression detection | Measuring overall health |

### Why This Matters

**CB rates scale with turn count.** A bot that looks healthy at 20k turns may show problems at 50k:

```
Necromancer @ 20k turns: 10% CB rate  ← looks OK
Necromancer @ 50k turns: 20% CB rate  ← actual baseline issue
```

### Matching Settings

When investigating a baseline issue, **use baseline settings**:

```bash
# WRONG - uses 20k turns, won't reproduce baseline CB
pnpm diagnose batch --seed=1000 --class=necromancer

# RIGHT - matches baseline's 50k turns
pnpm diagnose batch --seed=1000 --class=necromancer --turns=50000
```

### Default Settings (same for both contexts)

All modes share these defaults:
- `--upgrades=full` (all upgrades at max)
- `--boosters=class` (primary stat + CON)
- `--capabilities=full` (all bot features enabled)
- `--seed` defaults to `Date.now()` (random) - **always specify for reproducibility**

The ONLY difference between standard and baseline is turn count and run count.

## Pre-Run Checklist

**Follow these steps before every diagnostic run.**

### 1. Verify Flag Syntax

Never guess flag names. If unsure, check the source:

```bash
# Confirm exact flag syntax before running
pnpm diagnose --help
```

Known gotchas:
- `--upgrades=none` NOT `--no-upgrades`
- `--capabilities=full` NOT `--all-capabilities`
- `--seed=N` NOT positional `N`

### 2. Sanity Check Before Full Suite

Run a small trial first to confirm the configuration is taking effect:

```bash
# WRONG - jump straight to 100 runs
pnpm diagnose batch --seed=1000 --runs=100 --capabilities=none

# RIGHT - verify with a small run first, check output looks sane
pnpm diagnose batch --seed=1000 --runs=5 --capabilities=none
# Check: are capabilities actually disabled? Does output shape look right?
# Then run the full suite
pnpm diagnose batch --seed=1000 --runs=100 --capabilities=none
```

What to check in the sanity run:
- Configuration section confirms your flags took effect
- Output format matches expectations (not empty, not erroring)
- Results are plausible (e.g., `--capabilities=none` should show worse performance than `--capabilities=full`)

### 3. Separate Data from Interpretation

When presenting diagnostic results, **always separate what you observed from what you conclude**:

```
## Observations (data)
- Necromancer CB rate: 18% at 50k turns (baseline was 12%)
- CB runs cluster at depths 15-20
- All CB runs show farming goal stuck for 800+ turns

## Interpretation (may be wrong)
- Likely cause: farming goal not releasing at deeper depths
- Could also be: monster density too high for caster at those depths
- Confounding factor: diagnose.ts capability passthrough bug was present in last baseline
```

Rules:
- State raw numbers before drawing conclusions
- Flag when results might have confounding causes (bugs in the diagnostic tool itself, wrong flags, different seed sets)
- If two explanations fit the data, present both — don't pick one and overstate confidence
- Note when a result contradicts expectations — that's often a sign the test setup is wrong, not the code

## Seeds and Determinism

**The game engine is fully deterministic.** Given identical inputs (seed, race, class, personality, upgrades, balance), a run produces identical output every time. This enables:

- **Reproducibility**: Re-run the exact scenario that caused a bug, turn by turn
- **A/B testing**: Compare code changes on identical seed sets
- **Regression detection**: Known-good seeds that break indicate regressions

### Seed Generation in Batch Modes

Batch modes (`batch`, `find`, `compare`) generate sequential seeds from a starting point:

```
--seed=1000 --runs=5  →  seeds: 1000, 1001, 1002, 1003, 1004
```

Without `--seed`, the start is `Date.now()` — different each run. For reproducible A/B testing, always specify `--seed`:

```bash
# Before code change — results written to /tmp/borglike-diagnose/
pnpm diagnose batch --seed=1000 --runs=100

# After code change — compare the .json files
pnpm diagnose batch --seed=1000 --runs=100

# Or force stdout for manual diff:
pnpm diagnose batch --seed=1000 --runs=100 --stdout > before.txt
# (make changes)
pnpm diagnose batch --seed=1000 --runs=100 --stdout > after.txt
diff before.txt after.txt
```

## Diagnostic Workflow

### Standard Bug Hunting (20k turns)

1. **`find`** discovers problematic seeds
   ```bash
   pnpm diagnose find --runs=100 --seed=1000
   ```
2. **`deep`** analyzes a specific seed turn-by-turn
   ```bash
   pnpm diagnose deep --seed=<problem-seed> --map
   ```
3. Fix code, re-run **`deep`** on same seed to verify

### Investigating Baseline Issues (50k turns)

When baseline shows a problem (e.g., high CB rate):

1. **Reproduce with matching settings**:
   ```bash
   pnpm diagnose batch --seed=1000 --runs=50 --class=necromancer --turns=50000
   ```
2. **Find specific CB seeds**:
   ```bash
   pnpm diagnose batch ... 2>&1 | grep circuit_breaker
   ```
3. **Deep dive with same turn count**:
   ```bash
   pnpm diagnose deep --seed=<cb-seed> --class=necromancer --turns=50000 --from=45000 --to=50000
   ```

## Quick Reference

```bash
pnpm diagnose [mode] [options]
```

### Modes

| Mode | Purpose | Example |
|------|---------|---------|
| `deep` | Full turn-by-turn analysis | `deep --seed=1768965560201 --map` |
| `quick` | Summary metrics only | `quick --seed=1768965560201` |
| `batch` | Aggregate statistics across runs | `batch --runs=100 --seed=1000` |
| `find` | Search for problematic seeds | `find --runs=100 --seed=1000` |
| `compare` | Compare across personalities | `compare --runs=20 --seed=1000` |
| `baseline` | Full baseline across all 11 classes | `baseline` (100 runs, 50k turns per class) |
| `baseline-races` | Full baseline across all 11 races | `baseline-races --class=warrior` |
| `sensitivity` | Test per-upgrade impact | `sensitivity --class=warrior` or `sensitivity --classes=all` |
| `matrix` | Cartesian product of classes/races/tiers | `matrix --classes=warrior,mage --races=all` |

### Seed Syntax

**Always use `--seed=N` flag syntax** (not positional arguments):

```bash
# Correct
pnpm diagnose deep --seed=1768965560201 --map
pnpm diagnose batch --seed=1000 --runs=100

# Wrong - don't use positional seeds
pnpm diagnose deep 1768965560201 --map
```

### Common Options

```
--seed=N          Specific seed to test
--turns=N         Max turns per run (default: 20000)
--runs=N          Runs for batch/find/compare (default: 50)
--threads=N       Worker threads (default: 8)
--personality=P   cautious|aggressive|greedy|speedrunner
--class=ID        warrior|mage|rogue|priest|ranger|paladin|necromancer|berserker|archmage|druid|blackguard
--race=ID         human|dwarf|elf|half_elf|hobbit|gnome|half_orc|half_troll|dunadan|high_elf|kobold
--map             Include ASCII map (explored tiles)
--full-map        Include full map (all tiles revealed)
--from=N          Start turn for output (deep mode)
--to=N            End turn for output (deep mode)
--log-only        Only turn log, skip analyzers (deep mode)
--upgrades=X      Upgrade preset (default: full)
                  Values: none, early, mid, late, full
--boosters=X      Booster preset (default: class)
                  Values: none, class (primary stat + CON), or comma-separated IDs
                  IDs: str_superior, con_superior, int_superior, etc.
--exclude-upgrade=X,Y  Exclude specific upgrades (isolation testing)
--capabilities=X  Bot capabilities (default: full)
                  Values: none, early, mid, late, full, or comma-separated IDs
                  IDs: town,farming,tactics,preparedness_1-3,sweep_1-3,surf_1-3,kiting_1-3,targeting_1-3,retreat_1-3
--randomize       Randomize race/class/personality per run
--races           Compare races instead of personalities (compare mode)
--races=a,b,c     Compare specific races (e.g., --races=human,dwarf,elf)
--stdout          Force stdout output (skip file writing)
--output=DIR      Custom output directory (default: /tmp/borglike-diagnose)

Matrix Options:
--classes=X       Comma-separated class IDs or 'all' (default: --class value)
--races=X         Comma-separated race IDs or 'all' (in matrix mode)
--personalities=X Comma-separated or 'all' (default: --personality value)
--cap-tiers=X     Capability tiers to sweep (e.g., none,early,mid,late,full)
--upgrade-tiers=X Upgrade tiers to sweep
--progression=X   Paired tiers: sets BOTH upgrades AND capabilities (zipped, not crossed)
```

## File Output

Most modes write results to `/tmp/borglike-diagnose/` as `.txt` + `.json` files by default. Progress bars stay on stdout; final results go to files. Matrix mode uses subfolders per cell.

```
Output (batch/baseline/etc):
  /tmp/borglike-diagnose/20260205-1430-baseline-human.txt
  /tmp/borglike-diagnose/20260205-1430-baseline-human.json

Output (matrix):
  /tmp/borglike-diagnose/20260206-1430-matrix/
    summary.txt          # comparison table
    summary.json         # machine-readable config + cell summaries
    warrior-human/       # subfolder per cell (only varying dims in name)
      batch.txt
      batch.json
    mage-human/
      batch.txt
      batch.json
```

**Per-mode defaults:**

| Mode | Default Output |
|------|---------------|
| `quick` | stdout (small, interactive) |
| `matrix` | subfolder tree in `/tmp/borglike-diagnose/` |
| All others | file output to `/tmp/borglike-diagnose/` |

**Flags:**
- `--stdout` -- Force all output to stdout (old behavior, no files written)
- `--output=DIR` -- Custom output directory

**JSON structure:** All `.json` files include a standard envelope:
```json
{
  "mode": "baseline",
  "timestamp": "2026-02-05T14:30:00.000Z",
  "config": { "runs": 100, "turns": 50000, "seed": 1000, ... },
  "result": [ ... ]
}
```

The `result` field contains the structured data for the mode (e.g., `BaselineResult[]` for baseline, summary object for batch). Use this for programmatic parsing instead of regex on the `.txt` file.

**Reading results:** Use `Read` tool or jq on the `.json` file for structured data, or `.txt` for human-readable output with copy-paste markdown tables.

## Common Pitfalls

> **See also: Pre-Run Checklist above.** These pitfalls are why the checklist exists.

### Pitfall 1: Testing with wrong turn count
```bash
# You see baseline CB rate of 20%
# You run this and get 5% - "fixed!"
pnpm diagnose batch --seed=1000 --class=necromancer  # 20k turns

# But the fix is illusory - 20k ≠ 50k baseline
# Always match: --turns=50000
```

### Pitfall 2: Comparing different seeds
```bash
# Run A (no --seed, uses Date.now())
pnpm diagnose batch --runs=50

# Run B (different random seeds!)
pnpm diagnose batch --runs=50

# These test DIFFERENT scenarios - not comparable!
# Always specify: --seed=1000
```

### Pitfall 3: Forgetting class-specific behavior
```bash
# Warrior at depth 20 is fine
# Necromancer at depth 20 might be underleveled (caster penalty)
# Always test the specific class showing issues
```

## Additional Workflows

**💡 For detailed navigation tips, grep patterns, and filtering strategies, see `references/navigation.md`**

### Comparing Bot Behavior

Compare performance across all personalities:
```bash
pnpm diagnose compare --runs=50 --seed=1000
```

### Running a Full Baseline

Generate baseline metrics for all 11 classes (100 runs, 50k turns each):
```bash
pnpm diagnose baseline
```

Output includes a markdown table ready to paste into `docs/BALANCE.md`.

### Matrix Mode

Run cartesian products of classes/races/tiers through a shared thread pool. Replaces running multiple parallel `batch` processes.

```bash
# Cross-class race testing (replaces 9 parallel batch commands)
pnpm diagnose matrix --classes=warrior,mage,ranger --races=all --runs=50 --turns=50000

# Capability progression sweep
pnpm diagnose matrix --class=warrior --upgrades=mid --cap-tiers=none,early,mid,late,full

# Paired progression (upgrade + capability at same tier, zipped not crossed)
pnpm diagnose matrix --class=warrior --progression=none,early,mid,late,full

# Quick regression check
pnpm diagnose matrix --classes=warrior,mage,rogue --runs=50 --seed=1000 --turns=50000
```

Output: subfolder tree with `summary.txt` + per-cell `batch.txt`/`batch.json`. Use `--stdout` for console output.

### Sensitivity Mode

Test per-upgrade impact on performance. Runs baseline (all upgrades maxed), then excludes each upgrade one at a time to measure its contribution.

```bash
# Single class
pnpm diagnose sensitivity --seed=1000 --class=warrior

# All classes in one pool (~8 min, 20 threads default)
pnpm diagnose sensitivity --classes=all --seed=1000

# Specific classes
pnpm diagnose sensitivity --classes=warrior,mage,rogue --seed=1000
```

Multi-class runs use pool-based parallelism (same as matrix mode) — all work items across all classes are submitted to a single thread pool. Output includes per-class tables and a cross-class summary showing each upgrade's impact across all tested classes.

Output: per-class `.txt`/`.json` files + combined summary for multi-class runs. Uses `--classes` flag (same as matrix mode).

## Analyzers

| Name | Detects |
|------|---------|
| `stuck` | Repeated actions, waits, twitch counter, no-move streaks |
| `movement` | Oscillation (A-B-A-B), loops, move rate |
| `pathing` | Path efficiency, unreachable targets, goal completion |
| `exploration` | Stairs discovery, exploration %, frontier stagnation |
| `combat` | Damage, kills, retreats, death causes |
| `goal` | Goal lifecycle, persistence, type distribution |
| `goal-distance` | Short-distance goal thrashing |
| `oscillation` | Direction reversals, position revisits |
| `jitter` | Bot confined to small area (bounding box) |
| `frontier` | Frontier reachability, door blocking, goal generation failures |
| `stats` | Worker metrics aggregation (internal use) |
| `step-debug` | Per-step debugging info (internal use) |
| `map` | Dungeon map snapshots |

## Turn Log Format

Actions include contextual details:
- `move:n`, `move:sw` - direction
- `attack:Floating Eye`, `ranged_attack:Kobold` - target
- `use:Potion of Cure Light Wounds` - item name
- `cast:fireball` - spell ID

Flags: `[MOVED]`, `[DAMAGE]`, `[DESCENDED]`, `[STUCK:N]`

## Issue Severity

- **error**: Critical (circuit breaker, death, unreachable stairs)
- **warning**: Potential issue (high stuck rate, oscillation, jitter)

Results include `hasErrors` and `hasWarnings` for quick checks.

## Balance Testing

Override balance parameters for testing:
```bash
pnpm diagnose batch --runs=100 \
  --monster-hp=80 --monster-damage=90 \
  --potion-rate=120 --upgrades=full --boosters=class
```

### Upgrade Presets (`--upgrades=X`)

| Preset | Upgrades |
|--------|----------|
| `none` | No upgrades |
| `early` | vitality 2, might 2, resilience 1 |
| `mid` | vitality 5, might 5, resilience 5, reflexes 4, precision 2, swiftness 2 |
| `late` | vitality 8, might 8, resilience 7, reflexes 6, precision 4, swiftness 4 |
| `full` | All upgrades at max level |

### Booster Presets (`--boosters=X`)

| Preset | Description |
|--------|-------------|
| `none` | No boosters |
| `class` | Primary stat (superior) + CON (superior) based on class |

**Class defaults (--boosters=class):**
- STR classes (warrior, berserker, blackguard): str_superior + con_superior
- INT classes (mage, archmage, necromancer): int_superior + con_superior
- WIS classes (priest, paladin, druid): wis_superior + con_superior
- DEX classes (rogue, ranger): dex_superior + con_superior

### Balance Overrides

Tier 1: `--monster-hp`, `--monster-damage`, `--start-potions`, `--potion-rate`, `--regen`, `--armor-pen`
Tier 2: `--enchant-rate`, `--item-rate`, `--levelup-hp`
Tier 3: `--xp-rate`, `--upgrade-power`, `--bestiary`

## Extending the Toolkit

**Want to add a new analyzer or mode?** See `references/extending.md` for the complete guide on:
- Adding new analyzers with full lifecycle hooks
- Code structure and best practices
- Programmatic usage patterns
- Integrating new functionality into the CLI

The diagnostic toolkit is designed to be extended. All new functionality should be added to `scripts/lib/diagnose/` rather than the entrypoint.

## Additional Resources

### Reference Files

For detailed documentation:
- **`references/extending.md`** - Adding analyzers, modes, code structure, lifecycle hooks (read this first when extending!)
- **`references/navigation.md`** - Grep patterns, turn ranges, and workflow examples for navigating diagnostic output
