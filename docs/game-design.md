# Roguidle — Game Design (MVP)

Companion doc to tech-design.md. This is WHAT the game is; the tech design is HOW.
When a build question is really a design question, answer it from here or ask the owner.

## Pillars

1. **Rogule's soul stays intact**: emoji minimalism, one shared daily seed for all
   players, shareable emoji result cards, minutes-per-day sessions.
2. **Idle with few, heavy decisions**: the game plays itself; the player makes
   exactly three kinds of decisions, each a real trade-off.
3. **Risk must overpay**: safe play has a hard ceiling; the best rewards only
   exist in risky states. "Low risk, just slower" must never be optimal.
4. **The login is a moment**: rare outcomes resolve in the player's hands
   (tap-to-open chests), never silently in a log.

## Core loop

The hero auto-delves an endless dungeon (the Descent): explore, bump-fight,
loot, descend. Rations fuel delving; at zero rations the hero camps and waits
(soft offline cap, never a punishment). The player checks in daily to read the
chronicle, open sealed chests, adjust the three levers, and run the Daily Gate.

**Rations are the time currency.** This is a core principle, not a knob:
anything that spends more ticks on a floor pays more rations for that floor.
It is why Cautious costs more per floor than Greedy despite being the careful
doctrine — P0 measured Cautious taking twice Greedy's ticks per floor, and
while it was also paying less, careful play strictly dominated: it out-lived
Greedy, out-earned it, and spent the surplus descending into the same death
wall. That ordering is deliberate and must not be "corrected" back.

## Run pacing

Reaching the Balrog gate takes roughly one to two weeks of normal play, and
that holds roughly constant across prestige cycles. What grows between cycles
is depth, not duration: run 1 spends ~10 days getting to floor 30, run 5 spends
~10 days getting to floor 70. Two targets follow from that. Cycle N must reach
the previous cycle's gate noticeably faster than cycle N-1 did — that speed-up
is where permanent progress is actually felt — while total run length stays at
one to two weeks, because the gate escalates to meet the stronger hero.

If runs stretch past about two and a half weeks, widen the power curve. Never
steepen difficulty scaling to compensate: that eats the permanent upgrades the
player just bought and makes prestige feel like running in place.

One consequence: with a two-week investment riding on it, the Balrog fight must
be readable rather than a coin flip. The danger has to be legible before the
player commits, and if a loss still lands too hard, soften the loss penalty
rather than making the fight easier.

## The three decisions

**Doctrine** (switch freely at camp or at any shrine):
- Greedy asks *what can I take*. Full-clears floors, seeks fights, maximum
  value per floor. Its risk accumulates as the pack fattens. Scores through loot.
- Swift asks *how far can I get*. Rushes stairs, best floors per ration, avoids
  fights and treats the ones it cannot avoid as tolls. Dies often, deep, and
  cheaply. Scores through depth.
- Cautious asks *what can I keep*. Selectively greedy: it engages only the
  fights the expected-damage math says it wins, so it has the fewest kills. It
  is the only doctrine that ends its own run on purpose (see the stop rule).
Doctrine changes DECISIONS in the auto-play AI, never the combat dice.

Doctrines are phase tools, not run identities. The healthy meta is rotating
them inside a single run: Swift across floors the hero has outgrown, Greedy
where the loot is worth the exposure, Cautious to consolidate a fat pack, then
optionally Swift again past the gate to pad max depth. If one doctrine is
strictly correct at every phase of a run, that is the imbalance alarm — fix it
before shipping. Switching is free and instant, at camp and at shrines both;
without mid-run switching the rotation meta does not exist, only a dropdown.

**The Cautious stop rule.** At each shrine Cautious estimates its survival odds
for the next stretch of floors. Below the threshold in balance.md it banks
everything and makes camp: the run ends there, alive, haul kept. Knowing how to
quit is the doctrine's whole identity. Its depth ceiling is the accepted price
of that, and its death rate is targeted under 10%.

**Bank or push** (at shrines, every 3 floors): carried loot gains Renown value
per shrine skipped (greed stacks; the per-stack figure lives in balance.md).
Banking sends it home safely and resets stacks. Death loses everything carried.
Standing order covers offline play (auto-bank every N shrines); manual override
wins when watching live. Shrines come every 3 floors rather than every 5 so
that a median run actually faces at least two live bank-or-push decisions — a
decision the player meets once per run is not a mechanic.

