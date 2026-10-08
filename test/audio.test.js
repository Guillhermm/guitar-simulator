import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../src/audio.js';

const fakeParam = (value = 1) => {
  const calls = [];
  const record = (type) => (v, t) => { calls.push({ type, v, t }); };
  return {
    value,
    calls,
    setValueAtTime: record('set'),
    linearRampToValueAtTime: record('ramp'),
    setTargetAtTime: (v, t, tau) => { calls.push({ type: 'target', v, t, tau }); },
  };
};

const fakeContext = ({ detune = true } = {}) => {
  const log = { buffers: [], sources: [], gains: [], oscillators: [], resumed: 0 };
  const ctx = {
    sampleRate: 8000,
    state: 'suspended',
    currentTime: 12.5,
    destination: {},
    createGain: () => {
      const node = { gain: fakeParam(), connect(to) { this.to = to; } };
      log.gains.push(node);
      return node;
    },
    createDynamicsCompressor: () => ({ connect() {} }),
    createBuffer: (channels, length) => {
      const buffer = { length, copyToChannel() {} };
      log.buffers.push(buffer);
      return buffer;
    },
    createBufferSource: () => {
      const source = {
        buffer: null,
        started: 0,
        whens: [],
        stops: [],
        playbackRate: fakeParam(),
        connect(to) { this.to = to; },
        start(when) { this.started++; this.whens.push(when); },
        stop(when) { this.stops.push(when); },
      };
      if (detune) source.detune = fakeParam(0);
      log.sources.push(source);
      return source;
    },
    createOscillator: () => {
      const osc = {
        frequency: fakeParam(), started: [], stopped: [], connect(to) { this.to = to; }, start(t) { this.started.push(t); }, stop(t) { this.stopped.push(t); },
      };
      log.oscillators.push(osc);
      return osc;
    },
    resume: () => { log.resumed++; },
  };
  return { ctx, log };
};

const spec = (extra = {}) => ({ row: 3, midi: 55, when: 13, gain: 1, kind: 'pluck', baseMidi: 55, chokeAt: 20, ...extra });
const setup = (options) => {
  const f = fakeContext(options);
  return { ...f, player: createPlayer({ createContext: () => f.ctx }) };
};
const sets = (param) => param.calls.filter((c) => c.type === 'set');

test('no context is created until the first play', () => {
  let created = 0;
  createPlayer({ createContext: () => { created++; return fakeContext().ctx; } });
  assert.equal(created, 0);
});

test('first play creates the context, resumes it and starts a source', () => {
  const { ctx, log } = fakeContext();
  let created = 0;
  const player = createPlayer({ createContext: () => { created++; return ctx; } });
  player.play(45);
  assert.equal(created, 1);
  assert.equal(log.resumed, 1);
  assert.equal(log.sources.length, 1);
  assert.equal(log.sources[0].started, 1);
});

test('buffers are cached per MIDI note and sources overlap', () => {
  const { ctx, log } = fakeContext();
  const player = createPlayer({ createContext: () => ctx });
  player.play(45);
  player.play(45);
  player.play(50);
  assert.equal(log.buffers.length, 2);
  assert.equal(log.sources.length, 3);
  assert.equal(log.sources[0].buffer, log.sources[1].buffer);
});

test('resume creates and resumes the context without playing', () => {
  const { ctx, log } = fakeContext();
  const player = createPlayer({ createContext: () => ctx });
  player.resume();
  assert.equal(log.resumed, 1);
  assert.equal(log.sources.length, 0);
});

test('play returns the source and starts it at the given time, defaulting to now', () => {
  const { ctx, log } = fakeContext();
  const player = createPlayer({ createContext: () => ctx });
  const timed = player.play(45, 13.25);
  const immediate = player.play(45);
  assert.equal(timed, log.sources[0]);
  assert.deepEqual(timed.whens, [13.25]);
  assert.deepEqual(immediate.whens, [0]);
});

test('now returns the context time, creating and resuming the context lazily', () => {
  const { ctx, log } = fakeContext();
  let created = 0;
  const player = createPlayer({ createContext: () => { created++; return ctx; } });
  assert.equal(created, 0);
  assert.equal(player.now(), 12.5);
  assert.equal(created, 1);
  assert.equal(log.resumed, 1);
});

test('a legato note re-pitches the live voice at its time and creates no source', () => {
  const { player, log } = setup();
  player.play(spec());
  const result = player.play(spec({ kind: 'legato', midi: 57, when: 13.5 }));
  assert.equal(result, undefined);
  assert.equal(log.sources.length, 1);
  assert.deepEqual(sets(log.sources[0].playbackRate), [{ type: 'set', v: 2 ** (2 / 12), t: 13.5 }]);
});

