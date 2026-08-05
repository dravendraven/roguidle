# Balance — single source of truth for all tuning numbers

Rule from CLAUDE.md: no balance value may be hardcoded in logic files.
Code loads these values as data (a balance.js module mirroring this file,
or this file parsed directly). When a number changes here, it changes there.

Status: INITIAL GUESSES. Every value below must be validated by the P0 batch
simulator (1,000 seeded runs per doctrine) before being treated as real.
Tuning targets are listed so future tuning sessions know what "good" means.

## Tuning targets (what we are aiming for, not values)

- First hero death: somewhere on floors 6-12 for a fresh account.
- Reaching the Balrog gate: 1-2 weeks of normal play, held roughly CONSTANT
  across prestige cycles. What grows between cycles is depth, not duration
  (run 1: ~10 days to floor 30; run 5: ~10 days to floor 70).
  // was "First Balrog prestige: day 3-4 of normal play" — owner decision
  // 2026-08-05 replaced it. A 3-day gate cannot carry a prestige economy.
- Prestige speed-up: cycle N reaches cycle N-1's gate noticeably faster than
  N-1 did. That speed-up is where permanent progress is felt.
- If runs stretch past ~2.5 weeks: widen the power curve. NEVER steepen
  difficulty scaling to compensate — that eats the upgrades just bought.
- Greedy vs Swift vs Cautious: visibly different chronicles on the same seed;
  Swift reaches ~30% deeper per ration, Greedy earns ~50% more loot/kills.
- Cautious death rate under 10% (was "under 1/3 of Greedy's"). Cautious ends
  its own run at shrines when the forecast turns bad, so its deaths are
  genuine surprises, not the cost of doing business. Depth ceiling is the
  accepted price.
- Renown parity: no doctrine's MEDIAN Renown below ~60% of the best doctrine's.
  Batch reports carry a Renown column per doctrine from now on.
- Bank-or-push: a median run faces at least 2 live decisions. One decision per
  run is not a mechanic.
- Pushing shrines while strong: informed EV clearly positive (+30-50% Renown),
  suicidal while weak. Survival forecast accuracy matters more than fairness.
- 24h offline on a full early-game larder: rations run out around hour 14-18.

## Core principle: rations are time

Rations are the time currency. Anything that spends more ticks per floor pays
more rations per floor — this is a principle, not a knob, and the Cautious
(2.0) above Greedy (1.5) ordering that follows from it must not be reverted.
P0 measured why: Cautious took ~2x Greedy's ticks per floor while paying less,
so careful play strictly dominated (see ration_cost_per_floor below).

## Doctrine switching

Free and instant, at camp AND at any shrine mid-run. No cost, no cooldown.
Doctrines are phase tools; the rotation IS the meta, and it only exists if a
player can switch mid-run. Programmable routes are post-MVP (game-design.md).

## Hero

start_hp: 14
// was 10, then 12; with a damage cap of 4, two bad rolls erase 8 hp — floor
// 1-3 deaths were pure dice variance until the pool could absorb them
hp_per_level: 2
xp_curve: level_n_requires = 10 * n
// was 10*n*n; batch 2 showed heroes stuck at level 2 while depth scaled up —
// the hero must be able to outgrow the early dungeon, and a kill-fed curve
// is what makes Greedy's extra kills mean something.
// interpretation: advancing FROM level n TO n+1 costs 10*n xp.
level_up_heal: full   // INITIAL GUESS — leveling restores hp to max
start_rations: 12
// was 20; batch 3 showed the fresh-hero death wall sits around floors 8-13,
// so 20 rations meant nobody ever lived to camp. 12 = greedy dry at floor 8,
// cautious at 10, swift at 15 — the larder runs out before the wall for the
// careful doctrines, which is what makes "cautious rarely dies" true.
ration_cost_per_floor: { greedy: 1.5, swift: 0.8, cautious: 2.0 }
// cautious was 1.2. Measured: cautious spends ~1900 ticks per run to greedy's
// ~900 — twice the time on each floor, for FEWER rations. That made careful
// play strictly better: it out-lived greedy AND out-earned it, then pushed
// deeper into the death wall and died just as often (x1.27 greedy's rate).
// Rations are time as much as food, so the slow doctrine now pays for the
// clock it burns. This is pillar 3 ("safe play has a hard ceiling") expressed
// as a number: cautious is now depth-limited to ~6 floors and rarely dies,
// greedy reaches ~8 and dies often, swift reaches ~11 and dies most.
// OWNER: this reverses the doc's original ordering, so flagging it loudly.

## Combat (Rogule-style dice)

attack_roll: 1d6 + weapon_bonus
defense_roll: 1d6 + armor_bonus
damage_on_hit: 1 + max(0, attack_roll - defense_roll) // capped at 4
// interpretation (owner-approved 2026-08-05): no separate miss roll — every
// swing lands; a losing attack roll still deals the base 1 damage.
flee_check_cautious: flee if hp < 65% max_hp
// was 40%, then 50%; two capped hits can erase ~55% of an early hp pool, so
// fleeing at half was fleeing too late (batches 1 and 5)

