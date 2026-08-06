// Mirrors docs/balance.md — the single source of truth for tuning numbers.
// Data only, no logic. When a number changes there, change it here too.

export const BALANCE = {
  hero: {
    start_hp: 20,
    hp_per_level: 2,
    // advancing FROM level n TO n+1 costs 10*n xp
    xp_to_next: (level) => 10 * level,
    start_rations: 12,
    // Rations are the time currency, not just food: whatever spends more
    // ticks per floor pays more rations for it. Cautious ticks ~2x longer
    // per floor than greedy, so without this cost gap careful play strictly
    // dominated — it out-lived and out-earned greedy while dying just as often.
    ration_cost_per_floor: { greedy: 1.5, swift: 0.8, cautious: 2.0 },
  },

  combat: {
    die: 6,
    damage_cap: 4,
    // no miss roll: every swing deals at least the base 1 damage
  },

  monsters: {
    // gold: [min, max] dropped on death
    rat:    { hp: 4, atk: 0, def: 0, xp: 1, gold: [0, 2] },
    bat:    { hp: 4, atk: 0, def: 1, xp: 1, gold: [0, 2] },
    wolf:   { hp: 7, atk: 1, def: 1, xp: 3, gold: [2, 5] },
    spider: { hp: 5, atk: 1, def: 0, xp: 2, gold: [1, 3] },
  },

  // No elites before floor 4: a fresh level-1 hero simply loses to one, and
  // the first boss (which drops the only gear) has to be beatable bare-handed.
  elite: { hp_mult: 3, atk_bonus: 1, xp_mult: 4, gold_mult: 3, spawn_rate: 0.04, min_depth: 4 },

  // One small boss per floor, standing on the stairs. Killing it is the only
  // way down, and it is what drops the reward chest.
  boss: {
    hp: (d) => 7 + Math.round(d * 2.5),
    atk: (d) => Math.floor(d / 4),
    def: (d) => Math.floor(d / 6),
    xp: (d) => 5 + d * 2,
    gold: (d) => [6 + d * 2, 12 + d * 3],
    emoji: ['👹', '👺', '🧟', '🦂', '🐲'],
  },

  gear: {
    // Measured average gold collected on one floor (monsters + piles + boss),
    // 260 runs per depth. Tier prices hang off this so the economy tracks
    // what a floor actually pays, not a guess.
    floor_yield: (d) => 16 + 3.3 * d,
    // cheap: affordable from this floor with change left over.
    // mid: about one floor's whole takings.
    // rich: only reachable by saving across floors.
    tiers: [
      { key: 'cheap', label: 'Cheap', cost_mult: 0.6 },
      { key: 'mid', label: 'Solid', cost_mult: 1.0 },
      { key: 'rich', label: 'Prized', cost_mult: 1.9 },
    ],
    // Stats by tier index (0 cheap, 1 mid, 2 rich), scaling gently with depth.
    weapon_atk: (t, d) => 1 + t + Math.floor(d / (8 - 2 * t)),
    armor_def: (t, d) => 1 + t + Math.floor(d / 8),
    armor_hp: (t, d) => 2 + t * 2 + Math.floor(d / 4),
    relic_gold: (t) => [0.1, 0.2, 0.35][t],
    relic_ration: (t) => [0.05, 0.1, 0.2][t],
  },

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
    // Kept tight (was 6): wider aggro let packs gang up on floors 1-5 and
    // killed every doctrine there.
    chase_radius: 3,
    leash_radius: 8,
    rest_ticks_per_hp: 1,
    rest_below_frac: { greedy: 0.7, swift: 0.65, cautious: 0.7 },
    rest_until_frac: { greedy: 0.9, swift: 0.9, cautious: 1.0 },
    cautious_flee_frac: 0.65,
    cautious_reserve_frac: 0.55,
    cautious_engage_frac: 0.8,
    cautious_detour_tiles: 6,
    cautious_variance_margin: 1.6,
  },

  shrines: {
    every_n_floors: 3, // was 5: a median run must face 2+ bank-or-push calls
    greed_bonus_per_stack: 0.15, // was 0.25, scaled by 3/5 for the new cadence
    gilded_min_stacks: 2,
  },

  renown: {
    // Paid the first time a run passes each floor, banked on the spot and
    // never lost to a later death. Swift's scoring route.
    depth_thresholds: [
      [3, 5], [5, 12], [10, 30], [15, 60], [20, 110], [25, 180], [30, 300],
    ],
    depth_beyond_30_per_5: 120,
  },

  // Drives the cautious stop rule; becomes the shrine UI in P1.
  forecast: {
    horizon_floors: 3,
    forced_fights_per_floor: 1.5,
    elite_forced_fraction: 0.35, // share of elites the hero cannot dodge
    variance_margin: 1.6, // the forecast's own; NOT ai.cautious_variance_margin
    rest_recovery_per_floor: 0.5,
    cautious_stop_below: 0.35,
  },

  chests: {
    drop_chance: { common: 0.35, rare: 0.08, gilded: 0.015 },
  },

  sim: {
    max_ticks_per_floor: 800,
    // The ONE pace dial. There is no separate offline rate: time away is
    // replayed as exactly these ticks, so this sets both how fast the grid
    // moves and how much happens while you are gone.
    tick_ms_watchable: 3000,
  },

  offline: {
    max_hours: 24,
    camp_rations_per_hour: 1.0,
    max_pending_chests: 12,
  },
};
