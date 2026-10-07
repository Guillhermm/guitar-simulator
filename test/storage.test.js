import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSaved, save, KEY, MAX_BYTES } from '../src/storage.js';
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
