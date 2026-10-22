import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOLUME, VOLUME_KEY, audibleLevel, buildVolume, readVolume, slideTo, toggleMute, volumeIcon,
} from '../src/volume.js';

test('a saved volume is read field by field and anything broken falls back to full and unmuted', () => {
  assert.deepEqual(readVolume(null), DEFAULT_VOLUME);
  assert.deepEqual(readVolume('not json'), DEFAULT_VOLUME);
  assert.deepEqual(readVolume('{"level":0.4,"muted":true}'), { level: 0.4, muted: true });
  assert.deepEqual(readVolume('{"level":7,"muted":"yes"}'), { level: 1, muted: false });
  assert.deepEqual(readVolume('{"level":-2}'), { level: 0, muted: false });
  assert.deepEqual(readVolume('{"level":"loud"}'), { level: 1, muted: false });
});

test('the icon follows what is heard: off when muted or at zero, low under half, high above', () => {
  assert.equal(volumeIcon({ level: 0.8, muted: true }), 'volume-off');
  assert.equal(volumeIcon({ level: 0, muted: false }), 'volume-off');
  assert.equal(volumeIcon({ level: 0.3, muted: false }), 'volume-low');
  assert.equal(volumeIcon({ level: 0.5, muted: false }), 'volume-high');
  assert.equal(audibleLevel({ level: 0.8, muted: true }), 0);
});

test('the button mutes and restores the level; unmuting at zero comes back at half', () => {
  assert.deepEqual(toggleMute({ level: 0.7, muted: false }), { level: 0.7, muted: true });
  assert.deepEqual(toggleMute({ level: 0.7, muted: true }), { level: 0.7, muted: false });
  assert.deepEqual(toggleMute({ level: 0, muted: false }), { level: 0.5, muted: false });
});

test('moving the slider unmutes and stays within 0 to 1', () => {
  assert.deepEqual(slideTo(0.25), { level: 0.25, muted: false });
  assert.deepEqual(slideTo(3), { level: 1, muted: false });
});

const fakeDoc = () => {
  const element = (tag) => {
    const listeners = {};
    return {
      tag,
      dataset: {},
      attrs: {},
      children: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      fire: (type) => listeners[type]({ preventDefault() {} }),
    };
  };
  return {
    createElement: element,
    createElementNS: (ns, tag) => element(tag),
  };
};

test('the control applies the saved level, mutes on click, follows the slider and saves each change', () => {
  const heard = [];
  const saved = new Map([[VOLUME_KEY, '{"level":0.6,"muted":false}']]);
  const storage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  const parent = fakeDoc().createElement('div');
  const doc = fakeDoc();
  buildVolume({ parent, player: { setVolume: (v) => heard.push(v) }, storage, doc });
  const [wrap] = parent.children;
  const [button, range] = wrap.children;
  assert.equal(range.value, '60');
  assert.equal(button.attrs['aria-label'], 'Mute');
  button.fire('click');
  assert.equal(button.attrs['aria-label'], 'Unmute');
  assert.equal(range.attrs['aria-valuetext'], '0%');
  range.value = '25';
  range.fire('input');
  assert.deepEqual(heard, [0.6, 0, 0.25]);
  assert.deepEqual(JSON.parse(saved.get(VOLUME_KEY)), { level: 0.25, muted: false });
});

test('blocked storage still gives a working control at full volume', () => {
  const heard = [];
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const parent = fakeDoc().createElement('div');
  buildVolume({ parent, player: { setVolume: (v) => heard.push(v) }, storage, doc: fakeDoc() });
  parent.children[0].children[0].fire('click');
  assert.deepEqual(heard, [1, 0]);
});
