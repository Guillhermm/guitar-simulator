import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFret, emptyTab, landedCol, digitCount, parseTab } from '../src/tab.js';
import { ENTRY_WINDOW_MS, cellText, enterDigit, moveRight, moveRightBy, reduceGridKey, tapSteps } from '../src/editor-grid.js';

const at = (block, row, col) => ({ block, row, col });
const widths = [4, 3];

test('the entry window is 600 ms', () => {
  assert.equal(ENTRY_WINDOW_MS, 600);
});

test('a digit other than 1 settles at once', () => {
  assert.deepEqual(enterDigit(null, 7, 'k', 0), { fret: 7, pending: null, settled: true });
});

test('a 1 writes fret 1 and waits for a second digit', () => {
  const r = enterDigit(null, 1, 'k', 1000);
  assert.equal(r.fret, 1);
  assert.equal(r.settled, false);
  assert.deepEqual(r.pending, { key: 'k', digit: 1, at: 1000 });
});

test('a second digit 599 ms later on the same cell makes fret 15', () => {
  const { pending } = enterDigit(null, 1, 'k', 1000);
  assert.deepEqual(enterDigit(pending, 5, 'k', 1599), { fret: 15, pending: null, settled: true });
});

test('a second digit exactly 600 ms later still combines', () => {
  const { pending } = enterDigit(null, 1, 'k', 0);
  assert.equal(enterDigit(pending, 0, 'k', 600).fret, 10);
});

test('a second digit 601 ms later starts a new entry', () => {
  const { pending } = enterDigit(null, 1, 'k', 0);
  assert.equal(enterDigit(pending, 5, 'k', 601).fret, 5);
});

test('a second digit on another cell starts a new entry', () => {
  const { pending } = enterDigit(null, 1, 'a', 0);
  assert.equal(enterDigit(pending, 2, 'b', 100).fret, 2);
});

test('1 then 1 within the window makes fret 11 and does not chain further', () => {
  const { pending } = enterDigit(null, 1, 'k', 0);
  const r = enterDigit(pending, 1, 'k', 50);
  assert.equal(r.fret, 11);
  assert.equal(r.pending, null);
});

test('ArrowRight moves one column inside a block', () => {
  assert.deepEqual(reduceGridKey(at(0, 2, 1), 'ArrowRight', widths).cursor, at(0, 2, 2));
});

test('ArrowRight on the last column of block 0 goes to column 0 of block 1', () => {
  assert.deepEqual(reduceGridKey(at(0, 2, 3), 'ArrowRight', widths).cursor, at(1, 2, 0));
});

test('ArrowRight on the last column of the last block reports overflow', () => {
  const r = reduceGridKey(at(1, 0, 2), 'ArrowRight', widths);
  assert.equal(r.overflow, true);
  assert.deepEqual(r.cursor, at(1, 0, 2));
});

test('ArrowLeft on column 0 of block 1 goes to the last column of block 0', () => {
  assert.deepEqual(reduceGridKey(at(1, 0, 0), 'ArrowLeft', widths).cursor, at(0, 0, 3));
});

test('ArrowLeft at the very start stays put', () => {
  assert.deepEqual(reduceGridKey(at(0, 0, 0), 'ArrowLeft', widths).cursor, at(0, 0, 0));
});

test('ArrowUp stops at row 0 and ArrowDown at row 5', () => {
  assert.equal(reduceGridKey(at(0, 0, 0), 'ArrowUp', widths).cursor.row, 0);
  assert.equal(reduceGridKey(at(0, 5, 0), 'ArrowDown', widths).cursor.row, 5);
  assert.equal(reduceGridKey(at(0, 2, 0), 'ArrowDown', widths).cursor.row, 3);
});

test('Backspace and Delete clear the cell without moving', () => {
  ['Backspace', 'Delete'].forEach((key) => {
    const r = reduceGridKey(at(0, 3, 1), key, widths);
    assert.equal(r.action, 'clear');
    assert.deepEqual(r.cursor, at(0, 3, 1));
  });
});

test('Space is a rest and moves one column right', () => {
  const r = reduceGridKey(at(0, 3, 1), ' ', widths);
  assert.equal(r.action, 'rest');
  assert.deepEqual(r.cursor, at(0, 3, 2));
});

test('a key the grid does not own returns null', () => {
  assert.equal(reduceGridKey(at(0, 0, 0), 'Tab', widths), null);
});

test('moveRight keeps the row when it crosses into the next block', () => {
  assert.deepEqual(moveRight(at(0, 4, 3), widths).cursor, at(1, 4, 0));
});

test('a muted note (fret null) shows as x, an empty cell as nothing', () => {
  assert.deepEqual([undefined, null, 0, 12].map(cellText), ['', 'x', '0', '12']);
});

test('clearing a cell holding x removes the muted note', () => {
  const lines = emptyTab(4).split('\n');
  lines[3] = 'D|-x--|';
  const cleared = setFret(lines.join('\n'), { block: 0, row: 3, col: 1 }, null);
  assert.equal(cleared.split('\n')[3], 'D|----|');
  assert.equal(parseTab(cleared).events.length, 0);
});

test('taps from the guitar keep the block width and overflow at its end', () => {
  let text = emptyTab();
  const width = parseTab(text).blocks[0].width;
  let cursor = { block: 0, row: 0, col: 0 };
  let taps = 0;
  for (;;) {
    text = setFret(text, cursor, 3);
    taps += 1;
    const at = moveRightBy({ ...cursor, col: landedCol(text, cursor) }, [width], tapSteps(3));
    if (at.overflow) break;
    cursor = at.cursor;
  }
  assert.equal(parseTab(text).blocks[0].width, width);
  assert.equal(taps, width / 2);
  assert.equal(tapSteps(12), 3);
  assert.equal(tapSteps(null), 1);
});
