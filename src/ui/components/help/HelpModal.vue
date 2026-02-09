<script setup lang="ts">
import PanelFrame from '../common/PanelFrame.vue'

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div class="help-modal">
    <header class="help-header">
      <h2>Borglike</h2>
      <button class="close-btn" @click="emit('close')">✕</button>
    </header>

    <div class="help-content">
      <PanelFrame class="help-section">
        <h3>What is Borglike?</h3>
        <p>
          An idle roguelike inspired by Angband. Watch automated bots descend through 50 floors of a
          dungeon, fighting monsters, collecting loot, and (usually) dying.
        </p>
        <p>
          Each death earns <span class="essence">Essence</span> based on depth reached and monsters
          killed. Deeper runs earn exponentially more. Spend essence on permanent upgrades and
          unlocks to help future runs go deeper.
        </p>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Getting Started</h3>
        <p>
          Your first bot picks a random race and class and dives in. Let it die &mdash; that's the
          point. Spend the essence it earns on upgrades. Close the tab and come back later; the game
          simulates missed time on return.
        </p>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Core Loop</h3>
        <ol>
          <li>
            <strong>Run</strong> &mdash; A bot enters the dungeon with a random build. Unlock
            race/class selection through purchases.
          </li>
          <li><strong>Watch</strong> &mdash; Bots explore, fight, and loot automatically</li>
          <li><strong>Die</strong> &mdash; Death is inevitable (and profitable)</li>
          <li><strong>Earn</strong> &mdash; Gain essence from each run</li>
          <li><strong>Upgrade</strong> &mdash; Buy upgrades and unlock new options</li>
          <li><strong>Repeat</strong> &mdash; Each run goes a little deeper</li>
        </ol>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Upgrades &amp; Unlocks</h3>
        <p>
          Essence buys permanent upgrades: more run slots, smarter bots, race/class selection, and
          more. Equip up to 2 boosters per run for bonus stats, gear, or special effects.
        </p>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Controls</h3>
        <div class="controls-grid">
          <div class="control-item">
            <span class="control-key">Expand (⛶)</span>
            <span class="control-desc">Expand run to detailed view</span>
          </div>
          <div class="control-item">
            <span class="control-key">Turbo (⏩)</span>
            <span class="control-desc">Faster simulation, no cost</span>
          </div>
          <div class="control-item">
            <span class="control-key">Auto (↻)</span>
            <span class="control-desc">Auto-restart on death (upgrade required)</span>
          </div>
          <div class="control-item">
            <span class="control-key">Pause (⏸)</span>
            <span class="control-desc">Pause/resume all runs</span>
          </div>
        </div>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Header Bar</h3>
        <div class="controls-grid">
          <div class="control-item">
            <span class="control-key">≡ History</span>
            <span class="control-desc">Past runs with depth, kills, and essence earned</span>
          </div>
          <div class="control-item">
            <span class="control-key">🏆 Achievements</span>
            <span class="control-desc">Milestones with essence rewards to claim</span>
          </div>
          <div class="control-item">
            <span class="control-key">📖 Bestiary</span>
            <span class="control-desc">Monsters encountered; high kill counts unlock knowledge</span>
          </div>
          <div class="control-item">
            <span class="control-key">📦 Armory</span>
            <span class="control-desc">Equipment discovered across all runs</span>
          </div>
          <div class="control-item">
            <span class="control-key">📜 Codex</span>
            <span class="control-desc">Race and class details with unlock status</span>
          </div>
          <div class="control-item">
            <span class="control-key">⚙ Settings</span>
            <span class="control-desc">Game configuration and display options</span>
          </div>
        </div>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Goal</h3>
        <p>
          Reach floor 50 and defeat <span class="boss">Morgoth, Lord of Darkness</span> to achieve
          victory.
        </p>
      </PanelFrame>
    </div>
  </div>
</template>

<style scoped>
.help-modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 80vh;
  background: var(--panel);
}

.help-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  background: var(--elevated);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.help-header h2 {
  font-size: var(--text-2xl);
  font-weight: bold;
  color: var(--purple);
  margin: 0;
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--highlight);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--red);
  border-color: var(--red);
  color: white;
}

.help-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.help-section {
  padding: var(--space-4) !important;
}

.help-section h3 {
  font-size: var(--text-md);
  color: var(--cyan);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 var(--space-3);
}

.help-section p {
  font-size: var(--text-md);
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0 0 var(--space-2);
}

.help-section p:last-child {
  margin-bottom: 0;
}

.help-section ol {
  margin: 0;
  padding-left: var(--space-5);
  color: var(--text-secondary);
  font-size: var(--text-md);
  line-height: 1.8;
}

.help-section li strong {
  color: var(--text-primary);
}

.essence {
  color: var(--purple);
  font-weight: bold;
}

.boss {
  color: var(--red);
  font-weight: bold;
}

.controls-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.control-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--highlight);
  border-radius: var(--radius-md);
}

.control-key {
  font-size: var(--text-base);
  color: var(--amber);
  min-width: 100px;
}

.control-desc {
  font-size: var(--text-base);
  color: var(--text-secondary);
}
</style>
