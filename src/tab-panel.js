import { parseTab, withTempo, emptyTab } from './tab.js';
import { createScheduler } from './scheduler.js';
import { KEY, DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO, readSaved, save } from './storage.js';
import { exportFile, readImportedFile } from './files.js';

const SAVE_DELAY_MS = 300;
const UNDO_MS = 8000;

export const lineStarts = (text) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
};

const lineOf = (starts, offset) => {
  let line = starts.length - 1;
  while (starts[line] > offset) line--;
  return line;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Maps a caret offset to the tab cell under it. Off the tab (a lyric line, say) it
// falls back to column 0 of the closest block above, or the first block.
export const caretCell = (parsed, text, caret) => {
  if (parsed.blocks.length === 0) return null;
  const starts = lineStarts(text);
  const line = lineOf(starts, caret);
  const block = parsed.blocks.findIndex((b) => b.lines.includes(line));
  if (block >= 0) {
    const info = parsed.blocks[block];
    const row = info.lines.indexOf(line);
    const col = clamp(caret - starts[line] - info.bodyStart[row], 0, info.width - 1);
    return { block, row, col, inside: true };
  }
  const above = parsed.blocks.reduce((found, b, i) => (b.lines[0] < line ? i : found), 0);
  return { block: above, row: 0, col: 0, inside: false };
};

export const cellOffset = (parsed, text, { block, row, col }) => {
  const info = parsed.blocks[block];
  return lineStarts(text)[info.lines[row]] + info.bodyStart[row] + col;
};

export const blockOffsets = (parsed) => {
  let offset = 0;
  return parsed.blocks.map((b) => { const at = offset; offset += b.width; return at; });
};

// The step Play starts from. A caret on a tab line is its column; on any other line it is the first
// block below; with no block below (or no tab at all) it is the very start.
export const cueStep = (parsed, text, caret) => {
  const cell = caretCell(parsed, text, caret);
  if (!cell) return 0;
  const offsets = blockOffsets(parsed);
  if (cell.inside) return offsets[cell.block] + cell.col;
  const line = lineOf(lineStarts(text), caret);
  const next = parsed.blocks.findIndex((b) => b.lines[0] > line);
  return next < 0 ? 0 : offsets[next];
};

export const gridCueStep = (parsed, { block, col }) => (blockOffsets(parsed)[block] ?? 0) + col;

// Inverse of the above: the block and column a global step falls in.
export const stepToCell = (parsed, step) => {
  if (parsed.blocks.length === 0) return null;
  const offsets = blockOffsets(parsed);
  let block = 0;
  offsets.forEach((at, i) => { if (at <= step) block = i; });
  return { block, col: clamp(step - offsets[block], 0, parsed.blocks[block].width - 1) };
};

// A cue past the last note would play nothing, so it falls back to the start.
export const startStep = (parsed, cue) => (parsed.events.some((e) => e.step >= cue) ? cue : 0);

// Where the cue goes when a run ends: a stop keeps the step that was sounding (null while nothing
// has sounded yet, so the cue stays), the end of the song rewinds.
export const cueAfterRun = (reason, shown) => {
  if (reason === 'end') return 0;
  return shown ? shown.step : null;
};

// The text a Clear leaves: an empty tab that keeps the tempo line only if the document had one.
export const clearedText = (text) => {
  const tempo = parseTab(text).tempo;
  return tempo ? withTempo(emptyTab(), tempo) : emptyTab();
};

// null when there is nothing to clear; otherwise the new text and the one Undo restores.
export const clearDocument = (text) => {
  const next = clearedText(text);
  return next === text ? null : { text: next, previous: text };
};

const make = (tag, className, parent, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.append(node);
  return node;
};

const button = (label, parent, className = 'btn') => {
  const node = make('button', className, parent, label);
  node.type = 'button';
  return node;
};

// An SVG rather than the U+23EE glyph, which some platforms draw as a color emoji.
const backIcon = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 3h2v10H3zM14 3v10L6 8z');
  svg.append(path);
  return svg;
};

// Specs carry audio times, not steps. The first spec due belongs to the first event, and every other
// time sits a whole number of steps after it, so one anchor maps a spec time back to its event.
export const stepLookup = (events, bpm) => {
  const stepSec = 60 / (bpm * 4);
  const byStep = new Map(events.map((e) => [e.step, e]));
  let anchor = null;
  return {
    eventFor: (when) => {
      if (!events.length) return null;
      anchor ??= { when, step: events[0].step };
      return byStep.get(anchor.step + Math.round((when - anchor.when) / stepSec)) ?? null;
    },
  };
};

