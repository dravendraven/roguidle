// The three doctrines: what the hero DECIDES each tick. Decisions only —
// the combat dice are never touched here (game-design.md, "The three
// decisions"). Returns one action: attack / move / pickup / rest / descend /
// wait. Uses no randomness at all: same state, same decision.
import { BALANCE } from './balance.js';
import { expectedCostToKill } from './combat.js';
import { dist, adjacent4, findPath } from './floor.js';

const at = (list, x, y) => list.find((o) => o.x === x && o.y === y);

function nearest(pos, list) {
  let best = null;
  let bestD = Infinity;
  for (const o of list) {
    const d = Math.abs(o.x - pos.x) + Math.abs(o.y - pos.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function weakest(list) {
  let best = list[0];
  for (const m of list) if (m.hp < best.hp) best = m;
  return best;
}

// Would this fight leave the hero standing, allowing for bad dice? Damage
// swings 1-4 against a small hp pool, so planning on the AVERAGE cost loses
// the fights that land on the tail. The margin prices that in.
function favorable(hero, monster) {
  const B = BALANCE.ai;
  const reserve = B.cautious_reserve_frac * hero.maxHp;
  return expectedCostToKill(hero, monster) * B.cautious_variance_margin <= hero.hp - reserve;
}

export function decideAction(state, orders) {
  const B = BALANCE;
  const { hero, floor } = state;
  const pos = { x: hero.x, y: hero.y };
  const hpFrac = hero.hp / hero.maxHp;

  // Free loot underfoot — every doctrine takes it.
  if (at(floor.chests, pos.x, pos.y) || at(floor.piles, pos.x, pos.y)) {
    return { type: 'pickup' };
  }

  const adj = floor.monsters.filter((m) => adjacent4(m, pos));
  const near = floor.monsters.filter((m) => dist(m, pos) <= B.ai.chase_radius);
  const safe = near.length === 0;
  const onStairs = pos.x === floor.stairs.x && pos.y === floor.stairs.y;

  // Failsafe (floor took too long): march to the stairs, fight through.
  if (state.forceStairs) {
    if (onStairs) return { type: 'descend' };
    if (adj.length) return { type: 'attack', id: weakest(adj).id };
    return moveToward(state, floor.stairs);
  }

  // Keep an ongoing rest going until this doctrine's stop point.
  if (
    state.restSession &&
    safe &&
    hero.hp < hero.maxHp &&
    hpFrac < B.ai.rest_until_frac[orders.doctrine]
  ) {
    return { type: 'rest' };
  }

  if (orders.doctrine === 'greedy') return greedy(state, pos, adj, safe, hpFrac, onStairs);
  if (orders.doctrine === 'swift') return swift(state, pos, adj, safe, hpFrac, onStairs);
  return cautious(state, pos, adj, near, safe, hpFrac, onStairs);
}

// Greedy: full-clears the floor — kill everything, grab everything, then
// descend. Rests when hurt and nothing is nearby.
function greedy(state, pos, adj, safe, hpFrac, onStairs) {
  const B = BALANCE;
  const floor = state.floor;
  if (adj.length) return { type: 'attack', id: weakest(adj).id };
  if (hpFrac < B.ai.rest_below_frac.greedy && safe) return { type: 'rest' };
  const target =
    nearest(pos, floor.monsters) || nearest(pos, floor.chests) || nearest(pos, floor.piles);
  if (target) return moveToward(state, target);
  if (onStairs) return { type: 'descend' };
  return moveToward(state, floor.stairs);
}

// Swift: rushes the stairs. Fights only what blocks the way, grabs only what
// it happens to walk over, rests only when badly hurt.
function swift(state, pos, adj, safe, hpFrac, onStairs) {
  const B = BALANCE;
  const floor = state.floor;
  if (onStairs) return { type: 'descend' };
  // Clear off whatever is in our face — running past a chaser just donates
  // free hits every other tick. Swift never SEEKS fights, but it ends them.
  if (adj.length) return { type: 'attack', id: weakest(adj).id };
  if (hpFrac < B.ai.rest_below_frac.swift && safe) return { type: 'rest' };
  return moveToward(state, floor.stairs);
}

// Cautious: only favorable fights, flees when hurt, rests up before
// descending. Slow, rarely dies.
function cautious(state, pos, adj, near, safe, hpFrac, onStairs) {
  const B = BALANCE;
  const floor = state.floor;
  const hero = state.hero;

  // Disengaging is a COMMITMENT, not a per-tick opinion. Without this the
  // hero steps back, loses "adjacent", turns around, walks into the same
  // monster and eats a free hit — forever (traced, batch 9). Once retreating,
  // keep retreating until nothing is in chase range.
  if (safe) state.retreating = false;
  if (state.retreating) {
    return fleeStep(state, adj.length ? adj : near) || forcedMelee(adj);
  }

  // Flee from what can actually reach us. Using every monster within the
  // chase radius means two bracketing monsters leave no improving step, and
  // the hero stands and dies instead of slipping past one of them.
  if (hpFrac < B.ai.cautious_flee_frac && near.length) {
    state.retreating = true;
    return fleeStep(state, adj.length ? adj : near) || forcedMelee(adj);
  }
  if (adj.length) {
    const fav = adj.filter((m) => favorable(hero, m));
    if (fav.length) return { type: 'attack', id: weakest(fav).id };
    // Something unfavorable is on us. Healthy enough: commit to the trade
    // (monsters never heal, so rest-and-re-engage always wins eventually).
    // Otherwise back away — or fight if cornered.
    if (hpFrac >= B.ai.cautious_engage_frac) return { type: 'attack', id: weakest(adj).id };
    state.retreating = true;
    return fleeStep(state, adj) || forcedMelee(adj);
  }
  if (hpFrac < B.ai.rest_below_frac.cautious && safe) return { type: 'rest' };

  // Skip loot that an unfavorable monster is guarding — approaching it just
  // triggers an approach-flee loop that wastes the whole floor.
  const unfav = floor.monsters.filter((m) => !favorable(hero, m));
  const guarded = (o) => unfav.some((m) => dist(m, o) <= B.ai.chase_radius + 1);
  // Sneak-pathing: route around the aggro radius of unfavorable monsters
  // whenever a safe route exists (cautious_sneak_pathing, balance.md).
  const dangerZones = () => {
    const zone = new Set();
    const r = B.ai.chase_radius;
    for (const m of unfav) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          zone.add(m.x + dx + ',' + (m.y + dy));
        }
      }
    }
    return zone;
  };

  // Cautious does not HUNT. Every extra tick on a floor is another chance for
  // a leashed monster to wander back, and time-on-floor was what made cautious
  // as deadly as greedy (batch 7: 2097 ticks/run vs 909). It kills what is
  // already on top of it and takes loot within a short detour — nothing more.
  const detour = B.ai.cautious_detour_tiles;
  const worthIt = (o) => !guarded(o) && Math.abs(o.x - pos.x) + Math.abs(o.y - pos.y) <= detour;
  const target =
    nearest(pos, floor.monsters.filter((m) => favorable(hero, m) && worthIt(m))) ||
    nearest(pos, floor.chests.filter(worthIt)) ||
    nearest(pos, floor.piles.filter(worthIt));
  if (target) return moveToward(state, target, dangerZones);

  if (onStairs) {
    // Top up before taking the stairs.
    if (safe && hero.hp < hero.maxHp && hpFrac < B.ai.rest_until_frac.cautious) {
      return { type: 'rest' };
    }
    return { type: 'descend' };
  }
  return moveToward(state, floor.stairs, dangerZones);
}

