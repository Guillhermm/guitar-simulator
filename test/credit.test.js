import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_LINKS, CREDIT_TEXT, buildCredit } from '../src/credit.js';

const fakeDoc = {
  createElement: (tag) => {
    const node = { tag, children: [], attrs: new Map(), textContent: '' };
    node.setAttribute = (k, v) => node.attrs.set(k, v);
    node.append = (...kids) => node.children.push(...kids);
    node.replaceChildren = (...kids) => { node.children = kids; };
    return node;
  },
};

test('the credit links are exactly these three https addresses', () => {
  assert.deepEqual(CREDIT_LINKS.map((l) => l.href), [
    'https://www.linkedin.com/in/guilherme-zeni/',
    'https://github.com/Guillhermm/guitar-simulator',
    'https://guilherme.zenus.systems',
  ]);
  CREDIT_LINKS.forEach((l) => assert.equal(new URL(l.href).protocol, 'https:'));
});

test('the credit sentence is exact and the links open safely in a new tab', () => {
  const p = fakeDoc.createElement('p');
  buildCredit(p, fakeDoc);
  assert.equal(p.children[0].textContent, 'Made by Guilherme Almeida Zeni with AI agents.');
  assert.equal(CREDIT_TEXT, p.children[0].textContent);
  const anchors = p.children[2].children.filter((c) => c.tag === 'a');
  assert.equal(anchors.length, 3);
  anchors.forEach((a, i) => {
    assert.equal(a.href, CREDIT_LINKS[i].href);
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
    assert.ok(a.attrs.get('aria-label').toLowerCase().includes(a.textContent.toLowerCase()), 'name contains visible text');
  });
});

test('the credit is built from text nodes only, never markup', () => {
  const p = fakeDoc.createElement('p');
  buildCredit(p, fakeDoc);
  const all = JSON.stringify(p, (k, v) => (v instanceof Map ? undefined : v));
  assert.equal(all.includes('<'), false);
});
