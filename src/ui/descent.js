// The watchable descent: a CSS grid of <span>s, one emoji per tile.
// No canvas. Rendering only — this file never advances the simulation, it
// just draws whatever state it is handed.

const MONSTER_EMOJI = {
  rat: '🐀', bat: '🦇', spider: '🕷️', ghost: '👻', boar: '🐗', wolf: '🐺',
  ogre: '🧌', zombie: '🧟', vampire: '🧛', genie: '🧞', trex: '🦖', dragon: '🐉',
};
const HERO = '🧙';
const STAIRS = '🕳️';

// How much of the floor to show. A full 32x20 floor at phone width leaves
// ~11px cells, which is unreadable, so the view is a window that follows the
// hero instead of the whole map.
const VIEW_W = 15;
const VIEW_H = 11;

const key = (x, y) => x + ',' + y;

// A health bar sits above every living thing on the grid, so you can watch a
// creature die rather than just watching it vanish.
function bar(hp, maxHp, cls) {
  const w = Math.max(0, Math.min(100, (hp / (maxHp || 1)) * 100));
  return `<i class="hpbar ${cls}"><b style="width:${w}%"></b></i>`;
}

export function renderFloor(run) {
  if (!run || !run.floor) return '<div class="grid-empty">the hero is between floors…</div>';
  const f = run.floor;
  const hero = run.hero;

  // Clamp the window to the map so it never scrolls off the edge.
  const halfW = Math.floor(VIEW_W / 2);
  const halfH = Math.floor(VIEW_H / 2);
  const x0 = Math.max(0, Math.min(f.w - VIEW_W, hero.x - halfW));
  const y0 = Math.max(0, Math.min(f.h - VIEW_H, hero.y - halfH));

  const monsterAt = new Map();
  for (const m of f.monsters) monsterAt.set(key(m.x, m.y), m);
  const findAt = new Map();
  for (const p of f.finds) findAt.set(key(p.x, p.y), p);

  let cells = '';
  for (let y = y0; y < y0 + VIEW_H; y++) {
    for (let x = x0; x < x0 + VIEW_W; x++) {
      const k = key(x, y);
      if (!f.passable.has(k)) {
        cells += '<span class="t wall"></span>';
        continue;
      }
      if (hero.x === x && hero.y === y) {
        cells += `<span class="t hero">${bar(hero.hp, hero.maxHp, 'me')}${HERO}</span>`;
        continue;
      }
      const m = monsterAt.get(k);
      if (m) {
        const face = m.boss ? m.emoji : MONSTER_EMOJI[m.type] || '❓';
        const cls = m.boss ? ' boss' : m.elite ? ' elite' : '';
        cells += `<span class="t mon${cls}">${bar(m.hp, m.maxHp, 'foe')}${face}</span>`;
        continue;
      }
      const p = findAt.get(k);
      if (p) {
        cells += `<span class="t">${p.emoji}</span>`;
        continue;
      }
      if (f.stairs.x === x && f.stairs.y === y) {
        cells += `<span class="t">${STAIRS}</span>`;
        continue;
      }
      cells += '<span class="t floor">·</span>';
    }
  }
  return `<div class="grid" style="grid-template-columns:repeat(${VIEW_W},1fr)">${cells}</div>`;
}

// One-line summaries for the live feed. Returns null for events not worth
// interrupting the watcher for.
export function eventLine(e) {
  switch (e.type) {
    case 'floor_entered': {
      const parts = Object.entries(e.monsters || {}).map(([t, n]) => (MONSTER_EMOJI[t] || '?') + (n > 1 ? '×' + n : ''));
      if (e.elites) parts.push('💢×' + e.elites);
      return { cls: 'big', text: `🌀 Floor ${e.depth} — ${parts.join(' ') || 'empty'}` };
    }
    case 'monster_killed':
      return { text: `⚔️ ${e.elite ? '💢 elite ' : ''}${MONSTER_EMOJI[e.monster]} slain (+${e.xp}xp${e.gold ? ', +' + e.gold + '🪙' : ''})` };
    case 'boss_killed':
      return { cls: 'good', text: `👑 ${e.emoji} the floor boss falls! +${e.gold}🪙 and a reward chest` };
    case 'gold_found':
      return { text: `${e.emoji || '🪙'} found ${e.amount} gold` };
    case 'level_up':
      return { cls: 'good', text: `⬆️ level ${e.level}! max hp ${e.maxHp}` };
    case 'rested':
      return { text: `💤 rested ${e.from}→${e.to} hp` };
    case 'hero_died':
      return { cls: 'bad', text: `💀 slain by ${e.elite ? 'an elite ' : ''}${MONSTER_EMOJI[e.killer]} on floor ${e.depth}` };
    case 'out_of_rations':
      return { cls: 'bad', text: `⛺ the larder is empty — making camp` };
    case 'stalled':
      return { text: `🕳️ lost the thread — heading for the stairs` };
    default:
      return null;
  }
}
