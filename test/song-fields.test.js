import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, EMPTY_SUMMARY, summaryOf, refusalStatus, saveCheck, fieldUpdates, textWithField } from '../src/song-fields.js';
import { readMeta } from '../src/tab.js';

const TAB = 'e|-0-2-|\nB|-----|\nG|-----|\nD|-----|\nA|-----|\nE|-----|';

test('three fields: two required, Arranger optional', () => {
  assert.deepEqual(FIELDS.map((f) => [f.key, f.required]), [['title', true], ['artist', true], ['arranger', false]]);
});

test('the summary joins title and artist, and drops what is missing', () => {
  assert.equal(summaryOf({ title: 'Nothing Else Matters', artist: 'Metallica', arranger: 'X' }), 'Nothing Else Matters · Metallica');
  assert.equal(summaryOf({ title: 'Song', artist: '' }), 'Song');
  assert.equal(summaryOf({ title: '', artist: 'Band' }), 'Band');
  assert.equal(summaryOf({ title: '', artist: '' }), '');
  assert.match(EMPTY_SUMMARY, /required/);
});

test('typing in a field rewrites its header line, and nothing else', () => {
  const one = textWithField(TAB, 'title', 'Blackbird');
  assert.equal(one, `Title: Blackbird\n${TAB}`);
  const two = textWithField(one, 'artist', 'Beatles');
  assert.equal(two, `Title: Blackbird\nArtist: Beatles\n${TAB}`);
  assert.equal(textWithField(two, 'title', 'Black'), `Title: Black\nArtist: Beatles\n${TAB}`);
  assert.equal(textWithField(two, 'title', ''), `Artist: Beatles\n${TAB}`);
  assert.equal(textWithField(two, 'arranger', 'Me'), `Title: Blackbird\nArtist: Beatles\nArranged by: Me\n${TAB}`);
});

test('what a field writes is what readMeta reads back, round trip', () => {
  let text = TAB;
  ['B', 'Bl', 'Bla  ck', 'Black '].forEach((v) => { text = textWithField(text, 'title', v); });
  assert.equal(readMeta(text).title, 'Black');
  assert.equal(text.split('\n').filter((l) => l.startsWith('Title:')).length, 1);
});

test('editing a header line in Text updates the field; a field that already agrees is left alone', () => {
  const text = `Title: Hello\nArtist: Adele\n${TAB}`;
  const meta = readMeta(text);
  assert.deepEqual(fieldUpdates({ title: '', artist: '', arranger: '' }, meta), ['title', 'artist']);
  assert.deepEqual(fieldUpdates({ title: 'Hello', artist: 'Adele', arranger: '' }, meta), []);
  assert.deepEqual(fieldUpdates({ title: 'Hel', artist: 'Adele', arranger: '' }, meta), ['title']);
});

test('no loop and no cursor jump: typing a space, a double space or a trailing space never rewrites the field', () => {
  ['Black', 'Black ', 'Black  bird', ' Black'].forEach((typed) => {
    const text = textWithField(TAB, 'title', typed);
    assert.deepEqual(fieldUpdates({ title: typed, artist: '', arranger: '' }, readMeta(text)), [], JSON.stringify(typed));
  });
});

test('a header line in the text with an empty value empties the field', () => {
  assert.deepEqual(fieldUpdates({ title: 'Old', artist: '', arranger: '' }, readMeta(`Title:\n${TAB}`)), ['title']);
});

test('a second Title line does not change the field: the first line wins', () => {
  const text = `Title: First\nTitle: Second\n${TAB}`;
  assert.deepEqual(fieldUpdates({ title: 'First', artist: '', arranger: '' }, readMeta(text)), []);
});

test('Save refusal names what is missing and focuses the first of them', () => {
  assert.deepEqual(saveCheck({ title: '', artist: '', arranger: '' }), {
    fields: ['title', 'artist'],
    status: 'Add a song title and an artist to save.',
    focus: 'title',
  });
  assert.deepEqual(saveCheck({ title: 'T', artist: '', arranger: '' }), {
    fields: ['artist'],
    status: 'Add an artist to save.',
    focus: 'artist',
  });
  assert.deepEqual(saveCheck({ title: '', artist: 'A', arranger: '' }), {
    fields: ['title'],
    status: 'Add a song title to save.',
    focus: 'title',
  });
});

test('Save goes ahead with a title and an artist, Arranger optional', () => {
  assert.deepEqual(saveCheck({ title: 'T', artist: 'A', arranger: '' }), { fields: [], status: '', focus: null });
});

test('whitespace alone is missing', () => {
  assert.deepEqual(saveCheck(readMeta('Title:    \nArtist: ​\n')).fields, ['title', 'artist']);
});

test('the status follows what is still missing, in field order', () => {
  assert.equal(refusalStatus(['artist', 'title']), 'Add a song title and an artist to save.');
  assert.equal(refusalStatus(['artist']), 'Add an artist to save.');
  assert.equal(refusalStatus([]), '');
});
