// Fast-forward: replay elapsed real time as the same ticks that would have
// run had the page stayed open and been watched the whole time. There is no
// separate "offline rate" — this drives the exact tick() function the live
// loop uses, the same number of times BALANCE.sim.tick_ms_watchable divides
// into the elapsed time. Idle means the game kept playing, not that it
// waited for you: a death starts a fresh hero and keeps consuming the
// remaining budget, exactly as watched play does.
//
// Pure like the rest of src/sim — `now` is passed in, never read from the
// clock, and nothing here touches storage or the DOM.
import { BALANCE } from './balance.js';
import { initRun, tick, placeOnFloor } from './tick.js';
import { makeRng, hashSeeds } from './rng.js';
import { equipmentBonuses } from '../game/gear.js';
import { resetRun } from '../game/state.js';

export function runSeedFor(save) {
  return hashSeeds(save.accountSeed, save.run.number);
}

// Rebuild a live run state from the save, standing on the floor it left off
// on. The hero already paid rations for that floor, so it is placed, not
// re-entered.
export function runFromSave(save) {
  const run = initRun(runSeedFor(save));
  const h = save.hero;
  run.depth = h.floor;
  // Equipped gear is what the combat dice actually read.
  const bonus = equipmentBonuses(h.equipment);
  run.hero.weaponBonus = bonus.atk;
  run.hero.armorBonus = bonus.def;
  run.hero.goldMult = bonus.goldMult;
  run.hero.rationSave = bonus.rationSave;
  run.hero.maxHp = h.maxHp + bonus.hp;
  run.hero.hp = Math.min(h.hp, run.hero.maxHp);
  run.hero.level = h.level;
  run.hero.xp = h.xp;
  run.hero.rations = h.rations;
  run.carried = { gold: h.carried.gold };
  run.stats.maxDepth = h.floor;
  placeOnFloor(run);
  return run;
}

// Fold a run's state back into the save.
export function applyRunToSave(save, run, rng) {
  const h = save.hero;
  // Store the hero's OWN max hp. Gear is re-applied on every load, so saving
  // the boosted figure would compound the armour bonus every session.
  const bonus = equipmentBonuses(h.equipment);
  h.hp = run.hero.hp;
  h.maxHp = run.hero.maxHp - bonus.hp;
  h.level = run.hero.level;
  h.xp = run.hero.xp;
  h.rations = run.hero.rations;
  h.floor = run.depth;
  h.carried = { gold: run.carried.gold };
  save.run.rngState = rng.getState();
  save.meta.maxDepthEver = Math.max(save.meta.maxDepthEver, run.stats.maxDepth);
  return save;
}

// Advance `save` by however much real time has passed, one tick at a time.
// Returns a report describing what happened; the caller only needs to know
// whether to show a summary — deaths and restarts are already applied.
export function fastForward(save, now) {
  const B = BALANCE;
  const tickMs = B.sim.tick_ms_watchable;
  const capMs = B.offline.max_hours * 3600000;
  const rawElapsed = Math.max(0, now - save.lastSeenAt);
  const cappedElapsed = Math.min(rawElapsed, capMs);
  const totalTicks = Math.floor(cappedElapsed / tickMs);
  let ticksLeft = totalTicks;

  const events = [];
  let deaths = 0;
  let lives = 0;
  const guardLives = 1000; // sanity cap on chained hero restarts per catch-up

  while (ticksLeft > 0 && lives++ < guardLives) {
    const run = runFromSave(save);
    const rng = makeRng(runSeedFor(save));
    if (save.run.rngState !== null && save.run.rngState !== undefined) {
      rng.setState(save.run.rngState);
    }

    while (ticksLeft > 0 && !run.ended) {
      const out = tick(run, null, rng);
      for (const e of out.events) events.push(e);
      ticksLeft--;
    }
    applyRunToSave(save, run, rng);

    if (run.endReason === 'died') {
      deaths++;
      save.run.deaths++;
      resetRun(save, now);
    } else {
      break; // budget ran out mid-run; nothing more to chain
    }
  }

  const ticksConsumed = totalTicks - Math.max(0, ticksLeft);
  const remainderMs = cappedElapsed - ticksConsumed * tickMs;
  // Any time beyond the cap is discarded, not banked for later — the offline
  // cap limits benefit, it does not delay it.
  save.lastSeenAt = now - remainderMs;

  return {
    save,
    events,
    report: {
      elapsedMs: rawElapsed,
      cappedByLimit: rawElapsed > capMs,
      ticks: ticksConsumed,
      floors: events.filter((e) => e.type === 'floor_entered').length,
      deaths,
    },
  };
}
