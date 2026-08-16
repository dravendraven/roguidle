// What the hero DECIDES each tick: attack / move / pickup / rest / descend
// / wait. Uses no randomness at all: same state, same decision.
import { BALANCE } from './balance.js';
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

// Full-clears floors: kill everything, grab everything, then descend.
// Rests when hurt and nothing is nearby.
export function decideAction(state) {
  const B = BALANCE;
  const { hero, floor } = state;
  const pos = { x: hero.x, y: hero.y };
  const hpFrac = hero.hp / hero.maxHp;

  // Free loot underfoot.
  if (at(floor.finds, pos.x, pos.y)) return { type: 'pickup' };

  const adj = floor.monsters.filter((m) => adjacent4(m, pos));

  // Failsafe (floor took too long): march to the stairs, fight through.
  if (state.forceStairs) {
    const onStairs = pos.x === floor.stairs.x && pos.y === floor.stairs.y;
    if (onStairs) return { type: 'descend' };
    if (adj.length) return { type: 'attack', id: weakest(adj).id };
    return moveToward(state, floor.stairs);
  }

  if (adj.length) return { type: 'attack', id: weakest(adj).id };

  // Keep an ongoing rest going until back up near full.
  const near = floor.monsters.some((m) => dist(m, pos) <= (m.radius || 0));
  const resting = state.restSession && hero.hp < hero.maxHp && hpFrac < B.ai.rest_until_frac;
  if ((resting || hpFrac < B.ai.rest_below_frac) && !near) return { type: 'rest' };

  const target = nearest(pos, floor.monsters) || nearest(pos, floor.finds);
  if (target) return moveToward(state, target);

  const onStairs = pos.x === floor.stairs.x && pos.y === floor.stairs.y;
  if (onStairs) return { type: 'descend' };
  return moveToward(state, floor.stairs);
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
