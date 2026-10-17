import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, MIN_K, fit, openScale } from '../src/stage-fit.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('fit is width-bound in a wide region and height-bound in a tall one', () => {
  assert.equal(fit(1000, 1000), 1000);
  near(fit(2000, 300), 300 * ASPECT);
});

test('fit rotated swaps the axes: length runs down the screen', () => {
  assert.equal(fit(400, 600, true), 600);
  near(fit(100, 600, true), 100 * ASPECT);
});

test('k is below 1 when the dock leaves a height-bound region shorter', () => {
  const region = { w: 1424, h: 400 };
  const k = openScale(region, { w: 0, h: 224 });
  near(k, 176 / 400);
  assert.ok(k < 1);
});

test('k is 1 when the dock does not bind the guitar: a wide guitar in a tall region stays width-bound', () => {
  assert.equal(openScale({ w: 600, h: 2000 }, { w: 0, h: 224 }), 1);
});

test('k follows the width when the dock takes width (phone landscape)', () => {
  const region = { w: 772, h: 342 };
  const k = openScale(region, { w: 288, h: 0 });
  near(k, fit(484, 342) / fit(772, 342));
  assert.ok(k > 0.6 && k < 0.65);
});

test('portrait: the upright guitar shrinks with the height the sheet takes', () => {
  const region = { w: 374, h: 732 };
  const k = openScale(region, { w: 0, h: 38 * 8.44 + 48 }, true);
  near(k, (732 - (38 * 8.44 + 48)) / 732);
});

test('no dock, or a bad region, means no scaling', () => {
  assert.equal(openScale({ w: 800, h: 400 }, undefined), 1);
  assert.equal(openScale(undefined, { w: 0, h: 100 }), 1);
  assert.equal(openScale({ w: 0, h: 400 }, { w: 0, h: 100 }), 1);
  assert.equal(openScale({ w: 800, h: -5 }, { w: 0, h: 100 }), 1);
  assert.equal(openScale({ w: NaN, h: 400 }, { w: 0, h: 100 }), 1);
});

test('an open region with nothing left floors at MIN_K instead of zero', () => {
  assert.equal(openScale({ w: 800, h: 400 }, { w: 0, h: 400 }), MIN_K);
  assert.equal(openScale({ w: 800, h: 400 }, { w: 0, h: 900 }), MIN_K);
});

test('k never exceeds 1 even for a negative inset', () => {
  assert.equal(openScale({ w: 800, h: 400 }, { w: 0, h: -50 }), 1);
});
