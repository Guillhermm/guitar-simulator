import { parseTab, withTempo, readMeta } from './tab.js';
import { buildSongFields, summaryOf, refusalStatus, saveCheck, textWithField } from './song-fields.js';
import { missingFields } from './files.js';
import { createScheduler } from './scheduler.js';
import { KEY, UI_KEY, DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO, MAX_BYTES, fitsDocument, readSaved, readUi, save, saveUi } from './storage.js';
import { buildIcon } from './icons.js';
import { exportFile, readImportedFile, fileBase, ImportError } from './files.js';
import { printTab } from './print.js';
import {
  afterLoad, canStartNew, clearedText, clearDocument, initialEditing, editingLabel, guitarMayWrite, playPress, historyKey,
} from './edit-rules.js';
import { createHistory } from './history.js';
import { loadExampleText, createExamplesFlow } from './examples.js';
import { buildExamplesDialog } from './examples-dialog.js';
import { SONGS } from '../songs/index.js';

export { clearedText, clearDocument };

const SAVE_DELAY_MS = 300;
const FLASH_MS = 4000;
const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 48rem)';
const EDITOR_LABELS = [['text', 'Text'], ['grid', 'Grid']];

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

// A button with no visible text: aria-label is its name, data-tip is the tooltip the stylesheet draws.
const iconButton = ({ icon, label, tip }, parent, className = 'btn btn-ghost') => {
  const node = button('', parent, className);
  node.append(buildIcon(icon));
  node.setAttribute('aria-label', label);
  node.dataset.tip = tip;
  return node;
};

// The text is the document and never lives in an editor, so a switch builds the new editor from it
// and carries over the two things only an editor knows: the cue and the playhead.
export const swapEditor = (previous, build, shown) => {
  const cue = previous.getCue();
  if (previous.dispose) previous.dispose();
  const next = build();
  next.setCue(cue);
  if (shown) next.setPlayhead(shown);
  return next;
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

const loadUi = (storage) => {
  let raw = null;
  try { raw = storage.getItem(UI_KEY); } catch { /* blocked storage uses the defaults */ }
  return readUi(raw, window.matchMedia(PHONE_PORTRAIT).matches);
};

// Width of an element's vertical scrollbar, 0 for overlay scrollbars or when nothing scrolls.
export const scrollbarWidth = (el, style) => Math.max(0,
  el.offsetWidth - el.clientWidth - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0));

