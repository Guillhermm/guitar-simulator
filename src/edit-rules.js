import { parseTab, withTempo, emptyTab } from './tab.js';

// The text a Clear leaves: an empty tab that keeps the tempo line only if the document had one.
export const clearedText = (text) => {
  const tempo = parseTab(text).tempo;
  return tempo ? withTempo(emptyTab(), tempo) : emptyTab();
};

// null when there is nothing to clear; otherwise the text a Clear leaves.
export const clearDocument = (text) => {
  const next = clearedText(text);
  return next === text ? null : { text: next, previous: text };
};

export const isBlankDocument = (text) => clearDocument(text) === null;

// Editing starts on for an empty document and off for a song, so a finished song is not changed by
// a stray touch. Clear leaves an empty document, so it turns editing on through the same rule.
export const initialEditing = (text) => isBlankDocument(text);

export const editingLabel = (editing) => (editing ? 'Editing on' : 'Editing off');

// A tap on the guitar writes into the tab only while editing is on and an editor holds focus.
export const guitarMayWrite = ({ editing, focusInEditor }) => editing && focusInEditor;

// Play on a tab with no notes opens the example list instead of doing nothing.
export const playPress = ({ playing, hasNotes }) => {
  if (playing) return 'stop';
  return hasNotes ? 'play' : 'examples';
};

// Only the list opened by Play starts playback after a pick; the Examples button never does.
export const afterPick = ({ fromPlay }) => ({ editing: false, play: fromPlay });

// Maps a keydown to a history command. Ctrl/Cmd+Z undoes, with Shift it redoes, and Ctrl+Y redoes.
export const historyKey = (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = String(e.key).toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo';
  return null;
};
