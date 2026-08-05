// THE pure simulation step: tick(state, orders, rng) -> { state, events }.
// One hero action per call, then the monsters respond. No DOM, no
// Date.now(), no storage in here — hard rule from CLAUDE.md.
//
// orders: { doctrine: 'greedy'|'swift'|'cautious', autoBankEvery: N }
// rng:    the run's combat/loot stream (floors derive their own seeds).
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
      weaponBonus: 0, // gear arrives with P1 chests
      armorBonus: 0,
      rations: B.hero.start_rations,
      x: 0,
      y: 0,
    },
    carried: { gold: 0, chests: { common: 0, rare: 0, gilded: 0 }, greedStacks: 0 },
    banked: { gold: 0, value: 0, chests: 0 },
    shrinesSinceBank: 0,
    floor: null,
    floorTicks: 0,
    forceStairs: false,
    path: null,
    pathKey: null,
    restSession: null,
    stats: {
      kills: 0,
      eliteKills: 0,
      killsByType: {},
      goldCollected: 0,
      damageTaken: 0,
      restTicks: 0,
      maxDepth: 0,
      shrinesSeen: 0,
      banks: 0,
    },
  };
}

const ev = (state, type, data) => ({ type, t: state.t, depth: state.depth, ...data });

export function tick(state, orders, rng) {
  const events = [];
  if (state.ended) return { state, events };

  if (state.depth === 0) {
    enterFloor(state, orders, events);
    if (state.ended) return { state, events };
  }

  const action = decideAction(state, orders);

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
      enterFloor(state, orders, events);
      break;
    case 'wait':
      break;
  }

  if (!state.ended) monstersAct(state, rng, events);

  if (!state.ended) {
    state.floorTicks++;
    if (state.floorTicks > BALANCE.sim.max_ticks_per_floor && !state.forceStairs) {
      state.forceStairs = true;
      events.push(ev(state, 'stalled', {}));
    }
  }

  state.t++;
  return { state, events };
}

// Entering a floor: pay rations (or camp), resolve the shrine if this is a
// shrine floor, then generate the new floor.
function enterFloor(state, orders, events) {
  const B = BALANCE;
  const cost = B.hero.ration_cost_per_floor[orders.doctrine];
  if (state.hero.rations < cost) {
    state.ended = true;
    state.endReason = 'camped';
    events.push(ev(state, 'out_of_rations', {}));
    return;
  }
  state.hero.rations = Math.round((state.hero.rations - cost) * 100) / 100;

  state.depth += 1;
  state.stats.maxDepth = state.depth;

  // Shrine at the entrance of every Nth floor: bank or push.
  if (state.depth >= B.shrines.every_n_floors && state.depth % B.shrines.every_n_floors === 0) {
    state.stats.shrinesSeen++;
    state.shrinesSinceBank++;
    events.push(ev(state, 'shrine_reached', {}));
    if (orders.autoBankEvery && state.shrinesSinceBank >= orders.autoBankEvery) {
      bankNow(state, events);
    } else {
      state.carried.greedStacks++;
      events.push(ev(state, 'pushed_on', { stacks: state.carried.greedStacks }));
    }
  }

  state.floor = makeFloor(state.seed, state.depth, state.carried.greedStacks);
  state.hero.x = state.floor.heroStart.x;
  state.hero.y = state.floor.heroStart.y;
  state.floorTicks = 0;
  state.forceStairs = false;
  state.path = null;
  state.pathKey = null;

  const byType = {};
  let elites = 0;
  for (const m of state.floor.monsters) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    if (m.elite) elites++;
  }
  events.push(ev(state, 'floor_entered', { monsters: byType, elites }));
}

function bankNow(state, events) {
  const B = BALANCE;
  const c = state.carried;
  const chestCount = c.chests.common + c.chests.rare + c.chests.gilded;
  const mult = 1 + B.shrines.greed_bonus_per_stack * c.greedStacks;
  if (c.gold > 0 || chestCount > 0) {
    const value = Math.round(c.gold * mult * 10) / 10;
    state.banked.gold += c.gold;
    state.banked.value += value;
    state.banked.chests += chestCount;
    state.stats.banks++;
    events.push(
      ev(state, 'banked', { gold: c.gold, chests: chestCount, stacks: c.greedStacks, mult, value })
    );
  }
  c.gold = 0;
  c.chests = { common: 0, rare: 0, gilded: 0 };
  c.greedStacks = 0;
  state.shrinesSinceBank = 0;
}

function doAttack(state, id, rng, events) {
  const m = state.floor.monsters.find((mm) => mm.id === id);
  if (!m) return;
  m.hp -= attackDamage(rng, state.hero.weaponBonus, m.def);
  if (m.hp > 0) return;

  state.floor.monsters = state.floor.monsters.filter((mm) => mm.id !== id);
  const gold = randInt(rng, m.goldMin, m.goldMax);
  state.carried.gold += gold;
  state.stats.goldCollected += gold;
  state.stats.kills++;
  if (m.elite) state.stats.eliteKills++;
  state.stats.killsByType[m.type] = (state.stats.killsByType[m.type] || 0) + 1;
  state.pathKey = null; // whatever we were walking to may have been this
  state.path = null;
  events.push(ev(state, 'monster_killed', { monster: m.type, elite: m.elite, xp: m.xp, gold }));
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
    hero.hp = hero.maxHp; // level_up_heal: full (balance.md)
    events.push(ev(state, 'level_up', { level: hero.level, maxHp: hero.maxHp }));
  }
}

function doPickup(state, events) {
  const { hero, floor } = state;
  const chest = floor.chests.find((c) => c.x === hero.x && c.y === hero.y);
  if (chest) {
    floor.chests = floor.chests.filter((c) => c !== chest);
    state.carried.chests[chest.tier]++;
    events.push(ev(state, 'chest_found', { tier: chest.tier }));
    return;
  }
  const pile = floor.piles.find((p) => p.x === hero.x && p.y === hero.y);
  if (pile) {
    floor.piles = floor.piles.filter((p) => p !== pile);
    state.carried.gold += pile.amount;
    state.stats.goldCollected += pile.amount;
    events.push(ev(state, 'gold_found', { amount: pile.amount }));
  }
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
// the hero is near (and inside its leash), otherwise stay put. No dice are
// used for movement — chasing is deterministic.
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
        const chestCount =
          state.carried.chests.common + state.carried.chests.rare + state.carried.chests.gilded;
        events.push(
          ev(state, 'hero_died', {
            killer: m.type,
            elite: m.elite,
            lostGold: state.carried.gold,
            lostChests: chestCount,
            stacks: state.carried.greedStacks,
          })
        );
        return;
      }
      continue;
    }

    const spawn = { x: m.spawnX, y: m.spawnY };
    if (dist(m, hero) > B.ai.chase_radius) continue;
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
