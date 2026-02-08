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
          killed. Spend essence on permanent upgrades and unlocks to help future runs go deeper.
        </p>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Core Loop</h3>
        <ol>
          <li><strong>Setup</strong> &mdash; Pick race, class, boosters, and bot upgrades</li>
          <li><strong>Watch</strong> &mdash; Bots explore, fight, and loot automatically</li>
          <li><strong>Die</strong> &mdash; Death is inevitable (and profitable)</li>
          <li><strong>Earn</strong> &mdash; Gain essence from each run</li>
          <li><strong>Upgrade</strong> &mdash; Buy upgrades and unlock new options</li>
          <li><strong>Repeat</strong> &mdash; Each run goes a little deeper</li>
        </ol>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Slots &amp; Bot Upgrades</h3>
        <p>
          Unlock up to <span class="slots">4 run slots</span> to watch multiple dungeon runs
          simultaneously. Each slot has its own bot that can be upgraded independently.
        </p>
        <p>
          <span class="training">Bot Upgrades</span> unlock smarter behaviors: town visits, resource
          farming, exploration sweeps, retreat tactics, and ranged kiting. Upgrade each slot's bot
          to suit different strategies.
        </p>
      </PanelFrame>

      <PanelFrame class="help-section">
        <h3>Controls</h3>
        <div class="controls-grid">
          <div class="control-item">
            <span class="control-key">Click Run</span>
            <span class="control-desc">Expand to detailed view</span>
          </div>
          <div class="control-item">
            <span class="control-key">Turbo (⏩)</span>
            <span class="control-desc">Speed up simulation</span>
          </div>
          <div class="control-item">
            <span class="control-key">Auto (↻)</span>
            <span class="control-desc">Auto-restart on death</span>
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

.slots {
  color: var(--cyan);
  font-weight: bold;
}

.training {
  color: var(--amber);
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
