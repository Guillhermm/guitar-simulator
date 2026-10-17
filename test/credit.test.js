import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREDIT_LINKS, CREDIT_TEXT, GITHUB_MARK, LINKEDIN_MARKS, buildCredit, buildCreditMark } from '../src/credit.js';
import { ICONS } from '../src/icons.js';

const node = (tag, ns = null) => {
  const n = { tag, ns, children: [], attrs: new Map(), textContent: '' };
  n.setAttribute = (k, v) => n.attrs.set(k, String(v));
  n.append = (...kids) => n.children.push(...kids);
  n.replaceChildren = (...kids) => { n.children = kids; };
  return n;
};
const fakeDoc = { createElement: (tag) => node(tag), createElementNS: (ns, tag) => node(tag, ns) };

const build = () => {
  const p = fakeDoc.createElement('p');
  buildCredit(p, fakeDoc);
  return p;
};

test('the credit links are exactly these three https addresses', () => {
  assert.deepEqual(CREDIT_LINKS.map((l) => l.href), [
    'https://www.linkedin.com/in/guilherme-zeni/',
    'https://github.com/Guillhermm/guitar-simulator',
    'https://guilherme.zenus.systems',
  ]);
  CREDIT_LINKS.forEach((l) => assert.equal(new URL(l.href).protocol, 'https:'));
});

test('the credit is the sentence plus three icon links, each named, tipped and safe', () => {
  const p = build();
  assert.equal(p.children[0].textContent, CREDIT_TEXT);
  assert.equal(CREDIT_TEXT, 'Made by Guilherme Almeida Zeni with AI agents.');
  const anchors = p.children[1].children;
  assert.equal(anchors.length, 3);
  anchors.forEach((a, i) => {
    assert.equal(a.tag, 'a');
    assert.equal(a.href, CREDIT_LINKS[i].href);
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
    assert.equal(a.attrs.get('aria-label'), CREDIT_LINKS[i].label);
    assert.match(a.attrs.get('aria-label'), /opens in a new tab$/);
    assert.equal(a.attrs.get('data-tip'), CREDIT_LINKS[i].tip);
    assert.equal(a.textContent, '', 'an icon link has no visible text');
  });
  assert.deepEqual(CREDIT_LINKS.map((l) => l.tip), ['LinkedIn', 'GitHub', 'Profile']);
  assert.ok(CREDIT_LINKS[0].label.includes('LinkedIn'));
  assert.ok(CREDIT_LINKS[1].label.includes('GitHub'));
});

test('LinkedIn is the two official files, one per theme, decorative inside a named link', () => {
  const imgs = buildCreditMark('linkedin', fakeDoc);
  assert.deepEqual(imgs.map((i) => i.src), ['assets/linkedin/InBug-Black.png', 'assets/linkedin/InBug-White.png']);
  assert.deepEqual(imgs.map((i) => i.className.split(' ').pop()), ['on-light', 'on-dark']);
  imgs.forEach((i) => {
    assert.equal(i.tag, 'img');
    assert.equal(i.alt, '');
    assert.equal(i.attrs.get('aria-hidden'), 'true');
  });
  LINKEDIN_MARKS.forEach(({ src }) => {
    const bytes = readFileSync(new URL(`../${src}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG', src);
    assert.equal(bytes.readUInt32BE(16), 840);
    assert.equal(bytes.readUInt32BE(20), 779);
  });
});

test('the GitHub mark is one path in the official viewBox and nothing else', () => {
  const [svg] = buildCreditMark('github', fakeDoc);
  assert.equal(svg.ns, 'http://www.w3.org/2000/svg');
  assert.equal(svg.attrs.get('viewBox'), '0 0 98 96');
  assert.equal(svg.attrs.get('aria-hidden'), 'true');
  assert.equal(svg.children.length, 1);
  assert.equal(svg.children[0].attrs.get('d'), GITHUB_MARK.d);
  assert.match(GITHUB_MARK.d, /^[MmLlHhVvCcZz0-9.,\s\-eE]+$/);
  assert.equal(svg.attrs.has('style'), false);
  assert.equal(svg.children[0].attrs.has('fill'), false, 'color comes from the stylesheet, not the markup');
});

test('the profile link uses our own icon', () => {
  const [svg] = buildCreditMark('profile', fakeDoc);
  assert.equal(svg.attrs.get('viewBox'), '0 0 24 24');
  assert.deepEqual(svg.children.map((c) => c.attrs.get('d')), ICONS.profile);
});

test('an unknown mark throws', () => {
  assert.throws(() => buildCreditMark('myspace', fakeDoc), /Unknown credit mark/);
});

test('the credit is built from nodes and text only, never markup', () => {
  const all = JSON.stringify(build(), (k, v) => (v instanceof Map ? undefined : v));
  assert.equal(all.includes('<'), false);
});
