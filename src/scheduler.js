import { STRING_COUNT, noteAt } from './pitch.js';
import { HARMONIC_SEMITONES } from './tab.js';

// First note starts this far ahead of now, so the first tick has time to schedule it.
const START_LEAD = 0.05;

export const BEND_SEC = 0.12;
const SLIDE_MAX_SEC = 0.3;
const SLIDE_SHARE = 0.75;
const SLIDE_EDGE_SEMITONES = 3;
const RING_SEC = 3;
const MUTED_SEC = 0.08;
const GHOST_GAIN = 0.35;
const MUTED_GAIN = 0.6;
const OPEN_SLIDE_STEPS = 4;

const pitchOf = (row, note) => {
  const string = STRING_COUNT - 1 - row;
  const open = noteAt(string, 0);
  if (note.fret === null) return { base: open, midi: open };
  if (note.tech?.harmonic) return { base: open, midi: open + HARMONIC_SEMITONES[note.fret] };
  const fretted = noteAt(string, note.fret);
  return { base: fretted, midi: fretted };
};

const kindOf = (tech = {}) => {
  if (tech.muted) return 'muted';
  if (tech.harmonic) return 'harmonic';
  if (tech.legato) return 'legato';
  if (tech.palmMute) return 'palmMute';
  return 'pluck';
};

// Times are in seconds from step 0 of the events passed in. A voice is cut when the next plucked note
// on its string starts (legato notes continue the voice), or RING_SEC after its last note.
export const planNotes = (events, stepSec) => {
  const byRow = Array.from({ length: STRING_COUNT }, () => []);
  [...events].sort((a, b) => a.step - b.step).forEach((event) => {
    event.notes.forEach((note) => byRow[note.row].push({ ...note, when: event.step * stepSec }));
  });
  const specs = [];
  byRow.forEach((list, row) => {
    const rowSpecs = [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const n = list[i];
      const tech = n.tech ?? {};
      const next = list[i + 1];
      const { base, midi } = pitchOf(row, n);
      let chokeAt = n.when + RING_SEC;
      if (next) chokeAt = Math.min(chokeAt, next.tech?.legato ? rowSpecs[0].chokeAt : next.when);
      if (tech.muted) chokeAt = Math.min(chokeAt, n.when + MUTED_SEC);
      const spec = { row, midi, when: n.when, gain: (tech.ghost ? GHOST_GAIN : 1) * (tech.muted ? MUTED_GAIN : 1), kind: kindOf(tech), baseMidi: base, chokeAt };
      const gap = next ? next.when - n.when : OPEN_SLIDE_STEPS * stepSec;
      const slideSec = Math.min(SLIDE_SHARE * gap, SLIDE_MAX_SEC);
      if (tech.bend) {
        const start = n.when + stepSec;
        spec.bend = { semitones: tech.bend.semitones, start, dur: BEND_SEC };
        if (tech.bend.releaseStep !== undefined) {
          spec.bend.releaseAt = Math.max(tech.bend.releaseStep * stepSec, start + BEND_SEC);
        }
      }
      if (tech.vibrato) spec.vibrato = { start: Math.min(n.when + stepSec, chokeAt), end: chokeAt };
      if (tech.slideIn) {
        const from = midi + (tech.slideIn === 'up' ? -SLIDE_EDGE_SEMITONES : SLIDE_EDGE_SEMITONES);
        spec.glide = { from, to: midi, start: n.when, end: n.when + slideSec, stepped: true };
      } else if (tech.slideOut) {
        const to = midi + (tech.slideOut === 'up' ? SLIDE_EDGE_SEMITONES : -SLIDE_EDGE_SEMITONES);
        spec.glide = { from: midi, to, start: n.when + gap - slideSec, end: n.when + gap, stepped: true };
      }
      if (next && (next.tech?.legato === '/' || next.tech?.legato === '\\')) {
        const target = pitchOf(row, next).midi;
        spec.glide = { from: midi, to: target, start: next.when - slideSec, end: next.when, stepped: true };
      }
      rowSpecs.unshift(spec);
    }
    specs.push(...rowSpecs);
  });
  return specs.sort((a, b) => a.when - b.when || a.row - b.row);
};

const shifted = (spec, by) => {
  const out = { ...spec, when: spec.when + by, chokeAt: spec.chokeAt + by };
  if (spec.glide) out.glide = { ...spec.glide, start: spec.glide.start + by, end: spec.glide.end + by };
  if (spec.bend) {
    out.bend = { ...spec.bend, start: spec.bend.start + by };
    if (spec.bend.releaseAt !== undefined) out.bend.releaseAt = spec.bend.releaseAt + by;
  }
  if (spec.vibrato) out.vibrato = { start: spec.vibrato.start + by, end: spec.vibrato.end + by };
  return out;
};

export const createScheduler = ({
  now,
  play,
  onStep = () => {},
  onEnd = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  tickMs = 25,
  lookahead = 0.1,
}) => {
  let run = null;

  const cancel = () => {
    if (!run) return;
    clearTimer(run.timer);
    const t = now();
    run.handles.forEach((h) => { if (h.when > t) h.source?.stop?.(); });
    run = null;
  };

  const tick = () => {
    const r = run;
    const t = now();
    while (r.next < r.specs.length) {
      const spec = r.specs[r.next];
      if (spec.when >= t + lookahead) break;
      r.handles.push({ when: spec.when, source: play(spec) });
      onStep(spec);
      r.next += 1;
    }
    r.handles = r.handles.filter((h) => h.when > t);
    if (r.next >= r.specs.length && t >= r.endAt) {
      run = null;
      onEnd();
      return;
    }
    r.timer = setTimer(tick, tickMs);
  };

  const start = (events, tempo, fromStep = 0) => {
    if (!(tempo > 0) || !Number.isFinite(tempo)) throw new RangeError(`bad tempo ${tempo}`);
    cancel();
    const list = events.filter((e) => e.step >= fromStep).sort((a, b) => a.step - b.step);
    const stepSec = 60 / (tempo * 4);
    const t0 = now() + START_LEAD;
    const shift = t0 - fromStep * stepSec;
    const last = list.length ? list[list.length - 1].step : fromStep - 1;
    run = {
      specs: planNotes(list, stepSec).map((spec) => shifted(spec, shift)), next: 0, handles: [], timer: null,
      endAt: t0 + (last - fromStep + 1) * stepSec,
    };
    tick();
  };

  return { start, stop: cancel, isPlaying: () => run !== null };
};
