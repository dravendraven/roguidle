// Boot and the one game screen: grid, resources, chest, equipment.
// Outside src/sim and src/game, so this is the layer allowed to touch the
// clock, the DOM and storage.
import { loadOrCreate, save as writeSave, saveUnlessChangedExternally, clear } from './storage.js';
import { absorbEvents, resetRun } from './game/state.js';
import { rollChestOptions, describeGear, equipmentBonuses, SLOTS } from './game/gear.js';
import { fastForward, runFromSave, applyRunToSave, runSeedFor } from './sim/offline.js';
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
let awayLine = '';     // one-line summary of the most recent catch-up

function boot() {
  const now = Date.now();
  // Seed minted here, not in src/game, because Math.random() is banned there.
  const seed = (now ^ (now >>> 9) ^ 0x9e3779b9) >>> 0;
  const { state: loaded } = loadOrCreate(now, seed);
  state = loaded;

  settleAwayTime();
  beginLiveRun();
}

// Catch the save up on however much real time has passed since it was last
// touched — the exact same ticks the live loop would have run, no faster and
// no slower. There is no "offline speed": the game was simply playing itself
// the whole time, and this is where we find out what happened.
function settleAwayTime() {
  const now = Date.now();
  const { events, report } = fastForward(state, now);
  absorbEvents(state, events);
  writeSave(state);

  if (report.ticks > 0) {
    const kills = events.filter((e) => e.type === 'monster_killed' || e.type === 'boss_killed').length;
    const bits = [`${report.floors} floor${report.floors === 1 ? '' : 's'}`, `${kills} kills`];
    if (report.deaths) bits.push(`${report.deaths} death${report.deaths === 1 ? '' : 's'}`);
    awayLine = `While away: ${bits.join(', ')}.`;
  } else {
    awayLine = '';
  }
  return report;
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

  const prevDepth = run.depth;
  const out = tick(run, null, rng);

  absorbEvents(state, out.events);
  let mustSave = false;
  for (const e of out.events) {
    if (e.type === 'boss_killed') mustSave = true;
    const line = eventLine(e);
    if (line) feed.push(line);
  }
  if (feed.length > 30) feed = feed.slice(-30);

  if (run.depth > prevDepth) mustSave = true;
  if (mustSave) persistRun();

  if (run.ended) {
    // The only ending left is death — camping never ends a run any more.
    persistRun();
    state.run.deaths += 1;
    feed.push({ cls: 'bad', text: '💀 the hero is gone. Another takes the pack…' });
    resetRun(state, Date.now());
    writeSave(state);
    run = null;
    stopTimer();
    setTimeout(() => beginLiveRun(), 2500);
  }
  repaint();
}

// The sim ticks a few times a second; redrawing the whole screen at that
// rate would yank the chest menu out from under a tap. While a chest is
// open the screen holds still and the sim runs silently behind it.
function repaint() {
  if (!openChest) paint();
}

function persistRun() {
  if (!run) return;
  applyRunToSave(state, run, rng);
  // The game has been ticking in real time up to this instant, so there is
  // nothing left for a future catch-up to replay.
  state.lastSeenAt = Date.now();
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

function paint() {
  const h = run ? run.hero : state.hero;
  const depth = run ? run.depth : state.hero.floor;
  const carried = run ? run.carried : state.hero.carried;
  const camping = !!(run && run.camping);

  app.innerHTML = `
    <div class="res">
      <span>🌀 <b>${depth}</b></span>
      <span>❤️ <b>${h.hp}</b>/${h.maxHp}</span>
      <span>🍖 <b>${h.rations}</b></span>
      <span>🪙 <b>${carried.gold}</b></span>
      ${state.pendingChests.length ? `<span>🎁 <b>${state.pendingChests.length}</b></span>` : ''}
    </div>

    ${awayLine ? `<p class="notice">${awayLine}</p>` : ''}
    ${camping ? `<p class="notice">🏕️ The larder is empty. The hero rests and forages — rations refill over time, same pace whether you watch or not.</p>` : ''}

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

// A hidden tab (locked phone, switched app) stops ticking locally, but the
// game did not pause: on return, catch up on the real time that passed and
// rebuild the live run from the result, so backgrounding never loses time
// or gets a free pause. This is the same path boot() uses.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTimer();
    if (run) {
      applyRunToSave(state, run, rng);
      state.lastSeenAt = Date.now();
      writeSave(state);
    }
  } else if (state) {
    settleAwayTime();
    beginLiveRun();
  }
});

boot();
