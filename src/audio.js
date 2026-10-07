import { midiToHz } from './pitch.js';
import { renderPluck } from './pluck.js';

const NOTE_SECONDS = 3.5;
const MASTER_GAIN = 0.3;

const defaultCreateContext = () => new AudioContext();

// The context is created on the first play() call, inside the user gesture,
// so the same click unlocks audio and sounds the note.
export const createPlayer = ({ createContext = defaultCreateContext, random = Math.random } = {}) => {
  let ctx = null;
  let master = null;
  const buffers = new Map();

  const ensureContext = () => {
    if (ctx) return;
    ctx = createContext();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(ctx.destination);
  };

  const bufferFor = (midi) => {
    let buffer = buffers.get(midi);
    if (!buffer) {
      const samples = renderPluck({
        frequency: midiToHz(midi),
        sampleRate: ctx.sampleRate,
        duration: NOTE_SECONDS,
        random,
      });
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      buffers.set(midi, buffer);
    }
    return buffer;
  };

  const resume = () => {
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
  };

  // Returns the source so a scheduled note can be stopped before it starts.
  const play = (midi, when = 0) => {
    resume();
    const source = ctx.createBufferSource();
    source.buffer = bufferFor(midi);
    source.connect(master);
    source.start(when);
    return source;
  };

  const now = () => {
    resume();
    return ctx.currentTime;
  };

  return { play, resume, now };
};
