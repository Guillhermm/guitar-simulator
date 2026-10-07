import { parseTab, setFret, appendBlock, landedCol } from './tab.js';
import { caretCell, cellOffset } from './tab-panel.js';

const ROWS_IN_BLOCK = 6;
const PLAYHEAD_FRACTION = 0.3;
const CARET_ADVANCE = 2;

export const createEditor = (container, { getText, setText, onCursor = () => {} }) => {
  container.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'text-editor';
  const area = document.createElement('textarea');
  area.className = 'text-area';
  area.id = 'tab-text';
  area.name = 'tab-text';
  area.wrap = 'off';
  area.spellcheck = false;
  area.autocapitalize = 'off';
  area.setAttribute('aria-label', 'Tablature text');
  area.value = getText();
  const bar = document.createElement('div');
  bar.className = 'playhead';
  bar.hidden = true;
  const probe = document.createElement('span');
  probe.className = 'ch-probe';
  wrap.append(area, bar, probe);
  container.append(wrap);

  let cache = { text: null, parsed: null };
  const parsedNow = () => {
    const text = getText();
    if (cache.text !== text) cache = { text, parsed: parseTab(text) };
    return cache.parsed;
  };

  const reportCursor = () => {
    const cell = caretCell(parsedNow(), area.value, area.selectionStart);
    if (cell) onCursor(cell);
  };

  const syncScroll = () => {
    wrap.style.setProperty('--sx', `${area.scrollLeft}px`);
    wrap.style.setProperty('--sy', `${area.scrollTop}px`);
  };

  area.addEventListener('input', () => { setText(area.value); reportCursor(); });
  area.addEventListener('keyup', reportCursor);
  area.addEventListener('pointerup', reportCursor);
  area.addEventListener('scroll', syncScroll);

  const scrollTo = (column, line) => {
    const ch = probe.getBoundingClientRect().width || 1;
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 1;
    const x = column * ch;
    if (x < area.scrollLeft || x > area.scrollLeft + area.clientWidth - 3 * ch) {
      area.scrollLeft = Math.max(0, x - PLAYHEAD_FRACTION * area.clientWidth);
    }
    const top = line * lineHeight;
    const bottom = top + ROWS_IN_BLOCK * lineHeight;
    if (top < area.scrollTop || bottom > area.scrollTop + area.clientHeight) {
      area.scrollTop = Math.max(0, top - lineHeight);
    }
    syncScroll();
  };

  const setPlayhead = (event) => {
    const info = event && parsedNow().blocks[event.block];
    bar.hidden = !info;
    if (!info) return;
    const column = info.bodyStart[0] + event.col;
    wrap.style.setProperty('--ph-col', column);
    wrap.style.setProperty('--ph-line', info.lines[0]);
    scrollTo(column, info.lines[0]);
  };

  const writeFret = (row, fret) => {
    let text = getText();
    let parsed = parsedNow();
    if (parsed.blocks.length === 0) {
      text = appendBlock(text);
      parsed = parseTab(text);
    }
    const cell = caretCell(parsed, text, Math.min(area.selectionStart, text.length));
    if (!cell) return;
    const next = setFret(text, { block: cell.block, row, col: cell.col }, fret);
    setText(next);
    area.value = next;
    const after = parsedNow();
    const info = after.blocks[cell.block];
    const col = Math.min(landedCol(next, { block: cell.block, row, col: cell.col }) + CARET_ADVANCE, info.width - 1);
    const offset = cellOffset(after, next, { block: cell.block, row, col });
    area.setSelectionRange(offset, offset);
    reportCursor();
  };

  const update = () => {
    if (area.value === getText()) return;
    const at = area.selectionStart;
    area.value = getText();
    area.setSelectionRange(at, at);
  };

  return { setPlayhead, writeFret, update, focus: () => area.focus() };
};
