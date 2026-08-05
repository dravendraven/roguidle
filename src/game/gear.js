// Gear: the three-way choice inside a boss chest, and what wearing it does.
// Contents roll when the player taps the chest open, never in the sim —
// the reveal stays the player's moment (game-design.md pillar 4).
import { BALANCE } from '../sim/balance.js';
import { makeRng, hashSeeds, pick } from '../sim/rng.js';

export const SLOTS = ['weapon', 'armor', 'relic'];

const WEAPON_NAMES = ['Chipped Blade', 'Iron Fang', 'Hooked Axe', 'Bone Cleaver', 'Long Knife'];
const ARMOR_NAMES = ['Padded Coat', 'Ringmail', 'Scale Vest', 'Iron Plate', 'Tower Shield'];
const RELIC_NAMES = ['Coin Charm', 'Dowsing Rod', 'Greedy Idol', 'Forager\'s Token', 'Split Compass'];

const WEAPON_EMOJI = ['🗡️', '⚔️', '🪓', '🔪'];
const ARMOR_EMOJI = ['🛡️', '🥼', '🦺', '⛓️'];
const RELIC_EMOJI = ['💰', '🔮', '🧭', '🪙'];

// The three options a chest offers: one per slot, so choosing a slot IS
// choosing between damage, survivability and resources.
export function rollChestOptions(chest, depth) {
  const G = BALANCE.gear;
  const d = Math.max(1, depth);
  const rng = makeRng(hashSeeds(chest.seedAt || 1, d));
  const cost = G.cost(d);

  return [
    {
      slot: 'weapon',
      name: pick(rng, WEAPON_NAMES),
      emoji: pick(rng, WEAPON_EMOJI),
      cost,
      atk: G.weapon.atk(d),
      blurb: 'hits harder',
    },
    {
      slot: 'armor',
      name: pick(rng, ARMOR_NAMES),
      emoji: pick(rng, ARMOR_EMOJI),
      cost,
      def: G.armor.def(d),
      hp: G.armor.hp(d),
      blurb: 'survives longer',
    },
    {
      slot: 'relic',
      name: pick(rng, RELIC_NAMES),
      emoji: pick(rng, RELIC_EMOJI),
      cost,
      goldMult: G.relic.goldMult(d),
      rationSave: G.relic.rationSave,
      blurb: 'gathers more',
    },
  ];
}

export function describeGear(item) {
  if (!item) return '—';
  const bits = [];
  if (item.atk) bits.push(`+${item.atk} attack`);
  if (item.def) bits.push(`+${item.def} defence`);
  if (item.hp) bits.push(`+${item.hp} max hp`);
  if (item.goldMult) bits.push(`+${Math.round(item.goldMult * 100)}% gold`);
  if (item.rationSave) bits.push(`−${Math.round(item.rationSave * 100)}% rations`);
  return bits.join(', ') || 'no effect';
}

// Roll equipped gear up into the numbers the simulation actually reads.
export function equipmentBonuses(equipment) {
  const eq = equipment || {};
  let atk = 0;
  let def = 0;
  let hp = 0;
  let goldMult = 1;
  let rationSave = 0;
  for (const slot of SLOTS) {
    const item = eq[slot];
    if (!item) continue;
    atk += item.atk || 0;
    def += item.def || 0;
    hp += item.hp || 0;
    goldMult += item.goldMult || 0;
    rationSave += item.rationSave || 0;
  }
  // Rations can be reduced, never made free.
  rationSave = Math.min(0.6, rationSave);
  return { atk, def, hp, goldMult, rationSave };
}
