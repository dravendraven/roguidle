// Boot, screen routing, and the watchable tick loop.
// Outside src/sim and src/game, so this is the layer allowed to touch the
// clock, the DOM and storage.
import { loadOrCreate, save as writeSave, saveUnlessChangedExternally, clear } from './storage.js';
import { absorbEvents, resetRun } from './game/state.js';
import { rollChestOptions, describeGear, equipmentBonuses, SLOTS } from './game/gear.js';
import { fastForward, runFromSave, applyRunToSave, runSeedFor, atFloorBoundary } from './sim/offline.js';
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
let openChest = null;  // the chest whose three choices are on screen

function boot() {
  const now = Date.now();
  // Seed minted here, not in src/game, because Math.random() is banned there.
  const seed = (now ^ (now >>> 9) ^ 0x9e3779b9) >>> 0;
  const { state: loaded, fresh } = loadOrCreate(now, seed);
  state = loaded;

  // Deliberately NOT resolved on boot. Time earned while away is a backlog
  // the player can either watch happen or settle instantly — the sim is
  // deterministic and floor-granular, so both produce the identical hero.
  arrival = { fresh, away: now - state.lastSeenAt };
  writeSave(state);
  render();
}

function catchUpNow() {
  const now = Date.now();
  const { events, report } = fastForward(state, now);
  absorbEvents(state, events);
  if (report.died) {
    state.run.deaths += 1;
    resetRun(state, now);
  }
  writeSave(state);
  arrival = { fresh: false, away: arrival ? arrival.away : 0, events, report };
  render();
}

