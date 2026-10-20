import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../songs/index.js';
import { createExamplesFlow, loadExampleText } from '../src/examples.js';
import { DEFAULT_GROUP, groupSongs } from '../src/examples-dialog.js';
import { parseTab, readMeta } from '../src/tab.js';
import { noteAt } from '../src/pitch.js';

test('every index entry has an id, a title, an artist, a note and a module, and an arranger only when it is someone else', () => {
  assert.ok(SONGS.length >= 2);
  SONGS.forEach((song) => {
    ['id', 'title', 'artist', 'note', 'module'].forEach((key) => {
      assert.equal(typeof song[key], 'string', `${song.id} ${key}`);
      assert.notEqual(song[key].trim(), '', `${song.id} ${key}`);
    });
    if ('arranger' in song) {
      assert.notEqual(song.arranger.trim(), '', song.id);
      assert.notEqual(song.arranger, song.artist, song.id);
    }
  });
});

test('ids are unique', () => {
  assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length);
});

test('every entry loads through the same dynamic import the page uses, with non-empty text and its header lines', async () => {
  for (const song of SONGS) {
    const text = await loadExampleText(song, (path) => import(new URL(path, new URL('../src/examples.js', import.meta.url)).href));
    assert.ok(text.trim().length > 0, song.id);
    const meta = readMeta(text);
    assert.equal(meta.title, song.title, song.id);
    assert.equal(meta.artist, song.artist, song.id);
    assert.equal(meta.arranger, song.arranger ?? '', song.id);
    assert.ok(parseTab(text).events.length > 0, `${song.id} has notes`);
  }
});

test('loadExampleText rejects a module without text', async () => {
  await assert.rejects(loadExampleText({ id: 'x', module: 'x.js' }, async () => ({ default: '  ' })));
  await assert.rejects(loadExampleText({ id: 'x', module: 'x.js' }, async () => ({})));
});

test('loadExampleText resolves the module next to the index, under songs/', async () => {
  const seen = [];
  await loadExampleText({ id: 'x', module: 'x.js' }, async (path) => { seen.push(path); return { default: 'ok' }; });
  assert.deepEqual(seen, ['../songs/x.js']);
});

const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7] };

