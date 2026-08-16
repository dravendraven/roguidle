// THE pure simulation step: tick(state, orders, rng) -> { state, events }.
// One hero action per call, then the monsters respond. No DOM, no
// Date.now(), no storage access inside src/sim/ — hard rule from CLAUDE.md.
import { BALANCE } from './balance.js';
import { makeFloor, dist, adjacent4 } from './floor.js';
import { attackDamage } from './combat.js';
import { decideAction } from './doctrine.js';
import { randInt } from './rng.js';

export function initRun(seed) {
  const B = BALANCE;
  return {
    seed,
    t: 0,
    depth: 0, // becomes 1 on the first tick
    alive: true,
    ended: false,
    endReason: null,
    hero: {
      hp: B.hero.start_hp,
      maxHp: B.hero.start_hp,
      level: 1,
      xp: 0,
      weaponBonus: 0, // set from equipped gear by runFromSave
      armorBonus: 0,
      goldMult: 1,
      rationSave: 0,
      rations: B.hero.start_rations,
      x: 0,
      y: 0,
    },
    carried: { gold: 0 },
    floor: null,
    floorTicks: 0,
    forceStairs: false,
    path: null,
    pathKey: null,
    restSession: null,
    camping: false, // out of rations; resting in place, not a terminal state
    stats: {
      kills: 0,
      eliteKills: 0,
      killsByType: {},
      goldCollected: 0,
      damageTaken: 0,
      restTicks: 0,
      maxDepth: 0,
      bossKills: 0,
    },
  };
}

const ev = (state, type, data) => ({ type, t: state.t, depth: state.depth, ...data });

export function tick(state, orders, rng) {
  const events = [];
  if (state.ended) return { state, events };

  if (state.depth === 0) {
    enterFloor(state, events);
    if (state.ended) return { state, events };
  }

  const action = decideAction(state);

  // Close out a rest session the moment the hero stops resting.
  if (action.type !== 'rest' && state.restSession) {
    if (state.hero.hp > state.restSession.startHp) {
      events.push(ev(state, 'rested', { from: state.restSession.startHp, to: state.hero.hp }));
    }
    state.restSession = null;
  }

  switch (action.type) {
    case 'attack':
      doAttack(state, action.id, rng, events);
      break;
    case 'move':
      state.hero.x = action.x;
      state.hero.y = action.y;
      break;
    case 'pickup':
      doPickup(state, events);
      break;
    case 'rest':
      doRest(state);
      break;
    case 'descend':
      enterFloor(state, events);
      break;
    case 'wait':
      break;
  }

  if (!state.ended) monstersAct(state, rng, events);

  if (!state.ended) {
    state.floorTicks++;
    if (state.floorTicks > BALANCE.ai.max_ticks_per_floor && !state.forceStairs) {
      state.forceStairs = true;
      events.push(ev(state, 'stalled', {}));
    }
  }

  state.t++;
  return { state, events };
}

// Entering a floor: pay rations (or camp in place), generate the new floor.
function enterFloor(state, events) {
  const B = BALANCE;
  const cost = B.hero.ration_cost_per_floor * (1 - (state.hero.rationSave || 0));
  if (state.hero.rations < cost) {
    // Camping is not a punishment and not an ending (docs/notes: "the hero
    // camps and waits ... never a punishment"). The hero rests exactly
    // where it stands and regains rations one tick at a time, at the same
    // rate whether the run is watched live or caught up after being away —
    // there is no separate offline clock, only ticks.
    if (!state.camping) events.push(ev(state, 'out_of_rations', {}));
    state.camping = true;
    const gainPerTick = B.offline.camp_rations_per_hour * (B.sim.tick_ms_watchable / 3600000);
    state.hero.rations = Math.min(
      B.hero.start_rations,
      Math.round((state.hero.rations + gainPerTick) * 10000) / 10000
    );
    return;
  }
  state.camping = false;
  state.hero.rations = Math.round((state.hero.rations - cost) * 100) / 100;

  state.depth += 1;
  state.stats.maxDepth = state.depth;

  placeOnFloor(state);

  const byType = {};
  let elites = 0;
  for (const m of state.floor.monsters) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    if (m.elite) elites++;
  }
  events.push(ev(state, 'floor_entered', { monsters: byType, elites }));
}

// Build the current depth's floor and stand the hero at its entrance. Split
// out of enterFloor so a saved run can be resumed onto its floor WITHOUT
// paying rations for it a second time (offline.js).
export function placeOnFloor(state) {
  state.floor = makeFloor(state.seed, state.depth);
  state.hero.x = state.floor.heroStart.x;
  state.hero.y = state.floor.heroStart.y;
  state.floorTicks = 0;
  state.forceStairs = false;
  state.path = null;
  state.pathKey = null;
  state.restSession = null;
}

