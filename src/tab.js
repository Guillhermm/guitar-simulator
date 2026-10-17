import { STRING_COUNT, FRET_COUNT } from './pitch.js';

const LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const MAX_WRITABLE_FRET = 99;

// Optional string label, optional bar or colon, then only characters that can appear in tab.
const TAB_LINE = /^(\s*(?:[eEBbGgDdAa]\s*)?[|:]?)([-0-9|:hpbrxX/\\~()*.<>]*)$/;
const ANNOTATED = /^(.*?[|:])(\s+\S.*)$/;
const TEMPO_LINE = /^\s*tempo\s*[:=]?\s*(\d{1,3})(?:\s*bpm)?\s*$/i;

const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';

// Splits a tab line into its label prefix, its columns and a closing barline. Null for any other line.
// A line with neither a label nor a bar needs a digit, so a row of dashes used as a divider is not tab.
// Text after the closing bar, set off by whitespace ("| (3x)", "|  x2"), is an annotation: it is kept
// in the tail so edits preserve it, and only a line whose part before it is pure tab qualifies.
const splitLine = (raw) => {
  const line = raw.replace(/\s+$/, '');
  const annotated = TAB_LINE.test(line) ? null : ANNOTATED.exec(line);
  const m = TAB_LINE.exec(annotated ? annotated[1] : line);
  if (!m) return null;
  const [, prefix, rest] = m;
  if (!rest.includes('-')) return null;
  const tail = /[|:]*$/.exec(rest)[0];
  if (annotated && !tail) return null;
  const body = rest.slice(0, rest.length - tail.length);
  if (!/[eEBbGgDdAa|:]/.test(prefix) && !/\d/.test(body)) return null;
  return { prefix, body, tail: annotated ? tail + annotated[2] : tail };
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

// Semitones above the open string for the natural harmonic written <n>.
export const HARMONIC_SEMITONES = { 12: 12, 7: 19, 19: 19, 5: 24, 4: 28, 9: 28 };
const DEFAULT_BEND = 2;

const TOKEN = /<(\d+)>|\((\d+)\)|(\d+)|[xX]|[hpbr~/\\]/g;

// Splits a tab body into num (a fret, kind 'harmonic' for <n>, 'ghost' for (n), else 'plain'), x and sym
// tokens. from is the first column of the token as written, start and end the columns of its digits.
export const lexLine = (body) => {
  const tokens = [];
  for (const m of body.matchAll(TOKEN)) {
    const from = m.index;
    const last = from + m[0].length - 1;
    if (m[1] !== undefined) tokens.push({ type: 'num', n: Number(m[1]), kind: 'harmonic', from, start: from + 1, end: last - 1 });
    else if (m[2] !== undefined) tokens.push({ type: 'num', n: Number(m[2]), kind: 'ghost', from, start: from + 1, end: last - 1 });
    else if (m[3] !== undefined) tokens.push({ type: 'num', n: Number(m[3]), kind: 'plain', from, start: from, end: last });
    else if (m[0] === 'x' || m[0] === 'X') tokens.push({ type: 'x', from, start: from, end: from });
    else tokens.push({ type: 'sym', ch: m[0], from });
  }
  return tokens;
};

const LEGATO = 'hp/\\';

// Reads one string's tokens into notes with their techniques. Bend and release targets are consumed
// and never become notes.
const readRow = (tokens, row, fretCount) => {
  const notes = [];
  let skipped = 0;
  let last = null;
  tokens.forEach((t, i) => {
    if (t.type === 'sym') {
      const next = tokens[i + 1];
      const feedsNext = next?.type === 'num' && next.kind !== 'harmonic' && next.from === t.from + 1;
      if (t.ch === '~') {
        if (last) last.tech.vibrato = true;
      } else if (t.ch === 'b') {
        if (last && last.fret !== null && !last.tech.harmonic) last.tech.bend = { semitones: DEFAULT_BEND };
      } else if (t.ch === 'r') {
        if (last?.tech.bend) last.releaseCol = t.from;
      } else if ((t.ch === '/' || t.ch === '\\') && !feedsNext && last?.end + 1 === t.from) {
        last.tech.slideOut = t.ch === '/' ? 'up' : 'down';
      }
      return;
    }
    const prev = tokens[i - 1];
    const sym = prev?.type === 'sym' && prev.from + 1 === t.from ? prev.ch : null;
    if (t.type === 'num' && t.kind !== 'harmonic') {
      if (sym === 'b' && last?.tech.bend) {
        if (t.n > last.fret) last.tech.bend.semitones = t.n - last.fret;
        return;
      }
      if (sym === 'r' && last?.releaseCol === prev.from) return;
    }
    const tech = {};
    const joined = last && last.end + 1 === prev?.from;
    if (sym && LEGATO.includes(sym) && t.type === 'num' && t.kind === 'plain' && joined && last.fret !== null) {
      tech.legato = sym;
    } else if ((sym === '/' || sym === '\\') && t.type === 'num' && t.kind === 'plain' && !joined) {
      tech.slideIn = sym === '/' ? 'up' : 'down';
    }
    const note = { row, fret: t.type === 'x' ? null : t.n, start: t.start, end: t.end, tech };
    if (t.type === 'x') tech.muted = true;
    else if (t.kind === 'ghost') tech.ghost = true;
    else if (t.kind === 'harmonic') tech.harmonic = true;
    if (t.type === 'num' && (t.n > fretCount || (t.kind === 'harmonic' && !(t.n in HARMONIC_SEMITONES)))) {
      skipped += 1;
      return;
    }
    notes.push(note);
    last = note;
  });
  return { notes, skipped };
};

// Column ranges (in body coordinates) covered by a PM---- marker on the line above a block.
const palmMuteRanges = (lines, block) => {
  const above = lines[block.lines[0] - 1];
  if (above === undefined) return [];
  return [...above.matchAll(/P\.?M\.?-*/g)].map((m) => [m.index - block.bodyStart[0], m.index + m[0].length - block.bodyStart[0]]);
};

// Notes whose digit spans overlap on different strings sound together: a two-digit fret on one
// string covers the column of a single digit written under its second digit on another.
const blockEvents = (block, blockIndex, offset, pmRanges) => {
  const notes = [];
  let skipped = 0;
  block.bodies.forEach((body, row) => {
    const r = readRow(lexLine(body), row, FRET_COUNT);
    skipped += r.skipped;
    r.notes.forEach((n) => {
      if (n.releaseCol !== undefined) n.tech.bend.releaseStep = offset + n.releaseCol;
      if (pmRanges.some(([lo, hi]) => n.start >= lo && n.start < hi)) n.tech.palmMute = true;
      notes.push(n);
    });
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
    notes: g.notes
      .map(({ row, fret, tech }) => (Object.keys(tech).length ? { row, fret, tech } : { row, fret }))
      .sort((a, b) => a.row - b.row),
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
    const r = blockEvents(block, i, offset, palmMuteRanges(lines, block));
    events.push(...r.events);
    skipped += r.skipped;
    offset += block.width;
  });
  const blocks = found.map(({ lines: l, bodyStart, width }) => ({ lines: l, bodyStart, width }));
  return { tempo: tempoOf(lines), blocks, events, skipped };
};

export const readTempo = (text) => tempoOf(splitText(text));

const META_LINE = /^\s*(title|artist|arranged\s+by)\s*:(.*)$/i;
const META_KEYS = ['title', 'artist', 'arranger'];
const META_NAMES = { title: 'Title', artist: 'Artist', arranger: 'Arranged by' };
const META_MAX = 200;
const metaKeyOf = (name) => (/^arranged/i.test(name) ? 'arranger' : name.toLowerCase());

const cleanMeta = (value) => {
  const flat = String(value ?? '').replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '');
  return Array.from(flat.replace(/\s+/g, ' ').trim()).slice(0, META_MAX).join('').trim();
};

