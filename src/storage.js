import { emptyTab, readTempo } from './tab.js';

export const KEY = 'guitar-simulator.tab.v1';
export const MAX_BYTES = 256 * 1024;
export const DEFAULT_TEMPO = 80;
export const MIN_TEMPO = 40;
export const MAX_TEMPO = 240;

const byteLength = (s) => new TextEncoder().encode(s).length;
const validTempo = (t) => Number.isFinite(t) && t >= MIN_TEMPO && t <= MAX_TEMPO;

// Anything that is not a well-formed saved document falls back to an empty tab. A missing or invalid
// tempo field falls back to the Tempo line in the text, then to the default.
export const readSaved = (raw) => {
  const fallback = { text: emptyTab(), tempo: DEFAULT_TEMPO };
  if (typeof raw !== 'string' || byteLength(raw) > MAX_BYTES * 2) return fallback;
  let data;
  try { data = JSON.parse(raw); } catch { return fallback; }
  if (!data || typeof data !== 'object' || typeof data.text !== 'string') return fallback;
  if (byteLength(data.text) > MAX_BYTES) return fallback;
  const fromText = readTempo(data.text);
  const tempo = [data.tempo, fromText].find(validTempo) ?? DEFAULT_TEMPO;
  return { text: data.text, tempo };
};

// Returns whether the write went through; storage can be full, disabled or absent.
export const save = (storage, { text, tempo }) => {
  try {
    storage.setItem(KEY, JSON.stringify({ text, tempo }));
    return true;
  } catch {
    return false;
  }
};
