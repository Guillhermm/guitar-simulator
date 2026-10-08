import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parseTab, lexLine, HARMONIC_SEMITONES, readTempo, withTempo, setFret, emptyTab, appendBlock, landedCol } from '../src/tab.js';

const FIXTURE = [
  'Some Song - Some Artist',
  'tempo: 100',
  '',
  '[Intro]',
  'Am       G',
  'e|--0---12--5h7--20--|',
  'B|--1----3|',
  'g|--2---x',
  'D:--2',
  'A|-0',
  'E|3--',
  '',
  'Hold me close, never let me go',
  'e|--5-|',
  'B|----|',
  'G|----|',
  'D|----|',
  'A|----|',
  'E|----|',
].join('\n');

test('parses tempo, two blocks and the events of a cifraclub-style page', () => {
  const tab = parseTab(FIXTURE);
  assert.equal(tab.tempo, 100);
  assert.equal(tab.blocks.length, 2);
  assert.deepEqual(tab.blocks[0].lines, [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(tab.blocks[0].bodyStart, [2, 2, 2, 2, 2, 2]);
  assert.equal(tab.blocks[0].width, 19);
  assert.equal(tab.blocks[1].width, 4);
  assert.equal(tab.skipped, 1);
  assert.deepEqual(tab.events, [
    { step: 0, block: 0, col: 0, notes: [{ row: 5, fret: 3 }] },
    { step: 1, block: 0, col: 1, notes: [{ row: 4, fret: 0 }] },
    { step: 2, block: 0, col: 2, notes: [{ row: 0, fret: 0 }, { row: 1, fret: 1 }, { row: 2, fret: 2 }, { row: 3, fret: 2 }] },
    { step: 6, block: 0, col: 6, notes: [{ row: 0, fret: 12 }, { row: 1, fret: 3 }, { row: 2, fret: null, tech: { muted: true } }] },
    { step: 10, block: 0, col: 10, notes: [{ row: 0, fret: 5 }] },
    { step: 12, block: 0, col: 12, notes: [{ row: 0, fret: 7, tech: { legato: 'h' } }] },
    { step: 21, block: 1, col: 2, notes: [{ row: 0, fret: 5 }] },
  ]);
});

test('chords and lyrics are not tab; fewer than six lines is not a block', () => {
  const tab = parseTab('Am G\nHold me\ne|--0--|\nB|--1--|\n\n-----\nlyrics');
  assert.equal(tab.blocks.length, 0);
  assert.deepEqual(tab.events, []);
});

test('an unlabeled block needs digits; a dashes-only divider is ignored', () => {
  const tab = parseTab(['------', '--0--', '-----', '-----', '-----', '-----'].join('\n'));
  assert.equal(tab.blocks.length, 0);
});

test('tempo: absent, bpm suffix, readTempo and withTempo', () => {
  assert.equal(parseTab(emptyTab()).tempo, null);
  assert.equal(readTempo('Tempo = 72 BPM\n'), 72);
  assert.equal(readTempo('Tempo: 0'), null);
  assert.equal(withTempo(FIXTURE, 120).split('\n')[1], 'Tempo: 120');
  assert.equal(readTempo(withTempo(FIXTURE, 120)), 120);
  assert.equal(withTempo('abc', 90), 'Tempo: 90\nabc');
});

test('CRLF text parses the same as LF text', () => {
  assert.deepEqual(parseTab(FIXTURE.replace(/\n/g, '\r\n')), parseTab(FIXTURE));
});

test('emptyTab has six labeled lines of the requested width', () => {
  const lines = emptyTab(8).split('\n');
  assert.equal(lines.length, 6);
  assert.equal(lines[0], 'e|--------|');
  assert.equal(lines[5], 'E|--------|');
  const tab = parseTab(emptyTab());
  assert.equal(tab.blocks[0].width, 32);
  assert.deepEqual(tab.events, []);
});

test('appendBlock adds a second empty block after a blank line', () => {
  const text = appendBlock(emptyTab(4));
  assert.equal(parseTab(text).blocks.length, 2);
  assert.equal(text.split('\n')[6], '');
  assert.equal(appendBlock(''), emptyTab());
});

const at = (block, row, col) => ({ block, row, col });
const grid = (text) => text.split('\n');

test('setFret writes a single digit and parse finds it', () => {
  const text = setFret(emptyTab(8), at(0, 2, 3), 5);
  assert.equal(grid(text)[2], 'G|---5----|');
  assert.deepEqual(parseTab(text).events, [{ step: 3, block: 0, col: 3, notes: [{ row: 2, fret: 5 }] }]);
});

test('setFret with a two-digit fret inserts a column in all six lines when the next column is taken', () => {
  let text = setFret(emptyTab(6), at(0, 1, 3), 3);
  text = setFret(text, at(0, 0, 2), 12);
  const lines = grid(text);
  // B holds a 3 at column 3, where the 2 of the 12 goes. Without an inserted column the 3 would sound
  // with the 12; with it the 3 moves to column 4 and the width grows from 6 to 7.
  assert.deepEqual(lines.map((l) => l.length), Array(6).fill(lines[0].length));
  assert.equal(lines[0], 'e|--12---|');
  assert.equal(lines[1], 'B|----3--|');
  const tab = parseTab(text);
  assert.deepEqual(tab.events.map((e) => [e.col, e.notes]), [
    [2, [{ row: 0, fret: 12 }]],
    [4, [{ row: 1, fret: 3 }]],
  ]);
});

test('setFret with a two-digit fret needs no insertion when the next column is free', () => {
  const text = setFret(emptyTab(6), at(0, 0, 2), 12);
  assert.equal(grid(text)[0], 'e|--12--|');
  assert.equal(grid(text)[3], 'D|------|');
});

test('setFret overwrites an existing fret and clears both digits of a two-digit one', () => {
  let text = setFret(emptyTab(8), at(0, 0, 2), 12);
  text = setFret(text, at(0, 0, 2), 7);
  assert.equal(grid(text)[0], 'e|--7-----|');
  text = setFret(text, at(0, 0, 2), 12);
  text = setFret(text, at(0, 0, 3), null);
  assert.equal(grid(text)[0], 'e|--------|');
  assert.equal(setFret(text, at(0, 0, 5), null), text);
});

test('adjacent single digits on one string are kept apart', () => {
  let text = setFret(emptyTab(6), at(0, 0, 2), 3);
  text = setFret(text, at(0, 0, 3), 5);
  const tab = parseTab(text);
  assert.deepEqual(tab.events.map((e) => e.notes[0].fret), [3, 5]);
  assert.equal(tab.skipped, 0);
});

test('setFret pads uneven lines, keeps prefixes and never touches lines outside the block', () => {
  const text = FIXTURE;
  const out = setFret(text, at(0, 5, 0), 0);
  const before = grid(text);
  const after = grid(out);
  assert.equal(after.length, before.length);
  before.forEach((l, i) => { if (i < 5 || i > 10) assert.equal(after[i], l, `line ${i}`); });
  const widths = new Set(after.slice(5, 11).map((l) => l.replace(/\|$/, '').length));
  assert.equal(widths.size, 1);
  assert.equal(after[8].slice(0, 2), 'D:');
  assert.equal(after[7].slice(0, 2), 'g|');
  assert.equal(after[10].slice(0, 3), 'E|0');
  assert.equal(parseTab(out).events[0].notes[0].fret, 0);
  assert.equal(parseTab(out).skipped, 1);
});

test('setFret writes into the second block and past the current width', () => {
  const out = setFret(FIXTURE, at(1, 3, 6), 9);
  const tab = parseTab(out);
  assert.equal(tab.blocks[1].width, 7);
  assert.deepEqual(tab.events.at(-1), { step: 19 + 6, block: 1, col: 6, notes: [{ row: 3, fret: 9 }] });
});

test('setFret rejects bad targets and values', () => {
  assert.throws(() => setFret(emptyTab(), at(1, 0, 0), 1), RangeError);
  assert.throws(() => setFret(emptyTab(), at(0, 6, 0), 1), RangeError);
  assert.throws(() => setFret(emptyTab(), at(0, 0, -1), 1), RangeError);
  assert.throws(() => setFret(emptyTab(), at(0, 0, 0), 100), RangeError);
});

test('round trip: every row and a spread of frets', () => {
  let text = emptyTab(24);
  const wanted = [];
  for (let row = 0; row < 6; row += 1) {
    const fret = (row * 4) % 20;
    text = setFret(text, at(0, row, row * 3), fret);
    wanted.push({ col: row * 3, row, fret });
  }
  const found = parseTab(text).events.flatMap((e) => e.notes.map((n) => ({ col: e.col, ...n })));
  assert.deepEqual(found, wanted.map((w) => ({ col: w.col, row: w.row, fret: w.fret })));
});

const fretsOf = (text) => parseTab(text).events.flatMap((e) => e.notes.map((n) => [e.col, n.row, n.fret]));

test('an inserted column never splits a two-digit fret on another string', () => {
  // Separating a 5 from the 3 on its left inserts at column 3, where A holds a 12 across columns 2-3.
  let text = setFret(emptyTab(8), at(0, 4, 2), 12);
  text = setFret(text, at(0, 0, 2), 3);
  text = setFret(text, at(0, 0, 3), 5);
  assert.equal(grid(text)[4], 'A|--12-----|');
  assert.deepEqual(fretsOf(text), [[2, 0, 3], [2, 4, 12], [4, 0, 5]]);
  assert.equal(landedCol(text, at(0, 0, 3)), 4);

  // A note written right after another on the same string pushes columns; the 10 on D stays whole.
  text = setFret(emptyTab(8), at(0, 0, 2), 3);
  text = setFret(text, at(0, 3, 3), 10);
  text = setFret(text, at(0, 0, 4), 7);
  text = setFret(text, at(0, 0, 3), 4);
  assert.ok(grid(text)[3].includes('10'));
  assert.deepEqual(fretsOf(text).map(([, row, fret]) => [row, fret]), [[0, 3], [0, 4], [3, 10], [0, 7]]);
});

test('a two-digit fret over another string\'s two-digit fret joins its chord without splitting it', () => {
  // A 12 on B covers columns 2-3 and G has a 3 at column 3, which already sounds with the 12.
  let text = setFret(emptyTab(8), at(0, 1, 2), 12);
  text = text.split('\n').map((l, i) => (i === 2 ? 'G|---3----|' : l)).join('\n');
  text = setFret(text, at(0, 0, 2), 15);
  assert.equal(grid(text)[1], 'B|--12----|');
  assert.deepEqual(fretsOf(text), [[2, 0, 15], [2, 1, 12], [2, 2, 3]]);
});

test('a two-digit fret on a string holding a technique letter splits no other fret', () => {
  let text = 'e|--1h3---|\nB|--12----|\nG|--------|\nD|--------|\nA|--------|\nE|--------|';
  text = setFret(text, at(0, 0, 2), 10);
  assert.equal(grid(text)[0], 'e|--10h3---|');
  assert.equal(grid(text)[1], 'B|--12-----|');
  assert.equal(landedCol(text, at(0, 0, 2)), 2);
});

test('fuzz: setFret keeps every untouched fret whole and lands where landedCol says', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let trial = 0; trial < 300; trial++) {
    let text = emptyTab(10);
    for (let k = 0; k < 8; k++) {
      const row = rand(6);
      const col = rand(10);
      const fret = rand(20);
      const before = fretsOf(text).filter(([, r]) => r !== row).map(([, r, f]) => [r, f]);
      text = setFret(text, at(0, row, col), fret);
      const after = fretsOf(text).map(([, r, f]) => [r, f]);
      before.forEach((note) => assert.ok(after.some((n) => n[0] === note[0] && n[1] === note[1]), `lost ${note} in\n${text}`));
      const landed = landedCol(text, at(0, row, col));
      const body = grid(text)[row].slice(2);
      assert.equal(Number(/^\d+/.exec(body.slice(landed))?.[0]), fret, `fret ${fret} not at ${landed}\n${text}`);
    }
  }
});

