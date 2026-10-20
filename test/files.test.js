import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImported, exportFile, readImportedFile, fileBase, slug, missingFields, looksBinary, ImportError } from '../src/files.js';
import { MAX_BYTES } from '../src/storage.js';

test('normalizeImported strips a BOM and converts CRLF and lone CR to LF', () => {
  assert.equal(normalizeImported('﻿a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(normalizeImported('a﻿b'), 'a﻿b');
});

test('readImportedFile rejects files over 256 KB with a clear message', async () => {
  await assert.rejects(
    readImportedFile({ size: MAX_BYTES + 1, text: async () => 'x' }),
    /257 KB; the limit is 256 KB/,
  );
});

test('readImportedFile returns normalized text', async () => {
  const text = await readImportedFile({ size: 10, text: async () => '﻿e|--|\r\n' });
  assert.equal(text, 'e|--|\n');
});

test('exportFile downloads through a temporary link and revokes the URL', async () => {
  const calls = [];
  const a = { click: () => calls.push(['click', a.href, a.download]), remove: () => calls.push(['remove']) };
  const doc = {
    createElement: (tag) => { calls.push(['create', tag]); return a; },
    body: { appendChild: (n) => calls.push(['append', n === a]) },
  };
  let blob;
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
  URL.revokeObjectURL = (u) => calls.push(['revoke', u]);
  try {
    exportFile('hello', 'song.txt', doc);
    await new Promise((r) => setTimeout(r, 5));
  } finally {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  }
  assert.equal(blob.type, 'text/plain;charset=utf-8');
  assert.equal(await blob.text(), 'hello');
  assert.deepEqual(calls, [
    ['create', 'a'], ['append', true], ['click', 'blob:test', 'song.txt'], ['remove'], ['revoke', 'blob:test'],
  ]);
});

test('exportFile defaults the name to tab.txt', () => {
  const a = { click() {}, remove() {} };
  const doc = { createElement: () => a, body: { appendChild() {} } };
  const real = [URL.createObjectURL, URL.revokeObjectURL];
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  try { exportFile('t', undefined, doc); } finally { [URL.createObjectURL, URL.revokeObjectURL] = real; }
  assert.equal(a.download, 'tab.txt');
});

const D = new Date(2026, 9, 16, 18, 5, 9);
const STAMP = '20261016-180509';

test('fileBase: title_artist_stamp in lowercase ASCII', () => {
  assert.equal(fileBase({ title: 'Wish You Were Here', artist: 'Pink Floyd' }, D), `wish-you-were-here_pink-floyd_${STAMP}`);
});

test('slug drops accents from NFC and NFD input alike and folds letters that do not decompose', () => {
  assert.equal(slug('Canção'), 'cancao');
  assert.equal(slug('Canção'.normalize('NFD')), 'cancao');
  assert.equal(slug('Straße Øresund Łódź Ærø'), 'strasse-oresund-lodz-aero');
  assert.equal(slug('Mötley Crüe'), 'motley-crue');
});

test('slug turns every run of other characters into one hyphen and trims them', () => {
  assert.equal(slug('AC/DC: Live?'), 'ac-dc-live');
  assert.equal(slug('..x..'), 'x');
  assert.equal(slug('  Nothing   Else -- Matters!  '), 'nothing-else-matters');
  assert.equal(slug('a\u202eb\u0001c'), 'a-b-c');
  assert.equal(slug('Rock & Roll (Live) #2'), 'rock-roll-live-2');
});

test('fileBase: empty or non-Latin title is untitled, missing artist is left out', () => {
  assert.equal(fileBase({ title: '', artist: 'Band' }, D), `untitled_band_${STAMP}`);
  assert.equal(fileBase({ title: '???', artist: '' }, D), `untitled_${STAMP}`);
  assert.equal(fileBase({}, D), `untitled_${STAMP}`);
  assert.equal(fileBase({ title: 'Song' }, D), `song_${STAMP}`);
  assert.equal(fileBase({ title: '日本の歌', artist: 'X' }, D), `untitled_x_${STAMP}`);
});

test('fileBase stays short and safe on every file system', () => {
  const name = `${fileBase({ title: 'á'.repeat(300), artist: 'b'.repeat(300) }, D)}.txt`;
  assert.ok(name.length <= 200, String(name.length));
  assert.match(name, /^[a-z0-9_-]+\.txt$/);
  assert.ok(!/-_|_-|--/.test(name));
});

test('missingFields lists the missing title and artist', () => {
  assert.deepEqual(missingFields({ title: 'a', artist: 'b' }), { fields: [] });
  assert.deepEqual(missingFields({ title: '', artist: '' }), { fields: ['title', 'artist'] });
  assert.deepEqual(missingFields({ title: 'a', artist: ' ' }), { fields: ['artist'] });
  assert.deepEqual(missingFields({ artist: 'b' }), { fields: ['title'] });
});

test('looksBinary flags NUL bytes and files full of control characters, not a tab with a stray one', () => {
  assert.equal(looksBinary('Title: Canção\ne|-0-|\n'), false);
  assert.equal(looksBinary(`${'e|-0-|\n'.repeat(50)}\u0007`), false);
  assert.equal(looksBinary('e|-0-|\u0000'), true);
  assert.equal(looksBinary(String.fromCharCode(...Array.from({ length: 200 }, (_, i) => i % 32))), true);
  assert.equal(looksBinary('\uFFFD'.repeat(10) + 'abc'), true);
});

test('readImportedFile refuses a binary file with a message meant for the person opening it', async () => {
  const file = { size: 10, text: async () => '\u0000\u0001\u0002PK' };
  await assert.rejects(readImportedFile(file), (error) => error instanceof ImportError && /not a text file/.test(error.message));
  const big = { size: 300 * 1024, text: async () => '' };
  await assert.rejects(readImportedFile(big), (error) => error instanceof ImportError && /limit is 256 KB/.test(error.message));
});
