import { MAX_BYTES } from './storage.js';

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
