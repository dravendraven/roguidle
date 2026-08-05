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
