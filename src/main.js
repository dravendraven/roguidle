// Boot, screen routing, and the watchable tick loop.
// Outside src/sim and src/game, so this is the layer allowed to touch the
// clock, the DOM and storage.
import { loadOrCreate, save as writeSave, saveUnlessChangedExternally, clear } from './storage.js';
import { absorbEvents, resetRun } from './game/state.js';
import { fastForward, runFromSave, applyRunToSave, runSeedFor } from './sim/offline.js';
import { makeRng } from './sim/rng.js';
import { tick } from './sim/tick.js';
import { BALANCE } from './sim/balance.js';
import { renderFloor, eventLine } from './ui/descent.js';

const app = document.getElementById('app');

let state = null;      // the save
let run = null;        // the live simulation run, only while watching
let rng = null;
let timer = null;
let feed = [];         // recent event lines
let screen = 'camp';
let lastPersistedDepth = 0;
let arrival = null;    // what happened while away, for the camp screen

function boot() {
  const now = Date.now();
  // Seed minted here, not in src/game, because Math.random() is banned there.
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

  arrival = { fresh, away, events, report };
  render();
}

/* ---- the live run ------------------------------------------------------ */

function beginWatching() {
  run = runFromSave(state);
  rng = makeRng(runSeedFor(state));
  if (state.run.rngState !== null && state.run.rngState !== undefined) {
    rng.setState(state.run.rngState);
  }
  lastPersistedDepth = run.depth;
  feed = [];
  screen = 'descent';
  render();
  startTimer();
}

