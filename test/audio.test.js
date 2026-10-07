import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../src/audio.js';

const fakeContext = () => {
  const log = { buffers: 0, sources: [], resumed: 0 };
  const ctx = {
    sampleRate: 8000,
    state: 'suspended',
    currentTime: 12.5,
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createDynamicsCompressor: () => ({ connect() {} }),
    createBuffer: (channels, length) => {
      log.buffers++;
      return { length, copyToChannel() {} };
    },
    createBufferSource: () => {
      const source = { buffer: null, started: 0, whens: [], connect() {}, start(when) { this.started++; this.whens.push(when); } };
      log.sources.push(source);
      return source;
    },
    resume: () => { log.resumed++; },
  };
  return { ctx, log };
};

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
  assert.equal(log.buffers, 2);
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
