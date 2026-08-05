// Boot: load the save, catch the hero up on the time that passed, show it.
// This file is outside src/sim and src/game, so it is the layer allowed to
// touch the clock, the DOM and storage.
import { loadOrCreate, save as writeSave, saveUnlessChangedExternally, clear } from './storage.js';
import { absorbEvents, resetRun } from './game/state.js';
import { fastForward } from './sim/offline.js';
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
  const { events, report } = fastForward(state, now);
  absorbEvents(state, events);

  if (report.died) {
    state.run.deaths += 1;
    resetRun(state, now);
  }

  writeSave(state);
  render({ fresh, away, events, report });
}

const pct = (a, b) => Math.max(0, Math.min(100, (a / b) * 100));

function describeAway(ms) {
  if (ms < 60000) return 'just now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = ms / 3600000;
  if (hours < 48) return `${hours.toFixed(1)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// What happened while the player was away, in plain words.
function awayReport(events, report) {
  if (report.floors === 0 && report.campedHours === 0) return '';

  const count = (type) => events.filter((e) => e.type === type).length;
  const kills = count('monster_killed');
  const gold = events.filter((e) => e.type === 'gold_found').reduce((n, e) => n + e.amount, 0);
  const chests = count('chest_found');
  const banked = events.filter((e) => e.type === 'banked');
  const bankedValue = Math.round(banked.reduce((n, e) => n + e.value, 0));
  const depthRenown = events.filter((e) => e.type === 'depth_renown').reduce((n, e) => n + e.amount, 0);

  const lines = [];
  if (report.floors) lines.push(`Delved <b>${report.floors}</b> floor${report.floors === 1 ? '' : 's'}.`);
  if (kills) lines.push(`Killed <b>${kills}</b> monster${kills === 1 ? '' : 's'}.`);
  if (gold) lines.push(`Found <b>${gold}</b> 🪙.`);
  if (chests) lines.push(`Turned up <b>${chests}</b> sealed chest${chests === 1 ? '' : 's'}.`);
  if (bankedValue) lines.push(`Banked <b>${bankedValue}</b> Renown at a shrine.`);
  if (depthRenown) lines.push(`Earned <b>${depthRenown}</b> Renown for new depth.`);
  if (report.campedHours >= 0.1) {
    lines.push(`Camped and foraged for <b>${report.campedHours.toFixed(1)}h</b> to restock the larder.`);
  }
  if (report.died) lines.push(`<b>Died.</b> A new hero takes up the pack.`);
  if (report.stopped) lines.push(`Read the odds ahead, banked everything and made camp — alive.`);
  if (report.cappedByLimit) {
    lines.push(`<i>Only the last ${BALANCE.offline.max_hours}h counted; the hero does not delve forever unattended.</i>`);
  }
  return `<div class="card"><h2>While you were away</h2>${lines.map((l) => `<p class="line">${l}</p>`).join('')}</div>`;
}

function render({ fresh, away, events, report }) {
  const h = state.hero;
  const maxRations = BALANCE.hero.start_rations;
  app.innerHTML = `
    <h1>🕳️ Roguidle</h1>
    <p class="sub">${fresh ? 'A new hero shoulders a pack and starts down.' : 'Last seen ' + describeAway(away) + '.'}</p>

    ${awayReport(events, report)}

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
      <div class="stat"><span class="label">Chests waiting</span><span class="value">${state.pendingChests.length}</span></div>
    </div>

    <div class="card">
      <h2>Account</h2>
      <div class="stat"><span class="label">Run</span><span class="value">#${state.run.number}</span></div>
      <div class="stat"><span class="label">Doctrine</span><span class="value">${state.run.doctrine}</span></div>
      <div class="stat"><span class="label">Renown</span><span class="value">${Math.round(state.meta.renown)}</span></div>
      <div class="stat"><span class="label">Deepest ever</span><span class="value">floor ${state.meta.maxDepthEver}</span></div>
      <div class="stat"><span class="label">Deaths</span><span class="value">${state.run.deaths}</span></div>
      <div class="stat"><span class="label">Save version</span><span class="value">${state.version}</span></div>
    </div>

    <div class="row">
      <button id="reload">Reload page</button>
      <button id="skip">Skip ahead 4h</button>
      <button id="reset" class="danger">Delete save</button>
    </div>
    <p class="sub">A floor takes ${BALANCE.offline.minutes_per_floor / 60}h of real time. "Skip ahead" rewinds the
    clock on the save so you can watch a catch-up without waiting.</p>
  `;

  document.getElementById('reload').addEventListener('click', () => location.reload());
  document.getElementById('skip').addEventListener('click', () => {
    state.lastSeenAt -= 4 * 3600000;
    writeSave(state);
    location.reload();
  });
  document.getElementById('reset').addEventListener('click', () => {
    if (confirm('Delete this account and start over?')) {
      clear();
      location.reload();
    }
  });
}

// Write on the way out so a phone backgrounding the tab does not lose time.
window.addEventListener('pagehide', () => {
  if (state) saveUnlessChangedExternally(state);
});

boot();
