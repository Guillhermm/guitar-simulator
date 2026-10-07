import { parseTab, withTempo } from './tab.js';
import { createScheduler } from './scheduler.js';
import { KEY, DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO, readSaved, save } from './storage.js';
import { exportFile, readImportedFile } from './files.js';

const SAVE_DELAY_MS = 300;

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
  let frame = 0;
  let saveTimer = null;
  let lastFocus = null;
  let message = '';

  const transport = make('div', 'transport', dock);
  const sheet = make('div', 'sheet', dock);
  sheet.id = 'tab-sheet';
  const status = make('p', 'dock-status', sheet);
  status.id = 'tab-status';
  status.setAttribute('role', 'status');
  const editorBox = make('div', 'editor', sheet);

  const play = button('Play', transport, 'btn btn-play');
  play.setAttribute('aria-describedby', status.id);
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
  const open = button('Open', transport);
  const saveButton = button('Save', transport);
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

  const editor = createEditor(editorBox, {
    getText: () => text,
    setText: (next) => { text = next; message = ''; persistSoon(); refresh(); },
    onCursor: () => {},
  });

  const refresh = () => {
    const parsed = parseTab(text);
    const note = message || statusFor(parsed);
    status.textContent = note;
    play.disabled = !playing && parsed.events.length === 0;
    if (document.activeElement !== tempo) tempo.value = parsed.tempo || DEFAULT_TEMPO;
  };

  const finish = () => {
    cancelAnimationFrame(frame);
    queue = [];
    ending = false;
    playing = false;
    play.textContent = 'Play';
    editor.setPlayhead(null);
    refresh();
  };

  const tick = () => {
    const t = player.now();
    while (queue.length && queue[0].when <= t) {
      const { event } = queue.shift();
      event.notes.forEach((n) => guitar.strike(n.row, n.fret));
      editor.setPlayhead(event);
    }
    if (ending && queue.length === 0) finish();
    else frame = requestAnimationFrame(tick);
  };

  const scheduler = createScheduler({
    now: () => player.now(),
    play: (midi, when) => player.play(midi, when),
    onStep: (event, when) => queue.push({ event, when }),
    onEnd: () => { ending = true; },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
  });

  const stop = () => {
    scheduler.stop();
    finish();
  };

  const start = () => {
    const parsed = parseTab(text);
    if (parsed.events.length === 0) return;
    player.resume();
    playing = true;
    ending = false;
    queue = [];
    play.textContent = 'Stop';
    scheduler.start(parsed.events, clamp(Number(tempo.value) || parsed.tempo || DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO), 0);
    frame = requestAnimationFrame(tick);
  };

  const replaceText = (next) => {
    if (playing) stop();
    text = next;
    message = '';
    editor.update();
    persist();
    refresh();
  };

  play.addEventListener('click', () => (playing ? stop() : start()));

  tempo.addEventListener('change', () => {
    const bpm = Math.round(Number(tempo.value));
    if (Number.isFinite(bpm)) {
      text = withTempo(text, clamp(bpm, MIN_TEMPO, MAX_TEMPO));
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