export const createTabPanel = ({ dock, root, player, guitar, editors, storage = window.localStorage }) => {
  let text = loadText(storage);
  let ui = loadUi(storage);
  let playing = false;
  let ending = false;
  let queue = [];
  let steps = null;
  let shown = null;
  let frame = 0;
  let saveTimer = null;
  let lastFocus = null;
  let armed = false;
  let message = '';
  let flashTimer = null;
  let editing = initialEditing(text);
  const history = createHistory(text);
  let invalid = [];
  let refusing = false;

  const transport = make('div', 'transport', dock);
  const body = make('div', 'dock-body', dock);
  body.id = 'dock-body';
  const songFields = buildSongFields(body, { onInput: (key, value) => onFieldInput(key, value) });
  const status = make('p', 'dock-status', body);
  status.id = 'tab-status';
  status.setAttribute('role', 'status');
  // A refused Save is shown on the fields themselves; this only announces it to screen readers.
  const refusal = make('p', 'sr-only', body);
  refusal.setAttribute('role', 'alert');
  const editorBox = make('div', 'editor', body);

  const play = iconButton({ icon: 'play', label: 'Play', tip: 'Play' }, transport, 'btn btn-play');
  play.setAttribute('aria-describedby', status.id);
  const back = iconButton({ icon: 'back', label: 'Back to start', tip: 'Back to start' }, transport);
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
  make('span', 'spacer', transport).setAttribute('aria-hidden', 'true');
  const summary = make('span', 'summary', transport);
  const tools = make('div', 'tools', transport);
  const seg = make('fieldset', 'seg', tools);
  make('legend', null, seg, 'Editor');
  const radios = EDITOR_LABELS.map(([value, name]) => {
    const label = make('label', null, seg);
    const radio = make('input', null, label);
    radio.type = 'radio';
    radio.name = 'editor';
    radio.value = value;
    radio.checked = value === ui.editor;
    make('span', null, label, name);
    return radio;
  });
  const editToggle = iconButton({ icon: 'pencil', label: editingLabel(true), tip: editingLabel(true) }, tools);
  const undoButton = iconButton({ icon: 'undo', label: 'Undo', tip: 'Undo' }, tools);
  const redoButton = iconButton({ icon: 'redo', label: 'Redo', tip: 'Redo' }, tools);
  make('span', 'rule', tools).setAttribute('aria-hidden', 'true');
  const newButton = iconButton({ icon: 'new', label: 'Start a new tab', tip: 'New' }, tools);
  const open = iconButton({ icon: 'open', label: 'Open a tab file', tip: 'Open' }, tools);
  const examplesButton = iconButton({ icon: 'examples', label: 'Example songs', tip: 'Examples' }, tools);
  const saveButton = iconButton({ icon: 'save', label: 'Save as a text file', tip: 'Save' }, tools);
  const printButton = iconButton({ icon: 'print', label: 'Print the tab', tip: 'Print' }, tools);
  const toggle = iconButton(
    { icon: 'chevron', label: 'Collapse the tab panel', tip: 'Collapse' },
    transport,
    'btn btn-ghost btn-toggle tip-end',
  );
  toggle.setAttribute('aria-controls', body.id);
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

  const clearRefusal = () => {
    invalid = [];
    refusing = false;
    songFields.setInvalid([]);
  };

  const setMetaOpen = (isOpen) => {
    root.dataset.meta = isOpen ? 'open' : 'closed';
    songFields.toggle.setAttribute('aria-expanded', String(isOpen));
  };

  const flash = (note) => {
    message = note;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (message !== note) return;
      message = '';
      refresh();
    }, FLASH_MS);
  };

  // Every edit made through the page lands here: the text, one history step (or a join with the
  // previous one when `group` matches) and the saved copy.
  const apply = (next, group = null) => {
    text = next;
    message = '';
    history.record(next, group);
    persistSoon();
  };

  const onFieldInput = (key, value) => {
    if (!editing) return;
    apply(textWithField(text, key, value), `field:${key}`);
    editor.update();
    refresh();
  };

  const editorOptions = {
    getText: () => text,
    setText: (next, group = null) => {
      if (!editing) return;
      // Over the limit the edit is undone in the editor, so the saved copy can always be reopened.
      if (!fitsDocument(next)) {
        message = `Tabs are limited to ${MAX_BYTES / 1024} KB, so that change was not made.`;
        editor.update();
        refresh();
        return;
      }
      apply(next, group);
      refresh();
    },
    onCursor: () => {},
  };
  const buildEditor = () => {
    const built = editors[ui.editor](editorBox, editorOptions);
    built.setEditable(editing);
    return built;
  };
  let editor = buildEditor();

  // The Read only label sits at the sheet's top right, so it moves left by the scrollbar's width.
  const fitReadOnlyLabel = () => {
    const scroller = editorBox.querySelector('.text-area, .grid');
    const width = scroller ? scrollbarWidth(scroller, window.getComputedStyle(scroller)) : 0;
    editorBox.style.setProperty('--scrollbar', `${width}px`);
  };
  new window.ResizeObserver(fitReadOnlyLabel).observe(editorBox);

  const setPlayState = (isPlaying) => {
    const label = isPlaying ? 'Stop' : 'Play';
    play.replaceChildren(buildIcon(isPlaying ? 'stop' : 'play'));
    play.setAttribute('aria-label', label);
    play.dataset.tip = label;
  };

  const refresh = () => {
    const parsed = parseTab(text);
    const meta = readMeta(text);
    songFields.show(meta);
    summary.textContent = summaryOf(meta);
    if (invalid.length) {
      const stillMissing = missingFields(meta).fields;
      invalid = invalid.filter((key) => stillMissing.includes(key));
      songFields.setInvalid(invalid);
      if (refusing) {
        message = refusalStatus(invalid);
        refusing = invalid.length > 0;
      }
    }
    refusal.textContent = refusing ? message : '';
    const note = (refusing ? '' : message) || statusFor(parsed);
    status.replaceChildren();
    if (note) make('span', null, status, note);
    newButton.disabled = !canStartNew(text);
    undoButton.disabled = !history.canUndo();
    redoButton.disabled = !history.canRedo();
    // A button that just went disabled cannot keep focus; the editor is the natural place for it.
    if (document.activeElement?.disabled === true) editor.focus();
    if (document.activeElement !== tempo) tempo.value = parsed.tempo || DEFAULT_TEMPO;
    fitReadOnlyLabel();
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
    setPlayState(false);
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
    setPlayState(true);
    scheduler.start(playable, bpm, from);
    frame = requestAnimationFrame(tick);
  };

  const replaceText = (next) => {
    if (playing) stop();
    text = next;
    message = '';
    clearRefusal();
    history.record(next);
    setEditing(initialEditing(next));
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

  const startNew = () => {
    const cleared = clearDocument(text);
    if (!cleared) return;
    const fromButton = document.activeElement === newButton;
    if (playing) stop();
    clearRefusal();
    text = cleared.text;
    history.record(text);
    flash('New tab.');
    setEditing(initialEditing(text));
    editor.update();
    editor.setCue(0);
    persist();
    refresh();
    if (fromButton) undoButton.focus();
    armed = editing;
  };

  // Undo and redo swap the whole document text, so the song fields and either editor just re-read it.
  const applyHistory = (next) => {
    if (next === null) return;
    if (playing) stop();
    text = next;
    message = '';
    clearRefusal();
    editor.update();
    persist();
    refresh();
  };
  const undo = () => applyHistory(history.undo());
  const redo = () => applyHistory(history.redo());

  const setEditing = (on) => {
    editing = on;
    const label = editingLabel(on);
    root.dataset.editing = String(on);
    editorBox.dataset.editing = String(on);
    editToggle.setAttribute('aria-pressed', String(on));
    editToggle.setAttribute('aria-label', label);
    editToggle.dataset.tip = label;
    editToggle.replaceChildren(buildIcon(on ? 'pencil' : 'pencil-off'));
    history.setEnabled(on);
    editor.setEditable(on);
    songFields.setEditable(on);
    refresh();
  };

  [play, back, newButton, undoButton, redoButton, editToggle].forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
  });
  back.addEventListener('click', backToStart);
  newButton.addEventListener('click', startNew);
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  editToggle.addEventListener('click', () => {
    setEditing(!editing);
    armed = editing;
  });

  const flow = createExamplesFlow({
    show: () => examplesDialog.open(),
    load: loadExampleText,
    apply: (next) => replaceText(next),
    start: () => { if (afterLoad('example') === 'play') start(); },
    fail: () => { flash('Could not load that example.'); refresh(); },
  });
  const examplesDialog = buildExamplesDialog(SONGS, { onPick: (entry) => flow.pick(entry) });
  dock.append(examplesDialog.dialog);
  examplesButton.addEventListener('click', flow.open);

  const pressPlay = () => {
    const action = playPress({ playing, hasNotes: parseTab(text).events.length > 0 });
    if (action === 'stop') stop();
    else if (action === 'play') start();
    else flow.open();
  };
  play.addEventListener('click', pressPlay);

  tempo.addEventListener('change', () => {
    const bpm = Math.round(Number(tempo.value));
    if (Number.isFinite(bpm)) {
      apply(withTempo(text, clamp(bpm, MIN_TEMPO, MAX_TEMPO)), 'tempo');
      editor.update();
    }
    tempo.value = parseTab(text).tempo || DEFAULT_TEMPO;
    refresh();
  });

  const loadFile = async (file) => {
    try {
      replaceText(await readImportedFile(file));
      if (afterLoad('file') === 'focus-play') play.focus({ preventScroll: true });
    } catch (error) {
      message = error instanceof ImportError ? error.message : 'Could not open that file.';
      refresh();
    }
  };
  open.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    if (picker.files[0]) loadFile(picker.files[0]);
    picker.value = '';
  });
  // Save and Print both need the song's title and artist; the arranger is optional.
  const withSongDetails = (action) => () => {
    const check = saveCheck(readMeta(text));
    if (check.focus === null) {
      clearRefusal();
      message = '';
      refresh();
      action();
      return;
    }
    invalid = check.fields;
    refusing = true;
    message = check.status;
    setMetaOpen(true);
    refresh();
    songFields.focus(check.focus);
  };
  saveButton.addEventListener('click', withSongDetails(() => exportFile(text, `${fileBase(readMeta(text), new Date())}.txt`)));
  printButton.addEventListener('click', withSongDetails(() => printTab()));
  songFields.toggle.addEventListener('click', () => setMetaOpen(root.dataset.meta !== 'open'));

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

  const applyOpen = (isOpen) => {
    const label = isOpen ? 'Collapse' : 'Expand';
    root.dataset.open = String(isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', `${label} the tab panel`);
    toggle.dataset.tip = label;
  };
  toggle.addEventListener('click', () => {
    ui = { ...ui, dockOpen: !ui.dockOpen };
    applyOpen(ui.dockOpen);
    // Collapsing hides the body and the tools, so focus inside them would be lost.
    if (!ui.dockOpen && (body.contains(document.activeElement) || tools.contains(document.activeElement))) {
      toggle.focus();
    }
    saveUi(storage, ui);
  });
  radios.forEach((radio) => radio.addEventListener('change', () => {
    if (!radio.checked || radio.value === ui.editor) return;
    ui = { ...ui, editor: radio.value };
    editor = swapEditor(editor, buildEditor, shown);
    saveUi(storage, ui);
  }));
  dock.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      pressPlay();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Home') {
      e.preventDefault();
      backToStart();
    }
  });

  // One history for the page: it replaces the textarea's own undo, which would know nothing of
  // grid edits, fields or taps on the guitar.
  document.addEventListener('keydown', (e) => {
    const command = historyKey(e);
    if (!command || examplesDialog.isOpen() || e.target === tempo || e.target === picker) return;
    e.preventDefault();
    if (!editing) return;
    if (command === 'undo') undo(); else redo();
  });
  dock.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') return;
    e.preventDefault();
    if (!editing) return;
    if (e.inputType === 'historyUndo') undo(); else redo();
  });

  document.addEventListener('focusin', (e) => {
    lastFocus = e.target;
    if (e.target !== editToggle) armed = false;
  });
  window.addEventListener('pagehide', persist);

  applyOpen(ui.dockOpen);
  setMetaOpen(false);
  setEditing(editing);

  return {
    // Only a press that follows editing writes to the tab, and only with editing on; playing leaves it alone.
    onFretPress: (row, fret) => {
      if (guitarMayWrite({ editing, armed, focusInEditor: Boolean(lastFocus) && editorBox.contains(lastFocus) })) {
        editor.writeFret(row, fret);
      }
    },
    getText: () => text,
    stop,
  };
};
