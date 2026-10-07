import { STRING_COUNT, noteAt } from './pitch.js';

// First note starts this far ahead of now, so the first tick has time to schedule it.
const START_LEAD = 0.05;

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
    while (r.next < r.events.length) {
      const event = r.events[r.next];
      const when = r.t0 + (event.step - r.from) * r.stepSec;
      if (when >= t + lookahead) break;
      event.notes.forEach(({ row, fret }) => {
        r.handles.push({ when, source: play(noteAt(STRING_COUNT - 1 - row, fret), when) });
      });
      onStep(event, when);
      r.next += 1;
    }
    r.handles = r.handles.filter((h) => h.when > t);
    if (r.next >= r.events.length && t >= r.endAt) {
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
    const last = list.length ? list[list.length - 1].step : fromStep - 1;
    run = {
      events: list, from: fromStep, stepSec, t0, next: 0, handles: [], timer: null,
      endAt: t0 + (last - fromStep + 1) * stepSec,
    };
    tick();
  };

  return { start, stop: cancel, isPlaying: () => run !== null };
};