function doAttack(state, id, rng, events) {
  const m = state.floor.monsters.find((mm) => mm.id === id);
  if (!m) return;
  m.hp -= attackDamage(rng, state.hero.weaponBonus, m.def);
  if (m.hp > 0) return;

  state.floor.monsters = state.floor.monsters.filter((mm) => mm.id !== id);
  const gold = Math.round(randInt(rng, m.goldMin, m.goldMax) * (state.hero.goldMult || 1));
  state.carried.gold += gold;
  state.stats.goldCollected += gold;
  state.stats.kills++;
  if (m.elite) state.stats.eliteKills++;
  state.stats.killsByType[m.type] = (state.stats.killsByType[m.type] || 0) + 1;
  state.pathKey = null; // whatever we were walking to may have been this
  state.path = null;

  if (m.boss) {
    state.stats.bossKills++;
    // The boss chest is the game's only source of gear. Contents still roll
    // on tap, not here — the login reveal stays the player's moment.
    events.push(ev(state, 'boss_killed', { emoji: m.emoji, xp: m.xp, gold }));
  } else {
    events.push(ev(state, 'monster_killed', { monster: m.type, elite: m.elite, xp: m.xp, gold }));
  }
  gainXp(state, m.xp, events);
}

function gainXp(state, xp, events) {
  const B = BALANCE;
  const hero = state.hero;
  hero.xp += xp;
  while (hero.xp >= B.hero.xp_to_next(hero.level)) {
    hero.xp -= B.hero.xp_to_next(hero.level);
    hero.level++;
    hero.maxHp += B.hero.hp_per_level;
    if (B.hero.level_up_heal) hero.hp = hero.maxHp;
    events.push(ev(state, 'level_up', { level: hero.level, maxHp: hero.maxHp }));
  }
}

// Scenery finds (rogule.com: items hidden under a rock or a plant) grant
// gold on the spot — no queue, no decision, just a small immediate reward.
function doPickup(state, events) {
  const { hero, floor } = state;
  const find = floor.finds.find((f) => f.x === hero.x && f.y === hero.y);
  if (!find) return;
  floor.finds = floor.finds.filter((f) => f !== find);
  const amount = Math.round(find.value * (state.hero.goldMult || 1));
  state.carried.gold += amount;
  state.stats.goldCollected += amount;
  events.push(ev(state, 'gold_found', { amount, emoji: find.emoji }));
}

function doRest(state) {
  const hero = state.hero;
  if (!state.restSession) state.restSession = { startHp: hero.hp, ticks: 0 };
  state.restSession.ticks++;
  state.stats.restTicks++;
  if (state.restSession.ticks % BALANCE.ai.rest_ticks_per_hp === 0) {
    hero.hp = Math.min(hero.maxHp, hero.hp + 1);
  }
}

// After the hero acts, every monster gets a turn: swing if adjacent, chase if
// the hero is within ITS OWN aggro radius (and inside its leash), otherwise
// stay put. No dice are used for movement — chasing is deterministic.
function monstersAct(state, rng, events) {
  const B = BALANCE;
  const hero = state.hero;
  const occupied = new Set(state.floor.monsters.map((m) => m.x + ',' + m.y));

  for (const m of state.floor.monsters) {
    if (adjacent4(m, hero)) {
      const dmg = attackDamage(rng, m.atk, hero.armorBonus);
      hero.hp -= dmg;
      state.stats.damageTaken += dmg;
      if (hero.hp <= 0) {
        hero.hp = 0;
        state.alive = false;
        state.ended = true;
        state.endReason = 'died';
        events.push(
          ev(state, 'hero_died', {
            killer: m.type,
            elite: m.elite,
            lostGold: state.carried.gold,
          })
        );
        return;
      }
      continue;
    }

    const spawn = { x: m.spawnX, y: m.spawnY };
    if (dist(m, hero) > (m.radius || 0)) continue;
    if (dist(m, spawn) >= B.ai.leash_radius) continue;

    // Greedy step toward the hero: bigger axis first, other axis as fallback.
    const dx = Math.sign(hero.x - m.x);
    const dy = Math.sign(hero.y - m.y);
    const tryOrder =
      Math.abs(hero.x - m.x) >= Math.abs(hero.y - m.y)
        ? [[dx, 0], [0, dy]]
        : [[0, dy], [dx, 0]];
    for (const [sx, sy] of tryOrder) {
      if (sx === 0 && sy === 0) continue;
      const nx = m.x + sx;
      const ny = m.y + sy;
      const k = nx + ',' + ny;
      if (!state.floor.passable.has(k)) continue;
      if (occupied.has(k)) continue;
      if (nx === hero.x && ny === hero.y) continue; // never share the hero's tile
      if (dist({ x: nx, y: ny }, spawn) > B.ai.leash_radius) continue;
      occupied.delete(m.x + ',' + m.y);
      occupied.add(k);
      m.x = nx;
      m.y = ny;
      break;
    }
  }
}