test('legato after a pull-off returns below the voice pitch', () => {
  const { player, log } = setup();
  player.play(spec());
  player.play(spec({ kind: 'legato', midi: 53, when: 13.5 }));
  assert.equal(sets(log.sources[0].playbackRate)[0].v, 2 ** (-2 / 12));
});

test('a legato note keeps its own vibrato, bend and onward slide on the live voice (7\\5~~, 5h7b9, 5h7/9)', () => {
  const { player, log } = setup();
  player.play(spec());
  player.play(spec({
    kind: 'legato', midi: 57, when: 13.5,
    vibrato: { start: 13.6, end: 15 },
    bend: { semitones: 2, start: 13.6, dur: 0.12 },
    glide: { from: 57, to: 59, start: 14, end: 14.2, stepped: true },
  }));
  assert.equal(log.sources.length, 1);
  assert.equal(log.oscillators.length, 1);
  assert.equal(log.oscillators[0].to.to, log.sources[0].detune);
  const calls = log.sources[0].playbackRate.calls.map((c) => [c.type, +c.v.toFixed(6), c.t]);
  const r = (n) => +(2 ** (n / 12)).toFixed(6);
  assert.deepEqual(calls, [
    ['set', r(2), 13.5], ['set', r(3), 14.1], ['set', r(4), 14.2], ['set', r(2), 13.6], ['ramp', r(4), 13.6 + 0.12],
  ]);
});

test('a bend on a note that slid in starts from the note, not from where the slide began', () => {
  const { player, log } = setup();
  player.play(spec({ midi: 58, glide: { from: 55, to: 58, start: 13, end: 13.1 }, bend: { semitones: 1, start: 13.2, dur: 0.1 } }));
  const bendCalls = log.sources[0].playbackRate.calls.slice(-2);
  assert.ok(Math.abs(bendCalls[0].v - 2 ** (3 / 12)) < 1e-12);
  assert.ok(Math.abs(bendCalls[1].v - 2 ** (4 / 12)) < 1e-12);
});

test('legato with no sounding voice falls back to a pluck at gain 0.6', () => {
  const { player, log } = setup();
  player.play(spec({ kind: 'legato', midi: 57, when: 13 }));
  assert.equal(log.sources.length, 1);
  assert.equal(log.gains.at(-1).gain.value, 0.6);
});

test('legato after the voice has been choked falls back to a new pluck', () => {
  const { player, log } = setup();
  player.play(spec({ chokeAt: 13.2 }));
  player.play(spec({ kind: 'legato', midi: 57, when: 13.5 }));
  assert.equal(log.sources.length, 2);
});

test('a slide makes one setValueAtTime per semitone, the last at its end time', () => {
  const { player, log } = setup();
  player.play(spec({ midi: 59, glide: { from: 55, to: 59, start: 13, end: 13.2, stepped: true } }));
  const calls = sets(log.sources[0].playbackRate);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((c) => c.v), [1, 2, 3, 4].map((n) => 2 ** (n / 12)));
  assert.ok(Math.abs(calls[3].t - 13.2) < 1e-9);
  assert.ok(calls[0].t > 13);
});

test('a downward slide steps below the rendered pitch', () => {
  const { player, log } = setup();
  player.play(spec({ midi: 57, glide: { from: 57, to: 54, start: 13, end: 13.3, stepped: true } }));
  const calls = sets(log.sources[0].playbackRate);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.v), [-1, -2, -3].map((n) => 2 ** (n / 12)));
});

test('a bend ramps up over its duration and back down at the release', () => {
  const { player, log } = setup();
  player.play(spec({ bend: { semitones: 2, start: 13.1, dur: 0.12, releaseAt: 14 } }));
  assert.deepEqual(log.sources[0].playbackRate.calls, [
    { type: 'set', v: 1, t: 13.1 },
    { type: 'ramp', v: 2 ** (2 / 12), t: 13.1 + 0.12 },
    { type: 'set', v: 2 ** (2 / 12), t: 14 },
    { type: 'ramp', v: 1, t: 14 + 0.12 },
  ]);
});

test('a bend with no release stays up', () => {
  const { player, log } = setup();
  player.play(spec({ bend: { semitones: 2, start: 13.1, dur: 0.12 } }));
  assert.equal(log.sources[0].playbackRate.calls.length, 2);
});

