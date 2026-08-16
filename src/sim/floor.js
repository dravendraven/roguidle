// Seeded floor generation, wrapping ROT.js (the only external library).
// Every floor derives its seed from (runSeed, depth), so the same account
// seed always produces the same dungeon.
import * as ROT from 'https://cdn.jsdelivr.net/npm/rot-js@2.2.0/+esm';
import { BALANCE } from './balance.js';
import { makeRng, hashSeeds, randInt, chance, pickWeighted } from './rng.js';

const key = (x, y) => x + ',' + y;

// Bestiary ordered by danger tier — index i is BALANCE.monsters[NAME].tier.
const CREATURE_BY_TIER = Object.entries(BALANCE.monsters)
  .sort((a, b) => a[1].tier - b[1].tier)
  .map(([name]) => name);

// Chebyshev distance (diagonals count as 1) — used for aggro ranges.
export function dist(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Orthogonally adjacent (bump-combat range).
export function adjacent4(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

// Danger tier a spawn tile targets: rises with depth, and — taken from
// rogule.com's generator — with how far the tile sits from the hero's
// start, so one floor has a safe edge and a dangerous core rather than
// every tile being equally tough.
function targetTier(depth, distFrac, rng) {
  const F = BALANCE.floors;
  const base = depth / F.depth_tier_span;
  const spread = (distFrac - 0.5) * 2 * F.distance_spread;
  const jitter = randInt(rng, -F.tier_jitter, F.tier_jitter);
  const tier = Math.round(base + spread + jitter);
  return Math.max(0, Math.min(CREATURE_BY_TIER.length - 1, tier));
}

export function makeFloor(runSeed, depth) {
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
  const maxDist = Math.max(w, h);

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

  // Monsters — count scales with depth; each one's TYPE is picked by how
  // far its tile sits from the entrance (see targetTier).
  const count = Math.min(
    B.floors.monsters_max,
    B.floors.monsters_base + Math.floor(depth / B.floors.monsters_per_depth_div)
  );
  const monsters = [];
  // Spread spawns out (monster_min_spacing) so the hero rarely fights a pack.
  const spacedTile = () => {
    for (let tries = 0; tries < 40; tries++) {
      const t = takeTile(4); // never right on top of the hero
      if (!t) return null;
      if (monsters.some((m) => dist(m, t) < B.floors.monster_min_spacing)) {
        t.taken = false; // hand the tile back for other placements
        continue;
      }
      return t;
    }
    return takeTile(4); // give up on spacing rather than under-populate
  };
  for (let i = 0; i < count; i++) {
    const t = spacedTile();
    if (!t) break;
    const distFrac = Math.min(1, dist(t, heroStart) / maxDist);
    const type = CREATURE_BY_TIER[targetTier(depth, distFrac, rng)];
    const base = B.monsters[type];
    const elite = depth >= B.elite.min_depth && chance(rng, B.elite.spawn_rate);
    const m = {
      id: i,
      type,
      elite,
      radius: base.radius,
      hp: base.hp * (elite ? B.elite.hp_mult : 1),
      atk: base.atk + (elite ? B.elite.atk_bonus : 0),
      def: base.def,
      xp: base.xp * (elite ? B.elite.xp_mult : 1),
      goldMin: base.gold[0] * (elite ? B.elite.gold_mult : 1),
      goldMax: base.gold[1] * (elite ? B.elite.gold_mult : 1),
      x: t.x,
      y: t.y,
      spawnX: t.x,
      spawnY: t.y,
    };
    m.maxHp = m.hp;
    monsters.push(m);
  }

  // The floor's boss stands on the stairs. It blocks the way down by simply
  // being there — no separate "stairs locked" rule to keep in sync.
  const bossDepthEmoji = B.boss.emoji[Math.min(B.boss.emoji.length - 1, Math.floor((depth - 1) / 4))];
  const boss = {
    id: 9000,
    type: 'boss',
    boss: true,
    elite: false,
    emoji: bossDepthEmoji,
    radius: 0, // stationary; combat starts when the hero walks up
    hp: B.boss.hp(depth),
    atk: B.boss.atk(depth),
    def: B.boss.def(depth),
    xp: B.boss.xp(depth),
    goldMin: B.boss.gold(depth)[0],
    goldMax: B.boss.gold(depth)[1],
    x: stairs.x,
    y: stairs.y,
    spawnX: stairs.x,
    spawnY: stairs.y,
  };
  boss.maxHp = boss.hp;
  monsters.push(boss);

  // Scenery finds (rogule.com: items hidden under a rock or a plant) — an
  // instant, small, no-decision reward for walking over them, complementing
  // the boss chests rather than competing with them.
  const finds = [];
  const nFinds = randInt(rng, B.pickups.per_floor[0], B.pickups.per_floor[1]);
  for (let i = 0; i < nFinds; i++) {
    const t = takeTile(0);
    if (!t) break;
    const kind = pickWeighted(rng, B.pickups.types.map((p) => [p, p.weight]));
    finds.push({ emoji: kind.emoji, value: kind.value, x: t.x, y: t.y });
  }

  return { w, h, depth, passable, heroStart, stairs, monsters, finds };
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
