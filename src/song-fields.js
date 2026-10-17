import { readMeta, withMeta } from './tab.js';
import { missingFields } from './files.js';
import { buildIcon } from './icons.js';

export const FIELDS = [
  { key: 'title', label: 'Song title', required: true, error: 'Add a song title', phrase: 'a song title' },
  { key: 'artist', label: 'Artist', required: true, error: 'Add an artist', phrase: 'an artist' },
  { key: 'arranger', label: 'Arranger', required: false },
];

export const EMPTY_SUMMARY = 'Song details (title and artist required)';

// "Title · Artist" for the collapsed bar and the phone's summary row; CSS ellipsizes it.
export const summaryOf = (meta) => [meta.title, meta.artist].filter(Boolean).join(' · ');

// What Save says when it refuses: the missing keys, in field order.
export const refusalStatus = (keys) => {
  const parts = FIELDS.filter((f) => keys.includes(f.key) && f.phrase).map((f) => f.phrase);
  return parts.length ? `Add ${parts.join(' and ')} to save or print.` : '';
};

// The Save gate. Fields are the keys to flag; status is the line for the status area; focus is the
// first of them, the one the cursor goes to.
export const saveCheck = (meta) => {
  const { fields } = missingFields(meta);
  return { fields, status: refusalStatus(fields), focus: fields[0] ?? null };
};

// A field's text as the document would hold it: whitespace collapsed, controls dropped, trimmed,
// cut at the limit. Comparing normalized values is what keeps typing a trailing space from
// rewriting the field under the caret.
const normalized = (key, value) => readMeta(withMeta('', { [key]: value }))[key];

// Keys whose input shows something other than what the document says. Only these are rewritten.
export const fieldUpdates = (values, meta) =>
  FIELDS.map((f) => f.key).filter((key) => normalized(key, values[key] ?? '') !== (meta[key] ?? ''));

export const textWithField = (text, key, value) => withMeta(text, { [key]: value });

const make = (tag, className, parent, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.append(node);
  return node;
};

// Builds the phone toggle and the row of fields at the top of `parent`. The panel owns the document;
// this only reports typing through onInput(key, value) and shows what it is told.
export const buildSongFields = (parent, { onInput }) => {
  const toggle = make('button', 'meta-toggle', parent);
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.id = 'song-toggle';
  const toggleText = make('span', 'mt-text', toggle, EMPTY_SUMMARY);
  toggle.append(buildIcon('chevron'));

  const row = make('div', 'meta', parent);
  row.id = 'song-fields';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Song details');
  toggle.setAttribute('aria-controls', row.id);

  const cells = new Map();
  FIELDS.forEach(({ key, label, required, error }) => {
    const box = make('div', 'field', row);
    const head = make('div', 'field-head', box);
    const id = `song-${key}`;
    const name = make('label', 'field-label', head, label);
    name.htmlFor = id;
    const note = make('span', 'field-note', head, required ? 'Required' : 'Optional');
    let message = null;
    if (required) {
      message = make('span', 'field-error', head, error);
      message.id = `${id}-error`;
      message.hidden = true;
    }
    const input = make('input', null, box);
    input.id = id;
    input.name = key;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 200;
    if (required) input.setAttribute('aria-required', 'true');
    input.addEventListener('input', () => onInput(key, input.value));
    cells.set(key, { box, input, note, message });
  });

  return {
    toggle,
    row,
    inputs: Object.fromEntries([...cells].map(([key, c]) => [key, c.input])),
    values: () => Object.fromEntries([...cells].map(([key, c]) => [key, c.input.value])),
    // Rewrites only the inputs that disagree with the document, so a field being typed in is left alone.
    show: (meta) => {
      fieldUpdates(Object.fromEntries([...cells].map(([key, c]) => [key, c.input.value])), meta)
        .forEach((key) => { cells.get(key).input.value = meta[key]; });
      toggleText.textContent = summaryOf(meta) || EMPTY_SUMMARY;
    },
    // Marks exactly these keys invalid and clears the rest.
    setInvalid: (keys) => {
      cells.forEach(({ box, input, note, message }, key) => {
        const bad = keys.includes(key);
        if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        if (message) {
          message.hidden = !bad;
          note.hidden = bad;
          if (bad) input.setAttribute('aria-describedby', message.id); else input.removeAttribute('aria-describedby');
        }
        box.toggleAttribute('data-invalid', bad);
      });
    },
    // Read-only fields still show, select and copy; they just refuse typing.
    setEditable: (on) => cells.forEach(({ input }) => { input.readOnly = !on; }),
    focus: (key) => cells.get(key)?.input.focus(),
  };
};
