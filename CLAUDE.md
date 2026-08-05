# Idle Rogule (Rogule: Descent)

An idle roguelike inspired by rogule.com. The hero delves an emoji dungeon
by itself; the player makes a few high-impact decisions daily.

## Before any work
Read docs/tech-design.md. It defines the architecture, phases, and state
shape. Only build what the current phase (see below) requires. Do not add
features from future phases, even if they seem easy.

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
- All tuning numbers (combat dice, drop rates, ration costs, multipliers)
  live in docs/balance.md and are loaded as data. Never hardcode balance
  values in logic files.
- localStorage saves are versioned; any save-format change needs a
  migration in storage.js.

## Workflow
- Small commits with clear messages after each working change.
- After building something, briefly explain what was created and where,
  in plain language (the maintainer is not a professional developer).
- If a request conflicts with the tech design, say so before coding.

## Owner context
Solo maintainer, basic coding knowledge, builds via Claude Code.
Prefer simple readable code over clever code.
