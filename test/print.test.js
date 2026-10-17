import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { printModel, buildPrintView, installPrint, printTab } from '../src/print.js';

const TABS = new URL('../../tabs/', import.meta.url);
const SIX = ['e|--0--|', 'B|--1--|', 'G|--0--|', 'D|--2--|', 'A|--3--|', 'E|-----|'];
const sample = [
  'Title: Test Song',
  'Artist: Someone',
  'Arranged by: Me',
  'Tempo: 90',
  '',
  '[Intro]',
  '   Am      G',
  ...SIX,
  '',
  'PM---------',
  ...SIX.map((l) => `${l}  (2x)`),
  'Some lyrics here',
  '',
  'Title: Second',
  'Tempo: 60',
].join('\n');

test('printModel reads the heading and keeps header lines out of the body', () => {
  const m = printModel(sample);
  assert.deepEqual(m.heading, { title: 'Test Song', artist: 'Someone', arranger: 'Me', tempo: 90 });
  const all = JSON.stringify(m.content);
  assert.equal(all.includes('Arranged by'), false);
  assert.equal(all.includes('Artist:'), false);
  assert.ok(all.includes('Title: Second'), 'a repeated header is body text');
  assert.ok(all.includes('Tempo: 60'));
});

test('printModel groups six strings with the line above, and keeps the rest as text in order', () => {
  const { content } = printModel(sample);
  assert.deepEqual(content.map((c) => c.kind), ['text', 'system', 'system', 'text']);
  assert.equal(content[0].text, '[Intro]');
  assert.deepEqual(content[1], { kind: 'system', above: '   Am      G', lines: SIX });
  assert.equal(content[2].above, 'PM---------');
  assert.equal(content[2].lines[0], 'e|--0--|  (2x)');
  assert.equal(content[3].text, 'Some lyrics here\n\nTitle: Second\nTempo: 60');
});

test('printModel gives a system with a blank line above no above line', () => {
  const m = printModel(`${SIX.join('\n')}\n\ntext`);
  assert.equal(m.content[0].above, null);
  assert.equal(m.content[1].text, 'text');
});

test('printModel handles a pasted page with CRLF, chords alone and lyrics', () => {
  const page = ['Song - Band', 'Source: https://example.test/', '', '   Em', 'I wonder how', '', '   Em', ...SIX, '', 'More words'].join('\r\n');
  const m = printModel(page);
  assert.equal(m.heading.title, '');
  assert.equal(m.heading.tempo, null);
  assert.deepEqual(m.content.map((c) => c.kind), ['text', 'system', 'text']);
  assert.equal(m.content[0].text, 'Song - Band\nSource: https://example.test/\n\n   Em\nI wonder how');
  assert.equal(m.content[1].above, '   Em');
  assert.equal(m.content[2].text, 'More words');
});

test('printModel on an empty document has an empty heading and no content', () => {
  assert.deepEqual(printModel(''), {
    heading: { title: '', artist: '', arranger: '', tempo: null },
    content: [],
  });
});

// A minimal element: enough to read back what buildPrintView writes.
const fakeDoc = () => ({
  title: 'Guitar Simulator',
  createElement: (tag) => {
    const node = { tag, children: [], className: '', textContent: '' };
    node.append = (...kids) => node.children.push(...kids);
    node.remove = () => { node.removed = true; };
    Object.defineProperty(node, 'length', { get: () => node.children.length });
    return node;
  },
  body: { children: [], append(n) { this.children.push(n); } },
});

test('buildPrintView writes the heading and one pre per system and text run, as text only', () => {
  const doc = fakeDoc();
  const root = buildPrintView(doc, printModel(sample));
  const [head, ...rest] = root.children;
  assert.equal(head.tag, 'header');
  assert.deepEqual(head.children.map((c) => c.textContent), ['Test Song', 'Someone', 'Arranged by Me', 'Tempo: 90']);
  assert.deepEqual(rest.map((c) => [c.tag, c.className]), [
    ['pre', 'print-text'], ['pre', 'print-system'], ['pre', 'print-system'], ['pre', 'print-text'],
  ]);
  assert.equal(rest[1].textContent, `   Am      G\n${SIX.join('\n')}`);
});

test('buildPrintView never turns pasted markup into elements', () => {
  const doc = fakeDoc();
  const root = buildPrintView(doc, printModel('Title: <img src=x onerror=alert(1)>\n<script>x</script>'));
  assert.equal(root.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(root.children[1].textContent, '<script>x</script>');
  assert.equal(root.children.every((c) => ['header', 'pre'].includes(c.tag)), true);
});

const fakeWin = () => {
  const handlers = {};
  return {
    handlers,
    addEventListener: (t, f) => { handlers[t] = f; },
    removeEventListener: (t) => { delete handlers[t]; },
    print: () => { handlers.beforeprint(); },
  };
};

test('beforeprint titles the page with the file name and afterprint restores it', () => {
  const doc = fakeDoc();
  const win = fakeWin();
  installPrint({ getText: () => sample, win, doc });
  win.handlers.beforeprint();
  assert.match(doc.title, /^Test Song - Someone \d{4}-\d\d-\d\d_\d{6}$/);
  assert.equal(doc.body.children.length, 1);
  win.handlers.afterprint();
  assert.equal(doc.title, 'Guitar Simulator');
  assert.equal(doc.body.children[0].removed, true);
});

test('printing twice before afterprint keeps the original title, and an empty tab prints as Untitled', () => {
  const doc = fakeDoc();
  const win = fakeWin();
  installPrint({ getText: () => '', win, doc });
  win.handlers.beforeprint();
  win.handlers.beforeprint();
  assert.match(doc.title, /^Untitled/);
  win.handlers.afterprint();
  assert.equal(doc.title, 'Guitar Simulator');
});

test('printTab calls window.print and the returned function removes the listeners', () => {
  const doc = fakeDoc();
  const win = fakeWin();
  const off = installPrint({ getText: () => '', win, doc });
  printTab(win);
  assert.match(doc.title, /^Untitled/);
  off();
  assert.deepEqual(Object.keys(win.handlers), []);
});

test('the widest line of every real tab fits a printed page at 10pt (skipped without the tabs folder)', { skip: !existsSync(TABS) }, () => {
  const names = readdirSync(TABS).filter((n) => n.endsWith('.txt'));
  assert.ok(names.length > 0);
  // Letter minus 14mm margins each side leaves about 510pt; a monospaced glyph is 0.6em wide.
  const columns = Math.floor(510 / (10 * 0.6));
  names.forEach((name) => {
    const { content } = printModel(readFileSync(new URL(name, TABS), 'utf8').replace(/\r\n?/g, '\n'));
    const widest = Math.max(...content.filter((c) => c.kind === 'system').flatMap((c) => [c.above ?? '', ...c.lines].map((l) => l.length)));
    assert.ok(widest <= columns, `${name}: ${widest} columns > ${columns}`);
  });
});
