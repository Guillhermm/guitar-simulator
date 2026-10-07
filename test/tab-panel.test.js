import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caretCell, cellOffset, lineStarts, statusFor } from '../src/tab-panel.js';
import { parseTab, emptyTab } from '../src/tab.js';

const song = ['Am', 'la la', ...emptyTab(4).split('\n'), '', ...emptyTab(4).split('\n')].join('\n');
const parsed = parseTab(song);
const starts = lineStarts(song);

test('lineStarts lists the offset of every line', () => {
  assert.deepEqual(lineStarts('ab\n\nc'), [0, 3, 4]);
});

test('the song fixture has two blocks on lines 2-7 and 9-14', () => {
  assert.deepEqual(parsed.blocks.map((b) => b.lines[0]), [2, 9]);
});

test('a caret on the third column of the B line of block 0 maps to row 1, col 2', () => {
  const caret = starts[3] + parsed.blocks[0].bodyStart[1] + 2;
  assert.deepEqual(caretCell(parsed, song, caret), { block: 0, row: 1, col: 2, inside: true });
});

test('a caret on the row label maps to column 0', () => {
  assert.equal(caretCell(parsed, song, starts[4]).col, 0);
});

test('a caret past the closing bar clamps to the last of the 4 columns', () => {
  assert.equal(caretCell(parsed, song, starts[2] + 6).col, 3);
});

test('a caret in the second block maps to block 1', () => {
  assert.equal(caretCell(parsed, song, starts[12] + 3).block, 1);
});

test('a caret on a lyric line falls back to column 0 of the first block', () => {
  assert.deepEqual(caretCell(parsed, song, 1), { block: 0, row: 0, col: 0, inside: false });
});

test('a caret on the blank line between blocks falls back to the block above', () => {
  assert.equal(caretCell(parsed, song, starts[8]).block, 0);
});

test('a text with no tab has no cell', () => {
  assert.equal(caretCell(parseTab('hello'), 'hello', 2), null);
});

test('cellOffset is the inverse of caretCell inside a block', () => {
  const cell = { block: 1, row: 4, col: 2 };
  const offset = cellOffset(parsed, song, cell);
  assert.deepEqual(caretCell(parsed, song, offset), { ...cell, inside: true });
});

test('statusFor is empty when there is something to play', () => {
  assert.equal(statusFor(parseTab('e|-3-|\nB|---|\nG|---|\nD|---|\nA|---|\nE|---|')), '');
});

test('statusFor explains an empty tab', () => {
  assert.equal(statusFor(parseTab(emptyTab(4))), 'Nothing to play yet.');
});

test('statusFor counts notes above fret 19', () => {
  const text = ['e|-25-|', 'B|----|', 'G|----|', 'D|----|', 'A|----|', 'E|-30-|'].join('\n');
  assert.equal(statusFor(parseTab(text)), 'Nothing to play yet. 2 notes above fret 19 skipped');
});
