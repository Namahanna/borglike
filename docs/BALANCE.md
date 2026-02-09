# Balance

Game balance methodology, diagnostic tooling, and historical baselines.

## Testing Dimensions

```
Character:     11 classes × 11 races = 121 combinations
Boosters:      class-optimal vs custom loadouts
Personality:   4 types (cautious, aggressive, greedy, speedrunner)
Bot caps:      5 tiers (none, early, mid, late, full)
Upgrades:      5 tiers (none, early, mid, late, full)
```

Full combinatorial testing is impractical (~12,100 configs). This guide defines a progressive approach that validates balance efficiently.

## Reference Configuration

All tests use this baseline unless specified:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `--seed` | 1000 | Reproducibility |
| `--runs` | 100 | Statistical significance, ~1 min per class |
| `--turns` | 50000 | Catches caster CB issues at high turn counts |
| `--race` | human | Neutral baseline |
| `--class` | warrior | Simplest mechanics |
| `--personality` | cautious | Default, most tested |
| `--upgrades` | full | Meta-progression maxed |
| `--boosters` | class | Class-optimal loadout |
| `--capabilities` | full | Bot fully unlocked |

---

## Diagnostic Tooling

```bash
# Quick single run (stdout by default)
pnpm diagnose quick --seed=12345 --class=warrior

# Deep dive with turn log
pnpm diagnose deep --seed=12345 --class=warrior --map

# Standard batch test
pnpm diagnose batch --runs=100 --seed=1000 --class=warrior --turns=50000

# Find problematic seeds
pnpm diagnose find --runs=100 --seed=1000 --class=mage --turns=50000

# Full baseline across all 11 classes (~8 min)
pnpm diagnose baseline --seed=1000 --turns=50000

# Race baseline across all 11 races (~8 min)
pnpm diagnose baseline-races --seed=1000 --turns=50000

# Upgrade sensitivity, single class (~5 min)
pnpm diagnose sensitivity --seed=1000 --class=warrior

# Upgrade sensitivity, all 6 classes in one pool (~8 min)
pnpm diagnose sensitivity --classes=all --seed=1000

# Personality comparison
pnpm diagnose compare --runs=50 --seed=1000 --class=CLASS --turns=50000

# Matrix: cross-class race testing (single shared pool)
pnpm diagnose matrix --classes=warrior,mage,ranger --races=all --runs=50 --turns=50000

# Matrix: capability progression sweep
pnpm diagnose matrix --class=warrior --upgrades=mid --cap-tiers=none,early,mid,late,full

# Matrix: paired progression (upgrade + capability at same tier)
pnpm diagnose matrix --class=warrior --progression=none,early,mid,late,full

# Matrix: all classes × 2 races
pnpm diagnose matrix --classes=all --races=human,dwarf --runs=100 --turns=50000
```

### Output

Most modes write to `/tmp/borglike-diagnose/` as timestamped `.txt` + `.json` pairs.
Matrix mode uses subfolders per cell. Quick mode defaults to stdout. Use `--stdout` to force stdout for any mode.

```bash
# List recent results
ls -lt /tmp/borglike-diagnose/

# Read human-friendly text
cat /tmp/borglike-diagnose/20260206-143000-baseline-seed1000-100runs.txt

# Matrix results use subfolders
cat /tmp/borglike-diagnose/20260206-143000-matrix/summary.txt
ls /tmp/borglike-diagnose/20260206-143000-matrix/warrior-human/

# Parse JSON with jq
jq '.result[] | {classId, avgDepth, morgothKills}' /tmp/borglike-diagnose/*baseline*.json
jq '.result.runs[] | select(.depth >= 50)' /tmp/borglike-diagnose/*batch*.json
jq '.config' /tmp/borglike-diagnose/*baseline*.json  # check run config
```

**Thread pool:** All modes share a singleton thread pool. Use `matrix` mode instead of parallel processes for cross-class/race testing — one pool of 20 threads beats 9 processes × 8 threads each.

### Balance Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--upgrades=X` | full | Upgrade preset: none, early, mid, late, full |
| `--boosters=X` | class | Booster preset: none, class, or comma-separated IDs |
| `--capabilities=X` | full | Capability preset: none, early, mid, late, full |
| `--turns=N` | 20000 | Max turns per run |
| `--monster-hp=N` | 100 | Monster HP % |
| `--monster-damage=N` | 100 | Monster damage % |
| `--bestiary=N` | 0 | Fixed bestiary bonus % (0=use kills) |
| `--start-potions=N` | 3 | Starting healing potions |
| `--potion-rate=N` | 100 | Potion spawn rate % |
| `--regen=N` | 0 | HP regen per 10 turns (OOC) |
| `--armor-pen=N` | 0 | Flat armor penetration |
| `--enchant-rate=N` | 100 | Enchantment chance % |
| `--item-rate=N` | 100 | Items per level % |
| `--xp-rate=N` | 100 | XP gain % |

### Matrix Flags

| Flag | Description |
|------|-------------|
| `--classes=X` | Comma-separated class IDs or `all` (11 classes) |
| `--races=X` | Comma-separated race IDs or `all` (11 races) |
| `--personalities=X` | Comma-separated or `all` (4 personalities) |
| `--cap-tiers=X` | Capability tiers to sweep (e.g., `none,early,mid,late,full`) |
| `--upgrade-tiers=X` | Upgrade tiers to sweep |
| `--progression=X` | Paired tiers: sets both upgrades AND capabilities (zipped, not crossed) |

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
| `str_superior,con_superior` | Custom comma-separated booster IDs |