## Monsters (biome 1: caves, floors 1-10)

rat:    { hp: 2, atk: 0, def: 0, xp: 1 }
bat:    { hp: 2, atk: 0, def: 1, xp: 1 }
wolf:   { hp: 4, atk: 1, def: 1, xp: 3 }
spider: { hp: 3, atk: 1, def: 0, xp: 2 }
elite_multiplier: { hp: x3, atk: +1, xp: x4, spawn_rate: 0.04 }
gold_drops: { rat: 0-2, bat: 0-2, spider: 1-3, wolf: 2-5 } // INITIAL GUESS
elite_gold_mult: x3 // INITIAL GUESS

// biome 2 (crypts, 11-20) and biome 3 (barrows, 21-30): define during P3,
// scale roughly +60% stats per biome.

## Floors and spawning (P0 additions)

floor_width: 32    // INITIAL GUESS
floor_height: 20   // INITIAL GUESS
monsters_per_floor: 3 + floor(depth / 3), capped at 8
// was 4 + depth/3 cap 9; tuned after batch 1 (100% deaths, median floor 2)
monster_min_spacing: 3 // min distance between monster spawns // INITIAL GUESS
// batch 4: clustered spawns meant 2-3 monsters per brawl; ~30% of heroes of
// EVERY doctrine died on floors 1-5 to gang-ups
spawn_weights: // INITIAL GUESS — relative weights per depth band
  floors_1_3:    { rat: 5, bat: 3, spider: 1, wolf: 0 }
  floors_4_6:    { rat: 3, bat: 3, spider: 2, wolf: 1 }
  floors_7_plus: { rat: 1, bat: 2, spider: 3, wolf: 2 } // wolf 3→2, batch 2
gold_piles_per_floor: 0-2, amount 3-8 each // INITIAL GUESS
biome_scaling: monster hp/atk/def/xp/gold x1.6 per biome past the first,
  biome = ceil(depth / 10) // INITIAL GUESS placeholder until P3 real biomes

## Hero AI and healing (P0 additions)

rest_ticks_per_hp: 2  // resting heals 1 hp per 2 ticks (was 3, batch 1)
rest_below_frac: { greedy: 0.70, swift: 0.65, cautious: 0.70 } // (batch 3: swift 0.40→0.65)
rest_until_frac: { greedy: 0.90, swift: 0.90, cautious: 0.90 } // (batch 3: swift 0.60→0.90)
// swift rests generously: resting costs time, never rations, and rations are
// swift's slack resource — diving at level 1 on low hp was killing it at floor 5
cautious_reserve_frac: 0.55 // fight only if expected hp cost leaves this
// was 0.40 (batch 4): a "favorable" wolf at 12 hp still lost to one bad
// dice streak — cautious must price in variance, not just expectation
cautious_variance_margin: 1.6 // INITIAL GUESS — multiplies the expected cost
// of a fight before cautious accepts it. Damage swings 1-4 against a 14 hp
// pool, so planning on the average loses every fight that lands on the tail;
// a traced death went 11 -> 8 -> 4 -> 2 -> dead in a fight priced at ~3 hp.
retreat_is_committed: true // batch 9 trace: the hero stepped back, lost
// "adjacent", turned around, walked into the same monster and ate a free hit,
// forever. Once retreating it stays retreating until nothing is in chase range.
cautious_detour_tiles: 6 // INITIAL GUESS — how far cautious will step off its
// route to the stairs for a fight or some loot. Cautious does not hunt: batch
// 7 showed it spending 2097 ticks/run to greedy's 909, and time-on-floor is
// exposure. Lower = safer and poorer.
// TRIED AND REVERTED (batch 8): retreating by pathing to the stairs. It drags
// a wounded hero through unexplored floor and made deaths worse (50%->85%).
// Retreat stays a local step-away from ADJACENT threats only.
// 120 of 145 cautious deaths were 1-on-1 at ~2 hp with one adjacent monster.
// (A "camp when outmatched" rule was tried and removed: it fired on 0 of 1622
// floors, because a full-hp hero can always beat SOMETHING in biomes 1-2.)
flee_prefers_open_tiles: true // dead-end tie-break in the fallback step
cautious_sneak_pathing: true // batch 5: cautious routes around the aggro
// radius of unfavorable monsters when a safe route to its target exists;
// this is what "only favorable fights" means on a map with leashed monsters
cautious_engage_frac: 0.80 // was 0.70 (batch 4) — when an unfavorable monster is
// already adjacent (e.g. blocking a corridor), commit to trading blows only
// at/above this hp fraction; below it, retreat, rest, and re-engage.
// Monsters never heal, so hit-and-run always wins eventually.
chase_radius: 3  // monsters chase the hero within this range
// was 6; batch 1 showed pack pulls killing everyone by floor 2-3
leash_radius: 8  // monsters give up beyond this from their spawn // INITIAL GUESS
max_ticks_per_floor: 800 // failsafe: hero force-marches to stairs // INITIAL GUESS

