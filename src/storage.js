// localStorage persistence: load, save, migrate. Export/import lands here
// too (P1 step 5). Nothing in src/sim touches this file.
import { SAVE_VERSION, migrate, newSave } from './game/state.js';

const KEY = 'roguidle:save';

// Returns the migrated save, or null when there is nothing usable stored.
// A corrupt save is left in place under a backup key rather than destroyed —
// losing an account to a bad write is the one unforgivable bug (tech-design 9).
export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (err) {
    console.warn('roguidle: localStorage unreadable', err);
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return migrate(parsed);
  } catch (err) {
    console.error('roguidle: save unreadable, keeping a backup copy', err);
    try {
      localStorage.setItem(KEY + ':corrupt:' + Date.now(), raw);
    } catch (_) { /* out of room; the original is still under KEY */ }
    return null;
  }
}

// The exact text currently stored, or null. Used to notice edits made
// outside the page (devtools, import) so we never write over them.
export function readRaw() {
  try {
    return localStorage.getItem(KEY);
  } catch (_) {
    return null;
  }
}

let lastWritten = null;

export function save(state) {
  try {
    const text = JSON.stringify(state);
    localStorage.setItem(KEY, text);
    lastWritten = text;
    return true;
  } catch (err) {
    console.error('roguidle: could not write save', err);
    return false;
  }
}

// Write only if the stored save is still the one we last wrote. If something
// else changed it underneath — hand-editing in devtools is a supported way to
// test offline catch-up — leave that alone rather than clobbering it.
export function saveUnlessChangedExternally(state) {
  const current = readRaw();
  if (lastWritten !== null && current !== lastWritten) {
    console.warn('roguidle: save changed outside the page; not overwriting');
    return false;
  }
  return save(state);
}

// Load, or start a fresh account. `seed` is supplied by the caller because
// Math.random() is banned inside src/game.
export function loadOrCreate(now, seed) {
  const existing = load();
  if (existing) return { state: existing, fresh: false };
  const state = newSave(now, seed);
  save(state);
  return { state, fresh: true };
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn('roguidle: could not clear save', err);
  }
}

export const SAVE_KEY = KEY;
export { SAVE_VERSION };