test('vibrato runs a 5.5 Hz oscillator through a 30 cent gain into detune, fading in over 0.15 s', () => {
  const { player, log } = setup();
  player.play(spec({ vibrato: { start: 13.2, end: 14 } }));
  const [osc] = log.oscillators;
  const depth = osc.to;
  assert.equal(osc.frequency.value, 5.5);
  assert.equal(depth.to, log.sources[0].detune);
  const calls = depth.gain.calls;
  assert.deepEqual(calls[0], { type: 'set', v: 0, t: 13.2 });
  assert.equal(calls[1].type, 'ramp');
  assert.equal(calls[1].v, 30);
  assert.ok(Math.abs(calls[1].t - 13.35) < 1e-9);
  assert.equal(calls.at(-1).v, 0);
  assert.deepEqual(osc.started, [13.2]);
  assert.ok(osc.stopped[0] > 14);
});

test('without detune support vibrato wobbles the playback rate by 30 cents instead', () => {
  const { player, log } = setup({ detune: false });
  player.play(spec({ vibrato: { start: 13.2, end: 14 } }));
  const depth = log.oscillators[0].to;
  assert.equal(depth.to, log.sources[0].playbackRate);
  assert.ok(Math.abs(depth.gain.calls[1].v - (2 ** (30 / 1200) - 1)) < 1e-12);
});

test('a new note on a string fades the old voice and stops it shortly after', () => {
  const { player, log } = setup();
  player.play(spec({ midi: 55, when: 13, chokeAt: 20 }));
  player.play(spec({ midi: 57, when: 14, chokeAt: 20 }));
  const old = log.gains[1];
  assert.ok(old.gain.calls.some((c) => c.type === 'target' && c.t === 14 && c.v === 0 && c.tau === 0.008));
  assert.deepEqual(log.sources[0].stops, [14.06]);
});

test('notes on different strings do not choke each other', () => {
  const { player, log } = setup();
  player.play(spec({ row: 3, chokeAt: 15 }));
  player.play(spec({ row: 4, when: 14, chokeAt: 15 }));
  assert.deepEqual(log.sources[0].stops, [15.06]);
});

test('chokeAt fades and stops the voice at that time', () => {
  const { player, log } = setup();
  player.play(spec({ chokeAt: 15 }));
  assert.deepEqual(log.gains[1].gain.calls, [{ type: 'target', v: 0, t: 15, tau: 0.008 }]);
  assert.deepEqual(log.sources[0].stops, [15.06]);
});

test('a second choke never extends an earlier one', () => {
  const { player, log } = setup();
  player.play(spec({ chokeAt: 14 }));
  player.play(spec({ when: 16, chokeAt: 20 }));
  assert.deepEqual(log.sources[0].stops, [14.06]);
});

test('direct play(midi, when, row) chokes that string, without a row it does not', () => {
  const { player, log } = setup();
  player.play(45, 0, 5);
  player.play(45, 0, 5);
  assert.equal(log.sources[0].stops.length, 1);
  player.play(50);
  player.play(50);
  assert.equal(log.sources[2].stops.length, 0);
});

test('direct play(midi) still plays a full-gain pluck', () => {
  const { player, log } = setup();
  player.play(45, 13.25);
  assert.deepEqual(log.sources[0].whens, [13.25]);
  assert.equal(log.gains[1].gain.value, 1);
});

test('muted, palm-muted and harmonic notes use their own buffers, cached per kind and pitch, at the spec gain', () => {
  const { player, log } = setup();
  player.play(spec({ kind: 'pluck', row: 0 }));
  player.play(spec({ kind: 'muted', row: 1 }));
  player.play(spec({ kind: 'palmMute', row: 2 }));
  player.play(spec({ kind: 'harmonic', row: 3 }));
  player.play(spec({ kind: 'muted', row: 4 }));
  assert.equal(log.buffers.length, 4);
  assert.equal(log.sources[1].buffer, log.sources[4].buffer);
  assert.deepEqual(log.gains.slice(1).map((g) => g.gain.value), [1, 1, 1, 1, 1]);
  assert.ok(log.buffers[1].length < log.buffers[0].length);
  assert.ok(log.buffers[3].length > log.buffers[0].length);
});

test('a ghost note keeps its spec gain', () => {
  const { player, log } = setup();
  player.play(spec({ gain: 0.35 }));
  assert.equal(log.gains[1].gain.value, 0.35);
});

test('silence chokes every sounding voice now, clicked or scheduled', () => {
  const { ctx, player, log } = setup();
  player.play(spec({ row: 1, chokeAt: 20 }));
  player.play(50, 0, 2);
  ctx.currentTime = 13.5;
  player.silence();
  assert.deepEqual(log.sources.map((s) => s.stops.at(-1)), [13.56, 13.56]);
});

test('silence before any play creates no context', () => {
  let created = 0;
  createPlayer({ createContext: () => { created++; return fakeContext().ctx; } }).silence();
  assert.equal(created, 0);
});
