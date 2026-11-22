// Save / continue in localStorage: money, respect (missions done), the rifle,
// the player's position and health. One slot, written on mission complete,
// on pause and every 30 s of play. Storage can be off (private windows) —
// then the save lasts this visit only and every call fails silently.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, ...state, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore: no storage, nothing to clear.
  }
}

/** One-line summary for the title screen ("Mission 2 · $650 · Wheelman"). */
export function describeSave(data, rankName) {
  if (!data) return '';
  const mission = Math.min(data.missionsDone + 1, 4);
  return `Saved game — Mission ${mission} of 4 · $${data.money} · ${rankName}`;
}