test('setFret over the second digit of a two-digit fret moves to the next free column and keeps the fret', () => {
  const base = setFret(emptyTab(8), at(0, 0, 0), 12);
  assert.equal(base.split('\n')[0], 'e|12------|');
  const out = setFret(base, at(0, 0, 1), 3);
  assert.equal(out.split('\n')[0], 'e|12-3----|');
  assert.equal(landedCol(out, at(0, 0, 1)), 3);
  assert.deepEqual(parseTab(out).events.map((e) => e.notes[0].fret), [12, 3]);
});

test('setFret over the second digit with a two-digit fret keeps both and reports where it landed', () => {
  const base = setFret(emptyTab(8), at(0, 0, 1), 10);
  const out = setFret(base, at(0, 0, 2), 14);
  assert.deepEqual(parseTab(out).events.map((e) => e.notes[0].fret), [10, 14]);
  assert.equal(out.split('\n')[0], 'e|-10-14--|');
  assert.equal(landedCol(out, at(0, 0, 2)), 4);
});

// One string of tab, parsed on its own: the notes of row 0 with their techniques.
const row0 = (body) => {
  const pad = '-'.repeat(body.length + 1);
  const lines = [`e|${body}-|`, ...['B', 'G', 'D', 'A', 'E'].map((l) => `${l}|${pad}|`)];
  return parseTab(lines.join('\n')).events.flatMap((e) => e.notes.map(({ row, ...n }) => ({ step: e.step, ...n })));
};

