import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockOffsets, caretCell, cellOffset, clearDocument, clearedText, cueAfterRun, cueStep, gridCueStep, lineStarts,
  startStep, statusFor, stepLookup, stepToCell, takeDue,
} from '../src/tab-panel.js';
import { parseTab, emptyTab } from '../src/tab.js';
import { planNotes } from '../src/scheduler.js';

const song = ['Am', 'la la', ...emptyTab(4).split('\n'), '', ...emptyTab(4).split('\n')].join('\n');
const parsed = parseTab(song);
const starts = lineStarts(song);

test('lineStarts lists the offset of every line', () => {
  assert.deepEqual(lineStarts('ab\n\nc'), [0, 3, 4]);
});

test('the song fixture has two blocks on lines 2-7 and 9-14', () => {
  assert.deepEqual(parsed.blocks.map((b) => b.lines[0]), [2, 9]);
});

test('a caret on the third column of the B line of block 0 maps to row 1, col 2', () => {
  const caret = starts[3] + parsed.blocks[0].bodyStart[1] + 2;
  assert.deepEqual(caretCell(parsed, song, caret), { block: 0, row: 1, col: 2, inside: true });
});

test('a caret on the row label maps to column 0', () => {
  assert.equal(caretCell(parsed, song, starts[4]).col, 0);
});

test('a caret past the closing bar clamps to the last of the 4 columns', () => {
  assert.equal(caretCell(parsed, song, starts[2] + 6).col, 3);
});

test('a caret in the second block maps to block 1', () => {
  assert.equal(caretCell(parsed, song, starts[12] + 3).block, 1);
});

test('a caret on a lyric line falls back to column 0 of the first block', () => {
  assert.deepEqual(caretCell(parsed, song, 1), { block: 0, row: 0, col: 0, inside: false });
});

test('a caret on the blank line between blocks falls back to the block above', () => {
  assert.equal(caretCell(parsed, song, starts[8]).block, 0);
});

test('a text with no tab has no cell', () => {
  assert.equal(caretCell(parseTab('hello'), 'hello', 2), null);
});

test('cellOffset is the inverse of caretCell inside a block', () => {
  const cell = { block: 1, row: 4, col: 2 };
  const offset = cellOffset(parsed, song, cell);
  assert.deepEqual(caretCell(parsed, song, offset), { ...cell, inside: true });
});

test('statusFor is empty when there is something to play', () => {
  assert.equal(statusFor(parseTab('e|-3-|\nB|---|\nG|---|\nD|---|\nA|---|\nE|---|')), '');
});

test('statusFor explains an empty tab', () => {
  assert.equal(statusFor(parseTab(emptyTab(4))), 'Nothing to play yet.');
});

test('statusFor counts notes above fret 19', () => {
  const text = ['e|-25-|', 'B|----|', 'G|----|', 'D|----|', 'A|----|', 'E|-30-|'].join('\n');
  assert.equal(statusFor(parseTab(text)), 'Nothing to play yet. 2 notes above fret 19 skipped');
});

test('stepLookup maps a spec time back to its event, anchored on the first spec due', () => {
  const events = [{ step: 0 }, { step: 2 }, { step: 3 }, { step: 8 }];
  const lookup = stepLookup(events, 60);
  assert.equal(lookup.eventFor(100.05), events[0]);
  assert.equal(lookup.eventFor(100.05 + 0.5), events[1]);
  assert.equal(lookup.eventFor(100.05 + 0.75), events[2]);
  assert.equal(lookup.eventFor(100.05 + 2.0), events[3]);
  assert.equal(lookup.eventFor(100.05 + 0.25), null);
});

test('stepLookup on a tab with no events finds nothing', () => {
  assert.equal(stepLookup([], 80).eventFor(5), null);
});

test('takeDue hands over the specs due by now, in order, keeps the rest and moves the playhead', () => {
  const specs = [{ when: 1, row: 0 }, { when: 1, row: 1 }, { when: 1.25, row: 0 }, { when: 2, row: 0 }];
  const events = new Map([[1, 'e0'], [1.25, 'e1'], [2, 'e2']]);
  const eventFor = (when) => events.get(when) ?? null;
  const first = takeDue(specs, 1.3, eventFor, null);
  assert.deepEqual(first.due, specs.slice(0, 3));
  assert.deepEqual(first.rest, specs.slice(3));
  assert.equal(first.playhead, 'e1');
  const idle = takeDue(first.rest, 1.9, eventFor, 'e1');
  assert.deepEqual(idle, { due: [], rest: specs.slice(3), playhead: 'e1' });
  assert.deepEqual(takeDue(idle.rest, 5, eventFor, 'e1'), { due: specs.slice(3), rest: [], playhead: 'e2' });
});

