# Roguidle

An idle roguelike inspired by rogule.com. The hero delves an emoji dungeon
by itself; the player makes decisions when it matters.

## Hard rules
- Vanilla JS, ES modules. No frameworks, no npm, no build step, no
  TypeScript. Must run by opening HTML files / GitHub Pages as-is.
- ROT.js from CDN is the only external library.
- Math.random() is BANNED in src/sim/ and src/game/ — seeded rng only
  (src/sim/rng.js). Same seed + same decisions = same result, always.
- tick() stays pure: no DOM, no Date.now(), no storage inside src/sim/.
- No balance value hardcoded in logic files. Numbers live in
  src/sim/balance.js — one file, no mirror in the docs.
- Saves are versioned; any format change needs a migration in
  src/game/state.js.

## Workflow
- Small commits, clear messages.
- Tune by playing: change a number, open the game, see if it's better.
  run-sim.html's batch simulator is an occasional tool, not required.
- Explain what changed in plain language when done (not a pro dev).
- If a request conflicts with docs/notes/, say so before coding.

## Running it
`python tools/dev-server.py` then open http://localhost:8137/index.html —
disables browser caching so edits to src/*.js actually take effect.

## Owner context
Solo maintainer, basic coding knowledge, builds via Claude Code.
Prefer simple readable code over clever code.