const TECH_TABLE = [
  ['5h7', [{ step: 0, fret: 5 }, { step: 2, fret: 7, tech: { legato: 'h' } }]],
  ['7p5', [{ step: 0, fret: 7 }, { step: 2, fret: 5, tech: { legato: 'p' } }]],
  ['5h7p5', [{ step: 0, fret: 5 }, { step: 2, fret: 7, tech: { legato: 'h' } }, { step: 4, fret: 5, tech: { legato: 'p' } }]],
  ['5/7', [{ step: 0, fret: 5 }, { step: 2, fret: 7, tech: { legato: '/' } }]],
  ['7\\5', [{ step: 0, fret: 7 }, { step: 2, fret: 5, tech: { legato: '\\' } }]],
  ['-/7', [{ step: 2, fret: 7, tech: { slideIn: 'up' } }]],
  ['-\\7', [{ step: 2, fret: 7, tech: { slideIn: 'down' } }]],
  ['7\\--', [{ step: 0, fret: 7, tech: { slideOut: 'down' } }]],
  ['7/--', [{ step: 0, fret: 7, tech: { slideOut: 'up' } }]],
  ['7b', [{ step: 0, fret: 7, tech: { bend: { semitones: 2 } } }]],
  ['7b9', [{ step: 0, fret: 7, tech: { bend: { semitones: 2 } } }]],
  ['12b14', [{ step: 0, fret: 12, tech: { bend: { semitones: 2 } } }]],
  ['7b10', [{ step: 0, fret: 7, tech: { bend: { semitones: 3 } } }]],
  ['7b9r7', [{ step: 0, fret: 7, tech: { bend: { semitones: 2, releaseStep: 3 } } }]],
  ['7b(9)', [{ step: 0, fret: 7, tech: { bend: { semitones: 2 } } }]],
  ['7b(10)r(7)', [{ step: 0, fret: 7, tech: { bend: { semitones: 3, releaseStep: 6 } } }]],
  ['7~~', [{ step: 0, fret: 7, tech: { vibrato: true } }]],
  ['x-x', [{ step: 0, fret: null, tech: { muted: true } }, { step: 2, fret: null, tech: { muted: true } }]],
  ['<12>', [{ step: 1, fret: 12, tech: { harmonic: true } }]],
  ['(7)', [{ step: 1, fret: 7, tech: { ghost: true } }]],
  ['-b9--', [{ step: 2, fret: 9 }]],
  ['h7', [{ step: 1, fret: 7 }]],
  ['r7', [{ step: 1, fret: 7 }]],
  ['~7', [{ step: 1, fret: 7 }]],
];

