// The watchable descent: a CSS grid of <span>s, one emoji per tile.
// No canvas, exactly as tech-design section 8 calls for. Rendering only —
// this file never advances the simulation, it just draws whatever state it
// is handed.

const MONSTER_EMOJI = { rat: '🐀', bat: '🦇', spider: '🕷️', wolf: '🐺' };
const CHEST_EMOJI = { common: '📦', rare: '🎁', gilded: '🏆' };
const HERO = '🧙';
const STAIRS = '🕳️';
const GOLD = '🪙';

// How much of the floor to show. A full 32x20 floor at phone width leaves
// ~11px cells, which is unreadable, so the view is a window that follows the
// hero instead of the whole map.
const VIEW_W = 15;
const VIEW_H = 11;

const key = (x, y) => x + ',' + y;

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
  const chestAt = new Map();
  for (const c of f.chests) chestAt.set(key(c.x, c.y), c);
  const goldAt = new Map();
  for (const g of f.piles) goldAt.set(key(g.x, g.y), g);

  let cells = '';
  for (let y = y0; y < y0 + VIEW_H; y++) {
    for (let x = x0; x < x0 + VIEW_W; x++) {
      const k = key(x, y);
      if (!f.passable.has(k)) {
        cells += '<span class="t wall"></span>';
        continue;
      }
      if (hero.x === x && hero.y === y) {
        cells += `<span class="t hero">${HERO}</span>`;
        continue;
      }
      const m = monsterAt.get(k);
      if (m) {
        cells += `<span class="t mon${m.elite ? ' elite' : ''}">${MONSTER_EMOJI[m.type] || '❓'}</span>`;
        continue;
      }
      const c = chestAt.get(k);
      if (c) {
        cells += `<span class="t">${CHEST_EMOJI[c.tier]}</span>`;
        continue;
      }
      if (goldAt.has(k)) {
        cells += `<span class="t">${GOLD}</span>`;
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
    case 'gold_found':
      return { text: `🪙 picked up ${e.amount} gold` };
    case 'chest_found':
      return { text: `${CHEST_EMOJI[e.tier]} a ${e.tier} chest, sealed` };
    case 'level_up':
      return { cls: 'good', text: `⬆️ level ${e.level}! max hp ${e.maxHp}` };
    case 'rested':
      return { text: `💤 rested ${e.from}→${e.to} hp` };
    case 'shrine_reached':
      return { cls: 'big', text: `⛩️ a shrine at the mouth of floor ${e.depth}` };
    case 'pushed_on':
      return { text: `🔥 pushed past the shrine — greed ×${(1 + 0.15 * e.stacks).toFixed(2)}` };
    case 'banked':
      return { cls: 'good', text: `🏦 banked ${e.gold}🪙${e.chests ? ' + ' + e.chests + ' chest(s)' : ''} → ${Math.round(e.value)} Renown` };
    case 'depth_renown':
      return { cls: 'good', text: `🏅 past floor ${e.floor} — ${e.amount} Renown banked` };
    case 'doctrine_switched':
      return { cls: 'big', text: `🔄 doctrine: ${e.from} → ${e.to}` };
    case 'hero_died':
      return { cls: 'bad', text: `💀 slain by ${e.elite ? 'an elite ' : ''}${MONSTER_EMOJI[e.killer]} on floor ${e.depth}` };
    case 'out_of_rations':
      return { cls: 'bad', text: `⛺ the larder is empty — making camp` };
    case 'made_camp':
      return { cls: 'bad', text: `⛺ odds ahead ${e.forecast}% — banked everything and camped` };
    case 'stalled':
      return { text: `🕳️ lost the thread — heading for the stairs` };
    default:
      return null;
  }
}
