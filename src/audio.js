import { midiToHz } from './pitch.js';
import { renderPluck, renderHarmonic } from './pluck.js';

const MASTER_GAIN = 0.3;
const CHOKE_TAU = 0.008;
const CHOKE_STOP = 0.06;
const LEGATO_FALLBACK_GAIN = 0.6;
const VIBRATO_HZ = 5.5;
const VIBRATO_CENTS = 30;
const VIBRATO_FADE_IN = 0.15;
const VIBRATO_FADE_OUT = 0.1;

// `ring` is the decay in seconds handed to the string model; `seconds` is the buffer length.
// Loudness is not here: the spec's gain carries it (ghost and muted levels come from the scheduler).
const KINDS = {
  pluck: { seconds: 3.5 },
  muted: { seconds: 0.4, ring: 0.05 },
  palmMute: { seconds: 1.2, ring: 0.3 },
  harmonic: { seconds: 6, harmonic: true },
};

const ratio = (semitones) => 2 ** (semitones / 12);

// iOS treats Web Audio as ambient sound, which the ring/silent switch mutes; declaring the page a
// media player lets a tap sound with the phone on silent, as a video would. Other browsers lack the API.
export const preferPlayback = (nav = globalThis.navigator) => {
  if (nav?.audioSession) nav.audioSession.type = 'playback';
};

const defaultCreateContext = () => {
  preferPlayback();
  return new AudioContext();
};

// The context is created on the first play() call, inside the user gesture,
// so the same click unlocks audio and sounds the note.
export const createPlayer = ({ createContext = defaultCreateContext, random = Math.random } = {}) => {
  let ctx = null;
  let master = null;
  let volume = 1;
  const buffers = new Map();
  const voices = new Map();

  const ensureContext = () => {
    if (ctx) return;
    ctx = createContext();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN * volume;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(ctx.destination);
  };

  const bufferFor = (midi, kind) => {
    const key = `${kind}:${midi}`;
    let buffer = buffers.get(key);
    if (!buffer) {
      const def = KINDS[kind];
      const args = { frequency: midiToHz(midi), sampleRate: ctx.sampleRate, duration: def.seconds };
      const samples = def.harmonic
        ? renderHarmonic(args)
        : renderPluck({ ...args, ring: def.ring, random });
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      buffers.set(key, buffer);
    }
    return buffer;
  };

  const resume = () => {
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
  };

  // A voice that already ends earlier is left alone, so a second choke never extends the first.
  const choke = (voice, at) => {
    if (at >= voice.endAt) return;
    voice.gain.gain.setTargetAtTime(0, at, CHOKE_TAU);
    voice.source.stop(at + CHOKE_STOP);
    voice.endAt = at;
  };

  const glide = (param, g) => {
    const steps = Math.abs(g.to - g.from);
    const dir = Math.sign(g.to - g.from);
    for (let i = 1; i <= steps; i += 1) {
      param.setValueAtTime(ratio(dir * i + g.from - g.base), g.start + ((g.end - g.start) * i) / steps);
    }
  };

  // `rest` is the rate the fretted note plays at on this voice: 1, unless the voice started on another pitch.
  const bend = (param, b, rest = 1) => {
    const up = rest * ratio(b.semitones);
    param.setValueAtTime(rest, b.start);
    param.linearRampToValueAtTime(up, b.start + b.dur);
    if (b.releaseAt != null) {
      param.setValueAtTime(up, b.releaseAt);
      param.linearRampToValueAtTime(rest, b.releaseAt + b.dur);
    }
  };

  // Safari lacks detune on buffer sources, so the same wobble goes on the playback rate there.
  const vibrato = (source, v) => {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const hasDetune = Boolean(source.detune);
    const amount = hasDetune ? VIBRATO_CENTS : ratio(VIBRATO_CENTS / 100) - 1;
    lfo.frequency.value = VIBRATO_HZ;
    depth.gain.setValueAtTime(0, v.start);
    depth.gain.linearRampToValueAtTime(amount, v.start + VIBRATO_FADE_IN);
    depth.gain.setValueAtTime(amount, v.end);
    depth.gain.linearRampToValueAtTime(0, v.end + VIBRATO_FADE_OUT);
    lfo.connect(depth);
    depth.connect(hasDetune ? source.detune : source.playbackRate);
    lfo.start(v.start);
    lfo.stop(v.end + VIBRATO_FADE_OUT + 0.05);
  };

  const strike = (spec, kind, gainScale = 1) => {
    const def = KINDS[kind];
    const when = spec.when ?? 0;
    const at = Math.max(when, ctx.currentTime);
    const tracked = spec.row !== undefined && spec.row !== null;
    const previous = tracked ? voices.get(spec.row) : null;
    if (previous) choke(previous, at);

    // A slide plays from where it starts, so its steps are whole semitones off the rendered pitch.
    const base = spec.glide ? spec.glide.from : spec.midi;
    const source = ctx.createBufferSource();
    source.buffer = bufferFor(base, kind);
    const gain = ctx.createGain();
    gain.gain.value = gainScale * (spec.gain ?? 1);
    source.connect(gain);
    gain.connect(master);
    source.start(when);

    const voice = { source, gain, baseMidi: base, endAt: at + def.seconds };
    if (tracked) {
      voices.set(spec.row, voice);
      source.onended = () => { if (voices.get(spec.row) === voice) voices.delete(spec.row); };
    }
    if (spec.glide) glide(source.playbackRate, { ...spec.glide, base });
    if (spec.bend) bend(source.playbackRate, spec.bend, ratio(spec.midi - base));
    if (spec.vibrato) vibrato(source, spec.vibrato);
    if (spec.chokeAt != null) choke(voice, spec.chokeAt);
    return source;
  };

  // Legato (hammer-on, pull-off) keeps the string vibrating: the live voice changes pitch, nothing restarts.
  const legato = (spec) => {
    const at = Math.max(spec.when ?? 0, ctx.currentTime);
    const voice = spec.row === undefined ? null : voices.get(spec.row);
    if (!voice || at >= voice.endAt) return strike(spec, 'pluck', LEGATO_FALLBACK_GAIN);
    const rate = ratio(spec.midi - voice.baseMidi);
    const param = voice.source.playbackRate;
    param.setValueAtTime(rate, at);
    if (spec.glide) glide(param, { ...spec.glide, base: voice.baseMidi });
    if (spec.bend) bend(param, spec.bend, rate);
    if (spec.vibrato) vibrato(voice.source, spec.vibrato);
    return undefined;
  };

  // Takes a note spec, or a bare MIDI number for a direct click (row optional, to choke that string).
  const play = (input, when = 0, row) => {
    resume();
    const spec = typeof input === 'object'
      ? input
      : { row, midi: input, when, gain: 1, kind: 'pluck', baseMidi: input };
    if (spec.kind === 'legato') return legato(spec);
    return strike(spec, KINDS[spec.kind] ? spec.kind : 'pluck');
  };

  // Stop mutes the strings the way a player's hand would: every voice still sounding is choked now.
  const silence = () => {
    if (!ctx) return;
    voices.forEach((voice) => choke(voice, ctx.currentTime));
    voices.clear();
  };

  const now = () => {
    resume();
    return ctx.currentTime;
  };

  // 0 to 1, on top of the master level. A short ramp so dragging the slider never clicks.
  const setVolume = (level) => {
    volume = Math.min(1, Math.max(0, Number(level) || 0));
    if (master) master.gain.setTargetAtTime(MASTER_GAIN * volume, ctx.currentTime, 0.015);
  };

  return { play, resume, now, silence, setVolume };
};
