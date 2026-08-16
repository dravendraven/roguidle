// Rogule-style dice combat. Tables live in balance.js.
import { BALANCE } from './balance.js';
import { rollDie } from './rng.js';

// One swing: attacker rolls 1d6+atkBonus vs defender 1d6+defBonus.
// Every swing lands; a losing roll still deals the base 1. Capped.
export function attackDamage(rng, atkBonus, defBonus) {
  const atk = rollDie(rng, BALANCE.combat.die) + atkBonus;
  const def = rollDie(rng, BALANCE.combat.die) + defBonus;
  return Math.min(BALANCE.combat.damage_cap, 1 + Math.max(0, atk - def));
}
