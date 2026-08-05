# Idle Rogule (Rogule: Descent)

An idle roguelike inspired by rogule.com. The hero delves an emoji dungeon
by itself; the player makes a few high-impact decisions daily.

## Before any work
Read, in this order:
1. docs/game-design.md — what the game is. Design questions get answered
   here or by asking the owner, never by inventing defaults.
2. docs/tech-design.md — architecture, state shape, build phases.
3. docs/balance.md — the single source of truth for ALL tuning numbers.

Only build what the current phase requires. Do not add features from future
phases or from the "Explicitly OUT of MVP" list in game-design.md, even if
they seem easy or are mentioned in the docs.

**Current phase: P0** (update this line manually as phases complete)

## Hard rules
- Vanilla JavaScript, ES modules. No frameworks, no npm, no build step,
  no TypeScript. Must run by opening HTML files / GitHub Pages as-is.
- ROT.js from CDN is the only external library.
- Math.random() is BANNED in src/sim/ and src/game/. All randomness goes
  through the seeded rng (src/sim/rng.js). Determinism is sacred: same
  seed + same decisions = same result, always.
- tick() stays a pure function: no DOM, no Date.now(), no storage access
  inside src/sim/.
- No balance value may be hardcoded in logic files. Numbers live in
  docs/balance.md and are mirrored in one loadable data module. If a
  needed number is missing from balance.md, add it there first with an
  // INITIAL GUESS comment, then use it.
- localStorage saves are versioned; any save-format change needs a
  migration in storage.js.

## Workflow
- Small commits with clear messages after each working change.
- After building something, briefly explain what was created and where,
  in plain language (the maintainer is not a professional developer).
- If a request conflicts with the tech design or game design, say so
  before coding.
- When tuning: change balance.md, rerun the batch simulator, report the
  before/after distributions. Never tune by feel alone.

## Owner context
Solo maintainer, basic coding knowledge, builds via Claude Code.
Prefer simple readable code over clever code.