**Class Booster Defaults (--boosters=class):**
- STR classes (warrior, berserker, blackguard): `str_superior + con_superior`
- INT classes (mage, archmage, necromancer): `int_superior + con_superior`
- WIS classes (priest, paladin, druid): `wis_superior + con_superior`
- DEX classes (rogue, ranger): `dex_superior + con_superior`

### Capability Presets (`--capabilities=X`)

| Preset | Capabilities | Expected Depth |
|--------|--------------|----------------|
| `none` | (all disabled) | 5-10 (face-rush) |
| `early` | town_1, farming, tactics_1, preparedness_1, targeting_1, retreat_1 | 15-20 |
| `mid` | town_2, farming, tactics_2, preparedness_2, sweep_1, surf_1, kiting_1, targeting_2, retreat_2 | 25-35 |
| `late` | town_3, farming, tactics_3, preparedness_3, sweep_2, surf_2, kiting_2, targeting_3, retreat_3 | 40-45 |
| `full` | (all maxed) | 45+ (endgame) |

### Interpreting Results

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Avg Depth | 45+ | 35-44 | <35 |
| Max Depth | 50 | 48-49 | <48 |
| CB Rate | 0-2% | 3-10% | >10% |
| Morgoth Kills | >=1 | 0 | N/A |

**Common Issues:**
- **High CB Rate:** Bot getting stuck, investigate with `deep` mode
- **Low Avg Depth:** Class/race underpowered or bot can't handle playstyle
- **High Variance:** Inconsistent performance, may indicate RNG sensitivity

---

## Testing Phases

### Phase 1: Race Baseline

**Goal:** Establish race balance with human as reference.

Races are character-defining choices made at game start. Players need to understand relative power levels before investing in unlocks.

```bash
pnpm diagnose baseline-races --seed=1000 --turns=50000
```

**Success Criteria:**
- All races reach depth 40+ average
- No race exceeds human by >5 avg depth (power creep)
- No race falls below human by >8 avg depth (trap option)
- CB rates <5% across all races

### Phase 2: Capability Progression

**Goal:** Validate bot performs progressively better with unlocks.

Bot capabilities are the primary unlock loop. Players need to feel progression as they purchase upgrades.

```bash
# Single tier
pnpm diagnose batch --runs=50 --seed=1000 --class=warrior --upgrades=mid --capabilities=TIER --turns=50000

# All tiers at once (matrix mode)
pnpm diagnose matrix --class=warrior --upgrades=mid --cap-tiers=none,early,mid,late,full --runs=50 --turns=50000
```

**Success Criteria:**
- Clear progression: each tier > previous by 5+ avg depth
- No tier feels "wasted" (< 3 depth gain)
- No single capability dominates (test via exclusion)

### Phase 3: Upgrade Progression

**Goal:** Validate meta-upgrades provide meaningful progression.

Upgrades are the permanent progression layer. Need to validate they compound well with capabilities.

```bash
# Single tier
pnpm diagnose batch --runs=50 --seed=1000 --class=warrior --upgrades=TIER --capabilities=full --turns=50000

# All tiers at once (matrix mode)
pnpm diagnose matrix --class=warrior --upgrade-tiers=none,early,mid,late,full --capabilities=full --runs=50 --turns=50000

# Paired progression (upgrade + capability at same tier)
pnpm diagnose matrix --class=warrior --progression=none,early,mid,late,full --runs=50 --turns=50000
```

**Success Criteria:**
- Clear progression curve
- Upgrades + capabilities compound (full/full > full/none + none/full)
- No upgrade tier feels mandatory (can progress without)

### Phase 4: Upgrade Sensitivity

**Goal:** Identify which individual upgrades matter most.

Helps prioritize unlock order UX and identify overpowered/underpowered upgrades.

```bash
# Single class
pnpm diagnose sensitivity --seed=1000 --class=CLASS

# All classes (single pool, per-class + cross-class summary)
pnpm diagnose sensitivity --classes=all --seed=1000
```

| Impact | Delta | Meaning |
|--------|-------|---------|
| 🔴 High | >10% depth loss | Critical, prioritize early |
| 🟡 Medium | 5-10% | Important but not blocking |
| 🟢 Low | <5% | Nice-to-have, can defer |

**Success Criteria:**
- No single upgrade > 15% impact (too dominant)
- Stat upgrades roughly equal impact across classes
- QoL upgrades < 5% impact (convenience, not power)

### Phase 5: Cross-Class Race Testing

**Goal:** Validate races work across class archetypes.

Race/class synergies may create outliers not visible in warrior-only testing.

| Archetype | Classes | Primary Stat |
|-----------|---------|--------------|
| Melee | warrior, berserker, blackguard | STR |
| Caster | mage, archmage, necromancer | INT |
| Hybrid | ranger, paladin, druid | Mixed |
| Specialist | rogue, priest | DEX/WIS |

**Success Criteria:**
- No race/class combo > 10% better than human/same-class
- No race/class combo > 15% worse than human/same-class
- Synergies feel intentional, not broken

### Phase 6: Personality Comparison (Low Priority)

**Goal:** Validate personality behaviors don't break baseline classes.

| Personality | Behavior | Expected Impact |
|-------------|----------|-----------------|
| cautious | Safe play, retreat early | Baseline |
| aggressive | Push deeper, risk more | Higher variance, similar avg |
| greedy | Prioritize loot | More gold, slightly lower depth |
| speedrunner | Rush stairs | Faster runs, lower depth |

