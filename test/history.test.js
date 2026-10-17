import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, editKind } from '../src/history.js';

test('record, undo and redo walk the texts in order', () => {
  const h = createHistory('a');
  h.record('b');
  h.record('c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), 'b');
  assert.equal(h.redo(), 'c');
  assert.equal(h.redo(), null);
});

test('a record equal to the current text adds no step', () => {
  const h = createHistory('a');
  assert.equal(h.record('a'), false);
  assert.equal(h.canUndo(), false);
});

test('records of the same group inside the pause join one step; a pause or a new group starts another', () => {
  const h = createHistory('', { pauseMs: 1000 });
  h.record('h', 'type', 0);
  h.record('he', 'type', 400);
  h.record('hel', 'type', 900);
  h.record('hell', 'type', 2500);
  h.record('hell ', 'space', 2600);
  assert.equal(h.size(), 3);
  assert.equal(h.undo(), 'hell');
  assert.equal(h.undo(), 'hel');
  assert.equal(h.undo(), '');
});

test('a record with no group is always its own step', () => {
  const h = createHistory('a');
  h.record('b', null, 0);
  h.record('c', null, 1);
  assert.equal(h.size(), 2);
});

test('a new edit clears what redo would restore', () => {
  const h = createHistory('a');
  h.record('b');
  h.record('c');
  h.undo();
  assert.equal(h.canRedo(), true);
  h.record('d');
  assert.equal(h.canRedo(), false);
  assert.equal(h.redo(), null);
});

test('after an undo a record of the last group does not join the step that was undone', () => {
  const h = createHistory('');
  h.record('a', 'type', 0);
  h.undo();
  h.record('b', 'type', 10);
  assert.equal(h.size(), 1);
  assert.equal(h.undo(), '');
});

test('the history keeps at most `cap` steps and drops the oldest', () => {
  const h = createHistory('0', { cap: 3 });
  for (let i = 1; i <= 10; i++) h.record(String(i));
  assert.equal(h.size(), 3);
  assert.deepEqual([h.undo(), h.undo(), h.undo(), h.undo()], ['9', '8', '7', null]);
});

test('the default cap is 200 steps', () => {
  const h = createHistory('0');
  for (let i = 1; i <= 250; i++) h.record(String(i));
  assert.equal(h.size(), 200);
});

test('while disabled nothing can be undone or redone, and the steps are kept for later', () => {
  const h = createHistory('a');
  h.record('b');
  h.setEnabled(false);
  assert.equal(h.canUndo(), false);
  assert.equal(h.undo(), null);
  assert.equal(h.current(), 'b');
  h.setEnabled(true);
  assert.equal(h.undo(), 'a');
  h.setEnabled(false);
  assert.equal(h.canRedo(), false);
  assert.equal(h.redo(), null);
});

test('reset forgets everything', () => {
  const h = createHistory('a');
  h.record('b');
  h.reset('z');
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
  assert.equal(h.current(), 'z');
});

test('editKind tells one typed character, one space and one erase apart from bigger edits', () => {
  assert.equal(editKind('ab', 'abc'), 'type');
  assert.equal(editKind('ab', 'a-b'), 'type');
  assert.equal(editKind('ab', 'ab '), 'space');
  assert.equal(editKind('ab', 'ab\n'), 'space');
  assert.equal(editKind('abc', 'ab'), 'erase');
  assert.equal(editKind('abc', 'a'), null);
  assert.equal(editKind('abc', 'abXYZ'), null);
  assert.equal(editKind('abc', 'aXc'), null);
  assert.equal(editKind('same', 'same'), null);
});
