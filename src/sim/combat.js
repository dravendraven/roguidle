// Rogule-style dice combat. The dice never change with doctrine — doctrines
// only change decisions (see game-design.md). Tables live in balance.js.
import { BALANCE } from './balance.js';
import { rollDie } from './rng.js';

// One swing: attacker rolls 1d6+atkBonus vs defender 1d6+defBonus.
// Every swing lands; a losing roll still deals the base 1. Capped.
export function attackDamage(rng, atkBonus, defBonus) {
  const atk = rollDie(rng, BALANCE.combat.die) + atkBonus;
  const def = rollDie(rng, BALANCE.combat.die) + defBonus;
  return Math.min(BALANCE.combat.damage_cap, 1 + Math.max(0, atk - def));
}

// Exact average damage per swing for given bonuses — used by the hero AI to
// judge fights. Enumerates all die pairs, so it matches the real dice.
export function expectedDamage(atkBonus, defBonus) {
  const sides = BALANCE.combat.die;
  let total = 0;
  for (let a = 1; a <= sides; a++) {
    for (let d = 1; d <= sides; d++) {
      total += Math.min(
        BALANCE.combat.damage_cap,
        1 + Math.max(0, a + atkBonus - (d + defBonus))
      );
    }
  }
  return total / (sides * sides);
}

// Estimated hp the hero loses killing this monster in a stand-up fight:
// the monster swings back once per hero swing except the killing blow.
export function expectedCostToKill(hero, monster) {
  const heroDmg = expectedDamage(hero.weaponBonus, monster.def);
  const monsterDmg = expectedDamage(monster.atk, hero.armorBonus);
  const swingsNeeded = Math.ceil(monster.hp / heroDmg);
  return monsterDmg * Math.max(0, swingsNeeded - 1);
}

// How much of the hero's pool is expected to survive the next stretch of
// floors, as a 0-1 fraction. Drives the cautious stop rule now and the shrine
// UI in P1, so it stays a plain readable number rather than a hidden score.
// `profile` is threatProfileAt(deepest floor of the horizon): the average
// inhabitant plus the elite tail. Both terms matter — the elite is what
// actually kills careful heroes.
export function survivalForecast(hero, profile) {
  const F = BALANCE.forecast;
  // The forecast keeps its OWN margin. Sharing the AI's fight-selection
  // margin silently couples two decisions: making the hero pickier about
  // fights also made it panic and quit at the first shrine.
  const margin = F.variance_margin;
  const atFull = { ...hero, hp: hero.maxHp };
  // An elite being ON the floor is not the same as having to fight it — a
  // careful hero walks around most of them. Only the forced share counts.
  const perFloor =
    F.forced_fights_per_floor * expectedCostToKill(atFull, profile.typical) * margin +
    profile.eliteChance * F.elite_forced_fraction * expectedCostToKill(atFull, profile.elite) * margin;
  const damage = F.horizon_floors * perFloor;
  const budget = hero.maxHp * (1 + F.rest_recovery_per_floor * F.horizon_floors);
  return Math.max(0, Math.min(1, 1 - damage / budget));
}
