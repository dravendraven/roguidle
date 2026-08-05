# Balance — single source of truth for all tuning numbers

Rule from CLAUDE.md: no balance value may be hardcoded in logic files.
Code loads these values as data (a balance.js module mirroring this file,
or this file parsed directly). When a number changes here, it changes there.

Status: INITIAL GUESSES. Every value below must be validated by the P0 batch
simulator (1,000 seeded runs per doctrine) before being treated as real.
Tuning targets are listed so future tuning sessions know what "good" means.

## Tuning targets (what we are aiming for, not values)

- First hero death: somewhere on floors 6-12 for a fresh account.
- First Balrog prestige: day 3-4 of normal play.
- Greedy vs Swift vs Cautious: visibly different chronicles on the same seed;
  Swift reaches ~30% deeper per ration, Greedy earns ~50% more loot/kills,
  Cautious death rate under 1/3 of Greedy's.
- Pushing shrines while strong: informed EV clearly positive (+30-50% Renown),
  suicidal while weak. Survival forecast accuracy matters more than fairness.
- 24h offline on a full early-game larder: rations run out around hour 14-18.

## Hero

start_hp: 10
hp_per_level: 2
xp_curve: level_n_requires = 10 * n * n
// interpretation: advancing FROM level n TO n+1 costs 10*n*n xp.
level_up_heal: full   // INITIAL GUESS — leveling restores hp to max
start_rations: 20
ration_cost_per_floor: { greedy: 1.5, swift: 0.8, cautious: 1.2 }

## Combat (Rogule-style dice)

attack_roll: 1d6 + weapon_bonus
defense_roll: 1d6 + armor_bonus
damage_on_hit: 1 + max(0, attack_roll - defense_roll) // capped at 4
// interpretation (owner-approved 2026-08-05): no separate miss roll — every
// swing lands; a losing attack roll still deals the base 1 damage.
flee_check_cautious: flee if hp < 40% max_hp

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
monsters_per_floor: 4 + floor(depth / 3), capped at 9 // INITIAL GUESS
spawn_weights: // INITIAL GUESS — relative weights per depth band
  floors_1_3:    { rat: 5, bat: 3, spider: 1, wolf: 0 }
  floors_4_6:    { rat: 3, bat: 3, spider: 2, wolf: 1 }
  floors_7_plus: { rat: 1, bat: 2, spider: 3, wolf: 3 }
gold_piles_per_floor: 0-2, amount 3-8 each // INITIAL GUESS
biome_scaling: monster hp/atk/def/xp/gold x1.6 per biome past the first,
  biome = ceil(depth / 10) // INITIAL GUESS placeholder until P3 real biomes

## Hero AI and healing (P0 additions)

rest_ticks_per_hp: 3  // resting heals 1 hp per 3 ticks // INITIAL GUESS
rest_below_frac: { greedy: 0.50, swift: 0.25, cautious: 0.60 } // INITIAL GUESS
rest_until_frac: { greedy: 0.80, swift: 0.50, cautious: 0.90 } // INITIAL GUESS
cautious_reserve_frac: 0.40 // fight only if expected hp cost leaves this // INITIAL GUESS
chase_radius: 6  // monsters chase the hero within this range // INITIAL GUESS
leash_radius: 8  // monsters give up beyond this from their spawn // INITIAL GUESS
max_ticks_per_floor: 800 // failsafe: hero force-marches to stairs // INITIAL GUESS

## Shrines and greed

shrine_every_n_floors: 5
greed_bonus_per_stack: 0.25   // renown multiplier: 1 + 0.25 * stacks
gilded_chest_min_stacks: 2

## Chests

drop_chance_per_floor: { common: 0.35, rare: 0.08, gilded: 0.015 }
// gilded only rolls at all if greed stacks >= gilded_chest_min_stacks

## Relics (5 at launch)

base_rate: 0.002 per qualifying kill/chest
attunement: each qualifying kill adds +0.00005 to rate, multiplied by
current greed stacks (min 1). Resets on relic drop.
// sources and effects: see game-design.md; exact effect numbers TBD in P3.

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