## Shrines and greed

shrine_every_n_floors: 3
// was 5. Owner decision 2026-08-05, resolving the batch-10 finding: on a
// 12-ration larder only Swift reached a SECOND shrine (floor 10), so Greedy
// and Cautious never banked at all and lost everything on death. Every 3
// floors puts at least 2 live bank-or-push decisions in a median run.
greed_bonus_per_stack: 0.15   // renown multiplier: 1 + 0.15 * stacks
// was 0.25, retuned DOWN because shrines are now 5/3 as frequent: 0.25 * 3/5
// = 0.15 keeps the reward per DEPTH travelled about where it was rather than
// inflating it by 67%. Skipping 2 shrines is x1.30, which lands inside the
// "+30-50% for an informed push" target above. Validate in batch.
gilded_chest_min_stacks: 2

## Renown

banked_renown = banked loot value x (1 + greed_bonus_per_stack * greed_stacks)

depth_renown: // INITIAL GUESS — owner decision 2026-08-05
// Paid the FIRST time a run passes each threshold, banked on the spot: no
// shrine needed, and no later death can take it back. This is Swift's scoring
// route — what a doctrine that skips the loot actually earns.
  floor 3:  5
  floor 5:  12
  floor 10: 30
  floor 15: 60
  floor 20: 110
  floor 25: 180
  floor 30: 300
  beyond 30: +120 per 5 floors
// Shape: superlinear, so depth keeps paying as the gate escalates across
// prestige cycles. If Swift is underused, raise THESE (and warden rare drops),
// never its combat — see game-design.md.

## Survival forecast

Drives the Cautious stop rule, and becomes the shrine UI in P1 (game-design.md).
Reported as "fraction of the hp pool expected to remain after the next stretch",
which is what a player actually wants to read at a shrine.

horizon_floors: 3            // one shrine interval // INITIAL GUESS
forced_fights_per_floor: 1.5 // fights even a careful hero cannot dodge // INITIAL GUESS
rest_recovery_per_floor: 0.5 // fraction of max hp regained by resting // INITIAL GUESS

forecast = clamp(1 - expected_damage / hp_budget, 0, 1), where
  expected_damage = horizon_floors * forced_fights_per_floor *
                    expected_cost_to_kill(hero at full hp, median monster at the
                    DEEPEST floor of the horizon) * cautious_variance_margin
  hp_budget       = max_hp * (1 + rest_recovery_per_floor * horizon_floors)

cautious_stop_below: 0.35 // INITIAL GUESS — at a shrine, if the forecast is
// below this, Cautious banks everything and makes camp: run over, hero alive,
// haul kept. Tune against the "Cautious deaths under 10%" target. Raising it
// makes Cautious quit earlier (safer, shallower, poorer).

## Chests

drop_chance_per_floor: { common: 0.35, rare: 0.08, gilded: 0.015 }
// gilded only rolls at all if greed stacks >= gilded_chest_min_stacks

## Relics (5 at launch)

base_rate: 0.002 per qualifying kill/chest
attunement: each qualifying kill adds +0.00005 to rate, multiplied by
current greed stacks (min 1). Resets on relic drop.
// sources and effects: see game-design.md; exact effect numbers TBD in P3.
// CONFIRMED 2026-08-05: relics are the unique gear tier. They drop from Balrog
// wins, occupy equipment slots, and persist through prestige forever. Common
// and rare gear resets at prestige except one kept piece:
gear_kept_through_prestige: 1 piece (player's choice) // INITIAL GUESS

## Wardens

broodmother_f10:  { hp: 20, atk: 2, def: 1, adds_per_2_turns: 1 }
coilfather_f20:   { hp: 35, atk: 2, def: 2, atk_bonus_per_greed_stack: 1 }
warden_doors_f30: { hp: 50, atk: 3, def: 2, turn_limit: 40 }
warden_loss_reward: gimmick revealed + 10% of a level in xp

## Prestige (Embers)

embers = floor(max_floor * 1.0 + warden_kills * 15 + banked_gold / 100)
// ember tree node costs: define in P3, 12 nodes, first node cost ~10.

## Daily Gate

dungeon_size: fixed, ~5 floors equivalent, from date seed
renown_multiplier_by_doctrine: { greedy: 1.5, swift: 1.2, cautious: 1.0 }

## Offline

tick_ms_watchable: 400
offline_resolution: per-floor aggregate (see tech-design 4.1)
max_offline_hours_uncapped_by_larder: 24
