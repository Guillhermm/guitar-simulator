import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hitCells, wireXs, quadFor, gapAt, stringY, rowEdgeY, NUT_X, SADDLE_X, HIT_LEFT_X, NUT_GAP, CENTER_Y,
  rowToString, stringLabel, fretText, reduceKey, displacement, isSettled, amplitudeFor, isWound,
  segmentStart, bodyPath, boardPath, boardHalfWidth, headstockPath, rollerFor, tieHole,
} from '../src/guitar.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('anchors: nut, saddle, 19 wires, fret 12 at half the scale', () => {
  assert.equal(NUT_X, 234);
  near(SADDLE_X, 1016.4);
  const wires = wireXs();
  assert.equal(wires.length, 19);
  near(wires[11], 234 + 780 / 2 * 1);
  near(wires[18], 234 + 780 * (1 - 2 ** (-19 / 12)));
  wires.forEach((x, i) => assert.ok(x > (wires[i - 1] ?? NUT_X) && x < SADDLE_X));
});

test('strings fan from 10.32 at the nut to 13.92 at the saddle, centered on y=240', () => {
  near(gapAt(NUT_X), NUT_GAP);
  near(gapAt(SADDLE_X), 13.92);
  near(gapAt(100), NUT_GAP);
  near(stringY(0, NUT_X), 214.2);
  near(stringY(5, NUT_X), 265.8);
  near(stringY(0, SADDLE_X), 205.2);
  near(stringY(5, SADDLE_X), 274.8);
  [NUT_X, 600, SADDLE_X].forEach((x) => near(stringY(2, x) + stringY(3, x), 2 * CENTER_Y));
});

test('hit cells: 20 fret cells plus the body zone, in order', () => {
  const cells = hitCells();
  assert.equal(cells.length, 21);
  assert.deepEqual(cells.slice(0, 20).map((c) => c.fret), [...Array(20).keys()]);
  assert.equal(cells[0].xa, HIT_LEFT_X);
  assert.equal(cells[0].xb, NUT_X);
  assert.equal(cells[1].xa, NUT_X);
  near(cells[19].xb, wireXs()[18]);
  const body = cells[20];
  assert.equal(body.body, true);
  assert.equal(body.fret, 0);
  assert.equal(body.xa, wireXs()[18]);
  assert.equal(body.xb, SADDLE_X);
  cells.forEach((c) => assert.ok(c.cx > c.xa && c.cx < c.xb));
});

test('cells of one string share their vertical edges exactly', () => {
  const cells = hitCells();
  for (let row = 0; row < 6; row += 1) {
    const quads = cells.map((c) => quadFor(row, c.xa, c.xb));
    quads.slice(1).forEach((q, i) => {
      assert.deepEqual(q[0], quads[i][1]);
      assert.deepEqual(q[3], quads[i][2]);
    });
  }
});

test('neighboring strings share their horizontal edges exactly, no gap and no overlap', () => {
  hitCells().forEach((c) => {
    for (let row = 0; row < 5; row += 1) {
      const a = quadFor(row, c.xa, c.xb);
      const b = quadFor(row + 1, c.xa, c.xb);
      assert.deepEqual(a[3], b[0]);
      assert.deepEqual(a[2], b[1]);
    }
  });
});

test('each quad is the local gap tall and holds its string at the middle', () => {
  hitCells().forEach((c) => {
    for (let row = 0; row < 6; row += 1) {
      const [tl, tr, br, bl] = quadFor(row, c.xa, c.xb);
      near(bl[1] - tl[1], gapAt(c.xa));
      near(br[1] - tr[1], gapAt(c.xb));
      near((tl[1] + bl[1]) / 2, stringY(row, c.xa));
      near((tr[1] + br[1]) / 2, stringY(row, c.xb));
    }
  });
});

test('left of the nut the quad uses the nut values', () => {
  const [tl, tr, br, bl] = quadFor(0, HIT_LEFT_X, NUT_X);
  assert.equal(tl[1], tr[1]);
  assert.equal(bl[1], br[1]);
  near(bl[1] - tl[1], NUT_GAP);
});

test('the row edges cover the board: top of row 0 to bottom of row 5', () => {
  near(rowEdgeY(0, NUT_X), 240 - 3 * NUT_GAP);
  near(rowEdgeY(6, NUT_X), 240 + 3 * NUT_GAP);
});

