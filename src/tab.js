import { STRING_COUNT, FRET_COUNT } from './pitch.js';

const LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const MAX_WRITABLE_FRET = 99;

// Optional string label, optional bar or colon, then only characters that can appear in tab.
const TAB_LINE = /^(\s*(?:[eEBbGgDdAa]\s*)?[|:]?)([-0-9|:hpbrxX/\\~()*.]*)$/;
const TEMPO_LINE = /^\s*tempo\s*[:=]?\s*(\d{1,3})(?:\s*bpm)?\s*$/i;

const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';

// Splits a tab line into its label prefix, its columns and a closing barline. Null for any other line.
// A line with neither a label nor a bar needs a digit, so a row of dashes used as a divider is not tab.
const splitLine = (raw) => {
  const m = TAB_LINE.exec(raw.replace(/\s+$/, ''));
  if (!m) return null;
  const [, prefix, rest] = m;
  if (!rest.includes('-')) return null;
  const tail = /[|:]*$/.exec(rest)[0];
  const body = rest.slice(0, rest.length - tail.length);
  if (!/[eEBbGgDdAa|:]/.test(prefix) && !/\d/.test(body)) return null;
  return { prefix, body, tail };
};

const splitText = (text) => text.split('\n').map((l) => l.replace(/\r$/, ''));

const findBlocks = (lines) => {
  const blocks = [];
  let run = [];
  const flush = () => {
    for (let i = 0; i + STRING_COUNT <= run.length; i += STRING_COUNT) {
      const parts = run.slice(i, i + STRING_COUNT);
      blocks.push({
        lines: parts.map((p) => p.index),
        bodyStart: parts.map((p) => p.prefix.length),
        width: Math.max(...parts.map((p) => p.body.length)),
        bodies: parts.map((p) => p.body),
      });
    }
    run = [];
  };
  lines.forEach((raw, index) => {
    const parts = splitLine(raw);
    if (parts) run.push({ index, ...parts });
    else flush();
  });
  flush();
  return blocks;
};

// Notes whose digit spans overlap on different strings sound together: a two-digit fret on one
// string covers the column of a single digit written under its second digit on another.
const blockEvents = (block, blockIndex, offset) => {
  const notes = [];
  let skipped = 0;
  block.bodies.forEach((body, row) => {
    for (const m of body.matchAll(/\d+/g)) {
      const fret = Number(m[0]);
      if (fret > FRET_COUNT) skipped += 1;
      else notes.push({ row, fret, start: m.index, end: m.index + m[0].length - 1 });
    }
  });
  notes.sort((a, b) => a.start - b.start || a.row - b.row);
  const groups = [];
  notes.forEach((n) => {
    const g = groups[groups.length - 1];
    if (g && n.start <= g.end) {
      g.notes.push(n);
      g.end = Math.max(g.end, n.end);
    } else {
      groups.push({ col: n.start, end: n.end, notes: [n] });
    }
  });
  const events = groups.map((g) => ({
    step: offset + g.col,
    block: blockIndex,
    col: g.col,
    notes: g.notes.map(({ row, fret }) => ({ row, fret })).sort((a, b) => a.row - b.row),
  }));
  return { events, skipped };
};

const tempoOf = (lines) => {
  for (const line of lines) {
    const m = TEMPO_LINE.exec(line);
    if (m && Number(m[1]) > 0) return Number(m[1]);
  }
  return null;
};

export const parseTab = (text) => {
  const lines = splitText(text);
  const found = findBlocks(lines);
  const events = [];
  let skipped = 0;
  let offset = 0;
  found.forEach((block, i) => {
    const r = blockEvents(block, i, offset);
    events.push(...r.events);
    skipped += r.skipped;
    offset += block.width;
  });
  const blocks = found.map(({ lines: l, bodyStart, width }) => ({ lines: l, bodyStart, width }));
  return { tempo: tempoOf(lines), blocks, events, skipped };
};

export const readTempo = (text) => tempoOf(splitText(text));

export const withTempo = (text, bpm) => {
  const line = `Tempo: ${Math.round(bpm)}`;
  const lines = text.split('\n');
  const i = lines.findIndex((l) => TEMPO_LINE.test(l) && Number(TEMPO_LINE.exec(l)[1]) > 0);
  if (i < 0) return `${line}\n${text}`;
  lines[i] = line;
  return lines.join('\n');
};