for (const [body, expected] of TECH_TABLE) {
  test(`technique snippet ${body}`, () => {
    assert.deepEqual(row0(body), expected);
  });
}

test('a bend or release target is never a note, however it is written', () => {
  for (const body of ['7b9', '7b(9)', '7b9r7', '7b9r(7)', '12b14r12']) {
    assert.equal(row0(body).length, 1, body);
  }
});

test('harmonics: the table, and other values are skipped and counted', () => {
  assert.deepEqual(HARMONIC_SEMITONES, { 12: 12, 7: 19, 19: 19, 5: 24, 4: 28, 9: 28 });
  const tab = parseTab('e|<12>-<3>-<5>|\nB|-----------|\nG|-----------|\nD|-----------|\nA|-----------|\nE|-----------|');
  assert.equal(tab.skipped, 1);
  assert.deepEqual(tab.events.map((e) => e.notes[0].fret), [12, 5]);
});

test('lexLine tokens', () => {
  assert.deepEqual(lexLine('5h<7>(3)x'), [
    { type: 'num', n: 5, kind: 'plain', from: 0, start: 0, end: 0 },
    { type: 'sym', ch: 'h', from: 1 },
    { type: 'num', n: 7, kind: 'harmonic', from: 2, start: 3, end: 3 },
    { type: 'num', n: 3, kind: 'ghost', from: 5, start: 6, end: 6 },
    { type: 'x', from: 8, start: 8, end: 8 },
  ]);
});

