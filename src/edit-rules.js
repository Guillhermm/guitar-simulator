import { parseTab, withTempo, emptyTab } from './tab.js';

// The text New leaves: an empty tab that keeps the tempo line only if the document had one.
export const clearedText = (text) => {
  const tempo = parseTab(text).tempo;
  return tempo ? withTempo(emptyTab(), tempo) : emptyTab();
};

// null when the document is already blank; otherwise the text New leaves.
export const clearDocument = (text) => {
  const next = clearedText(text);
  return next === text ? null : { text: next, previous: text };
};

export const isBlankDocument = (text) => clearDocument(text) === null;

// New replaces the whole document, like Open or an example, so edit mode does not guard it; it only
// has nothing to do on a document that is already blank.
export const canStartNew = (text) => !isBlankDocument(text);

// Editing starts on for an empty document and off for a song, so a finished song is not changed by
// a stray touch. New leaves an empty document, so it turns editing on through the same rule.
export const initialEditing = (text) => isBlankDocument(text);

export const editingLabel = (editing) => (editing ? 'Editing on' : 'Editing off');

// A tap on the guitar writes into the tab only while editing is on and the editor is the target:
// it holds focus, or editing was just switched on and nothing else has taken focus since. Switching
// on does not focus the editor itself, since on a phone that raises the keyboard over the guitar.
export const guitarMayWrite = ({ editing, focusInEditor, armed = false }) => editing && (focusInEditor || armed);

// A picked example plays at once; an opened or dropped file may be there to edit or print, so it only
// loads, with focus on Play so one key starts it (Guilherme, 2026-10-20, after product and design).
export const afterLoad = (source) => (source === 'example' ? 'play' : 'focus-play');

// Play on a tab with no notes opens the example list instead of doing nothing.
export const playPress = ({ playing, hasNotes }) => {
  if (playing) return 'stop';
  return hasNotes ? 'play' : 'examples';
};

// Maps a keydown to a history command. Ctrl/Cmd+Z undoes, with Shift it redoes, and Ctrl+Y redoes.
export const historyKey = (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = String(e.key).toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo';
  return null;
};