// One animation frame of the playhead: the specs whose time has come, in order, the specs still
// waiting, and the event the playhead should show (unchanged when no due spec maps to one).
export const takeDue = (queue, t, eventFor, shown) => {
  const split = queue.findIndex((spec) => spec.when > t);
  const due = split < 0 ? queue : queue.slice(0, split);
  const rest = split < 0 ? [] : queue.slice(split);
  const playhead = due.reduce((current, spec) => eventFor(spec.when) ?? current, shown);
  return { due, rest, playhead };
};

export const statusFor = (parsed) => {
  const parts = [];
  if (parsed.events.length === 0) parts.push('Nothing to play yet.');
  if (parsed.skipped > 0) {
    parts.push(`${parsed.skipped} ${parsed.skipped === 1 ? 'note' : 'notes'} above fret 19 skipped`);
  }
  return parts.join(' ');
};

const loadText = (storage) => {
  let raw = null;
  try { raw = storage.getItem(KEY); } catch { /* blocked storage starts a blank tab */ }
  return readSaved(raw).text;
};

export const createTabPanel = ({ dock, player, guitar, createEditor, storage = window.localStorage }) => {
  let text = loadText(storage);
  let playing = false;
  let ending = false;
  let queue = [];
  let steps = null;
  let shown = null;
  let frame = 0;
  let saveTimer = null;
  let lastFocus = null;
  let message = '';
  let undoText = null;
  let undoTimer = null;

  const transport = make('div', 'transport', dock);
  const sheet = make('div', 'sheet', dock);
  sheet.id = 'tab-sheet';
  const status = make('p', 'dock-status', sheet);
  status.id = 'tab-status';
  status.setAttribute('role', 'status');
  const editorBox = make('div', 'editor', sheet);

  const play = button('Play', transport, 'btn btn-play');
  play.setAttribute('aria-describedby', status.id);
  const back = button('', transport, 'btn btn-back');
  back.append(backIcon());
  back.setAttribute('aria-label', 'Back to start');
  back.title = 'Back to start';
  const tempoLabel = make('label', 'tempo', transport);
  const tempo = make('input', 'tempo-input', tempoLabel);
  tempo.type = 'number';
  tempo.min = MIN_TEMPO;
  tempo.max = MAX_TEMPO;
  tempo.step = 1;
  tempo.id = 'tempo-input';
  tempo.name = 'tempo';
  tempoLabel.htmlFor = tempo.id;
  tempo.setAttribute('aria-label', 'Tempo in beats per minute');
  make('span', 'tempo-unit', tempoLabel, 'BPM');
  const tools = make('div', 'tools', transport);
  const open = button('Open', tools);
  const saveButton = button('Save', tools);
  const clearButton = button('Clear', tools, 'btn btn-clear');
  const toggle = button('Tab', transport, 'btn btn-sheet');
  toggle.setAttribute('aria-controls', sheet.id);
  toggle.setAttribute('aria-expanded', 'false');
  const picker = make('input', null, transport);
  picker.type = 'file';
  picker.accept = '.txt,text/plain';
  picker.id = 'tab-file';
  picker.name = 'tab-file';
  picker.setAttribute('aria-label', 'Open a tab file');
  picker.hidden = true;
  picker.tabIndex = -1;

  const persist = () => {
    clearTimeout(saveTimer);
    save(storage, { text, tempo: parseTab(text).tempo || DEFAULT_TEMPO });
  };
  const persistSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, SAVE_DELAY_MS);
  };

  const undoButton = button('Undo', status, 'btn btn-undo');
  undoButton.remove();

  const dropUndo = () => {
    clearTimeout(undoTimer);
    undoText = null;
    if (document.activeElement === undoButton) editor.focus();
  };

  const editor = createEditor(editorBox, {
    getText: () => text,
    setText: (next) => { text = next; message = ''; dropUndo(); persistSoon(); refresh(); },
    onCursor: () => {},
  });

  const refresh = () => {
    const parsed = parseTab(text);
    const note = message || statusFor(parsed);
    status.replaceChildren();
    if (note) make('span', null, status, note);
    if (undoText !== null) status.append(undoButton);
    clearButton.disabled = clearDocument(text) === null;
    play.disabled = !playing && parsed.events.length === 0;
    if (document.activeElement !== tempo) tempo.value = parsed.tempo || DEFAULT_TEMPO;
  };

  const finish = (reason = 'stop') => {
    const at = cueAfterRun(reason, shown);
    if (at !== null) editor.setCue(at);
    cancelAnimationFrame(frame);
    queue = [];
    steps = null;
    shown = null;
    ending = false;
    playing = false;
    play.textContent = 'Play';
    editor.setPlayhead(null);
    refresh();
  };

  const tick = () => {
    const { due, rest, playhead } = takeDue(queue, player.now(), steps.eventFor, shown);
    queue = rest;
    due.forEach((spec) => guitar.perform(spec));
    if (playhead !== shown) {
      shown = playhead;
      editor.setPlayhead(playhead);
    }
    if (ending && queue.length === 0) finish('end');
    else frame = requestAnimationFrame(tick);
  };

  const scheduler = createScheduler({
    now: () => player.now(),
    play: (spec) => player.play(spec),
    onStep: (spec) => queue.push(spec),
    onEnd: () => { ending = true; },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
  });

  const stop = () => {
    scheduler.stop();
    player.silence();
    finish();
  };

  const start = () => {
    const parsed = parseTab(text);
    if (parsed.events.length === 0) return;
    player.resume();
    playing = true;
    ending = false;
    queue = [];
    shown = null;
    const bpm = clamp(Number(tempo.value) || parsed.tempo || DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO);
    const from = startStep(parsed, editor.getCue());
    const playable = parsed.events.filter((e) => e.step >= from);
    steps = stepLookup(playable, bpm);
    play.textContent = 'Stop';
    scheduler.start(playable, bpm, from);
    frame = requestAnimationFrame(tick);
  };

  const replaceText = (next) => {
    if (playing) stop();
    text = next;
    message = '';
    dropUndo();
    editor.update();
    editor.setCue(0);
    persist();
    refresh();
  };

  const backToStart = () => {
    const wasPlaying = playing;
    if (wasPlaying) {
      scheduler.stop();
      player.silence();
      finish('none');
    }
    editor.setCue(0);
    if (wasPlaying) start();
  };

  const clearAll = () => {
    const cleared = clearDocument(text);
    if (!cleared) return;
    const fromButton = document.activeElement === clearButton;
    if (playing) stop();
    dropUndo();
    text = cleared.text;
    undoText = cleared.previous;
    message = 'Tab cleared.';
    undoTimer = setTimeout(() => {
      dropUndo();
      message = '';
      refresh();
    }, UNDO_MS);
    editor.update();
    editor.setCue(0);
    persist();
    refresh();
    if (fromButton) undoButton.focus();
  };

  undoButton.addEventListener('click', () => {
    if (undoText === null) return;
    text = undoText;
    message = '';
    dropUndo();
    editor.update();
    editor.setCue(0);
    persist();
    refresh();
  });

  [play, back, clearButton, undoButton].forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
  });
  back.addEventListener('click', backToStart);
  clearButton.addEventListener('click', clearAll);
  play.addEventListener('click', () => (playing ? stop() : start()));

  tempo.addEventListener('change', () => {
    const bpm = Math.round(Number(tempo.value));
    if (Number.isFinite(bpm)) {
      text = withTempo(text, clamp(bpm, MIN_TEMPO, MAX_TEMPO));
      message = '';
      dropUndo();
      editor.update();
      persistSoon();
    }
    tempo.value = parseTab(text).tempo || DEFAULT_TEMPO;
    refresh();
  });

  const loadFile = async (file) => {
    try {
      replaceText(await readImportedFile(file));
    } catch {
      message = 'Could not open that file.';
      refresh();
    }
  };
  open.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    if (picker.files[0]) loadFile(picker.files[0]);
    picker.value = '';
  });
  saveButton.addEventListener('click', () => exportFile(text, 'tab.txt'));

  dock.addEventListener('dragover', (e) => {
    e.preventDefault();
    dock.classList.add('dragging');
  });
  dock.addEventListener('dragleave', (e) => {
    if (!dock.contains(e.relatedTarget)) dock.classList.remove('dragging');
  });
  dock.addEventListener('drop', (e) => {
    e.preventDefault();
    dock.classList.remove('dragging');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  const setSheet = (isOpen) => {
    dock.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  };
  toggle.addEventListener('click', () => {
    const isOpen = !dock.classList.contains('open');
    setSheet(isOpen);
    if (isOpen) editor.focus();
  });
  dock.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !play.disabled) {
      e.preventDefault();
      if (playing) stop(); else start();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Home') {
      e.preventDefault();
      backToStart();
    } else if (e.key === 'Escape' && dock.classList.contains('open')) {
      setSheet(false);
      toggle.focus();
    }
  });

  document.addEventListener('focusin', (e) => { lastFocus = e.target; });
  window.addEventListener('pagehide', persist);

  refresh();

  return {
    // Only a press that follows editing writes to the tab; plain playing leaves it alone.
    onFretPress: (row, fret) => {
      if (lastFocus && editorBox.contains(lastFocus)) editor.writeFret(row, fret);
    },
    stop,
  };
};
