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
start_rations: 20
ration_cost_per_floor: { greedy: 1.5, swift: 0.8, cautious: 1.2 }

## Combat (Rogule-style dice)

attack_roll: 1d6 + weapon_bonus
defense_roll: 1d6 + armor_bonus
damage_on_hit: 1 + max(0, attack_roll - defense_roll) // capped at 4
flee_check_cautious: flee if hp < 40% max_hp

## Monsters (biome 1: caves, floors 1-10)

rat:    { hp: 2, atk: 0, def: 0, xp: 1 }
bat:    { hp: 2, atk: 0, def: 1, xp: 1 }
wolf:   { hp: 4, atk: 1, def: 1, xp: 3 }
spider: { hp: 3, atk: 1, def: 0, xp: 2 }
elite_multiplier: { hp: x3, atk: +1, xp: x4, spawn_rate: 0.04 }

// biome 2 (crypts, 11-20) and biome 3 (barrows, 21-30): define during P3,
// scale roughly +60% stats per biome.

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
