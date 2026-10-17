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
