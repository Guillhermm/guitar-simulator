import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', ROOT), 'utf8');
const SITE = 'https://guillhermm.github.io/guitar-simulator/';

const meta = (attr, name) => new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`).exec(html)?.[1];

test('the title and description fit what search results show', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  assert.ok(title.length <= 60, title);
  assert.match(title, /Guitar Simulator/);
  const description = meta('name', 'description');
  assert.ok(description.length >= 70 && description.length <= 160, `${description.length} characters`);
});

// Search Console rechecks this tag; removing it unverifies the property.
test('the Search Console verification tag stays on the page', () => {
  assert.equal(meta('name', 'google-site-verification'), 'IMB4bqRBXLrR92ODWWzF0c8qv-83lzgZZW2WHXw-ZCA');
});

test('canonical, sitemap and social tags all name the same address', () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}">`));
  assert.equal(meta('property', 'og:url'), SITE);
  const sitemap = readFileSync(new URL('sitemap.xml', ROOT), 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), [SITE]);
  assert.equal(meta('property', 'og:description'), meta('name', 'description'));
});

test('the share card exists at the advertised size', () => {
  const image = meta('property', 'og:image');
  assert.equal(meta('name', 'twitter:image'), image);
  assert.ok(image.startsWith(SITE));
  const bytes = readFileSync(new URL(image.slice(SITE.length), ROOT));
  assert.equal(bytes.readUInt32BE(16), Number(meta('property', 'og:image:width')));
  assert.equal(bytes.readUInt32BE(20), Number(meta('property', 'og:image:height')));
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
});

test('the structured data parses and describes this app at this address', () => {
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1];
  const data = JSON.parse(block);
  assert.equal(data['@type'], 'WebApplication');
  assert.equal(data.url, SITE);
  assert.equal(data.description, meta('name', 'description'));
  assert.equal(data.offers.price, '0');
});

test('the page has one h1 and every local file it links to exists', () => {
  assert.equal(html.match(/<h1\b/g).length, 1);
  const local = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^[a-z]+:/i.test(u));
  assert.ok(local.length > 0);
  local.forEach((path) => assert.ok(existsSync(new URL(path, ROOT)), path));
});
