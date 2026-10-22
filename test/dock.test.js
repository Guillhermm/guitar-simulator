import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swapEditor, createTabPanel } from '../src/tab-panel.js';
import { KEY, MAX_BYTES, UI_KEY } from '../src/storage.js';

const fakeEditor = (name, cue = 0, log = []) => {
  const editor = {
    name,
    log,
    getCue: () => cue,
    setEditable: () => {},
    update: () => { editor.log.push([name, 'update']); },
    setCue: (step) => { editor.log.push([name, 'setCue', step]); },
    setPlayhead: (event) => { editor.log.push([name, 'setPlayhead', event]); },
    dispose: () => { editor.log.push([name, 'dispose']); },
    writeFret: (row, fret) => { editor.log.push([name, 'writeFret', row, fret]); },
  };
  return editor;
};

test('swapEditor builds the new editor and carries the cue over', () => {
  const log = [];
  const old = fakeEditor('text', 37, log);
  const next = swapEditor(old, () => fakeEditor('grid', 0, log), null);
  assert.equal(next.name, 'grid');
  assert.deepEqual(log, [['text', 'dispose'], ['grid', 'setCue', 37]]);
});

test('swapEditor re-applies the playhead only when something is sounding', () => {
  const event = { block: 1, col: 4 };
  const playing = [];
  swapEditor(fakeEditor('text', 5), () => fakeEditor('grid', 0, playing), event);
  assert.deepEqual(playing, [['grid', 'setCue', 5], ['grid', 'setPlayhead', event]]);
  const idle = [];
  swapEditor(fakeEditor('grid', 5), () => fakeEditor('text', 0, idle), null);
  assert.deepEqual(idle, [['text', 'setCue', 5]]);
});

test('swapEditor copes with an editor that has nothing to dispose', () => {
  const old = fakeEditor('text', 2);
  delete old.dispose;
  assert.equal(swapEditor(old, () => fakeEditor('grid'), null).name, 'grid');
});

// A stand-in where every property is another stand-in; enough to build the panel without a browser.
const stub = () => {
  const store = new Map();
  return new Proxy(() => {}, {
    get: (_, key) => {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* empty() {};
      if (key === 'then') return undefined;
      if (!store.has(key)) store.set(key, stub());
      return store.get(key);
    },
    set: (_, key, value) => { store.set(key, value); return true; },
    apply: () => stub(),
    construct: () => stub(),
  });
};

const withBrowser = (phone, fn) => {
  const globals = {
    document: stub(),
    window: {
      matchMedia: () => ({ matches: phone }),
      addEventListener: () => {},
      ResizeObserver: class { observe() {} },
      getComputedStyle: () => ({}),
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    location: { search: '?editor=grid' },
  };
  const saved = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.entries(globals).forEach(([key, value]) => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  });
  try {
    return fn();
  } finally {
    saved.forEach(([key, d]) => (d ? Object.defineProperty(globalThis, key, d) : delete globalThis[key]));
  }
};

const mount = ({ phone = false, ui = null, saved = null }) => withBrowser(phone, () => {
  const built = [];
  const seen = {};
  const editors = {
    text: (box, options) => { built.push('text'); seen.options = options; seen.editor = fakeEditor('text'); return seen.editor; },
    grid: (box, options) => { built.push('grid'); seen.options = options; seen.editor = fakeEditor('grid'); return seen.editor; },
  };
  const writes = [];
  const storage = {
    getItem: (k) => (k === UI_KEY ? ui : k === KEY ? saved : null),
    setItem: (k, v) => writes.push([k, v]),
  };
  const root = { dataset: {} };
  const panel = createTabPanel({ dock: stub(), root, player: stub(), guitar: stub(), editors, storage });
  return { built, root, writes, seen, panel };
});

test('an edit past the size limit is refused and the editor goes back to the accepted text', () => withBrowser(false, () => {
  const { seen } = mount({});
  const before = seen.options.getText();
  seen.options.setText(`${before}x`);
  const accepted = seen.options.getText();
  assert.equal(accepted, `${before}x`);
  seen.editor.log.length = 0;
  seen.options.setText('e'.repeat(MAX_BYTES + 1));
  assert.equal(seen.options.getText(), accepted);
  assert.deepEqual(seen.editor.log, [['text', 'update']]);
}));

test('with nothing saved the panel builds the Text editor, open on desktop', () => {
  const { built, root } = mount({});
  assert.deepEqual(built, ['text']);
  assert.equal(root.dataset.open, 'true');
});

test('with nothing saved a portrait phone starts collapsed', () => {
  assert.equal(mount({ phone: true }).root.dataset.open, 'false');
});

test('a saved choice wins at every width', () => {
  const ui = JSON.stringify({ editor: 'grid', dockOpen: true });
  const phone = mount({ phone: true, ui });
  assert.deepEqual(phone.built, ['grid']);
  assert.equal(phone.root.dataset.open, 'true');
  const desktop = mount({ ui: JSON.stringify({ editor: 'text', dockOpen: false }) });
  assert.deepEqual(desktop.built, ['text']);
  assert.equal(desktop.root.dataset.open, 'false');
});

test('?editor= in the address changes nothing: only the saved choice picks the editor', () => {
  // withBrowser sets location.search to ?editor=grid for every mount
  assert.deepEqual(mount({}).built, ['text']);
});

test('building the panel writes no ui state until the user changes something', () => {
  assert.deepEqual(mount({}).writes, []);
});

test('with editing on every guitar press writes, whatever holds focus', () => withBrowser(false, () => {
  const { seen, panel, root } = mount({});
  assert.equal(root.dataset.editing, 'true');
  seen.editor.log.length = 0;
  panel.onFretPress(2, 5);
  assert.deepEqual(seen.editor.log, [['text', 'writeFret', 2, 5]]);
}));

test('with editing off a guitar press only sounds', () => withBrowser(false, () => {
  const text = 'Title: A\nArtist: B\ne|-3-|\nB|---|\nG|---|\nD|---|\nA|---|\nE|---|';
  const { seen, panel, root } = mount({ saved: JSON.stringify({ text, tempo: 80 }) });
  assert.equal(root.dataset.editing, 'false');
  seen.editor.log.length = 0;
  panel.onFretPress(2, 5);
  assert.equal(seen.editor.log.filter(([, kind]) => kind === 'writeFret').length, 0);
}));
