import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImported, exportFile, readImportedFile } from '../src/files.js';
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
