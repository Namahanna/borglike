# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Borglike is an idle/incremental game featuring an auto-playing roguelike. Watch up to 4 dungeon runs simultaneously, earn essence from deaths, unlock classes/races, and upgrade bot capabilities.

**Core Concept:** "Angband-lite as idle engine" - TypeScript roguelike designed for auto-play with meta-progression.
**Stack:** Vue 3 + TypeScript + Vite + Pinia + rot.js
**Documentation Level:** Minimal. Code is truth. Document decisions and gotchas only.
**Functional Core:** Separating your code into functional cores and imperative shells makes it more testable, maintainable, and adaptable. The core logic can be tested in isolation, and the imperative shell can be swapped out or modified as needed.

## Commands

```bash
pnpm run dev          # Dev server with HMR
pnpm run build        # Production build (typecheck + vite)
pnpm run preview      # Preview production build

pnpm run check        # Full check: typecheck + lint + format
pnpm run typecheck    # TypeScript check only
pnpm run lint         # ESLint check
pnpm run format       # Prettier write

pnpm run knip         # Find unused exports/dependencies
pnpm diagnose [mode]  # Bot diagnostics (deep, quick, batch, find, baseline)
```

## Tools Available
jq, bun

## Skills

- **`/diagnose`** - Bot diagnostic toolkit for investigating behavior issues. Modes: `deep`, `quick`, `batch`, `find`, `compare`. See `.claude/skills/diagnose/`.

## Path Aliases

```
@/*       → src/*           # General fallback (stores, types, core, engine, ui)
@game/*   → src/game/*      # Core roguelike engine
@bot/*    → src/game/bot/*  # Bot AI module (saves depth: src/game/bot/)
```

**Import rules:**
- `@game/` and `@bot/` for game engine and bot AI: `@game/types`, `@bot/flow`
- `@/` for everything else: `@/stores/progression`, `@/types/progression`, `@/core/formulas`
- Don't use `@/game/types` — use `@game/types` (the specific alias exists for a reason)
- Relative imports fine for same-module siblings: `./types`, `../common/ProgressBar.vue`
- Scripts use aliases too — except worker threads (see `scripts/lib/diagnose/config-parsing.ts`)

**Worker caveat:** Tinypool workers can't resolve path aliases at runtime. Shared code imported by workers must use relative paths for `src/` value imports. Type-only imports are fine (erased at compile time).

## Module Map

```
src/
├── engine/          # Instance manager (multi-run orchestration)
├── game/            # Core roguelike engine (24 root files)
│   ├── bot/         # Angband-inspired auto-player (27 files)
│   ├── dungeon/     # Multiple generators (classic, cavern, labyrinth, vaults) (9 files)
│   └── data/        # Static data (races, classes, monsters, spells, items) (19 files)
├── stores/          # Pinia (progression, runs, persistence, settings, feed) (7 files)
├── core/            # Formulas, run-completion bridge
└── ui/components/   # Vue components (37 total)
```

## Code Rules

**Naming:**
- Functions: `verbNoun` (`createRun`, `handleEvent`)
- Types: PascalCase (`ActiveRun`, `GameEvent`)
- Files: kebab-case.ts, PascalCase.vue
- Stores: `use{Name}Store`

**Must:**
- Type all game state explicitly
- Keep game instances isolated (no shared mutable state)
- Emit events for UI updates (don't poll)

**Must Not:**
- Block main thread (use requestAnimationFrame for heavy work)
- Store full game state in Pinia (only extracted stats)
- Over-engineer the roguelike

**MUST NEVER NOT**
- Git revert or checkout without checking last commit time and diff for other work

## File Size Guidelines
**Based on this philosophy:**
- ❌ 50-150 lines - Too small, ok for index
- ✅ 300-900 lines - Sweet spot for domain module
- ⚠️ 900-1200 lines - Getting large, but OK if well-organized
- ❌ 1500+ lines - Time to split by subdomain
- Organization matters more than size
- For AI codebases, fewer, larger files makes it easier to grasp the codebase and style quickly

## TSDoc Standards
**"Document the why and complex how, not the obvious what"**
- Focus on intent, design decisions, and non-obvious behavior. Keep documentation close to the code it describes.
- Make the tokens worth it, much code documents itself with context.

## Key Constraints

**Two-Layer State:** Full GameState lives in engine, Pinia stores hold extracted display metrics only. One-way flow: engine → stores → Vue.

**Persistence:** IndexedDB primary, localStorage backup on beforeunload. Critical saves immediate, others debounced 500ms.

**No Backwards Compat:** Solo dev project. Break saves, iterate fast, delete dead code.

**Dependency Direction:** `bot/` imports from `game/`, never reverse. AI decisions live in bot; mechanics live in game.

## Documentation

- `docs/ARCHITECTURE.md` - System design and data flow
- `docs/ANGBAND-LITE-DESIGN.md` - Game design (races, classes, balance)
- `docs/BALANCE.md` - Balance methodology, tooling, and baselines
- `docs/PERFORMANCE.md` - Performance profiling and optimization
- `TODO.md` - Current tasks and technical debt

## Git & Release Workflow

**Remotes:**
- `gitea` (primary) - Local Gitea, daily development target, configured as `remote.pushDefault`, full commit history
- `github` (public) - https://github.com/Namahanna/borglike.git, clean snapshot releases only (always 1 orphan commit)

**Architecture:**
```
gitea/main:  [full commits of dev history] → [continuous development]
github/main: [Single orphan commit: "Release v0.1.x"] ← always force-pushed
```

**Daily workflow:**
```bash
git push              # → gitea (default), full history preserved
```

**Release workflow (orphan snapshot):**
```bash
# 1. Bump version on main
pnpm version patch                    # → creates v0.1.x tag on main (gitea history)
git push gitea main --follow-tags     # → push to gitea with tag

# 2. Create clean orphan for github
git checkout --orphan github-release
git add -A
git commit -m "Release v0.1.x"
git push github github-release:main --force

# 3. Push tag and cleanup
git push github v0.1.x
git checkout main
git branch -D github-release
```

**Result:** GitHub always shows single clean snapshot commit, no development history. Tags tell the version story.

**GitHub Pages:** Auto-deploys when tag matching `v*` is pushed (see `.github/workflows/deploy.yml`).

**Agent guidance:**
- Default `git push` always goes to gitea
- NEVER push main branch or development history to github
- When asked to "release" or "publish version", follow the 3-step orphan workflow above
- GitHub is public-facing snapshot only, gitea preserves full lineage

## Versioning

**Single source of truth:** `package.json` version, injected as `__APP_VERSION__` via Vite `define`. Used for save format version, UI display, and exports. Declared in `src/env.d.ts`.

**Save format:** Currently coupled to app version (`SAVE_VERSION = __APP_VERSION__`). Old saves warn on mismatch but still load. No migration system — break saves freely pre-1.0.

## Development Notes

- User runs dev server, HMR applies changes immediately
- Circuit breaker kills stuck bots after 1000 turns on same level
- Depth 0 = Town (safe zone, fixed layout)
- Victory = Kill "Morgoth, Lord of Darkness" at depth 50
