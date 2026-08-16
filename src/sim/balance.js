// Every tuning number the game reads. Data only, no logic — the single
// source of truth (CLAUDE.md). Tune by playing: change a number, open the
// game, see if it's better.

export const BALANCE = {
  hero: {
    start_hp: 20,
    hp_per_level: 2,
    // advancing FROM level n TO n+1 costs 10*n xp
    xp_to_next: (level) => 10 * level,
    level_up_heal: true, // levelling restores hp to max
    start_rations: 12,
    // Rations are the time currency, not just food: every floor costs one
    // flat amount, since there's only one pace of play now.
    ration_cost_per_floor: 1.5,
  },

  combat: {
    die: 6,
    damage_cap: 4,
    // no miss roll: every swing deals at least the base 1 damage
  },

  // The bestiary, adapted from rogule.com (AGPL — stats reimplemented, not
  // its code). `radius` is how far the creature notices the hero from
  // (rogule.com's per-creature aggro range, replacing one global radius).
  // hp/xp scaled up from Rogule's own numbers to match our longer fight
  // pacing; gold and def are our own.
  monsters: {
    rat:     { hp: 3,  atk: 0, def: 0, xp: 1,  gold: [0, 2],  radius: 3,  tier: 0 },
    bat:     { hp: 4,  atk: 0, def: 1, xp: 2,  gold: [0, 2],  radius: 10, tier: 1 },
    spider:  { hp: 5,  atk: 1, def: 0, xp: 2,  gold: [1, 3],  radius: 8,  tier: 2 },
    ghost:   { hp: 5,  atk: 1, def: 1, xp: 3,  gold: [1, 3],  radius: 10, tier: 3 },
    boar:    { hp: 6,  atk: 1, def: 0, xp: 3,  gold: [1, 4],  radius: 15, tier: 4 },
    wolf:    { hp: 8,  atk: 1, def: 1, xp: 4,  gold: [2, 5],  radius: 20, tier: 5 },
    ogre:    { hp: 11, atk: 2, def: 1, xp: 5,  gold: [3, 7],  radius: 10, tier: 6 },
    zombie:  { hp: 14, atk: 2, def: 1, xp: 6,  gold: [4, 8],  radius: 5,  tier: 7 },
    vampire: { hp: 13, atk: 2, def: 2, xp: 7,  gold: [4, 9],  radius: 15, tier: 8 },
    genie:   { hp: 16, atk: 2, def: 2, xp: 8,  gold: [5, 10], radius: 20, tier: 9 },
    trex:    { hp: 19, atk: 3, def: 1, xp: 9,  gold: [6, 12], radius: 15, tier: 10 },
    dragon:  { hp: 22, atk: 3, def: 2, xp: 10, gold: [7, 14], radius: 10, tier: 11 },
  },

  elite: { hp_mult: 3, atk_bonus: 1, xp_mult: 4, gold_mult: 3, spawn_rate: 0.04, min_depth: 4 },
  // No elites before floor 4: a fresh level-1 hero simply loses to one, and
  // the first boss (which drops the only gear) has to be beatable bare-handed.

  // One small boss per floor, standing on the stairs. Killing it is the only
  // way down, and it is what drops the reward chest. Emoji distinct from the
  // regular bestiary so a boss reads as a boss at a glance.
  boss: {
    hp: (d) => 7 + Math.round(d * 2.5),
    atk: (d) => Math.floor(d / 4),
    def: (d) => Math.floor(d / 6),
    xp: (d) => 5 + d * 2,
    gold: (d) => [6 + d * 2, 12 + d * 3],
    emoji: ['👹', '👺', '🦂', '🐙', '👑'],
  },

  gear: {
    // Measured average gold collected on one floor (monsters + finds +
    // boss). Tier prices hang off this so the economy tracks what a floor
    // actually pays.
    floor_yield: (d) => 16 + 3.3 * d,
    // cheap: affordable from this floor's takings with change left over.
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
    monsters_per_depth_div: 3, // + floor(depth / 3) extra monsters, capped
    monsters_max: 8,
    monster_min_spacing: 3, // packed spawns gang up on the hero
    // Difficulty by DISTANCE from the hero's start, not just depth (taken
    // from rogule.com's generator): a tile's target danger tier rises with
    // how far it sits from the entrance, so one floor has a safe edge and a
    // dangerous core. depth_tier_span sets how many tiers depth alone moves
    // the average; distance_spread sets how many tiers distance can swing
    // it either side of that average.
    depth_tier_span: 4, // floors per +1 average tier
    // was 2: the average tier alone hit the roster ceiling (dragon) by
    // floor ~28, so every tile on a deep floor spawned the same creature
    // regardless of distance — losing the safe-edge/dangerous-core gradient
    // exactly where a longer run would want it most. At 4, that saturation
    // point moves to floor ~56.
    distance_spread: 3, // tiers a far corner can skew above/below the average
    tier_jitter: 1, // random +/-1 so a floor isn't perfectly graded
  },

  // Scenery pickups (rogule.com: items hidden under a rock or a plant).
  // Complements the boss chests: an instant, small, no-decision find while
  // delving, rather than a queued choice.
  pickups: {
    per_floor: [0, 3],
    types: [
      { emoji: '🌰', value: 1, weight: 5 },
      { emoji: '🍄', value: 2, weight: 3 },
      { emoji: '💎', value: 8, weight: 1 },
    ],
  },

  ai: {
    leash_radius: 8, // monsters give up beyond this from their spawn
    rest_ticks_per_hp: 1,
    rest_below_frac: 0.7, // rest when hurt and nothing is nearby
    rest_until_frac: 0.9,
    max_ticks_per_floor: 800, // failsafe: hero force-marches to stairs
  },

  sim: {
    // The single pace dial for the whole game — sets both how fast the grid
    // moves and how much happens while you're away (elapsed / tick_ms
    // ticks). There is no separate offline rate.
    tick_ms_watchable: 3000,
  },

  offline: {
    max_hours: 24, // time past this is discarded, not queued
    camp_rations_per_hour: 1.0, // OWNER DECISION STILL NEEDED, see notes:
    // nothing says how rations come back. Running dry no longer ends a run —
    // the hero camps in place and forages tick by tick. Replace this with
    // the real mechanic when there is one.
    max_pending_chests: 12, // deepest kept; opening is manual, so an
    // uncapped queue after a long absence turns coming back into paperwork.
  },
};