test('takeDue keeps the shown event when a due spec maps to none', () => {
  assert.equal(takeDue([{ when: 1 }], 2, () => null, 'e0').playhead, 'e0');
});

test('takeDue with stepLookup: the panel loop on real specs from the scheduler', () => {
  const tab = parseTab(['e|-0h2-|', 'B|-1---|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|-----|'].join('\n'));
  const lookup = stepLookup(tab.events, 60);
  const specs = planNotes(tab.events, 60 / (60 * 4)).map((spec) => ({ ...spec, when: spec.when + 10 }));
  assert.deepEqual(specs.map((spec) => [spec.when, spec.kind]), [[10.25, 'pluck'], [10.25, 'pluck'], [10.75, 'legato']]);
  const r = takeDue(specs, 10.8, lookup.eventFor, null);
  assert.equal(r.due.length, 3);
  assert.equal(r.playhead, tab.events[1]);
});

const withLyrics = ['intro', ...emptyTab(4).split('\n'), 'verse line', '', 'chorus', ...emptyTab(6).split('\n'), 'outro'].join('\n');
const lyricParsed = parseTab(withLyrics);
const lyricStarts = lineStarts(withLyrics);

test('blockOffsets accumulates block widths', () => {
  assert.deepEqual(blockOffsets(lyricParsed), [0, 4]);
});

test('cueStep inside a block is block offset plus column', () => {
  assert.equal(cueStep(lyricParsed, withLyrics, lyricStarts[12] + lyricParsed.blocks[1].bodyStart[0] + 3), 4 + 3);
});

test('cueStep on a lyric line between blocks is the start of the next block', () => {
  assert.equal(cueStep(lyricParsed, withLyrics, lyricStarts[7] + 2), 4);
  assert.equal(cueStep(lyricParsed, withLyrics, lyricStarts[8]), 4);
  assert.equal(cueStep(lyricParsed, withLyrics, lyricStarts[9] + 1), 4);
});

test('cueStep before every block is step 0, and so is a caret after the last block', () => {
  assert.equal(cueStep(lyricParsed, withLyrics, 2), 0);
  assert.equal(cueStep(lyricParsed, withLyrics, withLyrics.length), 0);
});

test('cueStep with no tab at all is step 0', () => {
  assert.equal(cueStep(parseTab('hello'), 'hello', 3), 0);
});

test('gridCueStep adds the block offset', () => {
  assert.equal(gridCueStep(lyricParsed, { block: 1, row: 2, col: 5 }), 9);
});

test('stepToCell inverts blockOffsets and clamps', () => {
  assert.deepEqual(stepToCell(lyricParsed, 0), { block: 0, col: 0 });
  assert.deepEqual(stepToCell(lyricParsed, 3), { block: 0, col: 3 });
  assert.deepEqual(stepToCell(lyricParsed, 4), { block: 1, col: 0 });
  assert.deepEqual(stepToCell(lyricParsed, 99), { block: 1, col: 5 });
  assert.equal(stepToCell(parseTab('hello'), 0), null);
});

test('startStep keeps a cue that has notes at or after it and rewinds one that has none', () => {
  const p = parseTab('e|-3---5-|\nB|--------|\nG|--------|\nD|--------|\nA|--------|\nE|--------|');
  assert.deepEqual(p.events.map((e) => e.step), [1, 5]);
  assert.equal(startStep(p, 5), 5);
  assert.equal(startStep(p, 6), 0);
});

test('cueAfterRun keeps the stopped step, leaves the cue alone before any note, and rewinds at the end', () => {
  assert.equal(cueAfterRun('stop', { step: 12 }), 12);
  assert.equal(cueAfterRun('stop', null), null);
  assert.equal(cueAfterRun('end', { step: 12 }), 0);
});

test('a stop step maps back to the caret offset of its column', () => {
  const cell = stepToCell(lyricParsed, 6);
  const offset = cellOffset(lyricParsed, withLyrics, { ...cell, row: 0 });
  assert.equal(cueStep(lyricParsed, withLyrics, offset), 6);
});

test('clearDocument keeps the tempo line, and returns the previous text for Undo', () => {
  const text = `Tempo: 120\n${emptyTab(4)}\nTempo: 90`;
  const result = clearDocument(text);
  assert.equal(result.text, `Tempo: 120\n${emptyTab()}`);
  assert.equal(result.previous, text);
  assert.equal(parseTab(result.text).tempo, 120);
});

test('clearDocument without a tempo line writes none', () => {
  assert.equal(clearDocument(`${emptyTab(4)}\nla la`).text, emptyTab());
});

test('clearDocument is null for a document that is already an empty tab', () => {
  assert.equal(clearDocument(emptyTab()), null);
  assert.equal(clearDocument(clearedText('Tempo: 100\ne|-3-|')), null);
});