test('a PM line above a block marks the notes in its columns', () => {
  const tab = parseTab([
    'PM--',
    'e|5---5---|',
    'B|--------|',
    'G|--------|',
    'D|--------|',
    'A|--------|',
    'E|--------|',
  ].join('\n'));
  assert.deepEqual(tab.events.map((e) => e.notes[0].tech), [{ palmMute: true }, undefined]);
});

test('a PM line columns follow the block body, not the line start', () => {
  const tab = parseTab([
    '  PM--',
    'e|5---5-|',
    'B|-----|',
    'G|-----|',
    'D|-----|',
    'A|-----|',
    'E|-----|',
  ].join('\n'));
  assert.deepEqual(tab.events.map((e) => e.notes[0].tech), [{ palmMute: true }, undefined]);
});

// The real tabs live beside the repo, not in it (they are third-party transcriptions), so a fresh clone skips these.
const TABS = new URL('../../tabs/', import.meta.url);
const realTest = (name, fn) => test(name, { skip: !existsSync(TABS) && 'no ../tabs folder' }, fn);
const real = (name) => parseTab(readFileSync(new URL(name, TABS), 'utf8'));
const techs = (tab) => tab.events.flatMap((e) => e.notes.map((n) => n.tech).filter(Boolean));

test('text after the closing bar is an annotation: the line stays tab and setFret keeps the text', () => {
  const lines = emptyTab(6).split('\n');
  lines[2] = `${lines[2]} (3x)`;
  lines[3] = `${lines[3]}      x2`;
  const text = lines.join('\n');
  const tab = parseTab(text);
  assert.equal(tab.blocks.length, 1);
  assert.equal(tab.blocks[0].width, 6);
  const next = setFret(text, { block: 0, row: 2, col: 1 }, 5);
  assert.equal(next.split('\n')[2], 'G|-5----| (3x)');
  assert.equal(next.split('\n')[3], 'D|------|      x2');
  assert.deepEqual(parseTab(next).events.map((e) => e.notes), [[{ row: 2, fret: 5 }]]);
});