// First line per key wins; later ones stay plain text. Maps key to { index, value }.
const metaLines = (lines) => {
  const found = {};
  lines.forEach((line, index) => {
    const m = META_LINE.exec(line);
    if (!m) return;
    const key = metaKeyOf(m[1].replace(/\s+/g, ' '));
    if (!found[key]) found[key] = { index, value: cleanMeta(m[2]) };
  });
  return found;
};

export const readMeta = (text) => {
  const found = metaLines(text.split('\n'));
  return Object.fromEntries(META_KEYS.map((k) => [k, found[k]?.value ?? '']));
};

const isHeaderLine = (l) => META_LINE.test(l) || (TEMPO_LINE.test(l) && Number(TEMPO_LINE.exec(l)[1]) > 0);
const headerOrder = (l) => {
  const m = META_LINE.exec(l);
  return m ? META_KEYS.indexOf(metaKeyOf(m[1].replace(/\s+/g, ' '))) : META_KEYS.length;
};

const insertHeader = (lines, line, order) => {
  let run = 0;
  while (run < lines.length && isHeaderLine(lines[run])) run += 1;
  let pos = 0;
  while (pos < run && headerOrder(lines[pos]) <= order) pos += 1;
  return [...lines.slice(0, pos), line, ...lines.slice(pos)];
};

// Only the named fields change; a missing field is left alone. A new line goes into the run of header
// lines at the top of the document, in the order Title, Artist, Arranged by, Tempo.
export const withMeta = (text, meta) => {
  let lines = text.split('\n');
  META_KEYS.forEach((key, order) => {
    if (!(key in meta)) return;
    const value = cleanMeta(meta[key]);
    const at = metaLines(lines)[key];
    if (at) {
      if (!value) lines.splice(at.index, 1);
      else if (at.value !== value) lines[at.index] = `${META_NAMES[key]}: ${value}`;
    } else if (value) {
      lines = insertHeader(lines, `${META_NAMES[key]}: ${value}`, order);
    }
  });
  return lines.join('\n');
};

export const withTempo = (text, bpm) => {
  const line = `Tempo: ${Math.round(bpm)}`;
  const lines = text.split('\n');
  const i = lines.findIndex((l) => TEMPO_LINE.test(l) && Number(TEMPO_LINE.exec(l)[1]) > 0);
  if (i < 0) return insertHeader(lines, line, META_KEYS.length).join('\n');
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
    for (const m of bodies[row].matchAll(/\d+|[xX]/g)) {
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
