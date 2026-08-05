// Seeded floor generation, wrapping ROT.js (the only external library).
// Every floor derives its seed from (runSeed, depth), so the same account
// seed always produces the same dungeon — identically for every doctrine.
import * as ROT from 'https://cdn.jsdelivr.net/npm/rot-js@2.2.0/+esm';
import { BALANCE } from './balance.js';
import { makeRng, hashSeeds, randInt, chance, pickWeighted } from './rng.js';

const key = (x, y) => x + ',' + y;

// Chebyshev distance (diagonals count as 1) — used for aggro ranges.
export function dist(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Orthogonally adjacent (bump-combat range).
export function adjacent4(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function makeFloor(runSeed, depth, greedStacks) {
  const B = BALANCE;
  const w = B.floors.width;
  const h = B.floors.height;
  const floorSeed = hashSeeds(runSeed, depth);
  const rng = makeRng(hashSeeds(floorSeed, 7));

  // ROT's digger uses ROT's own RNG; seeding it from our derived seed keeps
  // the whole floor deterministic.
  ROT.RNG.setSeed(floorSeed);
  const digger = new ROT.Map.Digger(w, h);
  const passable = new Set();
  digger.create((x, y, wall) => {
    if (!wall) passable.add(key(x, y));
  });

  const rooms = digger.getRooms();
  const centers = rooms.map((r) => {
    const [x, y] = r.getCenter();
    return { x, y };
  });
  // Fallback if the digger somehow made no rooms: use passable tiles.
  if (centers.length === 0) {
    for (const k of passable) {
      const [x, y] = k.split(',').map(Number);
      centers.push({ x, y });
      if (centers.length >= 2) break;
    }
  }

  const heroStart = centers[0];
  let stairs = centers[centers.length - 1];
  let best = -1;
  for (const c of centers) {
    const d = Math.abs(c.x - heroStart.x) + Math.abs(c.y - heroStart.y);
    if (d > best) {
      best = d;
      stairs = c;
    }
  }

  // Tiles available for placing things (never the start or the stairs).
  const openTiles = [];
  for (const k of passable) {
    const [x, y] = k.split(',').map(Number);
    if (x === heroStart.x && y === heroStart.y) continue;
    if (x === stairs.x && y === stairs.y) continue;
    openTiles.push({ x, y, taken: false });
  }
  const takeTile = (minDistFromStart) => {
    for (let tries = 0; tries < 60; tries++) {
      const t = openTiles[randInt(rng, 0, openTiles.length - 1)];
      if (t.taken) continue;
      if (minDistFromStart && dist(t, heroStart) < minDistFromStart) continue;
      t.taken = true;
      return t;
    }
    return null;
  };

  // Monsters — count and mix scale with depth, stats with biome.
  const biome = Math.ceil(depth / 10);
  const scale = Math.pow(B.floors.biome_scale_per_biome, biome - 1);
  const count = Math.min(
    B.floors.monsters_max,
    B.floors.monsters_base + Math.floor(depth / B.floors.monsters_per_depth_div)
  );
  const band = B.floors.spawn_weights.find((b) => depth <= b.up_to_depth);
  const monsters = [];
  for (let i = 0; i < count; i++) {
    const t = takeTile(4); // never right on top of the hero
    if (!t) break;
    const type = pickWeighted(rng, Object.entries(band.weights));
    const base = B.monsters[type];
    const elite = chance(rng, B.elite.spawn_rate);
    const m = {
      id: i,
      type,
      elite,
      hp: Math.round(base.hp * scale) * (elite ? B.elite.hp_mult : 1),
      atk: Math.round(base.atk * scale) + (elite ? B.elite.atk_bonus : 0),
      def: Math.round(base.def * scale),
      xp: Math.round(base.xp * scale) * (elite ? B.elite.xp_mult : 1),
      goldMin: Math.round(base.gold[0] * scale) * (elite ? B.elite.gold_mult : 1),
      goldMax: Math.round(base.gold[1] * scale) * (elite ? B.elite.gold_mult : 1),
      x: t.x,
      y: t.y,
      spawnX: t.x,
      spawnY: t.y,
    };
    m.maxHp = m.hp;
    monsters.push(m);
  }

  // Chest PRESENCE only — contents never roll in the sim (login reveal).
  // Gilded tier requires carrying enough greed stacks (risk-gated quality).
  const chests = [];
  for (const tier of ['common', 'rare', 'gilded']) {
    if (tier === 'gilded' && greedStacks < B.shrines.gilded_min_stacks) continue;
    if (chance(rng, B.chests.drop_chance[tier])) {
      const t = takeTile(0);
      if (t) chests.push({ tier, x: t.x, y: t.y });
    }
  }

  // Loose gold piles.
  const piles = [];
  const nPiles = randInt(rng, B.floors.gold_piles[0], B.floors.gold_piles[1]);
  for (let i = 0; i < nPiles; i++) {
    const t = takeTile(0);
    if (t) {
      piles.push({
        amount: randInt(rng, B.floors.gold_per_pile[0], B.floors.gold_per_pile[1]),
        x: t.x,
        y: t.y,
      });
    }
  }

  return { w, h, depth, passable, heroStart, stairs, monsters, chests, piles };
}

// BFS pathfinding, 4-directional. `blocked` is an extra Set of "x,y" tiles to
// treat as walls (monster positions). Returns [{x,y}, ...] where the first
// element is the next step, or null if unreachable. Fully deterministic.
export function findPath(floor, from, to, blocked) {
  if (from.x === to.x && from.y === to.y) return [];
  const prev = new Map();
  prev.set(key(from.x, from.y), null);
  const queue = [from];
  let qi = 0;
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      if (!floor.passable.has(k)) continue;
      const isGoal = nx === to.x && ny === to.y;
      if (!isGoal && blocked && blocked.has(k)) continue;
      prev.set(k, cur);
      if (isGoal) {
        const path = [];
        let node = { x: nx, y: ny };
        while (node && !(node.x === from.x && node.y === from.y)) {
          path.unshift({ x: node.x, y: node.y });
          node = prev.get(key(node.x, node.y));
        }
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
