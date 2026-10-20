import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { registerServiceWorker } from '../src/offline.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));

// Width and height from a PNG's IHDR chunk.
const pngSize = (path) => {
  const bytes = readFileSync(new URL(path, ROOT));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', path);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
};

const filesUnder = (dir) => readdirSync(new URL(dir, ROOT)).flatMap((name) => {
  const path = `${dir}/${name}`;
  return statSync(new URL(path, ROOT)).isDirectory() ? filesUnder(path) : [path];
});

test('the page links the manifest and icons, and its CSP lets them and the worker load', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="icon" href="assets\/icon\/favicon\.svg"/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/icon\/apple-touch-icon\.png">/);
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /manifest-src 'self'/);
  assert.match(csp, /worker-src 'self'/);
  assert.match(csp, /connect-src 'none'/);
  pngSize('assets/icon/apple-touch-icon.png');
  assert.equal(pngSize('assets/icon/favicon-32.png'), '32x32');
});

test('the manifest makes an installable standalone app with relative URLs only', () => {
  assert.equal(manifest.name, 'Guitar Simulator');
  assert.ok(manifest.short_name.length <= 12);
  assert.equal(manifest.display, 'standalone');
  ['id', 'start_url', 'scope'].forEach((key) => assert.equal(manifest[key], './', key));
  const pngs = manifest.icons.filter((icon) => icon.type === 'image/png');
  pngs.forEach((icon) => assert.equal(pngSize(icon.src), icon.sizes, icon.src));
  manifest.icons.forEach((icon) => assert.ok(!icon.src.startsWith('/'), icon.src));
  assert.ok(pngs.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(pngs.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(pngs.some((icon) => icon.purpose === 'maskable'));
});

// Runs sw.js against an in-memory Cache Storage and a fetch that can be switched off.
const loadWorker = ({ online = () => true } = {}) => {
  const stores = new Map();
  const origin = 'https://example.test/app/';
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href.split('?')[0];
  const openCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      addAll: async (urls) => urls.forEach((url) => store.set(key(url), `body of ${key(url)}`)),
      put: async (request, response) => store.set(key(request), response.body),
      match: async (request) => (store.has(key(request)) ? { body: store.get(key(request)), cached: true } : undefined),
    };
  };
  const listeners = {};
  const self = {
    location: new URL(origin),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const context = vm.createContext({
    self,
    URL,
    caches: {
      open: async (name) => openCache(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (request) => {
      if (!online()) throw new TypeError('Failed to fetch');
      return { ok: true, body: `fresh ${request.url}`, clone() { return this; } };
    },
  });
  const shell = vm.runInContext(`${read('sw.js')}\n;SHELL`, context);
  const fire = async (type, init = {}) => {
    let pending = Promise.resolve();
    const event = { ...init, waitUntil: (p) => { pending = p; }, respondWith: (p) => { pending = p; } };
    listeners[type](event);
    return pending;
  };
  const get = (path, mode = 'cors') => fire('fetch', { request: { method: 'GET', url: new URL(path, origin).href, mode } });
  return { shell, stores, fire, get, origin };
};

test('the worker precaches exactly the files the app can request', () => {
  const { shell } = loadWorker();
  const onDisk = ['src', 'songs', 'assets'].flatMap(filesUnder).filter((path) => /\.(js|png|svg)$/.test(path));
  assert.deepEqual([...shell].sort(), ['./', 'styles.css', 'manifest.webmanifest', ...onDisk].sort());
});

test('online the worker serves the network copy and keeps it; offline it serves the last copy', async () => {
  let up = true;
  const worker = loadWorker({ online: () => up });
  await worker.fire('install');
  const online = await worker.get('src/main.js');
  assert.equal(online.body, `fresh ${worker.origin}src/main.js`);
  up = false;
  const offline = await worker.get('src/main.js');
  assert.equal(offline.cached, true);
  assert.equal(offline.body, `fresh ${worker.origin}src/main.js`);
  assert.equal((await worker.get('songs/guitar-chords.js')).body, `body of ${worker.origin}songs/guitar-chords.js`);
});

test('offline, an uncached page address opens the app and an uncached file still fails', async () => {
  let up = true;
  const worker = loadWorker({ online: () => up });
  await worker.fire('install');
  up = false;
  assert.equal((await worker.get('?song=1', 'navigate')).body, `body of ${worker.origin}`);
  await assert.rejects(worker.get('missing.js'));
});

test('the worker leaves other origins and non-GET requests to the browser', () => {
  const worker = loadWorker();
  let answered = false;
  const respondWith = () => { answered = true; };
  const fetchListener = (request) => ({ request, respondWith, waitUntil() {} });
  worker.fire('fetch', fetchListener({ method: 'GET', url: 'https://elsewhere.test/x.js' }));
  worker.fire('fetch', fetchListener({ method: 'POST', url: `${worker.origin}src/main.js` }));
  assert.equal(answered, false);
});

test('activating a new version drops the old caches', async () => {
  const worker = loadWorker();
  worker.stores.set('guitar-simulator-v0', new Map());
  await worker.fire('install');
  await worker.fire('activate');
  assert.deepEqual([...worker.stores.keys()], ['guitar-simulator-v2']);
});

test('registration asks for sw.js and degrades to null without support or on failure', async () => {
  const seen = [];
  const ok = { serviceWorker: { register: async (url) => { seen.push(url); return 'registration'; } } };
  assert.equal(await registerServiceWorker(ok), 'registration');
  assert.deepEqual(seen, ['sw.js']);
  assert.equal(await registerServiceWorker({}), null);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await registerServiceWorker({ serviceWorker: { register: async () => { throw new Error('denied'); } } }), null);
  } finally {
    console.warn = warn;
  }
});

test('the dev server labels the manifest as a web app manifest', async (t) => {
  const child = spawn('python3', [fileURLToPath(new URL('tools/serve.py', ROOT)), '0'], { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => child.kill());
  const [line] = await once(child.stdout, 'data');
  const res = await fetch(`${/http:\S+/.exec(String(line))[0]}manifest.webmanifest`);
  assert.equal(res.headers.get('content-type'), 'application/manifest+json');
  await res.arrayBuffer();
});
