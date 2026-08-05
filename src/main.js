// Boot and the one game screen: grid, resources, chest, equipment.
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
let run = null;        // the live simulation run
let rng = null;
let timer = null;
let feed = [];
let openChest = null;  // the chest whose three tiers are on screen
let awayLine = '';     // one-line summary of the catch-up

const floorCostMs = () => BALANCE.offline.minutes_per_floor * 60000;
const earnedMs = () => Date.now() - state.lastSeenAt;

function boot() {
  const now = Date.now();
  // Seed minted here, not in src/game, because Math.random() is banned there.
  const seed = (now ^ (now >>> 9) ^ 0x9e3779b9) >>> 0;
  const { state: loaded } = loadOrCreate(now, seed);
  state = loaded;

  // Settle time away immediately — the grid is the whole screen now, so the
  // hero should be standing on the right floor when it appears.
  const { events, report } = fastForward(state, now);
  absorbEvents(state, events);
  if (report.died) {
    state.run.deaths += 1;
    resetRun(state, now);
  }
  writeSave(state);

  if (report.floors > 0) {
    const kills = events.filter((e) => e.type === 'monster_killed' || e.type === 'boss_killed').length;
    awayLine = `While away: ${report.floors} floor${report.floors === 1 ? '' : 's'}, ${kills} kills` +
      (report.died ? ' — and a death. A new hero takes the pack.' : '.');
  }

  beginLiveRun();
}

/* ---- the live run ------------------------------------------------------ */

function beginLiveRun() {
  run = runFromSave(state);
  rng = makeRng(runSeedFor(state));
  if (state.run.rngState !== null && state.run.rngState !== undefined) {
    rng.setState(state.run.rngState);
  }
  paint();
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
  if (!run) return;

  // The next descent waits until the clock has earned it — watching animates
  // time, it never buys more of it.
  if (atFloorBoundary(run) && earnedMs() < floorCostMs()) {
    repaint();
    return;
  }

  const orders = { doctrine: state.run.doctrine, autoBankEvery: 0 };
  const prevDepth = run.depth;
  const out = tick(run, orders, rng);

  absorbEvents(state, out.events);
  let mustSave = false;
  for (const e of out.events) {
    if (e.type === 'boss_killed') mustSave = true;
    const line = eventLine(e);
    if (line) feed.push(line);
  }
  if (feed.length > 30) feed = feed.slice(-30);

  if (run.depth > prevDepth) {
    state.lastSeenAt += floorCostMs();
    if (state.lastSeenAt > Date.now()) state.lastSeenAt = Date.now();
    mustSave = true;
  }
  if (mustSave) persistRun();

  if (run.ended) {
    const died = run.endReason === 'died';
    persistRun();
    if (died) {
      state.run.deaths += 1;
      resetRun(state, Date.now());
      writeSave(state);
      feed.push({ cls: 'bad', text: '💀 the hero is gone. Another takes the pack…' });
    } else {
      feed.push({ cls: 'bad', text: '⛺ the hero camps. Rations will refill with time.' });
    }
    run = null;
    stopTimer();
    // A short beat before the next hero walks in.
    setTimeout(() => beginLiveRun(), died ? 2500 : 60000);
  }
  repaint();
}

// The sim ticks 2.5x a second; redrawing the whole screen at that rate would
// yank the chest menu out from under a tap. While a chest is open the screen
// holds still and the sim runs silently behind it.
function repaint() {
  if (!openChest) paint();
}

function persistRun() {
  if (!run) return;
  applyRunToSave(state, run, rng);
  writeSave(state);
}

/* ---- gear + chest ------------------------------------------------------ */

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
  const gold = liveGold();
  if (!openChest) {
    return `<div class="card"><h2>Reward chest</h2>
      <button id="openchest" class="primary wide">🎁 Open it${state.pendingChests.length > 1
        ? ` (${state.pendingChests.length} waiting)` : ''}</button></div>`;
  }
  const opts = rollChestOptions(openChest, openChest.depth || state.hero.floor);
  return `<div class="card"><h2>Choose one — you carry ${gold} 🪙</h2>
    ${opts.map((o, i) => {
      const afford = gold >= o.cost;
      return `<button class="choice" data-i="${i}" ${afford ? '' : 'disabled'}>
        <div class="big">${o.emoji} ${o.name} <span class="why">· ${o.tierLabel}</span></div>
        <div class="why">${SLOT_LABEL[o.slot]} — ${o.blurb}</div>
        <div class="fx">${describeGear(o)}</div>
        <div class="cost">${o.cost} 🪙${afford ? '' : ' — keep saving'}</div>
      </button>`;
    }).join('')}
    <button id="skipchest">Leave it for now</button></div>`;
}

