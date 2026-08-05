# Idle Rogule — Tech Design (MVP)

Working title: **Rogule: Descent**. An idle companion to Rogule: the hero delves an endless emoji dungeon on its own, the player logs in daily to open chests, make three decisions, and run the shared daily seed.

This document targets a solo builder with basic coding knowledge, working with AI assistance, deploying to GitHub Pages. Every technical choice below is filtered through that constraint: no build tools, no server, no accounts, nothing that needs babysitting.

## 1. Constraints and principles

The game must be a static website: plain files served by GitHub Pages. All simulation runs in the player's browser. All save data lives in the player's browser (localStorage). There is no backend in the MVP.

Three engineering principles carry the whole design:

**Determinism.** Every random outcome comes from a seeded random number generator. Same seed plus same decisions equals same result, always. This is what makes the daily seed shared across players (like Rogule), makes bugs reproducible, and keeps the door open for a verified leaderboard later.

**The sim is a pure function.** One function, `tick(state, orders, rng) -> { state, events }`, contains all game logic. It knows nothing about the screen, the clock, or storage. The UI, the offline fast-forward, and the daily gate are all just different callers of this same function.

**Events are the currency between systems.** The tick emits a list of events (`monster_killed`, `chest_found`, `shrine_reached`, `hero_died`, `warden_encountered`...). The chronicle is a filter over events. The chest queue is a filter over events. Renown is a fold over events. New features later (scars, ventures) are new event types, not new architecture.

## 2. Stack

Vanilla JavaScript with ES modules (`<script type="module">`), no framework, no bundler, no npm. HTML and CSS by hand. ROT.js loaded from CDN (`rot-js` on jsdelivr or cdnjs) for dungeon generation, FOV and pathfinding — this is the same engine family underneath Rogule's feel. Emoji as the entire art budget, exactly like Rogule.

Rogule itself is ClojureScript compiled via shadow-cljs. We deliberately keep its *style* (emoji, seeded, client-side, tiny) and drop its *stack*, because ClojureScript is a steep learning curve with no payoff for this project.

Storage is `localStorage` with a versioned JSON save, plus an export/import feature (the save serialized to a base64 string the player can copy) as backup against cleared browser data. Export/import ships in the MVP, not later — losing a 3-week account to a cache clear kills the game for that player permanently.

## 3. Repository layout

```
idle-rogule/
  index.html          entry point, loads everything
  style.css
  src/
    main.js           boot, screen routing, game loop timer
    sim/
      tick.js         THE pure function: one hero action step
      floor.js        seeded floor generation (wraps ROT.js)
      combat.js       Rogule-style dice combat resolution
      doctrine.js     Greedy / Swift / Cautious decision tables
      offline.js      fast-forward elapsed time into ticks
      rng.js          seeded PRNG (mulberry32) + helpers
    game/
      state.js        state shape, initial state, migrations
      events.js       event type definitions and constructors
      renown.js       score fold over events
      relics.js       drop tables, attunement pity
      wardens.js      the 3 warden fights + balrog
      dailygate.js    daily seed run, reuses tick.js
      share.js        emoji share card generator
    ui/
      screens.js      camp, descent view, chronicle, ember tree
      chronicle.js    render event log with headline detection
      chests.js       tap-to-open reveal flow
    storage.js        save/load/migrate/export/import
  docs/
    balance.md        tuning numbers in one place
```

GitHub Pages serves the repo root (or `/docs`) directly. Deploy = `git push`. No CI needed initially.

## 4. The simulation core

### 4.1 Two resolutions, one rulebook

The sim runs at two levels of detail, both driven by the same probability tables:

**Watchable mode** (game tab open): the tick runs every ~400ms, one hero action per tick (move, attack, eat, pick up), rendered live on the emoji grid. This is the "watch it play itself" idle fantasy.

**Fast-forward mode** (returning after time away): replaying hours of 400ms ticks would take minutes of CPU, so offline time resolves at *floor* granularity instead. Each floor becomes one aggregate roll: expected damage taken, loot found, kills, and survival odds, computed from the same combat math as watchable mode, consuming the same RNG stream. Target budget: resolve 24 hours of offline play in under 2 seconds. Floor-level resolution will drift slightly from step-level resolution; this is acceptable because no player ever sees both resolutions of the same floor.

`offline.js` computes `elapsedMs` from the saved timestamp, converts to available hero-hours (capped by rations), and loops floor resolutions until time or rations run out, accumulating events. Chest *contents* are not rolled here — only chest *drops*. Contents roll when the player taps to open, preserving the login reveal moment.

### 4.2 Determinism and RNG

`rng.js` implements mulberry32 (tiny, seedable, good enough). Three separate streams to keep systems independent: the descent stream (seeded per prestige run from `accountSeed + runNumber`), the daily gate stream (seeded from the date string, e.g. `"2026-8-5"`, identical for all players, exactly Rogule's scheme), and the reveal stream (chest contents, seeded per chest at drop time so opening order doesn't change outcomes).

