import { test } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for every browser object: any property is another stand-in, any call returns one, and
// assigned values read back. It cannot catch a misused DOM API; it catches what a page load in a
// browser would throw from our own code: a bad import, a name used before it exists, a typo.
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

const browser = () => ({
  document: stub(),
  window: Object.assign(stub(), { localStorage: { getItem: () => null, setItem: () => {} } }),
  location: { get search() { throw new Error('main.js must not read location.search'); } },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
});

const load = async (search) => {
  const globals = browser();
  const saved = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.entries(globals).forEach(([key, value]) => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  });
  try {
    await import(`../src/main.js?${search}`);
  } finally {
    saved.forEach(([key, d]) => (d ? Object.defineProperty(globalThis, key, d) : delete globalThis[key]));
  }
};

test('main.js loads the whole page without throwing', async () => {
  await assert.doesNotReject(load(''));
});

test('main.js never reads the address query: ?editor=grid is ignored', async () => {
  await assert.doesNotReject(load('editor=grid'));
});
