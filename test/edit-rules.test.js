import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canStartNew, clearDocument, clearedText, editingLabel, guitarMayWrite, historyKey, initialEditing, isBlankDocument,
  playPress,
} from '../src/edit-rules.js';
import { emptyTab, withMeta, withTempo } from '../src/tab.js';

const song = 'Title: A\nArtist: B\ne|-3-|\nB|---|\nG|---|\nD|---|\nA|---|\nE|---|';

test('editing starts on for an empty document and off for a song', () => {
  assert.equal(initialEditing(emptyTab()), true);
  assert.equal(initialEditing(withTempo(emptyTab(), 120)), true);
  assert.equal(initialEditing(song), false);
  assert.equal(initialEditing(withMeta(emptyTab(), { title: 'Only a title' })), false);
});

test('New is offered for any document that is not already blank, whether editing is on or off', () => {
  assert.equal(canStartNew(song), true);
  assert.equal(canStartNew(emptyTab()), false);
  assert.equal(canStartNew(withTempo(emptyTab(), 100)), false);
  assert.equal(canStartNew(clearDocument(song).text), false);
});

test('after New the document is empty, so the same rule turns editing on', () => {
  const cleared = clearDocument(song).text;
  assert.equal(isBlankDocument(cleared), true);
  assert.equal(initialEditing(cleared), true);
  assert.equal(clearedText(withTempo(song, 100)), withTempo(emptyTab(), 100));
});

test('a loaded song (an opened file or an example) starts with editing off, a blank file with it on', () => {
  assert.equal(initialEditing('Title: Ode\nArtist: Beethoven\ne|-0-|\nB|---|\nG|---|\nD|---|\nA|---|\nE|---|'), false);
  assert.equal(initialEditing(emptyTab()), true);
});

test('the toggle names its state', () => {
  assert.equal(editingLabel(true), 'Editing on');
  assert.equal(editingLabel(false), 'Editing off');
});

test('guitar taps write only with editing on and an editor focused', () => {
  assert.equal(guitarMayWrite({ editing: true, focusInEditor: true }), true);
  assert.equal(guitarMayWrite({ editing: false, focusInEditor: true }), false);
  assert.equal(guitarMayWrite({ editing: true, focusInEditor: false }), false);
  assert.equal(guitarMayWrite({ editing: false, focusInEditor: false }), false);
});

test('Play on a tab with no notes opens the examples; with notes it plays; while playing it stops', () => {
  assert.equal(playPress({ playing: false, hasNotes: false }), 'examples');
  assert.equal(playPress({ playing: false, hasNotes: true }), 'play');
  assert.equal(playPress({ playing: true, hasNotes: true }), 'stop');
  assert.equal(playPress({ playing: true, hasNotes: false }), 'stop');
});

test('history keys: Ctrl/Cmd+Z undoes, with Shift it redoes, Ctrl+Y redoes', () => {
  assert.equal(historyKey({ key: 'z', ctrlKey: true }), 'undo');
  assert.equal(historyKey({ key: 'z', metaKey: true }), 'undo');
  assert.equal(historyKey({ key: 'Z', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(historyKey({ key: 'z', ctrlKey: true, shiftKey: true }), 'redo');
  assert.equal(historyKey({ key: 'y', ctrlKey: true }), 'redo');
  assert.equal(historyKey({ key: 'y', metaKey: true }), null);
  assert.equal(historyKey({ key: 'z' }), null);
  assert.equal(historyKey({ key: 'z', ctrlKey: true, altKey: true }), null);
});