function startTimer() {
  stopTimer();
  timer = setInterval(step, BALANCE.sim.tick_ms_watchable);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function step() {
  if (!run || run.ended) return stopWatchingRun();

  const orders = { doctrine: state.run.doctrine, autoBankEvery: state.run.standingOrder };
  const out = tick(run, orders, rng);

  for (const e of out.events) {
    const line = eventLine(e);
    if (line) feed.push(line);
  }
  if (feed.length > 40) feed = feed.slice(-40);

  // Persist ONLY at floor boundaries. A floor regenerates from its seed, so
  // saving mid-floor and reloading would hand out its gold a second time.
  if (run.depth > lastPersistedDepth) {
    lastPersistedDepth = run.depth;
    persistRun();
  }

  if (run.ended) return stopWatchingRun();
  paintDescent();
}

function persistRun() {
  applyRunToSave(state, run, rng);
  // Watched time is real time: move the clock forward so the offline
  // catch-up does not also pay for the same hours.
  state.lastSeenAt = Date.now();
  writeSave(state);
}

function stopWatchingRun() {
  stopTimer();
  if (!run) return;
  const ended = run.ended;
  const died = run.endReason === 'died';
  persistRun();
  absorbEvents(state, []);
  if (died) {
    state.run.deaths += 1;
    resetRun(state, Date.now());
    writeSave(state);
  }
  if (ended) {
    run = null;
    paintDescent(died ? 'The hero has fallen. A new one shoulders the pack.' : 'The hero has made camp.');
  }
}

function leaveWatching() {
  stopTimer();
  run = null;
  screen = 'camp';
  arrival = null;
  render();
}

/* ---- rendering --------------------------------------------------------- */

const pct = (a, b) => Math.max(0, Math.min(100, (a / b) * 100));

function describeAway(ms) {
  if (ms < 60000) return 'just now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = ms / 3600000;
  if (hours < 48) return `${hours.toFixed(1)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function awayReport(events, report) {
  if (!report || (report.floors === 0 && report.campedHours === 0)) return '';
  const count = (t) => events.filter((e) => e.type === t).length;
  const kills = count('monster_killed');
  const gold = events.filter((e) => e.type === 'gold_found').reduce((n, e) => n + e.amount, 0);
  const chests = count('chest_found');
  const bankedValue = Math.round(
    events.filter((e) => e.type === 'banked').reduce((n, e) => n + e.value, 0)
  );
  const depthRenown = events.filter((e) => e.type === 'depth_renown').reduce((n, e) => n + e.amount, 0);

  const lines = [];
  if (report.floors) lines.push(`Delved <b>${report.floors}</b> floor${report.floors === 1 ? '' : 's'}.`);
  if (kills) lines.push(`Killed <b>${kills}</b> monster${kills === 1 ? '' : 's'}.`);
  if (gold) lines.push(`Found <b>${gold}</b> 🪙.`);
  if (chests) lines.push(`Turned up <b>${chests}</b> sealed chest${chests === 1 ? '' : 's'}.`);
  if (bankedValue) lines.push(`Banked <b>${bankedValue}</b> Renown.`);
  if (depthRenown) lines.push(`Earned <b>${depthRenown}</b> Renown for new depth.`);
  if (report.campedHours >= 0.1) lines.push(`Camped and foraged <b>${report.campedHours.toFixed(1)}h</b>.`);
  if (report.died) lines.push(`<b>Died.</b> A new hero takes up the pack.`);
  if (report.stopped) lines.push(`Read the odds, banked everything and camped — alive.`);
  if (report.cappedByLimit) lines.push(`<i>Only the last ${BALANCE.offline.max_hours}h counted.</i>`);
  return `<div class="card"><h2>While you were away</h2>${lines.map((l) => `<p class="line">${l}</p>`).join('')}</div>`;
}

function render() {
  if (screen === 'descent') return paintDescent();
  paintCamp();
}

function paintCamp() {
  const h = state.hero;
  const maxRations = BALANCE.hero.start_rations;
  app.innerHTML = `
    <h1>🕳️ Roguidle</h1>
    <p class="sub">${arrival && arrival.fresh ? 'A new hero shoulders a pack and starts down.'
      : arrival ? 'Last seen ' + describeAway(arrival.away) + '.' : 'At camp.'}</p>

    ${arrival ? awayReport(arrival.events, arrival.report) : ''}

    <button id="watch" class="primary wide">▶ Watch the descent</button>

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
    </div>

    <div class="row">
      <button id="skip">Skip ahead 4h</button>
      <button id="reset" class="danger">Delete save</button>
    </div>
  `;

  document.getElementById('watch').addEventListener('click', beginWatching);
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

function paintDescent(notice) {
  const h = run ? run.hero : state.hero;
  const depth = run ? run.depth : state.hero.floor;
  const carried = run ? run.carried : state.hero.carried;
  const running = !!timer;

  app.innerHTML = `
    <div class="hud">
      <button id="back" class="ghost">‹ camp</button>
      <span class="hud-item">🌀 <b>${depth}</b></span>
      <span class="hud-item">❤️ <b>${h.hp}</b>/${h.maxHp}</span>
      <span class="hud-item">🍖 <b>${h.rations}</b></span>
      <span class="hud-item">🪙 <b>${carried.gold}</b></span>
    </div>

    ${notice ? `<p class="notice">${notice}</p>` : ''}
    ${renderFloor(run)}

    <div class="row">
      <button id="toggle" ${run ? '' : 'disabled'}>${running ? '⏸ pause' : '▶ resume'}</button>
      <span class="sub small">a tick every ${BALANCE.sim.tick_ms_watchable}ms</span>
    </div>

    <div class="card feed">
      <h2>Chronicle</h2>
      <div id="feedlines">${feed.slice(-14).map((l) => `<div class="line ${l.cls || ''}">${l.text}</div>`).join('')
        || '<div class="line sub">the descent begins…</div>'}</div>
    </div>
  `;

  document.getElementById('back').addEventListener('click', leaveWatching);
  const toggle = document.getElementById('toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (timer) { stopTimer(); } else { startTimer(); }
      paintDescent(notice);
    });
  }
  const lines = document.getElementById('feedlines');
  if (lines) lines.scrollTop = lines.scrollHeight;
}

/* ---- lifecycle --------------------------------------------------------- */

window.addEventListener('pagehide', () => {
  stopTimer();
  if (state) saveUnlessChangedExternally(state);
});

// Pause when the tab is hidden; a phone locking its screen should not spend
// the hero's rations in the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTimer();
});

boot();
