import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImported, exportFile, readImportedFile, fileBase, missingFields } from '../src/files.js';
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
const STAMP = '2026-10-16_180509';
const bytes = (s) => new TextEncoder().encode(s).length;

test('fileBase: title - artist plus a local timestamp', () => {
  assert.equal(fileBase({ title: 'Wish You Were Here', artist: 'Pink Floyd' }, D), `Wish You Were Here - Pink Floyd ${STAMP}`);
});

test('fileBase keeps accents and gives NFC from NFC and NFD input', () => {
  const nfc = fileBase({ title: 'Canção', artist: 'X' }, D);
  assert.equal(fileBase({ title: 'Canção', artist: 'X' }, D), nfc);
  assert.equal(nfc, `Canção - X ${STAMP}`);
});

test('fileBase replaces reserved runs with one space and trims spaces and dots', () => {
  assert.equal(fileBase({ title: 'AC/DC: Live?', artist: '' }, D), `AC DC Live ${STAMP}`);
  assert.equal(fileBase({ title: '..x..', artist: ' . ' }, D), `x ${STAMP}`);
  assert.equal(fileBase({ title: 'CON', artist: 'NUL' }, D), `CON - NUL ${STAMP}`);
  assert.equal(fileBase({ title: 'a‮b\u0001c', artist: '' }, D), `a b c ${STAMP}`);
});

test('fileBase: empty title is Untitled, missing artist is left out', () => {
  assert.equal(fileBase({ title: '', artist: 'Band' }, D), `Untitled - Band ${STAMP}`);
  assert.equal(fileBase({ title: '???', artist: '' }, D), `Untitled ${STAMP}`);
  assert.equal(fileBase({}, D), `Untitled ${STAMP}`);
  assert.equal(fileBase({ title: 'Song' }, D), `Song ${STAMP}`);
});

test('fileBase cuts long multibyte names on a code point boundary under 255 bytes', () => {
  for (const ch of ['ã', '日', '😀']) {
    const name = `${fileBase({ title: ch.repeat(300), artist: ch.repeat(300) }, D)}.txt`;
    assert.ok(bytes(name) <= 255, `${ch}: ${bytes(name)}`);
    assert.ok(!name.includes('�'));
    assert.equal(name, name.normalize('NFC'));
    assert.ok(name.endsWith(` ${STAMP}.txt`));
  }
});

test('missingFields lists title and artist and words the message', () => {
  assert.deepEqual(missingFields({ title: 'a', artist: 'b' }), { fields: [], message: '' });
  assert.deepEqual(missingFields({ title: '', artist: '' }), { fields: ['title', 'artist'], message: "Add the song's title and artist" });
  assert.deepEqual(missingFields({ title: 'a', artist: ' ' }), { fields: ['artist'], message: "Add the song's artist" });
  assert.deepEqual(missingFields({ artist: 'b' }), { fields: ['title'], message: "Add the song's title" });
});
