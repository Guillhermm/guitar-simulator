import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSaved, save, KEY, MAX_BYTES, UI_KEY, uiDefaults, readUi, saveUi } from '../src/storage.js';
import { emptyTab } from '../src/tab.js';

const EMPTY = { text: emptyTab(), tempo: 80 };

test('the key is versioned', () => {
  assert.equal(KEY, 'guitar-simulator.tab.v1');
});

test('a valid save round trips', () => {
  const state = { text: 'Tempo: 90\n' + emptyTab(4), tempo: 90 };
  assert.deepEqual(readSaved(JSON.stringify(state)), state);
});

test('garbage falls back to an empty tab at 80 BPM', () => {
  const inputs = [
    null, undefined, 42, '', 'not json', '{', 'null', '[]', '"text"', '{}',
    JSON.stringify({ text: 5, tempo: 90 }),
    JSON.stringify({ text: null }),
    JSON.stringify({ text: 'x'.repeat(MAX_BYTES + 1), tempo: 90 }),
    'x'.repeat(MAX_BYTES * 2 + 1),
  ];
  inputs.forEach((raw) => assert.deepEqual(readSaved(raw), EMPTY, String(raw).slice(0, 20)));
});

test('a text at the cap is accepted; multibyte characters count as bytes', () => {
  assert.equal(readSaved(JSON.stringify({ text: 'a'.repeat(MAX_BYTES), tempo: 80 })).text.length, MAX_BYTES);
  assert.deepEqual(readSaved(JSON.stringify({ text: 'é'.repeat(MAX_BYTES / 2 + 1), tempo: 80 })), EMPTY);
});

test('tempo outside 40-240 or not a number uses the Tempo line, then 80', () => {
  const t = (tempo, text = 'abc') => readSaved(JSON.stringify({ text, tempo })).tempo;
  assert.equal(t(39), 80);
  assert.equal(t(241), 80);
  assert.equal(t(40), 40);
  assert.equal(t(240), 240);
  assert.equal(t('90'), 80);
  assert.equal(t(null), 80);
  assert.equal(t(500, 'Tempo: 100'), 100);
});

test('save writes JSON under the key and reports failures instead of throwing', () => {
  const store = {};
  const ok = save({ setItem: (k, v) => { store[k] = v; } }, { text: 'a', tempo: 70 });
  assert.equal(ok, true);
  assert.deepEqual(JSON.parse(store[KEY]), { text: 'a', tempo: 70 });
  assert.equal(save({ setItem: () => { throw new Error('quota'); } }, { text: 'a', tempo: 70 }), false);
  assert.equal(save(null, { text: 'a', tempo: 70 }), false);
});

test('the ui key is versioned and apart from the tab document', () => {
  assert.equal(UI_KEY, 'guitar-simulator.ui.v1');
  assert.notEqual(UI_KEY, KEY);
});

test('ui defaults are Text, open on desktop and collapsed on a portrait phone', () => {
  assert.deepEqual(uiDefaults(false), { editor: 'text', dockOpen: true });
  assert.deepEqual(uiDefaults(true), { editor: 'text', dockOpen: false });
});

test('a saved ui state wins at every width', () => {
  const raw = JSON.stringify({ editor: 'grid', dockOpen: true });
  assert.deepEqual(readUi(raw, true), { editor: 'grid', dockOpen: true });
  assert.deepEqual(readUi(JSON.stringify({ editor: 'text', dockOpen: false }), false), { editor: 'text', dockOpen: false });
});

test('an absent or malformed ui value falls back to the defaults for the width', () => {
  const inputs = [null, undefined, '', 'not json', '{', 'null', '[]', '42', '"grid"', '{}'];
  inputs.forEach((raw) => {
    assert.deepEqual(readUi(raw, false), { editor: 'text', dockOpen: true }, String(raw));
    assert.deepEqual(readUi(raw, true), { editor: 'text', dockOpen: false }, String(raw));
  });
});

test('each ui field is validated on its own', () => {
  assert.deepEqual(readUi(JSON.stringify({ editor: 'piano', dockOpen: false }), false), { editor: 'text', dockOpen: false });
  assert.deepEqual(readUi(JSON.stringify({ editor: 'grid', dockOpen: 'yes' }), true), { editor: 'grid', dockOpen: false });
  assert.deepEqual(readUi(JSON.stringify({ editor: 'grid', dockOpen: 1 }), false), { editor: 'grid', dockOpen: true });
});

test('saveUi writes only editor and dockOpen under its own key and reports failures', () => {
  const store = {};
  const ok = saveUi({ setItem: (k, v) => { store[k] = v; } }, { editor: 'grid', dockOpen: false, text: 'leak' });
  assert.equal(ok, true);
  assert.deepEqual(JSON.parse(store[UI_KEY]), { editor: 'grid', dockOpen: false });
  assert.equal(KEY in store, false);
  assert.equal(saveUi({ setItem: () => { throw new Error('blocked'); } }, { editor: 'text', dockOpen: true }), false);
  assert.equal(saveUi(null, { editor: 'text', dockOpen: true }), false);
});

test('autosave needs no header field and a document with header lines round trips', () => {
  const store = { setItem: (k, v) => { store.v = v; } };
  for (const text of [emptyTab(), `Title: A\nArtist: B\n${emptyTab()}`]) {
    assert.equal(save(store, { text, tempo: 80 }), true);
    assert.deepEqual(readSaved(store.v), { text, tempo: 80 });
  }
});
