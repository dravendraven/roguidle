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

function favorable(hero, monster) {
  const reserve = BALANCE.ai.cautious_reserve_frac * hero.maxHp;
  return expectedCostToKill(hero, monster) <= hero.hp - reserve;
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
  if (hpFrac < B.ai.rest_below_frac.swift && safe) return { type: 'rest' };
  return moveToward(state, floor.stairs);
}

// Cautious: only favorable fights, flees when hurt, rests up before
// descending. Slow, rarely dies.
function cautious(state, pos, adj, near, safe, hpFrac, onStairs) {
  const B = BALANCE;
  const floor = state.floor;
  const hero = state.hero;

  if (hpFrac < B.ai.cautious_flee_frac && near.length) {
    return fleeStep(state, near) || forcedMelee(adj);
  }
  if (adj.length) {
    const fav = adj.filter((m) => favorable(hero, m));
    if (fav.length) return { type: 'attack', id: weakest(fav).id };
    // Something unfavorable is on us: back away, or fight if cornered.
    return fleeStep(state, adj) || forcedMelee(adj);
  }
  if (hpFrac < B.ai.rest_below_frac.cautious && safe) return { type: 'rest' };

  const favMonsters = floor.monsters.filter((m) => favorable(hero, m));
  const target =
    nearest(pos, favMonsters) || nearest(pos, floor.chests) || nearest(pos, floor.piles);
  if (target) return moveToward(state, target);

  if (onStairs) {
    // Top up before taking the stairs.
    if (safe && hero.hp < hero.maxHp && hpFrac < B.ai.rest_until_frac.cautious) {
      return { type: 'rest' };
    }
    return { type: 'descend' };
  }
  return moveToward(state, floor.stairs);
}

function forcedMelee(adj) {
  if (!adj.length) return { type: 'wait' };
  return { type: 'attack', id: weakest(adj).id };
}

// Walk toward dest along a cached BFS path, routing around monsters. If the
// way is fully blocked, attack the blocker when adjacent.
function moveToward(state, dest) {
  const floor = state.floor;
  const pos = { x: state.hero.x, y: state.hero.y };
  const destKey = dest.x + ',' + dest.y;

  const blocked = new Set(floor.monsters.map((m) => m.x + ',' + m.y));
  blocked.delete(destKey); // walking "to" a monster means walking up to it

  let path = state.pathKey === destKey ? state.path : null;
  if (!path || !path.length || blocked.has(path[0].x + ',' + path[0].y)) {
    path = findPath(floor, pos, dest, blocked);
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

// Step that maximizes distance from the nearest threat. Returns null when
// cornered (no step improves things).
function fleeStep(state, threats) {
  const floor = state.floor;
  const hero = state.hero;
  const occupied = new Set(floor.monsters.map((m) => m.x + ',' + m.y));
  const score = (p) => Math.min(...threats.map((t) => dist(p, t)));
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