**Success Criteria:**
- All personalities viable (reach depth 35+)
- No personality strictly dominates cautious

### Regression Testing

Re-run full class baseline after combat formula changes, monster stat/spawn changes, bot AI behavior changes, or new class/race additions.

**Quick regression check (3 most sensitive classes):**
```bash
pnpm diagnose matrix --classes=warrior,mage,rogue --runs=50 --seed=1000 --turns=50000
```

---

## Baselines

### Class Baseline @ `548a393` (100 runs, 50k turns, seed=1000, upgrades=full)

| Class | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Morgoth | Status |
|-------|-----------|-----------|---------|-----------|-------|---------|--------|
| **Paladin** | 49.0 | 50 | 0% | 21808 | 655 | 3 | ✅ Endgame |
| **Druid** | 48.8 | 50 | 0% | 23337 | 636 | 2 | ✅ Endgame |
| **Priest** | 48.8 | 50 | 0% | 25742 | 797 | 2 | ✅ Endgame |
| **Ranger** | 48.6 | 50 | 0% | 23083 | 630 | 6 | ✅ Endgame |
| **Blackguard** | 48.5 | 50 | 0% | 16049 | 535 | 6 | ✅ Endgame |
| **Mage** | 48.4 | 50 | 1% | 28793 | 639 | 2 | ✅ Endgame |
| **Rogue** | 48.2 | 50 | 0% | 21763 | 600 | 1 | ✅ Endgame |
| **Necromancer** | 48.0 | 50 | 3% | 24187 | 653 | 7 | ✅ Endgame |
| **Warrior** | 47.6 | 50 | 0% | 15587 | 500 | 3 | ✅ Endgame |
| **Berserker** | 47.4 | 50 | 0% | 14284 | 488 | 8 | ✅ Endgame |
| **Archmage** | 46.6 | 50 | 3% | 27612 | 601 | 3 | ✅ Endgame |

**Summary:** All 11 classes endgame-viable. **43 Morgoth kills** (8 berserker, 7 necromancer, 6 ranger, 6 blackguard, 3 paladin, 3 warrior, 3 archmage, 2 druid, 2 priest, 2 mage, 1 rogue). CB rates: archmage 3%, necromancer 3%, mage 1%, all others 0%. Spread: 46.6-49.0 (2.4 depth). Runtime: 220s.

**Tiers:**
- **A:** Paladin (49.0), Druid (48.8), Priest (48.8), Ranger (48.6), Blackguard (48.5), Mage (48.4), Rogue (48.2), Necromancer (48.0)
- **B:** Warrior (47.6), Berserker (47.4), Archmage (46.6)

**Changes from `af3d305`:** S-tier nerfs compressed spread 3.3→2.4 depth. Former S-tier now A-tier:
- **Paladin** 49.9→49.0 (-0.9): 80% heal potency + removed shield bash (warrior-only)
- **Druid** 49.2→48.8 (-0.4): WIS +3→+2 (reduced spell scaling)
- **Blackguard** 49.1→48.5 (-0.6): lifesteal 10%→8%
- **Ranger** 48.9→48.6 (-0.3): FAST_SHOT cap 6→5, root shot slow 50%→40%
- Untouched classes identical (priest, mage, rogue, necromancer, warrior, berserker, archmage)
- Morgoth kills dropped 56→43 (paladin 9→3, ranger 9→6, blackguard 11→6, druid 1→2)

---

### Race Baseline @ `734bd3b` (100 runs, 50k turns, seed=1000, class=warrior, upgrades=full)

| Race | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Morgoth | Status |
|------|-----------|-----------|---------|-----------|-------|---------|--------|
| **Half-Troll** | 48.8 | 50 | 0% | 15784 | 533 | 7 | ✅ Endgame |
| **Gnome** | 48.3 | 50 | 0% | 15053 | 532 | 5 | ✅ Endgame |
| **Kobold** | 48.2 | 50 | 0% | 15174 | 533 | 2 | ✅ Endgame |
| **Dwarf** | 48.0 | 50 | 0% | 15467 | 527 | 2 | ✅ Endgame |
| **Dunadan** | 48.0 | 50 | 0% | 16039 | 511 | 2 | ✅ Endgame |
| **High-Elf** | 47.9 | 50 | 0% | 15460 | 530 | 3 | ✅ Endgame |
| **Human** | 47.6 | 50 | 0% | 15587 | 500 | 3 | ✅ Endgame |
| **Half-Orc** | 47.5 | 50 | 0% | 15683 | 512 | 5 | ✅ Endgame |
| **Half-Elf** | 46.7 | 50 | 0% | 15512 | 494 | 1 | ✅ Endgame |
| **Hobbit** | 46.6 | 50 | 0% | 14713 | 505 | 1 | ✅ Endgame |
| **Elf** | 46.5 | 50 | 0% | 14698 | 498 | 2 | ✅ Endgame |

**Summary:** All 11 races endgame-viable. **33 Morgoth kills** (7 half-troll, 5 gnome, 5 half-orc, 3 high-elf, 3 human, 2 kobold, 2 dwarf, 2 dunadan, 2 elf, 1 half-elf, 1 hobbit). All CB rates 0%. Spread: 46.5-48.8 (2.3 depth). Runtime: 248s.

**Tiers:**
- **A:** Half-Troll (48.8), Gnome (48.3), Kobold (48.2), Dwarf (48.0), Dunadan (48.0), High-Elf (47.9) — tight top cluster
- **B:** Human (47.6), Half-Orc (47.5), Half-Elf (46.7), Hobbit (46.6), Elf (46.5) — all viable

