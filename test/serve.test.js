import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../tools/serve.py', import.meta.url));

test('the dev server serves the page and its modules with Cache-Control: no-store', async (t) => {
  const child = spawn('python3', [SERVER, '0'], { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => child.kill());
  const [line] = await once(child.stdout, 'data');
  const base = /http:\S+/.exec(String(line))[0];
  for (const path of ['', 'src/main.js']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('cache-control'), 'no-store', path);
    await res.arrayBuffer();
  }
});
