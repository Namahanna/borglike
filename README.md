# Borglike

Idle/incremental game featuring an auto-playing roguelike.

**Play now:** https://namahanna.github.io/borglike

## What is this?

Watch AI-controlled adventurers explore a 50-level dungeon inspired by Angband.
Earn essence from deaths, unlock races and classes, upgrade bot capabilities,
and run up to 4 simultaneous dungeon crawls.

## Features
- Auto-playing roguelike with class-specific AI (11 classes, 14 races)
- Multi-instance: 4 concurrent dungeon runs
- Meta-progression: essence → upgrades → better runs
- Prestige system with multipliers and prestige races
- 50-level dungeon with vaults, merchants, altars, traps
- 21 spells across 4 schools
- Sophisticated bot AI: pathfinding, danger assessment, kiting, farming

## Development
```bash
pnpm install
pnpm run dev      # http://localhost:5173
```

## Tech Stack
Vue 3 + TypeScript + Vite + Pinia + rot.js

## License
MIT
