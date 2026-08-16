// The save's shape, its initial value, and its migrations.
// The account seed is supplied by the caller (main.js) — Math.random() is
// banned in here.
import { BALANCE } from '../sim/balance.js';

export const SAVE_VERSION = 4;

export function newSave(now, accountSeed) {
  const H = BALANCE.hero;
  return {
    version: SAVE_VERSION,
    accountSeed: accountSeed >>> 0,
    lastSeenAt: now,
    hero: {
      hp: H.start_hp,
      maxHp: H.start_hp,
      level: 1,
      xp: 0,
      equipment: { weapon: null, armor: null, relic: null },
      rations: H.start_rations,
      floor: 1, // the floor the hero is standing on, rations already paid
      carried: { gold: 0 },
    },
    run: {
      number: 1,
      deaths: 0,
      // Determinism has to survive closing the tab: the generator's
      // position is part of the save, not just of the session. null means
      // "start the stream fresh".
      rngState: null,
    },
    meta: {
      maxDepthEver: 1,
    },
    pendingChests: [],
    chronicle: [],
  };
}

// Ordered migrations: index i upgrades a save at version i+1 to version i+2.
// Never change the save format without adding one (CLAUDE.md).
export const MIGRATIONS = [
  // 1 -> 2: offline resolution needs the rng position to persist, or a
  // resumed run re-rolls its combat on every catch-up.
  (save) => {
    save.run.rngState = null;
    return save;
  },
  // 2 -> 3: gear became a real system with three slots. The old `gear: []`
  // never held anything, so there is nothing to carry across.
  (save) => {
    delete save.hero.gear;
    save.hero.equipment = { weapon: null, armor: null, relic: null };
    return save;
  },
  // 3 -> 4: doctrines, shrines, bank-or-push and Renown were cut — none of
  // it was ever reachable by the player (doctrine was always 'greedy',
  // banking never triggered, Renown was never shown). Gold + depth + gear
  // is now the whole economy. Also drops embers/bestiary/relics/daily,
  // placeholder fields for systems that were never built.
  (save) => {
    delete save.hero.carried.chests;
    delete save.hero.carried.greedStacks;
    delete save.run.doctrine;
    delete save.run.standingOrder;
    delete save.run.depthRenownPaid;
    delete save.run.shrinesSinceBank;
    delete save.run.maxFloor;
    save.meta = { maxDepthEver: save.meta.maxDepthEver || 1 };
    delete save.daily;
    return save;
  },
];

export function migrate(save) {
  let v = save.version || 1;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new Error(`no migration from save version ${v}`);
    save = step(save);
    v += 1;
    save.version = v;
  }
  return save;
}

export const CHRONICLE_LIMIT = 200;

// Fold simulation events into the save: the chronicle keeps the tail, and
// killing a boss is what queues its chest. Chest CONTENTS are not rolled
// here — that happens on tap, at login (docs/notes/game-design.md).
export function absorbEvents(save, events) {
  for (const e of events) {
    if (e.type === 'boss_killed') {
      save.pendingChests.push({ tier: 'boss', seedAt: e.t + e.depth * 7919, depth: e.depth });
    }
    save.chronicle.push(e);
  }
  if (save.chronicle.length > CHRONICLE_LIMIT) {
    save.chronicle = save.chronicle.slice(-CHRONICLE_LIMIT);
  }
  // A long absence can kill a great many bosses. Opening chests is a manual
  // choice, so an uncapped queue turns coming back into paperwork — keep the
  // deepest ones, since those carry the best gear.
  const cap = BALANCE.offline.max_pending_chests;
  if (save.pendingChests.length > cap) {
    save.pendingChests.sort((a, b) => (b.depth || 0) - (a.depth || 0));
    save.pendingChests = save.pendingChests.slice(0, cap);
  }
  return save;
}

// A run that ends resets the hero and the run, never the meta.
export function resetRun(save, now) {
  const fresh = newSave(now, save.accountSeed);
  // The relic survives; weapon and armour do not. docs/notes/game-design.md
  // makes relics the account's persistent thread, and without prestige
  // built yet this is the only one.
  const keptRelic = save.hero && save.hero.equipment ? save.hero.equipment.relic : null;
  save.hero = fresh.hero;
  save.hero.equipment.relic = keptRelic || null;
  save.run = { ...fresh.run, number: save.run.number + 1, deaths: save.run.deaths };
  return save;
}
