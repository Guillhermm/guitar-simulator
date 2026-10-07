import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPluck } from '../src/pluck.js';
import { TUNING, midiToHz, noteAt } from '../src/pitch.js';

const SAMPLE_RATE = 44100;

const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const render = (frequency, duration = 1, seed = 1) =>
  renderPluck({ frequency, sampleRate: SAMPLE_RATE, duration, random: seeded(seed) });

const correlate = (x, lag, window) => {
  let sum = 0;
  for (let i = 0; i < window; i++) sum += x[i] * x[i + lag];
  return sum;
};

// Autocorrelation peak near k periods, refined by a parabola, divided by k.
const estimatePeriod = (x, expected, k) => {
  const window = 8192;
  const center = Math.round(expected * k);
  const radius = Math.ceil(expected * 0.5);
  let best = center;
  let bestValue = -Infinity;
  for (let lag = center - radius; lag <= center + radius; lag++) {
    const value = correlate(x, lag, window);
    if (value > bestValue) {
      bestValue = value;
      best = lag;
    }
  }
  const a = correlate(x, best - 1, window);
  const b = bestValue;
  const c = correlate(x, best + 1, window);
  const offset = (0.5 * (a - c)) / (a - 2 * b + c);
  return (best + offset) / k;
};

test('every one of the 120 notes is within 5 cents', (t) => {
  let count = 0;
  let worst = 0;
  for (let s = 0; s < TUNING.length; s++) {
    for (let fret = 0; fret <= 19; fret++) {
      const midi = noteAt(s, fret);
      const frequency = midiToHz(midi);
      const expected = SAMPLE_RATE / frequency;
      const samples = render(frequency, 0.5);
      const k = Math.max(1, Math.floor(1500 / expected));
      const measured = estimatePeriod(samples, expected, k);
      const cents = Math.abs(1200 * Math.log2(expected / measured));
      worst = Math.max(worst, cents);
      assert.ok(cents < 5, `midi ${midi}: ${cents.toFixed(2)} cents off`);
      count++;
    }
  }
  assert.equal(count, 120);
  t.diagnostic(`worst pitch error: ${worst.toFixed(3)} cents`);
});

test('output is finite, bounded to +-1 and not silent', () => {
  for (const midi of [40, 59, 76]) {
    const samples = render(midiToHz(midi));
    assert.ok(samples instanceof Float32Array);
    assert.equal(samples.length, SAMPLE_RATE);
    let peak = 0;
    for (const v of samples) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(peak <= 1 && peak > 0.5, `peak ${peak}`);
  }
});

test('energy decays over time', () => {
  const samples = render(midiToHz(45), 3);
  const energy = (from, to) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] ** 2;
    return sum;
  };
  const third = Math.floor(samples.length / 3);
  const first = energy(0, third);
  const second = energy(third, 2 * third);
  const last = energy(2 * third, 3 * third);
  assert.ok(first > second && second > last);
  assert.ok(last < first * 0.5);
});

test('the attack is brighter than the tail', () => {
  const samples = render(midiToHz(52), 2);
  const roughness = (from, to) => {
    let diff = 0;
    let level = 0;
    for (let i = from + 1; i < to; i++) {
      diff += (samples[i] - samples[i - 1]) ** 2;
      level += samples[i] ** 2;
    }
    return diff / level;
  };
  assert.ok(roughness(0, 4000) > roughness(60000, 64000));
});

test('same random source gives the same output, a different one does not', () => {
  const a = render(220, 0.3, 7);
  const b = render(220, 0.3, 7);
  const c = render(220, 0.3, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('rejects invalid input', () => {
  assert.throws(() => renderPluck({ frequency: 0, sampleRate: SAMPLE_RATE, duration: 1 }), RangeError);
  assert.throws(() => renderPluck({ frequency: 30000, sampleRate: SAMPLE_RATE, duration: 1 }), RangeError);
});
