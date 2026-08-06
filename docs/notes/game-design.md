# Roguidle — Game Design

An idle roguelike inspired by rogule.com: the hero delves an emoji dungeon
by itself, one small boss guards the stairs on every floor, and the
player's job is mostly opening the reward chests a beaten boss leaves.

## Core loop

The hero auto-delves an endless dungeon: explore, bump-fight, loot, kill
the floor's boss, descend. Rations fuel delving; at zero rations the hero
camps in place and forages more, at the same pace whether the tab is open
or not — there is one clock, not an online rate and an offline rate.

Every boss killed drops a sealed chest. Opening one is manual and offers
three gear options — cheap, solid, and a pricier piece worth saving gold
for — each costing carried gold. Equipping is instant.

Death resets the hero (level, gear, floor) but keeps the relic slot and
the account's history. It is never a hard stop: a new hero picks up the
pack immediately.

## Rules not to break by accident

- **Absence is never punished.** Time away is replayed as exactly the
  ticks that would have run watched — same rate, same outcome. Camping on
  empty rations forages rations back; it does not end the run.
- **Rare stays rare.** Never inflate a drop rate to make something feel
  more generous; add more ways to chase it instead.
- **Chest contents roll at tap time, never during the offline replay.**
  The sim decides THAT a boss dropped a chest; what's inside is rolled
  the moment the player opens it, so the reveal stays theirs.

## Tone

Emoji-first. Dry, slightly grim chronicle text is welcome ("the hero ate
a mysterious mushroom. It was fine, probably.").