Rule: `Math.random()` is banned from `src/sim/` and `src/game/`. UI-only effects (animation jitter) may use it.

### 4.3 Combat

Port Rogule's feel: bump combat, small integer HP, dice-style hit resolution (attacker rolls vs defender rolls, gear shifts the dice). Exact tables live in `docs/balance.md` as data, not code, so tuning never touches logic. Doctrine changes *decisions* (engage? flee? full-clear? rush stairs?), never the dice themselves — this keeps the combat model auditable and the doctrines honestly comparable.

## 5. State shape (sketch)

```js
{
  version: 3,
  accountSeed: 174233,
  lastSeenAt: 1791234567890,
  hero: { hp, maxHp, level, xp, gear: [...], rations, floor,
          carried: { gold, parts: {...}, greedStacks } },
  run:  { number, doctrine, standingOrder, deaths, maxFloor },
  meta: { embers, emberNodes: [...], bestiary: { wolf: 214, ... },
          relics: { everflame: { owned: false, attunement: 41 } },
          renown, bestRenown, maxDepthEver },
  daily:{ lastPlayed: "2026-8-5", streak, consumables: [...] },
  pendingChests: [ { tier, seedAt, source } ],
  chronicle: [ ...last 200 events ]
}
```

Migrations: `storage.js` holds an ordered list of migration functions keyed by version. Never mutate save format without adding one.

## 6. Feature-to-module map

The three decisions: doctrine is a dropdown writing `run.doctrine`, read by `doctrine.js` each tick. Bank-or-push is `run.standingOrder` (auto-bank every N shrines) applied inside the tick at shrine events, with a manual override button when watching live. The Balrog trigger is a button (available past floor 30) that ends the run through `wardens.js`, computes the Ember payout, and resets `hero` + `run` while keeping `meta`.

Renown: `renown.js` folds bank events (`loot × greedMultiplier`), warden kills, and daily gate results into `meta.renown`. Deaths never subtract. Season windows are a later concern; MVP tracks lifetime + best.

Daily gate: `dailygate.js` builds a fixed-size dungeon from the date seed, runs the hero through it with tick.js in watchable mode (skippable to instant-resolve), and hands the outcome to `share.js`, which emits a Rogule-style emoji card: depth, kills row, Renown earned, streak, doctrine icon.

Relics: 5 launch relics, each with a published source and base rate in `balance.md`. Every kill of a relic's source increments `attunement`, which multiplies the drop rate (soft pity). Gilded chest tier requires `greedStacks >= 2` at drop time — the risk-gated quality rule from the design.

## 7. Leaderboard path

MVP: no server, so no global board. Competition is share cards plus local records (best Renown, max depth, longest streak, no-death streak). The share card *is* the leaderboard for a friend group, exactly as Rogule/Wordle work.

Later, if wanted: Supabase free tier or a Cloudflare Worker + KV for score submission. Because the sim is deterministic and decisions are loggable, the ambitious version submits `(seed, decision log)` and the server replays to verify — cheat-resistant with no server-side game hosting. The architecture requires nothing now beyond keeping determinism intact.

## 8. Build phases

**P0 — Headless core (first weekend).** `rng.js`, `floor.js`, `combat.js`, `doctrine.js`, `tick.js` running in the browser console or Node, printing a text chronicle. Goal: watch a Greedy hero and a Swift hero produce visibly different logs from the same seed. This is also the balance testbed — simulate 1,000 runs and check death rates per floor before any UI exists.

**P1 — Idle shell.** State + storage + offline fast-forward + a minimal camp screen: chronicle list, chest tap-opening, the three decision controls, ration counter. The game is now playable-in-anger and installable as a bookmark.

**P2 — The watchable descent + daily gate.** Emoji grid rendering (a CSS grid of `<span>`s is enough, no canvas needed), live tick view, then the daily gate reusing the same renderer, plus the share card. This is the moment to show friends.

**P3 — Meta.** Ember tree (12 nodes, one screen), 3 wardens + Balrog prestige, bestiary masteries, 5 relics with attunement.

**P4 — Optional.** Leaderboard backend, seasons, sounds, PWA manifest for a home-screen icon.

Each phase ends deployed to GitHub Pages. Nothing sits unshipped.

## 9. Risks and mitigations

Fast-forward drift: floor-level and step-level resolution disagreeing enough to feel unfair. Mitigation: derive floor aggregates from Monte Carlo runs of the real tick during development, and store them as tables.

Balance blindness: idle curves are impossible to eyeball. Mitigation: P0's headless sim doubles as a batch simulator; every tuning change reruns 1,000 seeded runs and prints death/loot/depth distributions.

Save loss: localStorage is fragile. Mitigation: export/import in MVP, plus an autosave of the export string offered after each prestige.

Tab-open cheating (leaving the tab open overnight to run watchable mode): irrelevant in a client-only game with no shared board; revisit only if P4 happens.

Scope creep: the design docs describe scars, ventures, ascension and more. None of it enters the repo before P3 ships. The event system is the pressure valve — future features are event types, so postponing them costs nothing.
