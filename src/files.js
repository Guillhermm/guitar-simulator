import { MAX_BYTES } from './storage.js';

const pad = (n) => String(n).padStart(2, '0');
const SONG_BYTES = 200;
const encoder = new TextEncoder();

export const missingFields = (meta) => {
  const fields = ['title', 'artist'].filter((k) => !String(meta?.[k] ?? '').trim());
  const message = fields.length === 2 ? "Add the song's title and artist" : fields.length ? `Add the song's ${fields[0]}` : '';
  return { fields, message };
};

const cleanPart = (value) =>
  String(value ?? '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\s\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/^[ .]+|[ .]+$/g, '');

const cutBytes = (s, max) => {
  let out = '';
  let used = 0;
  for (const ch of s) {
    used += encoder.encode(ch).length;
    if (used > max) break;
    out += ch;
  }
  return out;
};

// Without an artist the name is the title alone, so Print still gets a sound name.
export const fileBase = ({ title, artist } = {}, date = new Date()) => {
  const song = [cleanPart(title) || 'Untitled', cleanPart(artist)].filter(Boolean).join(' - ');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${cutBytes(song, SONG_BYTES).replace(/[ .]+$/, '')} ${stamp}`;
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
    throw new Error(`File is ${Math.ceil(file.size / 1024)} KB; the limit is ${MAX_BYTES / 1024} KB.`);
  }
  return normalizeImported(await file.text());
};
