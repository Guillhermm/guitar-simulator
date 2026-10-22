import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerOn, keptCaret, writeAt } from '../src/editor-text.js';
import { withMeta, parseTab } from '../src/tab.js';

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

test('a fret written near the closing bar sends the caret to a new block below', () => {
  const lines = (text) => text.split('\n');
  const { text, caret } = writeAt(TAB, { block: 0, row: 0, col: 2 }, 3);
  assert.equal(lines(text)[0], 'e|-0-3|');
  assert.deepEqual(caret, { block: 1, row: 0, col: 0 });
  assert.equal(parseTab(text).blocks.length, 2);
});

test('past the closing bar the caret moves into the next block when there is one', () => {
  const two = `${TAB}\n\n${TAB}`;
  const { text, caret } = writeAt(two, { block: 0, row: 2, col: 2 }, 5);
  assert.equal(parseTab(text).blocks.length, 2);
  assert.deepEqual(caret, { block: 1, row: 2, col: 0 });
});

test('away from the bar the caret moves two columns on in the same block', () => {
  const wide = TAB.replace(/\|-(.)-\|/g, '|-$1------|');
  const { caret } = writeAt(wide, { block: 0, row: 1, col: 3 }, 7);
  assert.deepEqual(caret, { block: 0, row: 1, col: 5 });
});

test('the playing block is scrolled to the middle of the sheet, clamped to what can scroll', () => {
  assert.equal(centerOn(500, 120, 300, 2000), 410);
  assert.equal(centerOn(40, 120, 300, 2000), 0);
  assert.equal(centerOn(1950, 120, 300, 1800), 1800);
  assert.equal(centerOn(500, 400, 300, 2000), 500);
  assert.equal(centerOn(500, 120, 300, -10), 0);
});