test('rows, labels and value text', () => {
  assert.equal(rowToString(0), 5);
  assert.equal(rowToString(5), 0);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(isWound), [false, false, false, true, true, true]);
  assert.equal(stringLabel(2), 'String 3, G');
  assert.equal(stringLabel(0), 'String 1, E');
  assert.equal(fretText(2, 5), 'Fret 5, note C');
  assert.equal(fretText(0, 19), 'Fret 19, note B');
});

const start = () => ({ row: 2, frets: [0, 0, 5, 0, 0, 0] });

test('arrows change the fret and clamp at 0 and 19', () => {
  assert.equal(reduceKey(start(), 'ArrowRight').frets[2], 6);
  assert.equal(reduceKey(start(), 'ArrowLeft').frets[2], 4);
  assert.equal(reduceKey({ row: 0, frets: [0, 0, 0, 0, 0, 0] }, 'ArrowLeft').frets[0], 0);
  assert.equal(reduceKey({ row: 0, frets: [19, 0, 0, 0, 0, 0] }, 'ArrowRight').frets[0], 19);
});

test('Home and End jump to 0 and 19', () => {
  assert.equal(reduceKey(start(), 'Home').frets[2], 0);
  assert.equal(reduceKey(start(), 'End').frets[2], 19);
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

test('vibration starts at full amplitude and settles in about 3.2 s', () => {
  assert.equal(displacement(9, 0), 9);
  assert.equal(isSettled(9, 0), false);
  assert.equal(isSettled(9, 2.5), false);
  assert.equal(isSettled(9, 3.2), true);
  assert.equal(isSettled(6, 3.0), true);
});

test('bass strings swing wider than treble', () => {
  assert.equal(amplitudeFor(0), 6);
  assert.equal(amplitudeFor(2), 6);
  assert.equal(amplitudeFor(3), 9);
  assert.equal(amplitudeFor(5), 9);
});

test('the vibrating segment starts at the nut when open, else at the far wire of the cell', () => {
  const cells = hitCells();
  assert.equal(segmentStart(0), NUT_X);
  near(segmentStart(19), wireXs()[18]);
  for (let fret = 1; fret <= 19; fret += 1) near(segmentStart(fret), cells[fret].xb);
});

test('the swing at the segment midpoint stays under half the local gap, for every string and fret', () => {
  // The control point peaks at A, so the segment midpoint moves A / 2.
  for (let fret = 0; fret <= 19; fret += 1) {
    const mid = (segmentStart(fret) + SADDLE_X) / 2;
    for (let row = 0; row < 6; row += 1) {
      assert.ok(amplitudeFor(row) / 2 < gapAt(mid) / 2, `row ${row}, fret ${fret}`);
    }
  }
});

test('body path is a closed spline of 35 segments spanning 184 mm each side of the center line', () => {
  const d = bodyPath();
  assert.match(d, /^M [\d.]+ [\d.]+ C /);
  assert.ok(d.endsWith(' Z'));
  assert.equal(d.match(/ C /g).length, 35);
  const ys = d.match(/-?\d+(\.\d+)? -?\d+(\.\d+)?(?= C| Z)/g).map((p) => +p.split(' ')[1]);
  near(Math.min(...ys), 240 - 184 * 1.2, 0.01);
  near(Math.max(...ys), 240 + 184 * 1.2, 0.01);
});

test('board tapers from 52 mm at the nut and ends past the heel', () => {
  near(boardHalfWidth(0), 26);
  near(boardHalfWidth(325.2), 31);
  assert.ok(boardPath().startsWith('M 234 208.8'));
  assert.ok(boardPath().endsWith('Z'));
});

test('headstock path is closed and each string reaches a roller on its own side', () => {
  assert.ok(headstockPath().startsWith('M 234 206.4'));
  assert.ok(headstockPath().endsWith('Z'));
  const rollers = [0, 1, 2, 3, 4, 5].map(rollerFor);
  rollers.slice(0, 3).forEach((r) => assert.ok(r.y < CENTER_Y));
  rollers.slice(3).forEach((r) => assert.ok(r.y > CENTER_Y));
  assert.equal(new Set(rollers.map((r) => `${r.x},${r.y}`)).size, 6);
  rollers.forEach((r) => assert.ok(r.x < NUT_X));
});

test('tie holes sit 14.4 apart behind the saddle', () => {
  [0, 1, 2, 3, 4, 5].forEach((row) => assert.ok(tieHole(row).x > SADDLE_X));
  near(tieHole(1).y - tieHole(0).y, 14.4, 0.01);
});
