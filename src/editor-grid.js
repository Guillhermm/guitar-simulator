import { parseTab, setFret, appendBlock, landedCol, digitCount } from './tab.js';

export const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
export const ENTRY_WINDOW_MS = 600;
const ROWS = STRING_LABELS.length;
const PLAYHEAD_FRACTION = 0.3;

export const cellKey = ({ block, row, col }) => `${block}:${row}:${col}`;

// Fret 1 may be the first digit of 10-19, so it waits for a second digit
// and only the other digits settle at once.
export const enterDigit = (pending, digit, key, now) => {
  if (pending && pending.key === key && pending.digit === 1 && now - pending.at <= ENTRY_WINDOW_MS) {
    return { fret: 10 + digit, pending: null, settled: true };
  }
  if (digit === 1) return { fret: 1, pending: { key, digit, at: now }, settled: false };
  return { fret: digit, pending: null, settled: true };
};

// widths is the column count of every block. A move past the last column of the
// last block comes back with overflow so the caller can append a block.
export const moveRight = (cursor, widths) => {
  if (cursor.col < widths[cursor.block] - 1) return { cursor: { ...cursor, col: cursor.col + 1 }, overflow: false };
  if (cursor.block < widths.length - 1) return { cursor: { ...cursor, block: cursor.block + 1, col: 0 }, overflow: false };
  return { cursor, overflow: true };
};

// Steps right over the columns a fret occupies, so the cursor lands after its last digit.
export const moveRightBy = (cursor, widths, steps) => {
  let at = { cursor, overflow: false };
  for (let i = 0; i < steps && !at.overflow; i++) at = moveRight(at.cursor, widths);
  return at;
};

const moveLeft = (cursor, widths) => {
  if (cursor.col > 0) return { ...cursor, col: cursor.col - 1 };
  if (cursor.block > 0) return { ...cursor, block: cursor.block - 1, col: widths[cursor.block - 1] - 1 };
  return cursor;
};

export const reduceGridKey = (cursor, key, widths) => {
  switch (key) {
    case 'ArrowLeft': return { cursor: moveLeft(cursor, widths), overflow: false, action: null };
    case 'ArrowRight': return { ...moveRight(cursor, widths), action: null };
    case 'ArrowUp': return { cursor: { ...cursor, row: Math.max(0, cursor.row - 1) }, overflow: false, action: null };
    case 'ArrowDown': return { cursor: { ...cursor, row: Math.min(ROWS - 1, cursor.row + 1) }, overflow: false, action: null };
    case 'Backspace':
    case 'Delete': return { cursor, overflow: false, action: 'clear' };
    case ' ': return { ...moveRight(cursor, widths), action: 'rest' };
    default: return null;
  }
};

// A muted note (x in the text) parses to fret null.
export const cellText = (fret) => {
  if (fret === undefined) return '';
  return fret === null ? 'x' : String(fret);
};

const ariaLabel = (cursor, fret, multiple) => {
  const place = `string ${cursor.row + 1}, step ${cursor.col + 1}`;
  const bar = multiple ? `bar ${cursor.block + 1}, ` : '';
  const what = fret === undefined ? 'empty' : (fret === null ? 'muted' : `fret ${fret}`);
  return `${bar}${place}, ${what}`;
};

const make = (tag, className, parent, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.append(node);
  return node;
};