test('an annotation needs a closing bar and pure tab before it, so lyrics and chord charts stay out', () => {
  const block = (third) => {
    const lines = emptyTab(4).split('\n');
    lines[2] = third;
    return parseTab(lines.join('\n')).blocks.length;
  };
  assert.equal(block('G|--5- (3x)'), 0);
  assert.equal(block('| Em - Am |  x2'), 0);
  assert.equal(block('G|-5 Hold me close |'), 0);
});

const REAL_COUNTS = {
  'here-without-you.txt': { blocks: 6, events: 80 },
  'nothing-else-matters.txt': { blocks: 17, events: 153 },
  'techniques-test.txt': { blocks: 8, events: 38 },
  'wish-you-were-here.txt': { blocks: 13, events: 96 },
};

realTest('every real tab parses into one block per six tab lines, "(3x)" lines included', () => {
  for (const [f, want] of Object.entries(REAL_COUNTS)) {
    const tab = real(f);
    assert.deepEqual({ blocks: tab.blocks.length, events: tab.events.length }, want, f);
  }
});

realTest('every real tab in tabs/ parses without throwing', () => {
  const files = readdirSync(TABS).filter((f) => f.endsWith('.txt'));
  assert.ok(files.length >= 4);
  for (const f of files) assert.ok(real(f).events.length > 0, f);
});

realTest('here-without-you: 1h4 is a hammer-on, trailing "| " is ignored', () => {
  const tab = real('here-without-you.txt');
  assert.equal(tab.tempo, 72);
  assert.ok(techs(tab).some((t) => t.legato === 'h'));
  assert.equal(techs(tab).filter((t) => t.bend).length, 0);
});

realTest('wish-you-were-here and nothing-else-matters carry hammer-ons, pull-offs and slides', () => {
  for (const f of ['wish-you-were-here.txt', 'nothing-else-matters.txt']) {
    const t = techs(real(f));
    assert.ok(t.some((x) => x.legato === 'h'), f);
    assert.ok(t.some((x) => x.legato === 'p'), f);
  }
  assert.ok(techs(real('wish-you-were-here.txt')).some((x) => x.legato === '/' || x.legato === '\\'));
  assert.ok(techs(real('nothing-else-matters.txt')).some((x) => x.legato === '\\'));
});

realTest('techniques-test.txt covers every technique and no bend target sounds', () => {
  const tab = real('techniques-test.txt');
  assert.equal(tab.tempo, 80);
  assert.equal(tab.skipped, 0);
  const t = techs(tab);
  for (const key of ['legato', 'bend', 'vibrato', 'muted', 'harmonic', 'ghost']) {
    assert.ok(t.some((x) => key in x), key);
  }
  assert.deepEqual([...new Set(t.filter((x) => x.legato).map((x) => x.legato))].sort(), ['/', '\\', 'h', 'p']);
  const bends = t.filter((x) => x.bend).map((x) => x.bend);
  assert.deepEqual(bends.map((b) => b.semitones), [2, 2, 2]);
  assert.equal(bends.filter((b) => b.releaseStep !== undefined).length, 1);
  // The bend line B|-8b10---8b10r8---8b----|: only 8, 8 and 8 are notes, never 10 or the released 8.
  const bendBlock = tab.events.filter((e) => e.block === 3).flatMap((e) => e.notes);
  assert.deepEqual(bendBlock.map((n) => n.fret), [8, 8, 8]);
});

test('a hammer-on cannot reach across a block boundary: the first note of the next block is plucked', () => {
  const block = (g) => ['e|----|', 'B|----|', g, 'D|----|', 'A|----|', 'E|----|'].join('\n');
  const tab = parseTab(`${block('G|--5h|')}\n\n${block('G|h7--|')}`);
  assert.deepEqual(tab.events.map((e) => e.notes), [[{ row: 2, fret: 5 }], [{ row: 2, fret: 7 }]]);
});