function forcedMelee(adj) {
  if (!adj.length) return { type: 'wait' };
  return { type: 'attack', id: weakest(adj).id };
}

// Walk toward dest along a cached BFS path, routing around monsters. With
// avoidZones (a Set of "x,y"), prefer a route that skirts those tiles too,
// falling back to a normal route when no sneaky one exists. If the way is
// fully blocked, attack the blocker when adjacent.
function moveToward(state, dest, avoidZones) {
  const floor = state.floor;
  const pos = { x: state.hero.x, y: state.hero.y };
  const destKey = (avoidZones ? 'sneak:' : '') + dest.x + ',' + dest.y;

  const blocked = new Set(floor.monsters.map((m) => m.x + ',' + m.y));
  blocked.delete(dest.x + ',' + dest.y); // walking "to" a monster = up to it

  let path = state.pathKey === destKey ? state.path : null;
  if (!path || !path.length || blocked.has(path[0].x + ',' + path[0].y)) {
    if (avoidZones) {
      const sneaky = new Set(blocked);
      for (const k of avoidZones()) sneaky.add(k); // lazy: built only here
      sneaky.delete(dest.x + ',' + dest.y);
      sneaky.delete(pos.x + ',' + pos.y); // never wall off our own tile
      path = findPath(floor, pos, dest, sneaky);
    } else {
      path = null;
    }
    if (!path) path = findPath(floor, pos, dest, blocked);
    state.pathKey = destKey;
    state.path = path;
  }
  if (path && path.length) {
    const step = path.shift();
    return { type: 'move', x: step.x, y: step.y };
  }

  // No route around the monsters — go through them instead.
  const open = findPath(floor, pos, dest, null);
  if (open && open.length) {
    const step = open[0];
    const m = floor.monsters.find((mm) => mm.x === step.x && mm.y === step.y);
    if (m) return { type: 'attack', id: m.id }; // adjacent by construction
    state.pathKey = null;
    state.path = null;
    return { type: 'move', x: step.x, y: step.y };
  }
  return { type: 'wait' }; // truly unreachable; the floor failsafe handles it
}

// Step that maximizes distance from the nearest threat, preferring tiles
// that keep an escape route — retreating into a dead end just means dying
// there at low hp (flee_prefers_open_tiles). Returns null when cornered.
function fleeStep(state, threats) {
  const floor = state.floor;
  const hero = state.hero;
  const occupied = new Set(floor.monsters.map((m) => m.x + ',' + m.y));
  const exits = (p) => {
    let n = 0;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (floor.passable.has(p.x + dx + ',' + (p.y + dy))) n++;
    }
    return n;
  };
  // Distance dominates; open tiles break ties (a dead end is worth ~half a step).
  const score = (p) => Math.min(...threats.map((t) => dist(p, t))) + (exits(p) >= 2 ? 0.5 : 0);
  let best = null;
  let bestScore = score(hero);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const p = { x: hero.x + dx, y: hero.y + dy };
    const k = p.x + ',' + p.y;
    if (!floor.passable.has(k) || occupied.has(k)) continue;
    const s = score(p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (!best) return null;
  state.path = null; // fleeing invalidates any cached route
  state.pathKey = null;
  return { type: 'move', x: best.x, y: best.y };
}
