import { MAX_BYTES } from './storage.js';

// A refusal whose message is written for the person opening the file.
export class ImportError extends Error {}

// Control characters other than tab and line breaks, and U+FFFD, which file.text() puts where the
// bytes are not UTF-8. A tab may hold a stray one; a binary file is full of them.
const NOT_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g;
export const looksBinary = (text) => text.includes('\u0000') || (text.match(NOT_TEXT)?.length ?? 0) > text.length * 0.01;

const pad = (n) => String(n).padStart(2, '0');
const PART_CHARS = 80;

export const missingFields = (meta) => {
  const fields = ['title', 'artist'].filter((k) => !String(meta?.[k] ?? '').trim());
  return { fields };
};

// Letters that Unicode does not decompose into a base letter plus an accent.
const FOLD = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', þ: 'th', ł: 'l', ı: 'i' };

// A file-name slug: lowercase ASCII letters and digits joined by single hyphens, so "Canção do Mar!"
// becomes "cancao-do-mar". Scripts with no Latin form (Japanese, say) leave nothing and fall back.
export const slug = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ßæœøđðþłı]/g, (ch) => FOLD[ch])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PART_CHARS)
    .replace(/-+$/, '');

// title_artist_YYYYMMDD-HHMMSS in local time, the same base for the .txt and the PDF. Without an
// artist the name is the title alone, so Print still gets a sound name.
export const fileBase = ({ title, artist } = {}, date = new Date()) => {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return [slug(title) || 'untitled', slug(artist), stamp].filter(Boolean).join('_');
};

export const normalizeImported = (text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

export const exportFile = (text, name = 'tab.txt', doc = document) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const readImportedFile = async (file) => {
  if (file.size > MAX_BYTES) {
    throw new ImportError(`That file is ${Math.ceil(file.size / 1024)} KB; the limit is ${MAX_BYTES / 1024} KB.`);
  }
  const text = normalizeImported(await file.text());
  if (looksBinary(text)) throw new ImportError('That file is not a text file.');
  return text;
};
