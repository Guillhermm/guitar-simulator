import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../songs/index.js';
import { createExamplesFlow, loadExampleText } from '../src/examples.js';
import { parseTab, readMeta } from '../src/tab.js';
import { noteAt } from '../src/pitch.js';

test('every index entry has an id, a title, an artist, an arranger, a note and a module', () => {
  assert.ok(SONGS.length >= 2);
  SONGS.forEach((song) => {
    ['id', 'title', 'artist', 'arranger', 'note', 'module'].forEach((key) => {
      assert.equal(typeof song[key], 'string', `${song.id} ${key}`);
      assert.notEqual(song[key].trim(), '', `${song.id} ${key}`);
    });
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
    assert.equal(meta.arranger, song.arranger, song.id);
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

test('Ode to Joy plays E E F G G F E D C C D E E D D', async () => {
  const song = SONGS.find((s) => s.id === 'ode-to-joy');
  const text = (await import(new URL(`../songs/${song.module}`, import.meta.url).href)).default;
  const parsed = parseTab(text);
  assert.equal(parsed.tempo, 100);
  const names = 'E E F G G F E D C C D E E D D'.split(' ');
  const midi = { C: 60, D: 62, E: 64, F: 65, G: 67 };
  const played = parsed.events.map((event) => {
    assert.equal(event.notes.length, 1);
    const { row, fret } = event.notes[0];
    return noteAt(5 - row, fret);
  });
  assert.deepEqual(played, names.map((n) => midi[n]));
});

const MINUETS = [
  // One bar per block, so bar lines cost no time. No. 1 turns to 6/4 for its last three bars;
  // Nos. 2 and 3 use a column per 32nd note at twice the tempo.
  { id: 'minueto-op1-1', tempo: 180, widths: [...Array(40).fill(16), 24, 24, 24], opening: [[0, 68], [2, 66], [4, 64]] },
  { id: 'minueto-op1-2', tempo: 200, widths: Array(33).fill(32), opening: [[0, 46], [4, 48], [6, 50], [8, 51]] },
  { id: 'minueto-op1-3', tempo: 200, widths: Array(41).fill(32), opening: [[0, 67], [16, 64], [28, 67]] },
];

const loadSong = async (id) => {
  const song = SONGS.find((s) => s.id === id);
  return parseTab((await import(new URL(`../songs/${song.module}`, import.meta.url).href)).default);
};

for (const { id, tempo, widths, opening } of MINUETS) {
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