export const emptyTab = (width = 32) =>
  LABELS.map((label) => `${label}|${'-'.repeat(width)}|`).join('\n');

export const appendBlock = (text) => {
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${emptyTab()}` : emptyTab();
};

const blank = (s, from, to) => s.slice(0, from) + '-'.repeat(to - from) + s.slice(to);

// Writes or clears one fret. All six lines are padded to the block width and rewritten together, so they
// stay aligned. The fret lands at col, or at col + 1 when a column had to be inserted before it to keep
// it apart from a fret on its left; landedCol tells which.
export const setFret = (text, { block, row, col }, fret) => {
  const lines = text.split('\n');
  const blk = findBlocks(lines.map((l) => l.replace(/\r$/, '')))[block];
  if (!blk) throw new RangeError(`no tab block ${block}`);
  if (!Number.isInteger(row) || row < 0 || row >= STRING_COUNT) throw new RangeError(`bad row ${row}`);
  if (!Number.isInteger(col) || col < 0) throw new RangeError(`bad column ${col}`);
  if (fret !== null && (!Number.isInteger(fret) || fret < 0 || fret > MAX_WRITABLE_FRET)) {
    throw new RangeError(`bad fret ${fret}`);
  }

  const parts = blk.lines.map((index) => splitLine(lines[index].replace(/\r$/, '')));
  let bodies = parts.map((p) => p.body.padEnd(blk.width, '-'));
  const pad = (n) => { bodies = bodies.map((b) => b.padEnd(n, '-')); };
  // A line whose fret straddles the insertion column takes its dash after that fret instead, so a
  // multi-digit fret is never split and its timing does not move. The exact line is the one being
  // separated from its neighbor, so it always splits at the column.
  const insertAt = (at, exact = -1) => {
    pad(at);
    bodies = bodies.map((b, r) => {
      let cut = at;
      if (r !== exact && isDigit(b[at - 1])) while (isDigit(b[cut])) cut += 1;
      return `${b.slice(0, cut)}-${b.slice(cut)}`;
    });
  };

  if (fret === null) {
    for (const m of bodies[row].matchAll(/\d+/g)) {
      if (col >= m.index && col < m.index + m[0].length) {
        bodies[row] = blank(bodies[row], m.index, m.index + m[0].length);
      }
    }
  } else {
    const digits = String(fret);
    const len = digits.length;
    // A column under the second digit of a fret on this string belongs to that fret, so the write
    // moves to the first free column after it, with a dash kept between the two.
    for (const m of bodies[row].matchAll(/\d+/g)) {
      if (col > m.index && col < m.index + m[0].length) col = m.index + m[0].length + 1;
    }
    pad(col + len);
    for (const m of [...bodies[row].matchAll(/\d+/g)]) {
      if (m.index <= col + len - 1 && m.index + m[0].length - 1 >= col) {
        bodies[row] = blank(bodies[row], m.index, m.index + m[0].length);
      }
    }
    // The second digit needs a free column. When another string has a fret covering both columns,
    // anything at the second column already sounds with this one, so only this string can block it.
    const covered = bodies.some((b, r) => r !== row && isDigit(b[col]) && isDigit(b[col + 1]));
    const mustInsert = len === 2 && bodies.some((b, r) => b[col + 1] !== '-' && (r === row || !covered));
    if (mustInsert) insertAt(col + 1);
    let at = col;
    // A digit next to the new one would read as a single two-digit fret, so separate them.
    if (isDigit(bodies[row][col - 1])) {
      insertAt(col);
      at = col + 1;
    }
    bodies[row] = bodies[row].slice(0, at) + digits + bodies[row].slice(at + len);
    if (isDigit(bodies[row][at + len])) insertAt(at + len, row);
  }

  const out = lines.slice();
  blk.lines.forEach((index, r) => { out[index] = parts[r].prefix + bodies[r] + parts[r].tail; });
  return out.join('\n');
};

// The column where the fret written by setFret at col starts.
export const landedCol = (text, { block, row, col }) => {
  const blk = findBlocks(splitText(text))[block];
  if (!blk) return col + 1;
  const body = blk.bodies[row];
  if (isDigit(body[col]) && isDigit(body[col - 1])) {
    let end = col;
    while (isDigit(body[end + 1])) end += 1;
    return end + 2;
  }
  return isDigit(body[col]) ? col : col + 1;
};

export const digitCount = (fret) => String(fret).length;
