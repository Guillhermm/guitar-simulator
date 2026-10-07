import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING, midiToHz, noteAt, noteName, fretPositions } from '../src/pitch.js';

test('A4 is 440 Hz and octaves double', () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(81) - 880) < 1e-9);
  assert.ok(Math.abs(midiToHz(57) - 220) < 1e-9);
});

test('standard tuning, low E to high E', () => {
  assert.deepEqual(TUNING, [40, 45, 50, 55, 59, 64]);
  assert.deepEqual(TUNING.map(noteName), ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  assert.ok(Math.abs(midiToHz(40) - 82.4069) < 1e-3);
});

test('noteAt adds the fret to the open string', () => {
  assert.equal(noteAt(0, 0), 40);
  assert.equal(noteAt(5, 12), 76);
  assert.equal(noteAt(5, 19), 83);
  assert.equal(noteAt(2, 5), noteAt(3, 0));
});

test('noteAt rejects out-of-range input', () => {
  assert.throws(() => noteAt(6, 0), RangeError);
  assert.throws(() => noteAt(-1, 0), RangeError);
  assert.throws(() => noteAt(0, 20), RangeError);
  assert.throws(() => noteAt(0, 1.5), RangeError);
});

test('noteName covers accidentals and octave boundaries', () => {
  assert.equal(noteName(69), 'A4');
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(61), 'C#4');
  assert.equal(noteName(76), 'E5');
});

test('12th fret sits at half the scale length and sounds an octave up', () => {
  const positions = fretPositions(650, 12);
  assert.equal(positions.length, 12);
  assert.ok(Math.abs(positions[11] - 325) < 1e-9);
  for (let s = 0; s < 6; s++) {
    assert.ok(Math.abs(midiToHz(noteAt(s, 12)) / midiToHz(noteAt(s, 0)) - 2) < 1e-12);
  }
});

test('fret positions increase and follow x = L(1 - 2^(-n/12))', () => {
  const positions = fretPositions(648, 12);
  positions.forEach((x, i) => {
    assert.ok(Math.abs(x - 648 * (1 - 2 ** (-(i + 1) / 12))) < 1e-9);
    if (i > 0) assert.ok(x > positions[i - 1]);
  });
});
