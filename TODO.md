# TODO

## Balance


## Future Features
- [ ] Challenge Modifiers (run-based risk/reward)
  - Voluntary handicaps applied per-slot before a run starts, multiplicative essence bonus
  - Examples: "Glass Cannon" (+50% dmg, -50% HP, 1.5x essence), "Famine" (no healing potion spawns, 1.8x),
    "Haste" (monsters +25% speed, 1.3x), "Poverty" (no gold drops, 2x), "Nemesis" (extra unique every 5 floors, 1.4x)
  - Stackable — multiple modifiers multiply rewards but compound difficulty
  - Core decision: evaluate bot capabilities + race/class vs modifier difficulty
  - Makes different race/class/booster combos situationally optimal instead of one-best
  - Data: `ChallengeModifier[]` on SlotConfig, applied as stat/spawn adjustments in engine
  - Essence multiplier calculated at run completion from active modifiers
  - UI: modifier picker in slot config panel, show combined multiplier preview
  - Unlock modifiers progressively (first few free, harder ones gated behind depth/victory milestones)

- [ ] Booster Synergies
  - Certain booster pairs grant bonus effects when equipped together
  - Examples: Weapon+2 + STR Superior = "Crushing Blow" (5% double damage),
    Adrenaline Rush + Second Wind = "Phoenix" (heal triggers at 30% instead of critical)
  - Transforms booster selection from "pick two best" into composition puzzle
  - Data: `SynergyDefinition[]` checked when assembling effective booster effects
  - Later feature — needs enough boosters to make combos interesting

- [ ] Dungeon Variants (expedition choice)
  - Multiple dungeon "biomes" with different risk/reward profiles, player chooses per slot
  - Already have generators (classic, cavern, labyrinth, vaults) — surface as player-facing choice
  - Add thematic variants: "Orc Stronghold" (melee-heavy), "Dragon's Lair" (elemental resist matters),
    "Undead Crypt" (priest/paladin shine), "Moria" (deep 100-floor variant, different item/monster set)
  - Different monster/item tables per variant create real build diversity
  - Pairs well with prestige — unlock new dungeon variants as late-game content
  - Each slot can run a different dungeon, encouraging diverse team compositions

- [ ] Optional tile graphics
  - **Tilesets (pick one or offer choice):**
    - DCSS Tiles — CC0 (public domain), 32x32, 6000+ tiles, best coverage + quality
      - https://github.com/crawl/tiles / https://opengameart.org/content/dungeon-crawl-32x32-tiles
      - Refined evolution of RLTiles, more consistent art style
      - Need to curate ~200 tiles and build spritesheet
    - RLTiles — public domain, 32x32, ~1200 tiles, GitHub mirror has pre-built spritesheet+JSON
      - https://github.com/statico/rltiles (`rltiles-2d.png` + `rltiles-2d.json`)
      - Fastest to prototype (spritesheet ready), inconsistent art (many artists)
    - David Gervais — CC-BY 3.0, 32x32, literally made for Angband
      - Best monster-name match for our 91 monsters, needs extraction from Angband repo
    - DawnLike — CC-BY 4.0, 16x16, 1000+ tiles, very consistent pixel art (one artist)
      - Smaller tiles = more viewport, but less detail. Requires easter egg attribution.
  - **Integration approach:**
    - Expand `GridCell { char, color }` → add optional `tileId?: string`
    - `instance-manager.ts` already has entity context (MonsterTemplate, TileType, etc.) — emit tileId there
    - `DungeonGridCanvas.vue` render(): branch on setting — `drawImage()` vs `fillText()`
    - Settings toggle: ASCII / Tiles (default ASCII)
    - Spritesheet loaded as `HTMLImageElement`, tile map as `Record<string, [x, y]>`
  - **Viewport scaling (the hard problem):**
    - 80×24 at 32px = 2560×768 — way too wide, especially with 4 panels
    - Each panel is ~640px wide → fits ~20 cells at 32px, vs 80 in ASCII
    - Options: reduce viewport in tile mode (30×20), use 16px tiles (40×24), or user zoom slider
    - 16px tiles are probably the sweet spot for 4-panel layout
  - **Tile mapping for 91 monsters:**
    - Key by monster template name (unique) not char+color (ambiguous edge cases)
    - Fallback: render ASCII char if no tile mapping exists (incremental adoption)
    - DCSS/RLTiles cover all standard Angband monster types — mapping is manual but one-time