// Gold lives on the live run while one is walking, on the save otherwise.
function liveGold() {
  return run ? run.carried.gold : state.hero.carried.gold;
}

function chooseGear(index) {
  const chest = openChest;
  if (!chest) return;
  const opts = rollChestOptions(chest, chest.depth || state.hero.floor);
  const item = opts[index];
  if (!item || liveGold() < item.cost) return;

  // Spend from the live purse so the grid and the price agree.
  if (run) run.carried.gold -= item.cost;
  else state.hero.carried.gold -= item.cost;

  // Apply the gear as a DELTA to the live run — never rebuild it. Rebuilding
  // regenerates the current floor from its seed, which resurrects everything
  // already killed on it and lets its gold be farmed twice.
  const before = equipmentBonuses(state.hero.equipment);
  state.hero.equipment[item.slot] = item;
  const after = equipmentBonuses(state.hero.equipment);
  if (run) {
    run.hero.weaponBonus += after.atk - before.atk;
    run.hero.armorBonus += after.def - before.def;
    run.hero.goldMult = after.goldMult;
    run.hero.rationSave = after.rationSave;
    run.hero.maxHp += after.hp - before.hp;
    // Extra max hp arrives as usable health; a smaller pool clamps.
    run.hero.hp = Math.max(1, Math.min(run.hero.maxHp, run.hero.hp + Math.max(0, after.hp - before.hp)));
  }

  state.pendingChests.shift();
  openChest = null;
  persistRun();
  if (!run) writeSave(state);
  paint();
}

/* ---- the one screen ---------------------------------------------------- */

function untilNextFloor() {
  const left = floorCostMs() - earnedMs();
  if (left <= 0) return null;
  const mins = Math.ceil(left / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function paint() {
  const h = run ? run.hero : state.hero;
  const depth = run ? run.depth : state.hero.floor;
  const carried = run ? run.carried : state.hero.carried;
  const waiting = run && atFloorBoundary(run) && earnedMs() < floorCostMs() ? untilNextFloor() : null;

  app.innerHTML = `
    <div class="res">
      <span>🌀 <b>${depth}</b></span>
      <span>❤️ <b>${h.hp}</b>/${h.maxHp}</span>
      <span>🍖 <b>${h.rations}</b></span>
      <span>🪙 <b>${carried.gold}</b></span>
      ${state.pendingChests.length ? `<span>🎁 <b>${state.pendingChests.length}</b></span>` : ''}
    </div>

    ${awayLine ? `<p class="notice">${awayLine}</p>` : ''}
    ${waiting ? `<p class="notice">⏳ Floor cleared. The hero rests at the stairs — next floor in <b>${waiting}</b>.</p>` : ''}

    ${renderFloor(run)}

    ${chestPanel()}

    <div class="card">
      <h2>Equipment</h2>
      ${equipmentPanel()}
    </div>

    <div class="card feed">
      <h2>Chronicle</h2>
      <div id="feedlines">${feed.slice(-10).map((l) => `<div class="line ${l.cls || ''}">${l.text}</div>`).join('')
        || '<div class="line sub">the descent begins…</div>'}</div>
    </div>

    <div class="row">
      <button id="skip">Skip ahead 4h</button>
      <button id="reset" class="danger">Delete save</button>
    </div>
  `;

  const open = document.getElementById('openchest');
  if (open) open.addEventListener('click', () => { openChest = state.pendingChests[0]; paint(); });
  const skipChest = document.getElementById('skipchest');
  if (skipChest) skipChest.addEventListener('click', () => { openChest = null; paint(); });
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

  const lines = document.getElementById('feedlines');
  if (lines) lines.scrollTop = lines.scrollHeight;
}

/* ---- lifecycle --------------------------------------------------------- */

window.addEventListener('pagehide', () => {
  stopTimer();
  if (run) applyRunToSave(state, run, rng);
  if (state) saveUnlessChangedExternally(state);
});

// A locked phone should not tick in the background; the clock keeps earning
// floors either way, and boot settles them on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTimer();
  else if (run && !timer) startTimer();
});

boot();
