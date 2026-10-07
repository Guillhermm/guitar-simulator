import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellBounds, wireXs, NUT_X, HEADSTOCK_X, stringY, rowToString, stringLabel, fretText,
  reduceKey, displacement, isSettled, amplitudeFor, isWound, segmentStart, bodyZone, BRIDGE_X,
} from '../src/guitar.js';

test('fret 12 wire sits at x=540', () => {
  assert.ok(Math.abs(wireXs()[11] - 540) < 0.01);
});

test('cells tile the span from headstock to fret 12 without gaps', () => {
  const cells = cellBounds();
  assert.equal(cells.length, 13);
  assert.equal(cells[0].x, HEADSTOCK_X);
  assert.equal(cells[0].x + cells[0].width, NUT_X);
  cells.slice(1).forEach((c, i) => {
    assert.ok(Math.abs(cells[i].x + cells[i].width - c.x) < 1e-9);
    assert.ok(c.width > 0);
  });
  assert.ok(Math.abs(cells[12].x + cells[12].width - 540) < 0.01);
});

test('cell centers are the midpoints', () => {
  const [c0, c1] = cellBounds();
  assert.equal(c0.cx, (HEADSTOCK_X + NUT_X) / 2);
  assert.equal(c1.cx, c1.x + c1.width / 2);
});

test('strings are 36 apart with the high e on top', () => {
  assert.equal(stringY(1) - stringY(0), 36);
  assert.equal(stringY(0), 120);
  assert.equal(rowToString(0), 5);
  assert.equal(rowToString(5), 0);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(isWound), [false, false, false, true, true, true]);
});

test('labels and value text', () => {
  assert.equal(stringLabel(2), 'String 3, G');
  assert.equal(stringLabel(0), 'String 1, E');
  assert.equal(fretText(2, 5), 'Fret 5, note C');
  assert.equal(fretText(0, 0), 'Fret 0, note E');
});

const start = () => ({ row: 2, frets: [0, 0, 5, 0, 0, 0] });

test('arrows change the fret and clamp at 0 and 12', () => {
  assert.equal(reduceKey(start(), 'ArrowRight').frets[2], 6);
  assert.equal(reduceKey(start(), 'ArrowLeft').frets[2], 4);
  assert.equal(reduceKey({ row: 0, frets: [0, 0, 0, 0, 0, 0] }, 'ArrowLeft').frets[0], 0);
  assert.equal(reduceKey({ row: 0, frets: [12, 0, 0, 0, 0, 0] }, 'ArrowRight').frets[0], 12);
});

test('Home and End jump to 0 and 12', () => {
  assert.equal(reduceKey(start(), 'Home').frets[2], 0);
  assert.equal(reduceKey(start(), 'End').frets[2], 12);
});

test('up and down move between strings and clamp', () => {
  assert.equal(reduceKey(start(), 'ArrowUp').row, 1);
  assert.equal(reduceKey(start(), 'ArrowDown').row, 3);
  assert.equal(reduceKey({ row: 0, frets: [0, 0, 0, 0, 0, 0] }, 'ArrowUp').row, 0);
  assert.equal(reduceKey({ row: 5, frets: [0, 0, 0, 0, 0, 0] }, 'ArrowDown').row, 5);
});

test('space and enter pluck, other keys are ignored', () => {
  assert.equal(reduceKey(start(), ' ').pluck, true);
  assert.equal(reduceKey(start(), 'Enter').pluck, true);
  assert.equal(reduceKey(start(), 'a'), null);
  assert.equal(reduceKey(start(), 'ArrowRight').pluck, false);
});

test('reduceKey does not mutate its input', () => {
  const s = start();
  reduceKey(s, 'ArrowRight');
  assert.equal(s.frets[2], 5);
});

test('vibration starts at full amplitude and settles in about 3.5 s', () => {
  assert.equal(displacement(14, 0), 14);
  assert.equal(isSettled(14, 0), false);
  assert.equal(isSettled(14, 3.0), false);
  assert.equal(isSettled(14, 3.6), true);
  assert.equal(isSettled(10, 3.3), true);
});

test('bass strings swing wider than treble', () => {
  assert.equal(amplitudeFor(0), 10);
  assert.equal(amplitudeFor(2), 10);
  assert.equal(amplitudeFor(3), 14);
  assert.equal(amplitudeFor(5), 14);
});

test('the vibrating segment starts at the nut when open, else at the far wire of the cell', () => {
  const cells = cellBounds();
  assert.equal(segmentStart(0), NUT_X);
  assert.ok(Math.abs(segmentStart(12) - 540) < 0.01);
  for (let fret = 1; fret <= 12; fret++) {
    assert.ok(Math.abs(segmentStart(fret) - (cells[fret].x + cells[fret].width)) < 1e-9);
  }
});

test('the body zone runs from the last fret wire to the bridge and plays the open string', () => {
  const wires = wireXs();
  const zone = bodyZone(wires);
  assert.equal(zone.fret, 0);
  assert.equal(zone.x, wires[wires.length - 1]);
  assert.equal(zone.x + zone.width, BRIDGE_X);
  assert.ok(zone.cx > zone.x && zone.cx < BRIDGE_X);
});

test('the widest swing stays inside the gap to the next string', () => {
  // The control point peaks at A, so the string's midpoint moves A / 2.
  for (let row = 0; row < 6; row += 1) {
    assert.ok(amplitudeFor(row) / 2 < 36 / 2);
  }
});
