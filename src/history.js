export const HISTORY_CAP = 200;
export const COALESCE_MS = 1000;

// What kind of keystroke turned `before` into `after`, so a run of the same kind becomes one undo
// step. Anything bigger than one character (a paste, a cut, a replaced selection) is its own step.
export const editKind = (before, after) => {
  const most = Math.min(before.length, after.length);
  let head = 0;
  while (head < most && before[head] === after[head]) head += 1;
  let tail = 0;
  while (tail < most - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  const removed = before.length - head - tail;
  const added = after.length - head - tail;
  if (removed === 0 && added === 1) return /\s/.test(after[head]) ? 'space' : 'type';
  if (removed === 1 && added === 0) return 'erase';
  return null;
};

// One linear history of document texts. Consecutive records with the same group inside the pause
// window share a step; a record with no group is always a step of its own. Nothing is persisted.
export const createHistory = (text, { cap = HISTORY_CAP, pauseMs = COALESCE_MS } = {}) => {
  let past = [];
  let future = [];
  let present = text;
  let lastGroup = null;
  let lastAt = 0;
  let enabled = true;

  return {
    record: (next, group = null, at = Date.now()) => {
      if (next === present) return false;
      const joins = group !== null && group === lastGroup && at - lastAt <= pauseMs;
      if (!joins) {
        past.push(present);
        if (past.length > cap) past = past.slice(past.length - cap);
      }
      future = [];
      present = next;
      lastGroup = group;
      lastAt = at;
      return true;
    },
    undo: () => {
      if (!enabled || past.length === 0) return null;
      future.push(present);
      present = past.pop();
      lastGroup = null;
      return present;
    },
    redo: () => {
      if (!enabled || future.length === 0) return null;
      past.push(present);
      present = future.pop();
      lastGroup = null;
      return present;
    },
    reset: (next) => {
      past = [];
      future = [];
      present = next;
      lastGroup = null;
    },
    setEnabled: (on) => { enabled = on; },
    canUndo: () => enabled && past.length > 0,
    canRedo: () => enabled && future.length > 0,
    size: () => past.length,
    current: () => present,
  };
};
