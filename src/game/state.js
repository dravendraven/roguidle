// The save's shape, its initial value, and its migrations.
// Shape follows tech-design.md section 5. Math.random() is banned in here —
// the account seed is supplied by the caller (main.js).
import { BALANCE } from '../sim/balance.js';

export const SAVE_VERSION = 1;

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
      gear: [],
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
  // Example for the next format change:
  // (save) => { save.hero.newField = 0; return save; },
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

// A run that ends resets the hero and the run, never the meta.
export function resetRun(save, now) {
  const fresh = newSave(now, save.accountSeed);
  fresh.hero.rations = BALANCE.hero.start_rations;
  save.hero = fresh.hero;
  save.run = {
    ...fresh.run,
    number: save.run.number + 1,
    doctrine: save.run.doctrine,
    standingOrder: save.run.standingOrder,
    deaths: save.run.deaths,
  };
  return save;
}
