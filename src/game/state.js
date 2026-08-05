// The save's shape, its initial value, and its migrations.
// Shape follows tech-design.md section 5. Math.random() is banned in here —
// the account seed is supplied by the caller (main.js).
import { BALANCE } from '../sim/balance.js';

export const SAVE_VERSION = 3;

// DESIGN GAPS (flagged, not decided — see CLAUDE.md):
// - No default doctrine is specified anywhere in the docs. Using 'greedy',
//   the first one listed in every enumeration in game-design.md.
// - No default standing order is specified. Using 2 shrines, the setting
//   where a push actually happens before the bank.
export const DEFAULTS = { doctrine: 'greedy', standingOrder: 2 };

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
      carried: { gold: 0, chests: { common: 0, rare: 0, gilded: 0 }, greedStacks: 0 },
    },
    run: {
      number: 1,
      doctrine: DEFAULTS.doctrine,
      standingOrder: DEFAULTS.standingOrder,
      deaths: 0,
      maxFloor: 1,
      // Determinism has to survive closing the tab: the generator's position
      // and the run's once-only bookkeeping are part of the save, not just
      // of the session. null means "start the stream fresh".
      rngState: null,
      depthRenownPaid: [],
      shrinesSinceBank: 0,
    },
    meta: {
      embers: 0,
      emberNodes: [],
      bestiary: {},
      relics: {},
      renown: 0,
      bestRenown: 0,
      maxDepthEver: 1,
    },
    daily: { lastPlayed: null, streak: 0, consumables: [] },
    pendingChests: [],
    chronicle: [],
  };
}

// Ordered migrations: index i upgrades a save at version i+1 to version i+2.
// Never change the save format without adding one (CLAUDE.md).
export const MIGRATIONS = [
  // 1 -> 2: offline resolution needs the rng position and the run's
  // once-only bookkeeping to persist, or a resumed run re-rolls its combat
  // and re-earns its depth Renown on every catch-up.
  (save) => {
    save.run.rngState = null;
    save.run.depthRenownPaid = [];
    save.run.shrinesSinceBank = 0;
    return save;
  },
  // 2 -> 3: gear became a real system with three slots. The old `gear: []`
  // never held anything, so there is nothing to carry across.
  (save) => {
    delete save.hero.gear;
    save.hero.equipment = { weapon: null, armor: null, relic: null };
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
// banking a chest is what sends it home to be opened. Chest CONTENTS are not
// rolled here — that happens on tap, at login (game-design.md).
export function absorbEvents(save, events) {
  for (const e of events) {
    // Every boss drops a reward chest. It waits, sealed, until the player
    // opens it by hand and picks one of three pieces of gear.
    if (e.type === 'boss_killed') {
      save.pendingChests.push({ tier: 'boss', seedAt: e.t + e.depth * 7919, depth: e.depth });
    }
    save.chronicle.push(e);
  }
  if (save.chronicle.length > CHRONICLE_LIMIT) {
    save.chronicle = save.chronicle.slice(-CHRONICLE_LIMIT);
  }
  return save;
}

// A run that ends resets the hero and the run, never the meta.
export function resetRun(save, now) {
  const fresh = newSave(now, save.accountSeed);
  fresh.hero.rations = BALANCE.hero.start_rations;
  // The relic survives; weapon and armour do not. game-design.md makes
  // relics the permanent tier, and without prestige built yet this is the
  // only thread of progress between runs. FLAGGED: the docs tie relic
  // permanence to prestige, not to death.
  const keptRelic = save.hero && save.hero.equipment ? save.hero.equipment.relic : null;
  save.hero = fresh.hero;
  save.hero.equipment.relic = keptRelic || null;
  save.run = {
    ...fresh.run,
    number: save.run.number + 1,
    doctrine: save.run.doctrine,
    standingOrder: save.run.standingOrder,
    deaths: save.run.deaths,
  };
  return save;
}
