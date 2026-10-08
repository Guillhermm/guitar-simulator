import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler, planNotes, BEND_SEC } from '../src/scheduler.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

const rig = (opts = {}) => {
  const clock = { t: 10, timers: [] };
  const played = [];
  const stepped = [];
  const log = { ends: 0 };
  const scheduler = createScheduler({
    now: () => clock.t,
    play: (spec) => {
      const handle = { midi: spec.midi, when: spec.when, spec, stopped: 0, stop() { this.stopped += 1; } };
      played.push(handle);
      return handle;
    },
    onStep: (spec) => stepped.push(spec),
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

// Step index of a played spec, from its absolute time (start at clock 10 plus the 0.05 lead).
const stepOf = (spec, stepSec) => Math.round((spec.when - 10.05) / stepSec);

const E = (step, ...notes) => ({ step, block: 0, col: step, notes: notes.map(([row, fret]) => ({ row, fret })) });

test('when = start + step * 60 / (tempo * 4); tempo 120 gives 0.125 s per step', () => {
  const { scheduler, stepped, advance } = rig();
  scheduler.start([E(0, [0, 0]), E(1, [0, 0]), E(4, [0, 0])], 120);
  for (let i = 0; i < 20; i += 1) advance(0.025);
  assert.deepEqual(stepped.map((s) => stepOf(s, 0.125)), [0, 1, 4]);
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
  assert.equal(stepped.length, 1);
  near(stepped[0].when, 10.05);
});

test('no event is scheduled twice across ticks and none ahead of the lookahead', () => {
  const { scheduler, played, stepped, advance } = rig();
  scheduler.start([E(0, [0, 0]), E(1, [1, 0]), E(2, [2, 0])], 120);
  // Step 0 is at 10.05, step 1 at 10.175, step 2 at 10.3. At t = 10.05 the horizon is 10.15.
  assert.deepEqual(stepped.map((s) => stepOf(s, 0.125)), [0]);
  advance(0.025);
  advance(0.025);
  assert.deepEqual(stepped.map((s) => stepOf(s, 0.125)), [0]);
  advance(0.025);
  advance(0.025);
  assert.deepEqual(stepped.map((s) => stepOf(s, 0.125)), [0, 1]);
  for (let i = 0; i < 5; i += 1) advance(0.025);
  assert.deepEqual(stepped.map((s) => stepOf(s, 0.125)), [0, 1, 2]);
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

test('play and onStep get the same absolute spec, one per note, with glide and bend times shifted', () => {
  const { scheduler, played, stepped } = rig();
  const slide = { step: 0, block: 0, col: 0, notes: [{ row: 0, fret: 5 }] };
  const target = { step: 2, block: 0, col: 2, notes: [{ row: 0, fret: 7, tech: { legato: '/' } }] };
  scheduler.start([slide, target], 80);
  assert.equal(stepped.length, 1);
  assert.equal(played[0].spec, stepped[0]);
  near(stepped[0].glide.end, 10.05 + 0.375);
  near(stepped[0].chokeAt, 10.05 + 3);
});

test('with fromStep every time in a spec is re-based, release included', () => {
  const { scheduler, stepped } = rig({ lookahead: 5 });
  const e = (step, tech) => ({ step, block: 0, col: step, notes: [{ row: 0, fret: 5, tech }] });
  scheduler.start([e(0), e(8), e(12, { bend: { semitones: 2, releaseStep: 14 } })], 120, 8);
  assert.equal(stepped.length, 2);
  near(stepped[0].when, 10.05);
  near(stepped[1].when, 10.05 + 0.5);
  near(stepped[1].bend.start, 10.05 + 0.5 + 0.125);
  near(stepped[1].bend.releaseAt, 10.05 + 0.75);
});

const STEP = 60 / (80 * 4);
const ev = (step, ...notes) => ({ step, block: 0, col: step, notes });
const n = (row, fret, tech) => (tech ? { row, fret, tech } : { row, fret });
const plan = (...events) => planNotes(events, STEP);

test('planNotes: when, midi (row 0 is the high E) and defaults', () => {
  const [a, b] = plan(ev(0, n(0, 3), n(5, 0)), ev(4, n(0, 5)));
  assert.equal(plan().length, 0);
  assert.deepEqual(a, { row: 0, midi: 67, when: 0, gain: 1, kind: 'pluck', baseMidi: 67, chokeAt: 4 * STEP });
  assert.equal(b.midi, 40);
  near(b.chokeAt, 3);
  const last = plan(ev(4, n(0, 5)))[0];
  near(last.when, 0.75);
  near(last.chokeAt, 3.75);
});

test('planNotes: ghost gain 0.35, muted gain 0.6, palm mute and kind precedence', () => {
  const specs = plan(
    ev(0, n(0, 5, { ghost: true }), n(1, null, { muted: true }), n(2, 5, { palmMute: true }), n(3, 5, { palmMute: true, muted: false })),
  );
  assert.deepEqual(specs.map((s) => [s.row, s.gain, s.kind]), [[0, 0.35, 'pluck'], [1, 0.6, 'muted'], [2, 1, 'palmMute'], [3, 1, 'palmMute']]);
  const muted = specs[1];
  assert.equal(muted.midi, 59);
  near(muted.chokeAt, 0.08);
});

test('planNotes: harmonics sound the table offset over the open string', () => {
  const frets = [12, 7, 19, 5, 4, 9];
  const specs = plan(...frets.map((f, i) => ev(i * 8, n(0, f, { harmonic: true }))));
  assert.deepEqual(specs.map((s) => s.midi), [76, 83, 83, 88, 92, 92]);
  assert.ok(specs.every((s) => s.baseMidi === 64 && s.kind === 'harmonic'));
});

test('planNotes: legato notes continue the voice, so the chain is cut by the next pluck', () => {
  const [a, b, c, d] = plan(ev(0, n(0, 5)), ev(2, n(0, 7, { legato: 'h' })), ev(4, n(0, 5, { legato: 'p' })), ev(8, n(0, 3)));
  assert.deepEqual([a.kind, b.kind, c.kind, d.kind], ['pluck', 'legato', 'legato', 'pluck']);
  assert.deepEqual([a.chokeAt, b.chokeAt, c.chokeAt].map((t) => Math.round(t / STEP)), [8, 8, 8]);
  assert.equal(a.glide, undefined);
});

test('planNotes: a slide takes 0.75 of the gap, at most 0.3 s, and ends on the target beat', () => {
  const [short] = plan(ev(0, n(0, 5)), ev(1, n(0, 7, { legato: '/' })));
  near(short.glide.end, STEP);
  near(short.glide.end - short.glide.start, 0.75 * STEP);
  assert.deepEqual([short.glide.from, short.glide.to, short.glide.stepped], [69, 71, true]);
  const [long] = plan(ev(0, n(0, 7)), ev(8, n(0, 5, { legato: '\\' })));
  near(long.glide.end, 8 * STEP);
  near(long.glide.end - long.glide.start, 0.3);
  assert.deepEqual([long.glide.from, long.glide.to], [71, 69]);
});

test('planNotes: slide in starts on the note, slide out ends where the next note would be', () => {
  const [inUp] = plan(ev(0, n(0, 7, { slideIn: 'up' })));
  assert.deepEqual([inUp.glide.from, inUp.glide.to, inUp.glide.start], [68, 71, 0]);
  near(inUp.glide.end, 0.3);
  const [outDown] = plan(ev(0, n(0, 7, { slideOut: 'down' })));
  assert.deepEqual([outDown.glide.from, outDown.glide.to], [71, 68]);
  near(outDown.glide.start, 4 * STEP - 0.3);
  near(outDown.glide.end, 4 * STEP);
});

test('planNotes: bend and release last 0.12 s; the bend starts one step after the note', () => {
  assert.equal(BEND_SEC, 0.12);
  const [plain] = plan(ev(0, n(0, 7, { bend: { semitones: 2 } })));
  assert.deepEqual(plain.bend, { semitones: 2, start: STEP, dur: 0.12 });
  const [rel] = plan(ev(0, n(0, 7, { bend: { semitones: 3, releaseStep: 4 } })));
  near(rel.bend.releaseAt, 4 * STEP);
  const [early] = plan(ev(0, n(0, 7, { bend: { semitones: 2, releaseStep: 1 } })));
  near(early.bend.releaseAt, STEP + 0.12);
});

test('planNotes: vibrato runs from one step after the note to its chokeAt', () => {
  const [v, w] = plan(ev(0, n(0, 7, { vibrato: true })), ev(6, n(0, 5)));
  near(v.vibrato.start, STEP);
  near(v.vibrato.end, 6 * STEP);
  assert.equal(w.vibrato, undefined);
});