// Floors the clock has already paid for and that have not been delved yet.
function backlogFloors() {
  const capped = Math.min(earnedMs(), BALANCE.offline.max_hours * 3600000);
  return Math.floor(capped / floorCostMs());
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

// Delving time is earned by the clock at exactly one floor per
// offline_minutes_per_floor, whether or not anyone is watching. Watching
// animates that time; it never buys more of it.
const floorCostMs = () => BALANCE.offline.minutes_per_floor * 60000;
const earnedMs = () => Date.now() - state.lastSeenAt;

const heroOnStairs = () => atFloorBoundary(run);

function step() {
  if (!run || run.ended) return stopWatchingRun();

  // The current floor is already paid for, so it plays out in full. The next
  // one waits until the clock has earned it — this is the whole reason
  // watching cannot outpace being away.
  if (heroOnStairs() && earnedMs() < floorCostMs()) {
    paintDescent();
    return;
  }

  const orders = { doctrine: state.run.doctrine, autoBankEvery: state.run.standingOrder };
  const out = tick(run, orders, rng);

  // Fold into the save as they happen, or a boss chest won while watching
  // would never reach the pending queue.
  absorbEvents(state, out.events);
  let gotChest = false;
  for (const e of out.events) {
    if (e.type === 'boss_killed') gotChest = true;
    const line = eventLine(e);
    if (line) feed.push(line);
  }
  if (feed.length > 40) feed = feed.slice(-40);
  if (gotChest) writeSave(state); // a reward is worth an immediate write

  // Persist ONLY at floor boundaries. A floor regenerates from its seed, so
  // saving mid-floor and reloading would hand out its gold a second time.
  if (run.depth > lastPersistedDepth) {
    lastPersistedDepth = run.depth;
    chargeOneFloor();
    persistRun();
  }

  if (run.ended) return stopWatchingRun();
  paintDescent();
}

function persistRun() {
  applyRunToSave(state, run, rng);
  writeSave(state);
}

// Spend exactly one floor's worth of earned time, the same amount offline.js
// charges. Leftover stays on the clock rather than being rounded away.
function chargeOneFloor() {
  state.lastSeenAt += floorCostMs();
  if (state.lastSeenAt > Date.now()) state.lastSeenAt = Date.now();
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

/* ---- gear ------------------------------------------------------------- */

const SLOT_LABEL = { weapon: 'Weapon', armor: 'Armor', relic: 'Relic' };
const SLOT_BLANK = { weapon: '🗡️', armor: '🛡️', relic: '🔮' };

function equipmentPanel() {
  const eq = state.hero.equipment || {};
  return `<div class="slots">${SLOTS.map((slot) => {
    const it = eq[slot];
    return `<div class="slot${it ? '' : ' empty'}">
      <div class="face">${it ? it.emoji : SLOT_BLANK[slot]}</div>
      <div class="nm">${it ? it.name : SLOT_LABEL[slot]}</div>
      <div class="fx">${it ? describeGear(it) : '—'}</div>
    </div>`;
  }).join('')}</div>`;
}

function chestPanel() {
  const chest = state.pendingChests[0];
  if (!chest) return '';
  if (!openChest) {
    return `<div class="card"><h2>Reward chest</h2>
      <p class="line">A boss chest is waiting${state.pendingChests.length > 1
        ? ` (${state.pendingChests.length} in all)` : ''}.</p>
      <button id="openchest" class="primary wide">🎁 Open it</button></div>`;
  }
  const gold = state.hero.carried.gold;
  const opts = rollChestOptions(openChest, openChest.depth || state.hero.floor);
  return `<div class="card"><h2>Choose one — you have ${gold} 🪙</h2>
    ${opts.map((o, i) => {
      const afford = gold >= o.cost;
      return `<button class="choice" data-i="${i}" ${afford ? '' : 'disabled'}>
        <div class="big">${o.emoji} ${o.name}</div>
        <div class="why">${SLOT_LABEL[o.slot]} — ${o.blurb}</div>
        <div class="fx">${describeGear(o)}</div>
        <div class="cost">${afford ? '' : 'need '}${o.cost} 🪙</div>
      </button>`;
    }).join('')}
    <button id="skipchest">Take nothing</button></div>`;
}

function chooseGear(index) {
  const chest = openChest;
  if (!chest) return;
  const opts = rollChestOptions(chest, chest.depth || state.hero.floor);
  const item = opts[index];
  if (!item || state.hero.carried.gold < item.cost) return;

  state.hero.carried.gold -= item.cost;
  state.hero.equipment[item.slot] = item;
  // A bigger max hp from armour should arrive as usable health, not as an
  // empty gap in the bar.
  if (item.hp) state.hero.hp += item.hp;
  finishChest();
}

function finishChest() {
  state.pendingChests.shift();
  openChest = null;
  writeSave(state);
  render();
}

/* ---- camp -------------------------------------------------------------- */

function paintCamp() {
  const h = state.hero;
  const maxRations = BALANCE.hero.start_rations;
  const backlog = backlogFloors();
  app.innerHTML = `
    <h1>🕳️ Roguidle</h1>
    <p class="sub">${arrival && arrival.fresh ? 'A new hero shoulders a pack and starts down.'
      : arrival ? 'Last seen ' + describeAway(arrival.away) + '.' : 'At camp.'}</p>

    ${arrival && arrival.events ? awayReport(arrival.events, arrival.report) : ''}

    <div class="res">
      <span>🌀 floor <b>${h.floor}</b></span>
      <span>❤️ <b>${h.hp}</b>/${h.maxHp + equipmentBonuses(h.equipment).hp}</span>
      <span>🍖 <b>${h.rations}</b></span>
      <span>🪙 <b>${h.carried.gold}</b></span>
    </div>

    ${chestPanel()}

    ${backlog > 0 ? `<div class="card"><h2>Waiting to be delved</h2>
      <p class="line"><b>${backlog}</b> floor${backlog === 1 ? '' : 's'} of delving has been earned while you were away.
      Watch it happen, or settle it instantly — the hero ends up in the same place either way.</p></div>` : ''}

    <button id="watch" class="primary wide">▶ Watch the descent${backlog > 0 ? ` (${backlog} ready)` : ''}</button>
    ${backlog > 0 ? '<button id="catchup" class="wide">⏩ Settle it instantly</button>' : ''}

    <div class="card">
      <h2>Equipment</h2>
      ${equipmentPanel()}
    </div>

    <div class="card">
      <h2>Hero</h2>
      <div class="stat"><span class="label">Level</span><span class="value">${h.level}</span></div>
      <div class="bar hp"><span style="width:${pct(h.hp, h.maxHp + equipmentBonuses(h.equipment).hp)}%"></span></div>
      <div class="bar rations"><span style="width:${pct(h.rations, maxRations)}%"></span></div>
      <div class="stat"><span class="label">Deepest ever</span><span class="value">floor ${state.meta.maxDepthEver}</span></div>
      <div class="stat"><span class="label">Deaths</span><span class="value">${state.run.deaths}</span></div>
    </div>

    <div class="row">
      <button id="skip">Skip ahead 4h</button>
      <button id="reset" class="danger">Delete save</button>
    </div>
  `;

  document.getElementById('watch').addEventListener('click', beginWatching);
  const catchup = document.getElementById('catchup');
  if (catchup) catchup.addEventListener('click', catchUpNow);

  const open = document.getElementById('openchest');
  if (open) open.addEventListener('click', () => { openChest = state.pendingChests[0]; render(); });
  const skipChest = document.getElementById('skipchest');
  if (skipChest) skipChest.addEventListener('click', finishChest);
  for (const btn of document.querySelectorAll('.choice')) {
    btn.addEventListener('click', () => chooseGear(Number(btn.dataset.i)));
  }
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

function untilNextFloor() {
  const left = floorCostMs() - earnedMs();
  if (left <= 0) return null;
  const mins = Math.ceil(left / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function paintDescent(notice) {
  const h = run ? run.hero : state.hero;
  const depth = run ? run.depth : state.hero.floor;
  const carried = run ? run.carried : state.hero.carried;
  const running = !!timer;
  const waiting = heroOnStairs() && earnedMs() < floorCostMs() ? untilNextFloor() : null;

  app.innerHTML = `
    <div class="hud">
      <button id="back" class="ghost">‹ camp</button>
      <span class="hud-item">🌀 <b>${depth}</b></span>
      <span class="hud-item">❤️ <b>${h.hp}</b>/${h.maxHp}</span>
      <span class="hud-item">🍖 <b>${h.rations}</b></span>
      <span class="hud-item">🪙 <b>${carried.gold}</b></span>
      ${state.pendingChests.length ? `<span class="hud-item">🎁 <b>${state.pendingChests.length}</b></span>` : ''}
    </div>

    ${notice ? `<p class="notice">${notice}</p>` : ''}
    ${waiting ? `<p class="notice">⏳ The hero waits at the stairs. Next floor in <b>${waiting}</b>
      — the descent runs at the same pace whether you watch or not.</p>` : ''}
    ${renderFloor(run)}

    <div class="row">
      <button id="toggle" ${run ? '' : 'disabled'}>${running ? '⏸ pause' : '▶ resume'}</button>
      <span class="sub small">${waiting ? 'waiting on the clock' : 'a tick every ' + BALANCE.sim.tick_ms_watchable + 'ms'}</span>
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