**Balrog prestige** (available past floor 30): ends the run, converts depth +
kills + banked wealth into Embers for permanent upgrades. Player chooses when.
Meta (embers, bestiary, relics, streak, renown) always persists; hero and run reset.

## Renown (score)

Earned at bank-time: loot value x current greed multiplier. Also from Warden
kills and Daily Gate results (Gate score scaled by doctrine difficulty:
Greedy clear > Swift clear > Cautious clear of the same dungeon).
Deaths lose carried potential but NEVER subtract earned Renown.

**Depth Renown.** The first time a run passes each floor threshold in
balance.md, that Renown banks automatically on the spot — no shrine required,
and nothing a later death can take back. This is Swift's scoring route: the
answer to what a doctrine that skips the loot actually earns. Tuning target:
no doctrine's median Renown sits below ~60% of the best doctrine's.

If Swift turns out underused, raise what depth pays — the depth Renown table,
deeper Wardens dropping better rares — and never buff its combat. Swift is the
doctrine defined by avoiding fights; making it fight well erases the identity.
MVP has no global leaderboard: share cards + local records (best Renown,
max depth, daily streak, no-death streak) are the competition surface.

## Risk-gated quality (pillar 3, concretely)

- Gilded chests can only drop while carrying 2+ greed stacks. A permanent
  auto-banker cannot see the top chest tier at all.
- Relic attunement (pity) accrues multiplied by current greed stacks.
- At each shrine, the UI shows estimated survival odds for the next stretch of
  floors. The skill of the game is reading your own state: push when strong,
  consolidate when weak. Risky EV when strong should be clearly positive
  (target +30-50%), not marginally fair. The same forecast math drives the
  Cautious stop rule, and it becomes the shrine UI in P1.

## Wardens and Balrog

Boss gates at floors 10 / 20 / 30. Each counters one doctrine so no single
build steamrolls. First loss returns scouting info (gimmick revealed), not
nothing. Indicative gimmicks (tune freely, keep the counter-doctrine intent):
- Floor 10, Broodmother (spiders): endless adds, punishes Cautious retreat logic.
- Floor 20, Coilfather (snake): damage scales with your unbanked greed stacks.
- Floor 30, Warden of Doors: hard turn timer, punishes slow full-clearing.
Balrog waits past 30 and is the prestige fight.

## Daily Gate

The real daily seed (date string), same dungeon for every player, Rogule-style.
Player picks 2 consumables before entering; the run auto-plays with current
hero + doctrine; skippable to instant result. Output: emoji share card with
depth, kill row, Renown earned, doctrine icon, streak. Streak counter with
Wordle-like psychology. Nothing bought or ground may break the fairness of the
shared-seed comparison.

## Chests and relics

Offline sim decides that chests dropped, never their contents. Contents roll
on tap at login (reveal stream RNG). Chronicle surfaces headline events and
near-misses honestly (generated by the sim, never faked).
5 launch relics, each with a published source + brutal base rate + attunement
pity, each build-warping (examples: Everflame from the floor-20 area, rations
never fully deplete; Fang of the First Wolf from wolf elites, lifesteal).
Rare stays rare: never inflate drop rates; add more chases instead.

Relics are the game's unique gear tier — confirmed, not an open question. They
drop from Balrog wins, occupy equipment slots like any other gear, and persist
through prestige forever. Common and rare gear resets at prestige except for a
single piece the player keeps. So the permanent wardrobe grows only by beating
Balrogs, which is what makes the gate worth a two-week run.

## Bestiary

Kill counts per monster type; each type has one mastery bonus at thresholds.
This makes account history = account power (a wolf-grinder is measurably a
wolf-slayer) and is the cheapest divergence system in the game.

## Explicitly OUT of MVP

Scars/boons, ventures, camp buildings, forge/crafting (loot drops gear
directly), companions, golden variants, seasons, Ascension, real leaderboard
backend, and programmable routes ("Swift until floor 15, then Greedy" —
switching stays a manual choice at camp and shrines for now). Do not implement
these even if referenced above or easy to add.

## Tone

Emoji-first, dry, slightly grim humor in chronicle text ("the hero ate a
mysterious mushroom. It was fine, probably."). Never punish the player for
not logging in; absence means the hero camps, nothing decays.