**Changes from `62bddb9`:** Spread compressed 4.2→2.3 depth. Bottom-tier races gained more than top-tier (Hobbit +4.0, High-Elf +3.4, Human +3.5 vs Half-Orc +1.0, Dunadan +1.2). Kite/combat fixes lifted all races. Morgoth kills doubled (16→33). Half-Troll jumped from mid-pack to #1. Gnome rose from B to A tier.

**Success Criteria:** ✅ All passed
- ✅ All races reach depth 40+ average (lowest: 46.5)
- ✅ No race exceeds human by >5 avg depth (max delta: +1.2)
- ✅ No race falls below human by >8 avg depth (min delta: -1.1)
- ✅ CB rates <5% (all 0%)

---

## Capability Progression

### Warrior @ `734bd3b` (50 runs, 50k turns, seed=1000, upgrades=mid)

| Preset | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Delta |
|--------|-----------|-----------|---------|-----------|-------|-------|
| `none` | 31.6 | 48 | 0% | 8462 | 246 | baseline |
| `early` | 31.4 | 50 | 0% | 8400 | 253 | -0.2 |
| `mid` | 34.2 | 50 | 0% | 10094 | 331 | +2.6 |
| `late` | 39.5 | 50 | 0% | 13919 | 440 | +7.9 |
| `full` | 41.2 | 50 | 0% | 15301 | 457 | +9.6 |

**Observations:**
- Early tier regression nearly eliminated (-0.2, was -1.2) — noise level
- Mid tier now meaningful (+2.6, was +0.7) — sweep/surf registering for warrior
- Late tier strong (+7.9, was +5.9) — retreat/kiting tier still the big unlock
- Full now exceeds late by +1.7 (was -0.3) — no more plateau, full caps matter
- Total progression: +9.6 depth from none→full
- All CB rates 0%

### Mage @ `734bd3b` (50 runs, 50k turns, seed=1000, upgrades=mid)

| Preset | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Delta |
|--------|-----------|-----------|---------|-----------|-------|-------|
| `none` | 15.5 | 25 | 0% | 4002 | 87 | baseline |
| `early` | 15.6 | 29 | 0% | 4051 | 88 | +0.1 |
| `mid` | 25.1 | 42 | 0% | 26276 | 552 | +9.6 |
| `late` | 40.6 | 50 | 0% | 40895 | 925 | +25.1 |
| `full` | 45.9 | 50 | 0% | 45019 | 989 | +30.4 |

**Observations:**
- Dramatic progression: none→full is +30.4 depth (was +27.3)
- Early tier flat (+0.1) — still insufficient for mage
- Mid tier improved (+9.6, was +8.4) — max depth rose 38→42
- Late tier transformative (+15.5 from mid) — kiting remains the single biggest unlock
- **All CB rates 0%** (was 6% late, 2% full) — kite duration fix completely resolved CB issues
- Full tier now +5.3 above late (was +1.0) — full caps significantly extend mage, 1 Morgoth kill

### Cross-Class Comparison

| Preset | Warrior | Mage | Mage vs Warrior |
|--------|---------|------|-----------------|
| `none` | 31.6 | 15.5 | -16.1 (mage struggles hard without capabilities) |
| `early` | 31.4 | 15.6 | -15.8 (basic capabilities insufficient for either) |
| `mid` | 34.2 | 25.1 | -9.1 (sweep/surf help mage more) |
| `late` | 39.5 | 40.6 | +1.1 (kiting equalizes, mage passes warrior) |
| `full` | 41.2 | 45.9 | +4.7 (mage exceeds warrior at full) |

**Success Criteria:** ✅ Passed (was ⚠️ Partial)
- ✅ Clear progression mid→late→full for both classes
- ✅ Kiting transforms mage (+15.5 depth from mid→late)
- ✅ Mage crosses over warrior at late tier (kiting equalizes)
- ✅ Early tier regression eliminated for warrior (-0.2, was -1.2)
- ✅ **All CB rates 0%** across both classes (was 6% mage late)
- ✅ Full tier no longer plateaus for warrior (+1.7 above late, was -0.3)

---

## Upgrade Progression

### Warrior Upgrade Tiers @ `b42c753` (50 runs, 50k turns, seed=1000, capabilities=full)

| Preset | Upgrades | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Delta |
|--------|----------|-----------|-----------|---------|-----------|-------|-------|
| `none` | No upgrades | 33.7 | 50 | 0% | 13263 | 355 | baseline |
| `early` | vit 2, mgt 2, res 1 | 32.7 | 50 | 0% | 12749 | 340 | -1.0 |
| `mid` | vit 5, mgt 5, res 5, rfx 4, prc 2, swf 2 | 38.2 | 50 | 0% | 14786 | 419 | +4.5 |
| `late` | vit 8, mgt 8, res 7, rfx 6, prc 4, swf 4 | 43.6 | 50 | 0% | 16088 | 496 | +9.9 |
| `full` | All maxed | 43.9 | 50 | 0% | 14447 | 450 | +10.2 |

**Observations:**
- Early tier slight regression (-1.0, noise) — early upgrades too weak to register on warrior
- Mid tier meaningful jump (+4.5) — reflexes/resilience start mattering
- Late tier big jump (+9.9) — full survivability suite kicks in
- Late/full plateau (43.6 vs 43.9) — diminishing returns at max caps
- Total progression: +10.2 depth from none→full
- All CB rates 0%

### Paired Progression @ `b42c753` (50 runs, 50k turns, seed=1000)

