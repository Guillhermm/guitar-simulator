import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keptCaret } from '../src/editor-text.js';
import { withMeta } from '../src/tab.js';

const TAB = 'e|-0-|\nB|-1-|\nG|-2-|\nD|-2-|\nA|-0-|\nE|---|';

test('a header line inserted above the caret moves the caret with its text', () => {
  const at = TAB.indexOf('G|-2') + 3;
  const next = withMeta(TAB, { title: 'Song' });
  assert.equal(next.slice(keptCaret(TAB, next, at)), TAB.slice(at));
});

test('a header line removed above the caret moves the caret back with its text', () => {
  const before = `Title: Song\nArtist: Band\n${TAB}`;
  const at = before.indexOf('D|-2') + 1;
  const next = withMeta(before, { artist: '' });
  assert.equal(next.slice(keptCaret(before, next, at)), before.slice(at));
});

test('a change below the caret leaves the caret where it was', () => {
  const at = 3;
  assert.equal(keptCaret(TAB, `${TAB}\nlyrics`, at), at);
});

test('a caret inside the replaced span stays inside the new text', () => {
  const before = 'Title: Old name\nx';
  const next = 'Title: New\nx';
  assert.equal(keptCaret(before, next, 12), 10);
  assert.equal(keptCaret('abc', 'abc', 2), 2);
});
