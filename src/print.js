import { parseTab, readMeta, readTempo } from './tab.js';
import { fileBase } from './files.js';

const META_KEYS = ['title', 'artist', 'arranger'];

// Indexes of the header lines the heading replaces: the first line for each of title, artist and
// arranger, and the first Tempo line. Reading each line alone with the same readers the rest of the
// app uses keeps "first occurrence wins" identical to what the heading shows.
const headerLines = (lines) => {
  const taken = new Set();
  const seen = new Set();
  lines.forEach((line, i) => {
    const key = META_KEYS.find((k) => readMeta(line)[k] !== '');
    if (key && !seen.has(key)) {
      seen.add(key);
      taken.add(i);
    } else if (!seen.has('tempo') && readTempo(line) !== null) {
      seen.add('tempo');
      taken.add(i);
    }
  });
  return taken;
};

const trimBlank = (lines) => {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from].trim() === '') from += 1;
  while (to > from && lines[to - 1].trim() === '') to -= 1;
  return lines.slice(from, to);
};

// The document as it prints: a heading, then systems (six string lines plus the line directly above
// them, where chords, PM marks and annotations live) and text runs, in document order.
export const printModel = (text) => {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '').replace(/\s+$/, ''));
  const meta = readMeta(text);
  const heading = { title: meta.title, artist: meta.artist, arranger: meta.arranger, tempo: readTempo(text) };
  const header = headerLines(lines);
  const starts = new Map(parseTab(text).blocks.map((b) => [b.lines[0], b.lines]));
  const content = [];
  let run = [];
  const flush = () => {
    const kept = trimBlank(run);
    if (kept.length) content.push({ kind: 'text', text: kept.join('\n') });
    run = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const block = starts.get(i);
    if (block) {
      // The line above joins the system only when it is the last thing collected, so it is not
      // a blank, a header or part of a previous system.
      const above = run.length && run[run.length - 1].trim() !== '' ? run.pop() : null;
      flush();
      content.push({ kind: 'system', above, lines: block.map((n) => lines[n]) });
      i = block[block.length - 1];
    } else if (!header.has(i)) {
      run.push(lines[i]);
    }
  }
  flush();
  return { heading, content };
};

const el = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Plain elements and textContent only: the Content Security Policy allows no inline markup, and a
// pasted page can hold anything.
export const buildPrintView = (doc, model) => {
  const root = el(doc, 'div', 'print-root');
  const { title, artist, arranger, tempo } = model.heading;
  const head = el(doc, 'header', 'print-heading');
  if (title) head.append(el(doc, 'h1', 'print-title', title));
  [artist, arranger && `Arranged by ${arranger}`, tempo && `Tempo: ${tempo}`]
    .filter(Boolean)
    .forEach((line) => head.append(el(doc, 'p', 'print-meta', line)));
  if (head.children.length) root.append(head);
  model.content.forEach((item) => {
    if (item.kind === 'system') {
      root.append(el(doc, 'pre', 'print-system', [...(item.above === null ? [] : [item.above]), ...item.lines].join('\n')));
    } else {
      root.append(el(doc, 'pre', 'print-text', item.text));
    }
  });
  return root;
};

// Returns a function that removes the listeners. Listens for printing from anywhere (the Print button, the browser menu, Ctrl+P). The print view
// exists only between beforeprint and afterprint, and the page title becomes the suggested PDF name.
export const installPrint = ({ getText, win = window, doc = document }) => {
  let savedTitle = null;
  let view = null;
  const before = () => {
    if (savedTitle === null) savedTitle = doc.title;
    const text = getText();
    doc.title = fileBase(readMeta(text), new Date());
    view?.remove();
    view = buildPrintView(doc, printModel(text));
    doc.body.append(view);
  };
  const after = () => {
    view?.remove();
    view = null;
    if (savedTitle !== null) doc.title = savedTitle;
    savedTitle = null;
  };
  win.addEventListener('beforeprint', before);
  win.addEventListener('afterprint', after);
  return () => {
    win.removeEventListener('beforeprint', before);
    win.removeEventListener('afterprint', after);
  };
};

// What the dock's Print button calls. Printing never refuses: an untitled tab gets the file name "untitled_...".
export const printTab = (win = window) => win.print();