const parseChord = (name) => {
  const [, letter, accidental, quality] = /^([A-G])([#b]?)(.*)$/.exec(name);
  return { root: (ROOTS[letter] + ({ '#': 1, b: -1 }[accidental] ?? 0) + 12) % 12, quality };
};

// The pitch classes a chord name spells, from music theory rather than from the tab.
const spell = (name) => {
  const { root, quality } = parseChord(name);
  return QUALITIES[quality].map((i) => (root + i) % 12).sort((x, y) => x - y);
};

// Open shapes may leave out the fifth (C7 is x32310), as guitarists commonly do; nothing else may go.
test('every chord shape strums the notes its name spells, at most without the fifth', async () => {
  const song = SONGS.find((s) => s.id === 'guitar-chords');
  const text = (await import(new URL(`../songs/${song.module}`, import.meta.url).href)).default;
  const shapes = text.slice(0, text.indexOf('Now the chords at work'));
  const names = shapes.split('\n').filter((line) => /^ {2}[A-G]/.test(line)).flatMap((line) => line.trim().split(/\s+/));
  assert.equal(names.length, 31);
  const parsed = parseTab(text);
  assert.equal(parsed.skipped, 0);
  const strums = parsed.events.filter((e) => e.notes.length >= 3).slice(0, names.length);
  strums.forEach((event, i) => {
    const classes = [...new Set(event.notes.map((n) => noteAt(5 - n.row, n.fret) % 12))].sort((a, b) => a - b);
    const spelled = spell(names[i]);
    const fifth = (parseChord(names[i]).root + 7) % 12;
    assert.ok(classes.every((c) => spelled.includes(c)), `${names[i]} plays ${classes}`);
    assert.deepEqual(spelled.filter((c) => !classes.includes(c) && c !== fifth), [], names[i]);
  });
});

const ARRANGEMENTS = [
  // One bar per block, so bar lines cost no time. No. 1 turns to 6/4 for its last three bars;
  // Nos. 2 and 3 and the Rondo use a column per 32nd note at twice the tempo. The Rondo opens
  // with a quarter-note pickup.
  { id: 'minueto-op1-1', tempo: 180, widths: [...Array(40).fill(16), 24, 24, 24], opening: [[0, 68], [2, 66], [4, 64]] },
  { id: 'minueto-op1-2', tempo: 200, widths: Array(33).fill(32), opening: [[0, 46], [4, 48], [6, 50], [8, 51]] },
  { id: 'minueto-op1-3', tempo: 200, widths: Array(41).fill(32), opening: [[0, 67], [16, 64], [28, 67]] },
  { id: 'rondo-alla-turca', tempo: 240, widths: [8, ...Array(127).fill(16)], opening: [[0, 59], [2, 57], [4, 56], [6, 57], [8, 60]] },
];

const loadSong = async (id) => {
  const song = SONGS.find((s) => s.id === id);
  return parseTab((await import(new URL(`../songs/${song.module}`, import.meta.url).href)).default);
};

for (const { id, tempo, widths, opening } of ARRANGEMENTS) {
  test(`${id} keeps its meter, opens with the melody and fits one hand`, async () => {
    const parsed = await loadSong(id);
    assert.equal(parsed.tempo, tempo);
    assert.equal(parsed.skipped, 0);
    assert.deepEqual(parsed.blocks.map((b) => b.width), widths);
    const pitches = new Map(parsed.events.map((e) => [e.step, e.notes.map((n) => noteAt(5 - n.row, n.fret))]));
    opening.forEach(([step, midi]) => assert.ok(pitches.get(step)?.includes(midi), `step ${step}`));
    parsed.events.forEach((event) => {
      const frets = event.notes.map((n) => n.fret).filter((f) => f > 0);
      if (!frets.length) return;
      const low = Math.min(...frets);
      assert.ok(Math.max(...frets) - low <= (low >= 5 ? 4 : 3), `step ${event.step}: ${frets}`);
      assert.ok(Math.max(...frets) <= 15, `step ${event.step}: ${frets}`);
    });
  });
}

const harness = ({ load = async () => 'TEXT' } = {}) => {
  const log = [];
  const flow = createExamplesFlow({
    show: () => log.push('show'),
    load,
    apply: (text) => log.push(`apply ${text}`),
    start: () => log.push('start'),
    fail: () => log.push('fail'),
  });
  return { flow, log };
};

test('the Examples button opens the list and a pick loads without playing', async () => {
  const { flow, log } = harness();
  flow.openFromButton();
  await flow.pick({ id: 'a' });
  assert.deepEqual(log, ['show', 'apply TEXT']);
});

test('the list opened by Play loads the pick and starts playback', async () => {
  const { flow, log } = harness();
  flow.openFromPlay();
  await flow.pick({ id: 'a' });
  assert.deepEqual(log, ['show', 'apply TEXT', 'start']);
});

test('opening from the button after Play goes back to not playing', async () => {
  const { flow, log } = harness();
  flow.openFromPlay();
  flow.openFromButton();
  await flow.pick({ id: 'a' });
  assert.deepEqual(log, ['show', 'show', 'apply TEXT']);
});

test('a failed load reports it and neither applies nor plays', async () => {
  const { flow, log } = harness({ load: async () => { throw new Error('no'); } });
  flow.openFromPlay();
  await flow.pick({ id: 'a' });
  assert.deepEqual(log, ['show', 'fail']);
});

test('the dialog groups songs, sorts each group by title and orders groups by their first title', () => {
  const songs = [
    { title: 'Zebra' }, { title: 'No. 10', group: 'Set' }, { title: 'apple' }, { title: 'No. 2', group: 'Set' },
  ];
  assert.deepEqual(groupSongs(songs).map(({ name, songs: s }) => [name, s.map((x) => x.title)]), [
    [DEFAULT_GROUP, ['apple', 'Zebra']],
    ['Set', ['No. 2', 'No. 10']],
  ]);
});

test('the shipped examples read Guitar chords first, then the other examples, then the minuets', () => {
  const groups = groupSongs(SONGS);
  assert.deepEqual(groups.map((g) => g.name), [DEFAULT_GROUP, 'Minuetos']);
  assert.equal(groups[0].songs[0].id, 'guitar-chords');
  assert.deepEqual(groups[1].songs.map((s) => s.id), ['minueto-op1-1', 'minueto-op1-2', 'minueto-op1-3']);
  SONGS.filter((s) => s.arranger).forEach((s) => assert.equal(s.arranger, 'Guitar Simulator AI Team', s.id));
});