export const createEditor = (container, { getText, setText, onCursor = () => {} }) => {
  let parsed = parseTab(getText());
  let cursor = { block: 0, row: 0, col: 0 };
  let cells = [];
  let frets = new Map();
  let signature = '';
  let pending = null;
  let timer = null;
  let playing = null;

  container.replaceChildren();
  const hint = make('p', 'grid-hint', container, 'Type a fret number or tap the neck.');
  const grid = make('div', 'grid', container);
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Tablature');
  const live = make('div', 'sr-only', container);
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  const hasFocus = () => container.contains(document.activeElement);

  const widths = () => parsed.blocks.map((b) => b.width);

  const clampCursor = () => {
    const last = Math.max(0, parsed.blocks.length - 1);
    const block = Math.min(cursor.block, last);
    const width = parsed.blocks[block] ? parsed.blocks[block].width : 1;
    cursor = { block, row: cursor.row, col: Math.min(cursor.col, width - 1) };
  };

  const cellAt = (c) => cells[c.block] && cells[c.block][c.row] && cells[c.block][c.row][c.col];

  const paintCell = (c, node) => {
    const fret = frets.get(cellKey(c));
    const label = cellText(fret);
    const span = node.firstChild;
    if (span.textContent !== label) span.textContent = label;
    node.setAttribute('aria-label', ariaLabel(c, fret, parsed.blocks.length > 1));
  };

  const build = () => {
    grid.replaceChildren();
    cells = parsed.blocks.map((blockInfo, block) => {
      const group = make('div', 'grid-block', grid);
      group.setAttribute('role', 'rowgroup');
      return STRING_LABELS.map((label, row) => {
        const line = make('div', 'grid-row', group);
        line.setAttribute('role', 'row');
        const head = make('span', 'grid-label', line, label);
        head.setAttribute('role', 'rowheader');
        return Array.from({ length: blockInfo.width }, (_, col) => {
          const node = make('div', 'cell', line);
          node.setAttribute('role', 'gridcell');
          node.tabIndex = -1;
          node.dataset.block = block;
          node.dataset.row = row;
          node.dataset.col = col;
          make('span', 'cell-fret', node);
          return node;
        });
      });
    });
  };

  const paint = () => {
    cells.forEach((rows, block) => rows.forEach((line, row) => line.forEach((node, col) => {
      paintCell({ block, row, col }, node);
    })));
  };

  const markCursor = (focus) => {
    grid.querySelectorAll('.cursor').forEach((n) => { n.classList.remove('cursor'); n.tabIndex = -1; });
    const node = cellAt(cursor);
    if (!node) return;
    node.classList.add('cursor');
    node.tabIndex = 0;
    if (focus) node.focus();
  };

  const refresh = () => {
    parsed = parseTab(getText());
    frets = new Map();
    parsed.events.forEach((event) => event.notes.forEach((n) => {
      frets.set(cellKey({ block: event.block, row: n.row, col: event.col }), n.fret);
    }));
    const next = parsed.blocks.map((b) => b.width).join(',');
    const hadFocus = hasFocus();
    if (next !== signature) {
      signature = next;
      build();
    }
    clampCursor();
    paint();
    hint.hidden = parsed.events.length > 0;
    hint.tabIndex = parsed.blocks.length === 0 ? 0 : -1;
    markCursor(hadFocus);
  };

  const setCursor = (next, focus = hasFocus()) => {
    cursor = next;
    clampCursor();
    markCursor(focus);
    onCursor({ ...cursor });
  };

  const ensureBlock = () => {
    if (parsed.blocks.length > 0) return;
    setText(appendBlock(getText()));
    refresh();
  };

  // Returns the cell the fret landed in: setFret may shift it one column right.
  const write = (c, fret) => {
    const next = setFret(getText(), c, fret);
    setText(next);
    refresh();
    return fret === null ? c : { ...c, col: landedCol(next, c) };
  };

  const advance = (focus, steps = 1) => {
    const step = moveRightBy(cursor, widths(), steps);
    if (step.overflow) {
      setText(appendBlock(getText()));
      refresh();
      setCursor({ ...cursor, block: parsed.blocks.length - 1, col: 0 }, focus);
    } else {
      setCursor(step.cursor, focus);
    }
  };

  const flush = () => {
    clearTimeout(timer);
    pending = null;
  };

  const typeDigit = (digit) => {
    ensureBlock();
    const entry = enterDigit(pending, digit, cellKey(cursor), Date.now());
    pending = entry.pending;
    clearTimeout(timer);
    setCursor(write(cursor, entry.fret));
    if (pending) pending = { ...pending, key: cellKey(cursor) };
    if (entry.settled) advance(undefined, digitCount(entry.fret));
    else timer = setTimeout(() => { pending = null; advance(); }, ENTRY_WINDOW_MS);
  };

  grid.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      typeDigit(Number(e.key));
      return;
    }
    const result = reduceGridKey(cursor, e.key, widths());
    if (!result) return;
    e.preventDefault();
    flush();
    if (result.action === 'clear') write(cursor, null);
    if (result.action === 'rest') {
      for (let row = 0; row < ROWS; row++) write({ ...cursor, row }, null);
    }
    if (result.overflow) advance();
    else setCursor(result.cursor);
  });

  hint.addEventListener('keydown', (e) => {
    if (!/^[0-9]$/.test(e.key)) return;
    e.preventDefault();
    typeDigit(Number(e.key));
    markCursor(true);
  });

  grid.addEventListener('pointerdown', (e) => {
    const node = e.target.closest('.cell');
    if (!node) return;
    flush();
    setCursor({ block: Number(node.dataset.block), row: Number(node.dataset.row), col: Number(node.dataset.col) }, true);
  });

  const setPlayhead = (event) => {
    grid.querySelectorAll('.playing').forEach((n) => n.classList.remove('playing'));
    if (!event) {
      live.textContent = '';
      playing = null;
      return;
    }
    const column = (cells[event.block] || []).map((line) => line[event.col]).filter(Boolean);
    column.forEach((n) => n.classList.add('playing'));
    if (playing !== event.block) {
      live.textContent = `Playing, bar ${event.block + 1}`;
      playing = event.block;
    }
    if (column[0]) {
      grid.scrollLeft = Math.max(0, column[0].offsetLeft - PLAYHEAD_FRACTION * grid.clientWidth);
    }
  };

  const writeFret = (row, fret) => {
    flush();
    ensureBlock();
    const focus = hasFocus();
    cursor = write({ block: cursor.block, row, col: cursor.col }, fret);
    advance(focus, fret === null ? 1 : digitCount(fret));
  };

  refresh();

  return {
    setPlayhead,
    writeFret,
    update: refresh,
    focus: () => (parsed.blocks.length === 0 ? hint : cellAt(cursor) || hint).focus(),
  };
};
