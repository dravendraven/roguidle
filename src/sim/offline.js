// Fast-forward: turn elapsed real time into floors delved.
//
// Pure like the rest of src/sim — `now` is passed in, never read from the
// clock, and nothing here touches storage or the DOM.
//
// DEVIATION FROM tech-design 4.1, flagged deliberately. The design calls for
// resolving offline floors as aggregate rolls, because replaying 400ms ticks
// for 24 hours would be 216,000 ticks of CPU. That premise does not hold:
// rations cap a run at roughly 8-15 floors, so a full 24-hour catch-up is
// about 2,500 ticks — single-digit milliseconds. So this drives the REAL
// tick() a floor at a time instead. Same rulebook, so fast-forward and the
// watchable view cannot disagree, which deletes the "fast-forward drift"
// risk in tech-design section 9 outright. Revisit only if larders ever grow
// enough that one catch-up spans thousands of floors.
import { BALANCE } from './balance.js';
import { initRun, tick, placeOnFloor } from './tick.js';
import { makeRng, hashSeeds } from './rng.js';

export function runSeedFor(save) {
  return hashSeeds(save.accountSeed, save.run.number);
}

// Rebuild a live run state from the save, standing on the floor it left off
// on. The hero already paid rations for that floor, so it is placed, not
// re-entered.
export function runFromSave(save) {
  const run = initRun(runSeedFor(save));
  const h = save.hero;
  run.doctrine = save.run.doctrine;
  run.depth = h.floor;
  run.hero.hp = h.hp;
  run.hero.maxHp = h.maxHp;
  run.hero.level = h.level;
  run.hero.xp = h.xp;
  run.hero.rations = h.rations;
  run.carried = {
    gold: h.carried.gold,
    chests: { ...h.carried.chests },
    greedStacks: h.carried.greedStacks,
  };
  run.depthRenownPaid = [...(save.run.depthRenownPaid || [])];
  run.shrinesSinceBank = save.run.shrinesSinceBank || 0;
  run.stats.maxDepth = h.floor;
  placeOnFloor(run);
  return run;
}

// Fold a run's state back into the save.
export function applyRunToSave(save, run, rng) {
  const h = save.hero;
  h.hp = run.hero.hp;
  h.maxHp = run.hero.maxHp;
  h.level = run.hero.level;
  h.xp = run.hero.xp;
  h.rations = run.hero.rations;
  h.floor = run.depth;
  h.carried = {
    gold: run.carried.gold,
    chests: { ...run.carried.chests },
    greedStacks: run.carried.greedStacks,
  };
  save.run.rngState = rng.getState();
  save.run.depthRenownPaid = [...run.depthRenownPaid];
  save.run.shrinesSinceBank = run.shrinesSinceBank;
  save.run.maxFloor = Math.max(save.run.maxFloor, run.stats.maxDepth);
  save.meta.maxDepthEver = Math.max(save.meta.maxDepthEver, run.stats.maxDepth);
  // run.renown counts only what this catch-up earned — runFromSave never
  // restores it — so adding it each time accumulates without double counting.
  save.meta.renown += run.renown;
  return save;
}

// How much wall-clock time one floor of delving costs.
const floorMs = () => BALANCE.offline.minutes_per_floor * 60000;

// Resolve one floor: run real ticks until the hero descends or the run ends.
// Returns true when a floor was actually completed.
function resolveOneFloor(run, orders, rng, events) {
  const startDepth = run.depth;
  const guardLimit = BALANCE.sim.max_ticks_per_floor * 4;
  let guard = 0;
  while (!run.ended && run.depth === startDepth && guard++ < guardLimit) {
    const out = tick(run, orders, rng);
    for (const e of out.events) events.push(e);
  }
  return run.depth > startDepth;
}

// Advance `save` by however much time has passed. Returns a report; the
// caller decides what to do about a death.
export function fastForward(save, now) {
  const B = BALANCE.offline;
  const events = [];
  const capMs = B.max_hours * 3600000;
  const rawElapsed = Math.max(0, now - save.lastSeenAt);
  let budget = Math.min(rawElapsed, capMs);

  const run = runFromSave(save);
  const rng = makeRng(runSeedFor(save));
  if (save.run.rngState !== null && save.run.rngState !== undefined) {
    rng.setState(save.run.rngState);
  }
  const orders = { doctrine: save.run.doctrine, autoBankEvery: save.run.standingOrder };

  const report = {
    elapsedMs: rawElapsed,
    cappedMs: budget,
    cappedByLimit: rawElapsed > capMs,
    floors: 0,
    campedHours: 0,
    died: false,
    stopped: false,
  };

  const perFloor = floorMs();
  const cost = () => BALANCE.hero.ration_cost_per_floor[run.doctrine];

  while (budget >= perFloor && !run.ended) {
    // Out of rations: the hero camps and forages. Never a punishment, just
    // slower. (camp_rations_per_hour is an OWNER DECISION — see balance.md.)
    if (run.hero.rations < cost()) {
      const needed = cost() - run.hero.rations;
      const hoursNeeded = needed / B.camp_rations_per_hour;
      const campMs = hoursNeeded * 3600000;
      if (campMs > budget) {
        // Not enough time to finish foraging; bank the partial recovery.
        const hours = budget / 3600000;
        run.hero.rations = round2(run.hero.rations + hours * B.camp_rations_per_hour);
        report.campedHours += hours;
        budget = 0;
        break;
      }
      run.hero.rations = round2(
        Math.min(BALANCE.hero.start_rations, run.hero.rations + hoursNeeded * B.camp_rations_per_hour)
      );
      report.campedHours += hoursNeeded;
      budget -= campMs;
      continue;
    }

    if (!resolveOneFloor(run, orders, rng, events)) break; // died or wedged
    report.floors += 1;
    budget -= perFloor;
  }

  report.died = run.endReason === 'died';
  report.stopped = run.endReason === 'stopped';

  applyRunToSave(save, run, rng);
  // Unspent time stays on the clock rather than evaporating.
  save.lastSeenAt = now - budget;

  return { save, events, report, run };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