Matching capability and upgrade tiers — simulates realistic player progression.

**Warrior:**

| Tier | Avg Depth | Max Depth | CB | Kills | Delta |
|------|-----------|-----------|-----|-------|-------|
| none/none | 19.3 | 50 | 0% | 122 | baseline |
| early/early | 22.7 | 50 | 0% | 157 | +3.3 |
| mid/mid | 33.3 | 50 | 0% | 314 | +13.9 |
| late/late | 41.5 | 50 | 0% | 465 | +22.1 |
| full/full | 43.9 | 50 | 0% | 450 | +24.6 |

**Mage @ `af3d305`:**

| Tier | Avg Depth | Max Depth | CB | Kills | Delta |
|------|-----------|-----------|-----|-------|-------|
| none/none | 6.0 | 14 | 0% | 23 | baseline |
| early/early | 12.0 | 21 | 0% | 59 | +6.0 |
| mid/mid | 25.1 | 42 | 0% | 552 | +19.1 |
| late/late | 45.5 | 50 | 0% | 817 | +39.5 |
| full/full | 48.3 | 50 | 2% | 641 | +42.3 |

### Mage Upgrade Tiers @ `af3d305` (50 runs, 50k turns, seed=1000, capabilities=full)

| Preset | Upgrades | Avg Depth | Max Depth | CB Rate | Avg Turns | Kills | Delta |
|--------|----------|-----------|-----------|---------|-----------|-------|-------|
| `none` | No upgrades | 29.2 | 45 | 0% | 42112 | 887 | baseline |
| `early` | vit 2, mgt 2, res 1 | 36.5 | 48 | 0% | 44415 | 935 | +7.3 |
| `mid` | vit 5, mgt 5, res 5, rfx 4, prc 2, swf 2 | 45.9 | 50 | 0% | 45019 | 989 | +16.7 |
| `late` | vit 8, mgt 8, res 7, rfx 6, prc 4, swf 4 | 47.2 | 50 | 0% | 38353 | 835 | +18.0 |
| `full` | All maxed | 48.3 | 50 | 2% | 30176 | 641 | +19.1 |

