// Boot: load (or create) the save, show it, keep it written down.
// This file is outside src/sim and src/game, so it is the layer allowed to
// touch the clock, the DOM and storage.
import { loadOrCreate, save as writeSave, saveUnlessChangedExternally, clear } from './storage.js';
import { BALANCE } from './sim/balance.js';

const app = document.getElementById('app');
let state = null;

function boot() {
  const now = Date.now();
  // The account seed is minted here, not in src/game, because Math.random()
  // is banned there. Time-based is plenty for "a seed nobody else has".
  const seed = (now ^ (now >>> 9) ^ 0x9e3779b9) >>> 0;
  const { state: loaded, fresh } = loadOrCreate(now, seed);
  state = loaded;

  const away = now - state.lastSeenAt;
  state.lastSeenAt = now;
  writeSave(state);

  render(fresh, away);
}

function pct(a, b) {
  return Math.max(0, Math.min(100, (a / b) * 100));
}

function describeAway(ms) {
  if (ms < 60000) return 'just now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = ms / 3600000;
  if (hours < 48) return `${hours.toFixed(1)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function render(fresh, awayMs) {
  const h = state.hero;
  const maxRations = BALANCE.hero.start_rations;
  app.innerHTML = `
    <h1>🕳️ Roguidle</h1>
    <p class="sub">${fresh ? 'A new hero shoulders a pack and starts down.' : 'Last seen ' + describeAway(awayMs) + '.'}</p>

    <div class="card">
      <h2>The hero</h2>
      <div class="stat"><span class="label">Floor</span><span class="value">${h.floor}</span></div>
      <div class="stat"><span class="label">Level</span><span class="value">${h.level}</span></div>
      <div class="stat"><span class="label">Health</span><span class="value">${h.hp} / ${h.maxHp}</span></div>
      <div class="bar hp"><span style="width:${pct(h.hp, h.maxHp)}%"></span></div>
      <div class="stat"><span class="label">Rations</span><span class="value">${h.rations}</span></div>
      <div class="bar rations"><span style="width:${pct(h.rations, maxRations)}%"></span></div>
    </div>

    <div class="card">
      <h2>Pack</h2>
      <div class="stat"><span class="label">Gold carried</span><span class="value">${h.carried.gold} 🪙</span></div>
      <div class="stat"><span class="label">Greed stacks</span><span class="value">${h.carried.greedStacks}</span></div>
      <div class="stat"><span class="label">Sealed chests</span><span class="value">${state.pendingChests.length}</span></div>
    </div>

    <div class="card">
      <h2>Account</h2>
      <div class="stat"><span class="label">Run</span><span class="value">#${state.run.number}</span></div>
      <div class="stat"><span class="label">Doctrine</span><span class="value">${state.run.doctrine}</span></div>
      <div class="stat"><span class="label">Renown</span><span class="value">${Math.round(state.meta.renown)}</span></div>
      <div class="stat"><span class="label">Deepest ever</span><span class="value">floor ${state.meta.maxDepthEver}</span></div>
      <div class="stat"><span class="label">Save version</span><span class="value">${state.version}</span></div>
    </div>

    <div class="row">
      <button id="reload">Reload page</button>
      <button id="reset" class="danger">Delete save</button>
    </div>
  `;

  document.getElementById('reload').addEventListener('click', () => location.reload());
  document.getElementById('reset').addEventListener('click', () => {
    if (confirm('Delete this account and start over?')) {
      clear();
      location.reload();
    }
  });
}

// Write on the way out so a phone backgrounding the tab does not lose time.
window.addEventListener('pagehide', () => {
  if (state) {
    state.lastSeenAt = Date.now();
    saveUnlessChangedExternally(state);
  }
});

boot();
