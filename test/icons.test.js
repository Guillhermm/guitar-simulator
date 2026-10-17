import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, buildIcon } from '../src/icons.js';

// Just enough of the DOM for the builder: elements that record their namespace, attributes and children.
const fakeDoc = {
  createElementNS: (ns, tag) => {
    const attrs = new Map();
    const children = [];
    return {
      ns,
      tag,
      attrs,
      children,
      setAttribute: (k, v) => attrs.set(k, String(v)),
      append: (...nodes) => children.push(...nodes),
    };
  },
};

const NAMES = ['play', 'stop', 'back', 'open', 'save', 'clear', 'undo', 'chevron', 'print', 'profile', 'redo', 'pencil', 'pencil-off', 'examples'];

test('the fourteen icons of the design exist', () => {
  assert.deepEqual(Object.keys(ICONS).sort(), [...NAMES].sort());
});

test('each icon builds an svg in the svg namespace with only path children', () => {
  NAMES.forEach((name) => {
    const svg = buildIcon(name, fakeDoc);
    assert.equal(svg.tag, 'svg', name);
    assert.equal(svg.ns, 'http://www.w3.org/2000/svg', name);
    assert.equal(svg.attrs.get('viewBox'), '0 0 24 24', name);
    assert.equal(svg.children.length, ICONS[name].length, name);
    svg.children.forEach((path, i) => {
      assert.equal(path.tag, 'path', name);
      assert.equal(path.ns, 'http://www.w3.org/2000/svg', name);
      assert.equal(path.attrs.get('d'), ICONS[name][i], name);
    });
  });
});

test('icons are hidden from assistive technology and cannot take focus', () => {
  NAMES.forEach((name) => {
    const svg = buildIcon(name, fakeDoc);
    assert.equal(svg.attrs.get('aria-hidden'), 'true', name);
    assert.equal(svg.attrs.get('focusable'), 'false', name);
  });
});

test('no icon element carries an event attribute or a style', () => {
  NAMES.forEach((name) => {
    const svg = buildIcon(name, fakeDoc);
    [svg, ...svg.children].forEach((node) => {
      [...node.attrs.keys()].forEach((attr) => {
        assert.equal(/^on/i.test(attr), false, `${name}: ${attr}`);
        assert.notEqual(attr, 'style', name);
      });
    });
  });
});

test('path data is only drawing commands and numbers', () => {
  NAMES.forEach((name) => ICONS[name].forEach((d) => {
    assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/, `${name}: ${d}`);
  }));
});

test('an unknown icon throws instead of building an empty svg', () => {
  assert.throws(() => buildIcon('trumpet', fakeDoc), /Unknown icon/);
});