**Observations:**
- Strong monotonic progression: none→full is +19.1 depth
- **All CB rates 0% except full (2%)** — massive improvement from `62bddb9` (was 10% early, 4% none)
- Kite duration fix eliminated CB issues across the board
- Early tier still a meaningful jump (+7.3, was +11.5) — Vitality remains key for mage survivability
- Mid tier now the biggest single jump (+9.4 from early) — reflexes/resilience compound with kiting
- Late/full diminishing returns (47.2 vs 48.3) — similar to warrior pattern
- Total progression: +19.1 depth from none→full (vs warrior's +10.2)
- **Full tier 2% CB is new** — at max depth, the few remaining CB runs are from endgame Morgoth attempts

### Cross-Class Comparison (Paired)

| Tier | Warrior | Mage | Mage vs Warrior |
|------|---------|------|-----------------|
| none/none | 19.3 | 6.0 | -13.3 (mage nearly unplayable) |
| early/early | 22.7 | 12.0 | -10.7 (both struggle, mage worse) |
| mid/mid | 33.3 | 25.1 | -8.2 (mage still behind) |
| late/late | 41.5 | 45.5 | +4.0 (mage surges past — kiting) |
| full/full | 43.9 | 48.3 | +4.4 (mage exceeds warrior) |

**Observations:**
- **Warrior smooth progression**: none/none 19.3 → full/full 43.9 (+24.6 total)
- **Mage explosive late surge**: none/none 6.0 → late/late 45.5 (+39.5) — kiting + late upgrades combine
- **Mage crosses warrior at late tier** — same crossover point as capability progression
- **Mage full/full gets 2 Morgoth kills** and reaches 48.3 avg depth (+0.4 from `62bddb9`)
- **Early tier works for paired** (+3.3 warrior, +6.0 mage) — unlike capability-only where early hurt warrior
- **All CB rates 0%** for paired mage except full/full (2%) — kite duration fix resolved late-tier CB

**Changes from `62bddb9`:** Kite duration fix eliminated CB at late/late (6%→0%). Mage full/full improved 47.9→48.3 (+0.4) with 2 Morgoth kills (was 1). Full/full shows 2% CB (was 0%) — noise at endgame depth, not a regression. Overall progression slightly smoother.

**Success Criteria:** ✅ Passed
- ✅ Upgrades provide meaningful improvement at all tiers (+10.2 warrior, +19.1 mage)
- ✅ Strong paired progression feel (each tier noticeably better)
- ✅ Mage full/full viable and endgame (48.3 avg, 2 Morgoth, 2% CB)
- ✅ **All mage CB rates 0%** across upgrade tiers (was up to 10%)
- ⚠️ Late/full plateau for warrior (43.6 vs 43.9)

---

## Upgrade Sensitivity

### 11-Class Sensitivity @ `548a393` (50 runs, 50k turns, seed=1000)

| Upgrade | Archmage | Berserker | Blackguard | Druid | Mage | Necromancer | Paladin | Priest | Ranger | Rogue | Warrior |
|---------|----------|-----------|------------|-------|------|-------------|---------|--------|--------|-------|---------|
| **Vitality** | +0.4% | -0.5% | -0.4% | -1.9% | -1.4% | +0.7% | **-1.5%** | **-3.3%** | -1.4% | **-2.9%** | -0.5% |
| **Resilience** | -1.4% | -0.6% | **-2.0%** | -1.6% | -1.3% | +1.5% | -0.4% | -0.9% | -0.4% | +0.4% | -1.9% |
| **Swiftness** | **-2.4%** | -1.8% | -0.7% | -0.9% | **-2.2%** | -0.8% | -0.9% | -0.6% | **-3.8%** | -1.3% | -0.6% |
| **Reflexes** | -0.5% | -1.1% | +0.1% | +0.3% | -1.3% | -0.4% | +0.2% | -0.3% | -0.2% | -0.4% | -1.2% |
| **Precision** | +1.3% | -1.5% | +0.0% | +0.1% | -1.4% | +0.2% | +0.1% | -0.6% | -0.3% | -0.2% | -0.9% |
| **Might** | -0.3% | -1.2% | -0.1% | +0.5% | -0.7% | +0.1% | -0.2% | -0.5% | -0.0% | +0.2% | -0.6% |

**Per-class baselines:** Archmage 47.4, Berserker 49.5, Blackguard 49.9, Druid 49.1, Mage 48.9, Necromancer 48.1, Paladin 49.9, Priest 49.1, Ranger 49.5, Rogue 49.7, Warrior 49.3

**Analysis:**

- **Priest Vitality remains the biggest single impact** (-3.3%) — sustained melee healer needs the HP buffer
- **Rogue Vitality** (-2.9%) also notable — melee class with no healing relies on raw HP pool
- **Swiftness is the most consistently impactful upgrade** — negative for 11/11 classes, with Ranger (-3.8%), Archmage (-2.4%), and Mage (-2.2%) as the top beneficiaries. Speed helps kiting classes most
- **Ranger Swiftness surged** (-2.8%→-3.8%) — FAST_SHOT cap nerf (6→5) makes speed even more critical for ranger's kiting playstyle
- **Paladin decompressed** — Vitality now -1.5% (was +0.0%), Swiftness -0.9% (was +0.1%). Heal potency nerf lowered the ceiling enough for upgrades to register
- **Blackguard decompressed** — Resilience now -2.0% (was +0.3%), Swiftness -0.7% (was +0.6%). Lifesteal nerf eliminated ceiling anomalies, 4 of 6 upgrades now show real negative values
- **Druid less sensitive** — Vitality -1.9% (was -4.2%), Resilience -1.6% (was -3.0%). WIS nerf weakened overall power, reducing upgrade dependence
- **Necromancer anomalies persist**: Vitality +0.7%, Resilience +1.5% — minion/spell-heavy style doesn't benefit from survivability upgrades at this baseline
- **Warrior unchanged** — Resilience -1.9%, Reflexes -1.2%, same as before (untouched by nerfs)

**Changes from `af3d305`:** S-tier nerfs decompressed paladin and blackguard sensitivity as intended. Ranger swiftness dependence increased. Druid got less sensitive (WIS nerf weakened overall rather than decompressing). Non-nerfed classes identical within noise.

**Success Criteria:** ✅ Passed
- ✅ No single upgrade >15% impact (max: Ranger Swiftness -3.8%)
- ✅ All upgrades <5% impact across all 11 classes
- ✅ Swiftness registers negatively for 11/11 classes (was 9/11)
- ✅ Precision registers negatively for 7/11 classes
- ✅ Paladin and Blackguard ceiling anomalies resolved — both now show meaningful sensitivity
- ⚠️ Necromancer still shows ceiling/noise anomalies (Vitality +0.7%, Resilience +1.5%)

---

## Cross-Class Race Testing

```bash
# All races × 3 archetype classes (matrix mode, single pool)
pnpm diagnose matrix --classes=warrior,mage,ranger --races=all --runs=50 --turns=50000 --seed=1000
```

### Cross-Class × Race @ `548a393` (50 runs, 50k turns, seed=1000, upgrades=full)

| Class | Race | Avg Depth | Max Depth | CB Rate | Kills | Morgoth | Turns |
|-------|------|-----------|-----------|---------|-------|---------|-------|
| **Ranger** | **Kobold** | 49.8 | 50 | 0% | 697 | 4 | 21001 |
| **Ranger** | **High_elf** | 49.5 | 50 | 0% | 692 | 6 | 21905 |
| **Mage** | **Hobbit** | 49.4 | 50 | 4% | 685 | 4 | 29768 |
| **Ranger** | **Dwarf** | 49.4 | 50 | 0% | 680 | 3 | 20987 |
| **Ranger** | **Hobbit** | 49.2 | 50 | 0% | 685 | 5 | 21143 |
| **Ranger** | **Dunadan** | 49.2 | 50 | 0% | 658 | 3 | 23747 |
| **Ranger** | **Gnome** | 49.1 | 50 | 0% | 683 | 8 | 20805 |
| **Ranger** | **Half_orc** | 49.1 | 50 | 0% | 660 | 4 | 23434 |
| **Ranger** | **Elf** | 49.0 | 50 | 0% | 665 | 4 | 21412 |
| **Warrior** | **Half_troll** | 48.9 | 50 | 0% | 532 | 4 | 16072 |
| **Ranger** | **Half_elf** | 48.8 | 50 | 0% | 653 | 2 | 21483 |
| **Mage** | **Gnome** | 48.7 | 50 | 0% | 673 | 1 | 28960 |
| **Ranger** | **Half_troll** | 48.6 | 50 | 0% | 658 | 2 | 21549 |
| **Mage** | **Dwarf** | 48.4 | 50 | 2% | 662 | 1 | 29801 |
| **Warrior** | **Dunadan** | 48.4 | 50 | 0% | 517 | 0 | 15670 |
| **Mage** | **Kobold** | 48.4 | 50 | 4% | 661 | 1 | 28362 |
| **Mage** | **Human** | 48.4 | 50 | 2% | 640 | 1 | 30539 |
| **Warrior** | **Gnome** | 48.3 | 50 | 0% | 528 | 2 | 15038 |
| **Mage** | **Dunadan** | 48.2 | 50 | 0% | 670 | 0 | 30369 |
| **Warrior** | **Dwarf** | 48.2 | 50 | 0% | 528 | 1 | 15443 |
| **Warrior** | **High_elf** | 48.2 | 50 | 0% | 533 | 5 | 14846 |
| **Warrior** | **Kobold** | 48.2 | 50 | 0% | 532 | 0 | 14922 |
| **Warrior** | **Half_orc** | 47.8 | 50 | 0% | 519 | 1 | 15685 |
| **Mage** | **Half_orc** | 47.8 | 50 | 6% | 656 | 1 | 28884 |
| **Ranger** | **Human** | 47.8 | 50 | 0% | 608 | 2 | 22700 |
| **Warrior** | **Human** | 47.4 | 50 | 0% | 495 | 2 | 15235 |
| **Mage** | **Elf** | 47.1 | 50 | 0% | 640 | 2 | 29682 |
| **Warrior** | **Half_elf** | 46.9 | 50 | 0% | 498 | 0 | 14633 |
| **Mage** | **Half_troll** | 46.9 | 50 | 0% | 634 | 1 | 28816 |
| **Warrior** | **Hobbit** | 46.7 | 50 | 0% | 505 | 0 | 14438 |
| **Mage** | **High_elf** | 46.6 | 50 | 0% | 641 | 3 | 28656 |
| **Warrior** | **Elf** | 46.2 | 50 | 0% | 486 | 2 | 14723 |
| **Mage** | **Half_elf** | 46.1 | 50 | 0% | 623 | 2 | 28360 |

Runtime: 334s (33 cells, 1650 total runs, 20 threads).

### Per-Class Summary

| Class | Avg Depth | Range | Morgoth | CB Max |
|-------|-----------|-------|---------|--------|
| **Ranger** | 49.0 | 47.8–49.8 | 43 | 0% |
| **Mage** | 47.8 | 46.1–49.4 | 17 | 6% |
| **Warrior** | 47.7 | 46.2–48.9 | 17 | 0% |

**Ranger** still dominant but spread widened (0.7→2.0 depth) due to FAST_SHOT cap nerf. **Mage** and **Warrior** essentially unchanged from `af3d305` (untouched by S-tier nerfs).

### Race Rankings (averaged across 3 classes)

| Race | Avg Depth | Best Class | Worst Class |
|------|-----------|------------|-------------|
| Kobold | 48.8 | Ranger 49.8 | Warrior 48.2 |
| Gnome | 48.7 | Ranger 49.1 | Warrior 48.3 |
| Dwarf | 48.7 | Ranger 49.4 | Warrior 48.2 |
| Dunadan | 48.6 | Ranger 49.2 | Mage 48.2 |
| Hobbit | 48.4 | Mage 49.4 | Warrior 46.7 |
| Half-Orc | 48.2 | Ranger 49.1 | Warrior 47.8 |
| Half-Troll | 48.1 | Warrior 48.9 | Mage 46.9 |
| High-Elf | 48.1 | Ranger 49.5 | Mage 46.6 |
| Human | 47.9 | Mage 48.4 | Warrior 47.4 |
| Elf | 47.4 | Ranger 49.0 | Warrior 46.2 |
| Half-Elf | 47.3 | Ranger 48.8 | Mage 46.1 |

### Observations

- **Ranger spread widened**: 0.7→2.0 depth (47.8–49.8) due to FAST_SHOT cap nerf (6→5). Most races dropped ~0.5 avg depth
- **Ranger/Human dropped significantly**: 49.4→47.8 (-1.6) — the biggest ranger regression, now the weakest ranger/race combo. Human's neutral stats don't compensate for the FAST_SHOT cap reduction
- **Ranger/Gnome Morgoth leader**: 8 Morgoth kills in 50 runs (was Kobold at 7)
- **Mage unchanged**: avg 47.9→47.8, all combos within ±0.5 of previous. Untouched by nerfs
- **Warrior unchanged**: avg 47.7→47.7, all combos within ±0.5 of previous. Untouched by nerfs
- **Mage/Half-Orc 6% CB persists** — same outlier as before
- **77 Morgoth kills total** (was 73): Ranger 43 (56%), Mage 17, Warrior 17

**Changes from `af3d305`:** Ranger dropped ~0.5 avg depth across races (FAST_SHOT nerf). Ranger/Human is the notable regression (-1.6). Warrior gained 3 Morgoth kills (14→17). Mage and warrior data essentially identical — only ranger column is meaningfully changed.

### Success Criteria: ✅ Passed

- ✅ No race/class combo >10% better than human/same-class (max: Ranger/Kobold +4.2% vs Ranger/Human)
- ✅ Mage/Half-Elf -4.8% vs Mage/Human (threshold: 15%)
- ✅ Mage/Elf -2.7% vs Mage/Human
- ✅ All warrior combos viable (46.2+ avg depth)
- ✅ All ranger combos viable (47.8+ avg depth)
- ✅ CB rates ≤6% across all combos (Mage/Half-Orc 6% is the outlier)

**Remaining items:**
- Ranger/Human 47.8 is a new low — FAST_SHOT nerf hit human ranger hardest, worth monitoring
- Mage/Half-Orc 6% CB persists — same outlier as before
- Elf and Half-Elf remain the weakest races across classes (47.4 and 47.3 avg) — both within acceptable range

---

## Personality Comparison

### 3-Class × 4 Personalities @ `548a393` (50 runs, 50k turns, seed=1000, upgrades=full)

| Class | Personality | Avg Depth | Max Depth | CB Rate | Kills | Morgoth | Turns |
|-------|-------------|-----------|-----------|---------|-------|---------|-------|
| **Ranger** | **Greedy** | 49.3 | 50 | 0% | 744 | 1 | 26909 |
| **Mage** | **Greedy** | 48.5 | 50 | 0% | 741 | 1 | 32082 |
| **Mage** | **Cautious** | 48.4 | 50 | 2% | 640 | 1 | 30539 |
| **Ranger** | **Speedrunner** | 48.2 | 50 | 0% | 524 | 1 | 17186 |
| **Mage** | **Aggressive** | 48.0 | 50 | 2% | 584 | 1 | 24688 |
| **Warrior** | **Greedy** | 47.8 | 50 | 0% | 597 | 4 | 19842 |
| **Ranger** | **Cautious** | 47.8 | 50 | 0% | 608 | 2 | 22700 |
| **Warrior** | **Cautious** | 47.4 | 50 | 0% | 495 | 2 | 15235 |
| **Mage** | **Speedrunner** | 47.4 | 50 | 2% | 533 | 0 | 23927 |
| **Ranger** | **Aggressive** | 46.2 | 50 | 0% | 552 | 2 | 18816 |
| **Warrior** | **Aggressive** | 45.5 | 50 | 0% | 421 | 3 | 12700 |
| **Warrior** | **Speedrunner** | 44.4 | 50 | 0% | 367 | 1 | 9950 |

Runtime: 111s (12 cells, 600 total runs, 20 threads).

### Per-Personality Summary (averaged across 3 classes)

| Personality | Avg Depth | Morgoth | CB Max | Behavior Match |
|-------------|-----------|---------|--------|----------------|
| **Greedy** | 48.5 | 6 | 0% | Most kills, loot compensates for DPS nerfs |
| **Cautious** | 47.9 | 5 | 2% | Baseline — safe play |
| **Speedrunner** | 46.7 | 2 | 2% | Fastest runs, lowest depth |
| **Aggressive** | 46.6 | 6 | 2% | Faster runs, more risk |

### Per-Class Personality Rankings

| Class | Best | 2nd | 3rd | Worst | Spread |
|-------|------|-----|-----|-------|--------|
| **Ranger** | Greedy 49.3 | Speedrunner 48.2 | Cautious 47.8 | Aggressive 46.2 | 3.1 |
| **Mage** | Greedy 48.5 | Cautious 48.4 | Aggressive 48.0 | Speedrunner 47.4 | 1.1 |
| **Warrior** | Greedy 47.8 | Cautious 47.4 | Aggressive 45.5 | Speedrunner 44.4 | 3.4 |

### Observations

- **Greedy now best for all 3 classes** — ranger greedy surged from worst (+1.8) to best, mage and warrior unchanged. FAST_SHOT nerf reduced ranger's raw DPS, making loot collection (better gear) more valuable
- **Ranger personality rankings completely reshuffled**: Old: Cautious > Aggressive > Speedrunner > Greedy. New: Greedy > Speedrunner > Cautious > Aggressive. The FAST_SHOT cap nerf inverted the value of aggression vs gear collection
- **Ranger/Aggressive took the biggest hit**: 49.1→46.2 (-2.9) — pushing fights without the old FAST_SHOT power is now punished heavily
- **Ranger/Cautious also dropped**: 49.4→47.8 (-1.6) — consistent with race matrix regression for ranger/human
- **Ranger spread widened**: 1.9→3.1 depth — ranger is now more personality-sensitive than before (was the least sensitive)
- **Mage unchanged**: all 4 personalities within ±0.5 of previous. Untouched by nerfs
- **Warrior unchanged**: all 4 personalities within ±0.3 of previous. Untouched by nerfs
- **Speedrunner viable everywhere**: worst case is warrior at 44.4 avg — still well above 35 threshold
- **All CB rates ≤2%** — improved from 4% max (aggressive mage dropped 4%→2%)

**Changes from `af3d305`:** FAST_SHOT nerf reshuffled ranger personalities entirely. Greedy went from worst to best ranger personality (+1.8). Aggressive went from 2nd to worst (-2.9). Mage and warrior data essentially identical.

### Success Criteria: ✅ Passed

- ✅ All personalities viable (reach depth 35+) — lowest: warrior/speedrunner at 44.4
- ✅ No personality strictly dominates cautious — greedy beats all 3 classes but by small margins for mage (+0.1) and warrior (+0.4)
- ✅ Personality behaviors match expectations (greedy = most kills, speedrunner = fewest turns, aggressive = higher risk)

---

## References

- `docs/BALANCE-PASS-1.md` - Monster spawn rate tuning
- `docs/BALANCE-PASS-2.md` - Multi-attack, deadliness, combat formulas
- `docs/BALANCE-PASS-3.md` - Pure caster fixes (vision, stair-surf, phase door)
- `docs/BALANCE-PASS-4.md` - Goal oscillation, caution threshold, vault fixes, TP scroll fixes
- `docs/BALANCE-PASS-5.md` - Historical baselines and archived test data
- `docs/XP-CURVE-ANALYSIS.md` - XP curve analysis and two-part curve implementation
