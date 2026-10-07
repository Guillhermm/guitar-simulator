import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../src/scheduler.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

const rig = (opts = {}) => {
  const clock = { t: 10, timers: [] };
  const played = [];
  const stepped = [];
  const log = { ends: 0 };
  const scheduler = createScheduler({
    now: () => clock.t,
    play: (midi, when) => {
      const handle = { midi, when, stopped: 0, stop() { this.stopped += 1; } };
      played.push(handle);
      return handle;
    },
    onStep: (event, when) => stepped.push({ step: event.step, when }),
    onEnd: () => { log.ends += 1; },
    setTimer: (fn) => { clock.timers.push(fn); return clock.timers.length; },
    clearTimer: (id) => { clock.timers[id - 1] = null; },
    ...opts,
  });
  // Advances the audio clock and runs the most recent pending timer, like one setTimeout firing.
  const advance = (dt) => {
    clock.t += dt;
    const fn = clock.timers.at(-1);
    if (fn) { clock.timers[clock.timers.length - 1] = null; fn(); }
  };
  return { scheduler, clock, played, stepped, log, advance };
};

const E = (step, ...notes) => ({ step, block: 0, col: step, notes: notes.map(([row, fret]) => ({ row, fret })) });

test('when = start + step * 60 / (tempo * 4); tempo 120 gives 0.125 s per step', () => {
  const { scheduler, stepped, advance } = rig();
  scheduler.start([E(0, [0, 0]), E(1, [0, 0]), E(4, [0, 0])], 120);
  for (let i = 0; i < 20; i += 1) advance(0.025);
  assert.deepEqual(stepped.map((s) => s.step), [0, 1, 4]);
  const t0 = stepped[0].when;
  near(t0, 10.05);
  near(stepped[1].when - t0, 0.125);
  near(stepped[2].when - t0, 0.5);
});

test('same-column notes share one when and map row 0 to the high E (MIDI 64)', () => {
  const { scheduler, played } = rig();
  scheduler.start([E(0, [0, 0], [5, 3])], 80);
  assert.equal(played.length, 2);
  assert.equal(played[0].when, played[1].when);
  assert.deepEqual(played.map((p) => p.midi), [64, 43]);
});

test('fromStep skips earlier events and re-bases time', () => {
  const { scheduler, stepped } = rig();
  scheduler.start([E(0, [0, 0]), E(8, [0, 0])], 60, 8);
  assert.deepEqual(stepped.map((s) => s.step), [8]);
  near(stepped[0].when, 10.05);
});

test('no event is scheduled twice across ticks and none ahead of the lookahead', () => {
  const { scheduler, played, stepped, advance } = rig();
  scheduler.start([E(0, [0, 0]), E(1, [1, 0]), E(2, [2, 0])], 120);
  // Step 0 is at 10.05, step 1 at 10.175, step 2 at 10.3. At t = 10.05 the horizon is 10.15.
  assert.deepEqual(stepped.map((s) => s.step), [0]);
  advance(0.025);
  advance(0.025);
  assert.deepEqual(stepped.map((s) => s.step), [0]);
  advance(0.025);
  advance(0.025);
  assert.deepEqual(stepped.map((s) => s.step), [0, 1]);
  for (let i = 0; i < 5; i += 1) advance(0.025);
  assert.deepEqual(stepped.map((s) => s.step), [0, 1, 2]);
  assert.equal(played.length, 3);
});

test('stop cancels notes not yet started and leaves started ones alone', () => {
  const { scheduler, played, advance, log } = rig();
  scheduler.start([E(0, [0, 0]), E(1, [1, 0]), E(8, [2, 0])], 240);
  // Step is 0.0625 s: step 0 at 10.05, step 1 at 10.1125.
  advance(0.06);
  assert.equal(played.length, 2);
  assert.equal(scheduler.isPlaying(), true);
  scheduler.stop();
  assert.equal(played[0].stopped, 0);
  assert.equal(played[1].stopped, 1);
  assert.equal(scheduler.isPlaying(), false);
  advance(1);
  assert.equal(played.length, 2);
  assert.equal(log.ends, 0);
});

test('onEnd fires once, after the last step has had its slot', () => {
  const { scheduler, advance, log } = rig();
  scheduler.start([E(0, [0, 0]), E(2, [0, 0])], 120);
  // Last slot ends at 10.05 + 3 * 0.125 = 10.425.
  advance(0.2);
  assert.equal(log.ends, 0);
  advance(0.2);
  assert.equal(log.ends, 0);
  advance(0.1);
  assert.equal(log.ends, 1);
  assert.equal(scheduler.isPlaying(), false);
  advance(1);
  assert.equal(log.ends, 1);
});

test('an empty song ends on the first tick', () => {
  const { scheduler, log } = rig();
  scheduler.start([], 80);
  assert.equal(log.ends, 0);
  scheduler.start([], 80);
  assert.equal(scheduler.isPlaying(), true);
});

test('start replaces a running song and rejects a bad tempo', () => {
  const { scheduler, played, log } = rig();
  scheduler.start([E(5, [0, 0])], 80);
  scheduler.start([E(0, [0, 0])], 80);
  assert.equal(played.length, 1);
  assert.equal(log.ends, 0);
  assert.throws(() => scheduler.start([], 0), RangeError);
});
