// Seeded PRNG (mulberry32) and helpers. ALL randomness in src/sim and
// src/game flows through here — Math.random() is banned there (CLAUDE.md).

// Returns a function that yields floats in [0, 1), fully determined by seed.
export function makeRng(seed) {
  let a = seed >>> 0;
  function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // The whole generator state is one 32-bit int, so a run can be paused,
  // saved, and resumed without changing a single roll. Determinism has to
  // survive closing the tab, not just staying in one session.
  rng.getState = () => a >>> 0;
  rng.setState = (s) => { a = s >>> 0; };
  return rng;
}

// Derive a new independent seed from two integers (e.g. runSeed + floor
// number). Same inputs always give the same output.
export function hashSeeds(a, b) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h + Math.imul(b | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function rollDie(rng, sides) {
  return 1 + Math.floor(rng() * sides);
}

// Integer in [min, max] inclusive.
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// True with probability p.
export function chance(rng, p) {
  return rng() < p;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// entries: [[item, weight], ...] — picks an item proportionally to weight.
export function pickWeighted(rng, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng() * total;
  for (const [item, w] of entries) {
    r -= w;
    if (r < 0) return item;
  }
  return entries[entries.length - 1][0];
}
