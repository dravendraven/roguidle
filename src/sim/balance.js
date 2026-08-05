// Mirrors docs/balance.md — the single source of truth for tuning numbers.
// Data only, no logic. When a number changes there, change it here too.

export const BALANCE = {
  hero: {
    start_hp: 14,
    hp_per_level: 2,
    // advancing FROM level n TO n+1 costs 10*n xp
    xp_to_next: (level) => 10 * level,
    start_rations: 12,
    // cautious costs MORE than greedy: it spends ~2x the ticks per floor, and
    // rations are the clock as much as the larder (see docs/balance.md)
    ration_cost_per_floor: { greedy: 1.5, swift: 0.8, cautious: 2.0 },
  },

  combat: {
    die: 6,
    damage_cap: 4,
    // no miss roll: every swing deals at least the base 1 damage
  },

  monsters: {
    // gold: [min, max] dropped on death
    rat:    { hp: 2, atk: 0, def: 0, xp: 1, gold: [0, 2] },
    bat:    { hp: 2, atk: 0, def: 1, xp: 1, gold: [0, 2] },
    wolf:   { hp: 4, atk: 1, def: 1, xp: 3, gold: [2, 5] },
    spider: { hp: 3, atk: 1, def: 0, xp: 2, gold: [1, 3] },
  },

  elite: { hp_mult: 3, atk_bonus: 1, xp_mult: 4, gold_mult: 3, spawn_rate: 0.04 },

  floors: {
    width: 32,
    height: 20,
    monsters_base: 3,
    monsters_per_depth_div: 3, // + floor(depth / 3) extra monsters
    monsters_max: 8,
    monster_min_spacing: 3,
    spawn_weights: [
      { up_to_depth: 3,        weights: { rat: 5, bat: 3, spider: 1, wolf: 0 } },
      { up_to_depth: 6,        weights: { rat: 3, bat: 3, spider: 2, wolf: 1 } },
      { up_to_depth: Infinity, weights: { rat: 1, bat: 2, spider: 3, wolf: 2 } },
    ],
    gold_piles: [0, 2],
    gold_per_pile: [3, 8],
    biome_scale_per_biome: 1.6, // biome = ceil(depth / 10)
  },

  ai: {
    chase_radius: 3,
    leash_radius: 8,
    rest_ticks_per_hp: 2,
    rest_below_frac: { greedy: 0.7, swift: 0.65, cautious: 0.7 },
    rest_until_frac: { greedy: 0.9, swift: 0.9, cautious: 0.9 },
    cautious_flee_frac: 0.65,
    cautious_reserve_frac: 0.55,
    cautious_engage_frac: 0.8,
    cautious_detour_tiles: 6,
    cautious_variance_margin: 1.6,
  },

  shrines: {
    every_n_floors: 5,
    greed_bonus_per_stack: 0.25, // renown multiplier: 1 + 0.25 * stacks
    gilded_min_stacks: 2,
  },

  chests: {
    drop_chance: { common: 0.35, rare: 0.08, gilded: 0.015 },
  },

  sim: {
    max_ticks_per_floor: 800,
    tick_ms_watchable: 400,
  },
};
