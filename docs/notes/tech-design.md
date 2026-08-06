# Roguidle — Tech Design

Companion to game-design.md (what) — this is how it's built.

## Principles

**Determinism.** Every random outcome comes from the seeded rng
(src/sim/rng.js). Same seed + same decisions = same result, always —
it's what lets offline catch-up and watched play produce identical
outcomes.

**The sim is a pure function.** `tick(state, orders, rng) -> { state,
events }` holds all game logic. It knows nothing about the screen, the
clock, or storage — the UI and the offline fast-forward are both just
callers of this same function, at the same rate.

**Events are the currency between systems.** The tick emits events
(`monster_killed`, `boss_killed`, `hero_died`...). The chronicle is a
filter over events; the chest queue is built by folding `boss_killed`
events into `pendingChests`.

## State shape (sketch)

```js
{
  version: 3,
  accountSeed, lastSeenAt,
  hero: { hp, maxHp, level, xp, equipment: { weapon, armor, relic },
          rations, floor, carried: { gold, chests, greedStacks } },
  run:  { number, doctrine, standingOrder, deaths, maxFloor, rngState },
  meta: { renown, bestRenown, maxDepthEver, ... },
  pendingChests: [ { tier, seedAt, depth } ],
  chronicle: [ ...last 200 events ],
}
```

Migrations: `src/game/state.js` holds an ordered list keyed by version.
Never change the save shape without adding one.

## Repo layout

```
index.html / style.css   entry point
src/
  main.js                 boot, the one screen, the tick loop timer
  storage.js              save / load / migrate
  sim/                    the pure core — tick, floor gen, combat, rng
  game/                   state shape, gear
  ui/                     grid rendering
tools/dev-server.py       local server with caching off
```
