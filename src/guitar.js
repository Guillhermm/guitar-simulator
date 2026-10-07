import { TUNING, FRET_COUNT, STRING_COUNT, noteAt, noteName, fretPositions } from './pitch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const VIEW = { width: 1200, height: 420 };
export const SCALE_LENGTH = 820;
export const NUT_X = 130;
export const BRIDGE_X = 950;
export const HEADSTOCK_X = 24;
export const STRING_SPACING = 36;
export const STRING_CENTER_Y = 210;
// Row 0 is the high e, drawn on top.
export const STRING_WIDTHS = [1.2, 1.6, 2.2, 3.0, 3.8, 4.6];

const BASS_ROWS = 3;
const MIN_AMPLITUDE = 0.1;
const DECAY_SECONDS = 0.7;
const VIBRATION_HZ = 14;

export const rowToString = (row) => STRING_COUNT - 1 - row;
export const isWound = (row) => row >= STRING_COUNT - 3;
export const stringY = (row) => STRING_CENTER_Y + (row - (STRING_COUNT - 1) / 2) * STRING_SPACING;
export const wireXs = () => fretPositions(SCALE_LENGTH, FRET_COUNT).map((d) => NUT_X + d);

// Fret 0 is the zone left of the nut, fret n spans the space between wires n-1 and n.
export const cellBounds = (wires = wireXs(), nutX = NUT_X, headX = HEADSTOCK_X) => {
  const edges = [headX, nutX, ...wires];
  return edges.slice(0, -1).map((x, fret) => {
    const width = edges[fret + 1] - x;
    return { fret, x, width, cx: x + width / 2 };
  });
};

// Over the body, where a player strums, a tap plays the open string.
export const bodyZone = (wires = wireXs(), bridgeX = BRIDGE_X) => {
  const x = wires[wires.length - 1];
  return { fret: 0, x, width: bridgeX - x, cx: (x + bridgeX) / 2 };
};

// A finger in cell n stops the string at wire n, which leaves wire n to the bridge vibrating.
export const segmentStart = (fret, wires = wireXs()) => (fret === 0 ? NUT_X : wires[fret - 1]);

export const pitchClass = (midi) => noteName(midi).replace(/-?\d+$/, '');

export const stringLabel = (row) => `String ${row + 1}, ${pitchClass(TUNING[rowToString(row)])}`;
export const fretText = (row, fret) =>
  `Fret ${fret}, note ${pitchClass(noteAt(rowToString(row), fret))}`;

export const isBassRow = (row) => row >= BASS_ROWS;
export const amplitudeFor = (row) => (isBassRow(row) ? 14 : 10);

export const envelope = (amplitude, t) => amplitude * Math.exp(-t / DECAY_SECONDS);
export const displacement = (amplitude, t) =>
  envelope(amplitude, t) * Math.cos(2 * Math.PI * VIBRATION_HZ * t);
export const isSettled = (amplitude, t) => envelope(amplitude, t) < MIN_AMPLITUDE;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Returns the next keyboard state, or null when the key is not ours.
export const reduceKey = ({ row, frets }, key) => {
  const setFret = (fret) => ({
    row,
    frets: frets.map((f, i) => (i === row ? clamp(fret, 0, FRET_COUNT) : f)),
    pluck: false,
  });
  const moveRow = (delta) => ({ row: clamp(row + delta, 0, STRING_COUNT - 1), frets, pluck: false });
  switch (key) {
    case 'ArrowLeft': return setFret(frets[row] - 1);
    case 'ArrowRight': return setFret(frets[row] + 1);
    case 'Home': return setFret(0);
    case 'End': return setFret(FRET_COUNT);
    case 'ArrowUp': return moveRow(-1);
    case 'ArrowDown': return moveRow(1);
    case ' ':
    case 'Enter': return { row, frets, pluck: true };
    default: return null;
  }
};

const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (parent) parent.appendChild(node);
  return node;
};

const stop = (parent, offset, color, opacity) =>
  el('stop', { offset, 'stop-color': color, ...(opacity === undefined ? {} : { 'stop-opacity': opacity }) }, parent);

const buildDefs = (svg) => {
  const defs = el('defs', {}, svg);
  const top = el('linearGradient', { id: 'top-grad', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  stop(top, 0, '#E0AE63');
  stop(top, 0.55, '#CB8D44');
  stop(top, 1, '#B2702F');
  const board = el('linearGradient', { id: 'board-grad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  stop(board, 0, '#2B1B14');
  stop(board, 1, '#3A2519');
  const glow = el('radialGradient', { id: 'body-glow', cx: 0.32, cy: 0.3, r: 0.6 }, defs);
  stop(glow, 0, '#FFFFFF', 0.16);
  stop(glow, 1, '#FFFFFF', 0);
  const rim = el('radialGradient', { id: 'body-rim', cx: 0.5, cy: 0.5, r: 0.62 }, defs);
  stop(rim, 0.7, '#000000', 0);
  stop(rim, 1, '#000000', 0.12);
  const head = el('linearGradient', { id: 'head-grad', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  stop(head, 0, '#8A5328');
  stop(head, 1, '#6A3A18');
  const hole = el('radialGradient', { id: 'hole-grad', cx: 0.5, cy: 0.42, r: 0.6 }, defs);
  stop(hole, 0, '#1C130D');
  stop(hole, 1, '#050302');
  const shadow = el('filter', { id: 'soft-shadow', x: '-10%', y: '-15%', width: '125%', height: '135%' }, defs);
  el('feGaussianBlur', { stdDeviation: 7 }, shadow);
  const clip = el('clipPath', { id: 'body-clip' }, defs);
  el('path', { d: BODY_PATH }, clip);
};

const BODY_PATH =
  'M 520 104 C 565 104 600 58 690 58 C 770 58 800 120 840 120 C 890 120 925 22 1020 22 ' +
  'C 1100 22 1140 110 1140 210 C 1140 310 1100 398 1020 398 C 925 398 890 300 840 300 ' +
  'C 800 300 770 362 690 362 C 600 362 565 316 520 316 Z';

const buildBody = (svg, wires) => {
  const body = el('g', { class: 'body' }, svg);
  el('path', { d: BODY_PATH, fill: '#000', 'fill-opacity': 0.28, transform: 'translate(4 9)', filter: 'url(#soft-shadow)' }, body);
  el('path', { d: BODY_PATH, fill: 'url(#top-grad)', stroke: '#6E3E1B', 'stroke-width': 7, 'stroke-linejoin': 'round' }, body);
  el('path', { d: BODY_PATH, fill: 'none', stroke: '#E9C98C', 'stroke-width': 1.5, 'stroke-opacity': 0.7, transform: 'translate(0 0)' }, body);
  el('path', { d: BODY_PATH, fill: 'url(#body-glow)' }, body);
  el('path', { d: BODY_PATH, fill: 'url(#body-rim)' }, body);

  for (let i = 0; i < 14; i += 1) {
    const y = 36 + i * 26;
    el('path', {
      d: `M 560 ${y} C 700 ${y + 6} 860 ${y - 6} 1120 ${y + 2}`,
      fill: 'none', stroke: '#6E3E1B', 'stroke-opacity': 0.05 + (i % 3) * 0.015, 'stroke-width': 1, 'clip-path': 'url(#body-clip)',
    }, body);
  }

  el('circle', { cx: 700, cy: 210, r: 84, fill: 'none', stroke: '#000', 'stroke-opacity': 0.25, 'stroke-width': 6 }, body);
  el('circle', { cx: 700, cy: 210, r: 82, fill: 'none', stroke: '#3A2616', 'stroke-width': 3 }, body);
  el('circle', { cx: 700, cy: 210, r: 76, fill: 'none', stroke: '#E8D3A0', 'stroke-width': 3 }, body);
  el('circle', { cx: 700, cy: 210, r: 70, fill: 'none', stroke: '#3A2616', 'stroke-width': 3 }, body);
  el('circle', { cx: 700, cy: 210, r: 64, fill: 'url(#hole-grad)' }, body);

  el('rect', { x: 938, y: 108, width: 50, height: 204, rx: 9, fill: '#1E120B' }, body);
  el('rect', { x: 945, y: 114, width: 3, height: 192, rx: 1.5, fill: '#F3EBD8', 'fill-opacity': 0.55 }, body);
  for (let row = 0; row < STRING_COUNT; row += 1) {
    el('circle', { cx: 970, cy: stringY(row), r: 3.2, fill: '#F3EBD8', 'fill-opacity': 0.85 }, body);
  }

  const neck = el('g', { class: 'neck' }, svg);
  el('rect', { x: NUT_X + 3, y: 112, width: 464, height: 204, fill: '#000', 'fill-opacity': 0.16, filter: 'url(#soft-shadow)' }, neck);
  el('rect', { x: NUT_X, y: 102, width: 460, height: 216, fill: '#7A4620' }, neck);
  el('rect', { x: NUT_X, y: 108, width: 460, height: 204, fill: 'url(#board-grad)' }, neck);
  el('rect', { x: NUT_X, y: 102, width: 460, height: 1.5, fill: '#FFFFFF', 'fill-opacity': 0.15 }, neck);
  for (let i = 0; i < 10; i += 1) {
    const y = 114 + i * (192 / 9);
    const wobble = 2 + (i % 3);
    const opacity = 0.06 + (i % 5) * 0.01;
    el('path', {
      d: `M ${NUT_X} ${y} C 250 ${y + wobble} 400 ${y - wobble} 590 ${y + (i % 2 ? 1 : -1)}`,
      fill: 'none', stroke: '#000', 'stroke-opacity': opacity, 'stroke-width': 1,
    }, neck);
  }
  wires.forEach((x) => el('rect', { x: x - 1, y: 108, width: 2, height: 204, fill: '#C9C6BE' }, neck));

  const mid = (n) => (n === 1 ? (NUT_X + wires[0]) / 2 : (wires[n - 2] + wires[n - 1]) / 2);
  [3, 5, 7, 9].forEach((n) => el('circle', { cx: mid(n), cy: STRING_CENTER_Y, r: 6, fill: '#EFE6D0' }, neck));
  [174, 246].forEach((y) => el('circle', { cx: mid(12), cy: y, r: 6, fill: '#EFE6D0' }, neck));

  el('rect', { x: NUT_X - 4, y: 106, width: 6, height: 208, rx: 1, fill: '#F3EBD8' }, neck);

  const head = el('g', { class: 'headstock' }, svg);
  [48, 80, 112].forEach((x) => {
    el('rect', { x: x - 2, y: 82, width: 4, height: 14, fill: '#9A9A94' }, head);
    el('rect', { x: x - 6, y: 70, width: 12, height: 14, rx: 4, fill: '#8C8A84' }, head);
    el('rect', { x: x - 2, y: 324, width: 4, height: 14, fill: '#9A9A94' }, head);
    el('rect', { x: x - 6, y: 336, width: 12, height: 14, rx: 4, fill: '#8C8A84' }, head);
  });
  el('path', {
    d: `M ${HEADSTOCK_X + 8} 92 L ${NUT_X - 4} 104 L ${NUT_X - 4} 316 L ${HEADSTOCK_X + 8} 328 Q ${HEADSTOCK_X} 328 ${HEADSTOCK_X} 318 L ${HEADSTOCK_X} 102 Q ${HEADSTOCK_X} 92 ${HEADSTOCK_X + 8} 92 Z`,
    fill: 'url(#head-grad)',
  }, head);
  for (let row = 0; row < STRING_COUNT; row += 1) {
    el('circle', { cx: 60, cy: stringY(row), r: 5, fill: '#C9C6BE' }, head);
  }
};

const buildString = (layer, row, cells) => {
  const y = stringY(row);
  const wound = isWound(row);
  const cls = wound ? ' wound' : '';
  const g = el('g', {
    class: 'string',
    tabindex: 0,
    role: 'slider',
    'aria-label': stringLabel(row),
    'aria-orientation': 'horizontal',
    'aria-valuemin': 0,
    'aria-valuemax': FRET_COUNT,
    'aria-valuenow': 0,
    'aria-valuetext': fretText(row, 0),
  }, layer);

  el('rect', { class: 'focus-halo', x: 40, y: y - 15, width: BRIDGE_X + 20 - 40, height: 30, rx: 8, 'stroke-width': 5 }, g);
  el('rect', { class: 'focus-ring', x: 40, y: y - 15, width: BRIDGE_X + 20 - 40, height: 30, rx: 8, 'stroke-width': 2 }, g);

  const line = el('line', { class: `string-line${cls}`, x1: 60, y1: y, x2: BRIDGE_X, y2: y, 'stroke-width': STRING_WIDTHS[row] }, g);
  const ghost = el('path', { class: `string-ghost${cls}`, 'stroke-width': STRING_WIDTHS[row] }, g);
  const live = el('path', { class: `string-live${cls}`, 'stroke-width': STRING_WIDTHS[row] }, g);
  const hoverDot = el('circle', { class: 'hover-dot', cx: cells[0].cx, cy: y, r: 9 }, g);
  const pressDot = el('circle', { class: 'press-dot', cx: cells[0].cx, cy: y, r: 9 }, g);
  const keyDot = el('circle', { class: 'key-dot', cx: cells[0].cx, cy: y, r: 9 }, g);

  return { g, line, ghost, live, hoverDot, pressDot, keyDot, y, row };
};

const createVibrator = (reducedMotion) => {
  const active = new Map();
  let raf = 0;

  const restore = (s) => {
    s.line.setAttribute('x2', BRIDGE_X);
    s.live.style.opacity = 0;
    s.ghost.style.opacity = 0;
  };

  const frame = (now) => {
    active.forEach((v, s) => {
      const t = (now - v.start) / 1000;
      if (isSettled(v.amplitude, t)) {
        active.delete(s);
        restore(s);
        return;
      }
      const d = displacement(v.amplitude, t);
      const cx = (v.fromX + BRIDGE_X) / 2;
      s.live.setAttribute('d', `M ${v.fromX} ${s.y} Q ${cx} ${s.y + d} ${BRIDGE_X} ${s.y}`);
      s.ghost.setAttribute('d', `M ${v.fromX} ${s.y} Q ${cx} ${s.y - d} ${BRIDGE_X} ${s.y}`);
    });
    raf = active.size ? requestAnimationFrame(frame) : 0;
  };

  const flash = (s) => {
    s.g.classList.add('flash');
    setTimeout(() => s.g.classList.remove('flash'), 250);
  };

  const pluck = (s, fromX) => {
    if (reducedMotion()) {
      flash(s);
      return;
    }
    s.line.setAttribute('x2', fromX);
    s.live.style.opacity = 1;
    s.ghost.style.opacity = 0.4;
    active.set(s, { start: performance.now(), amplitude: amplitudeFor(s.row), fromX });
    if (!raf) raf = requestAnimationFrame(frame);
  };

  return { pluck };
};

export const buildGuitar = (svg, { player }) => {
  const wires = wireXs();
  const cells = cellBounds(wires);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vibrator = createVibrator(reducedMotion);

  buildDefs(svg);
  buildBody(svg, wires);
  const stringLayer = el('g', { class: 'strings' }, svg);
  const hitLayer = el('g', { class: 'hit-layer' }, svg);

  // A touch pointerdown is not a user activation, so the release resumes audio the press could not.
  svg.addEventListener('pointerup', player.resume);

  const strings = Array.from({ length: STRING_COUNT }, (_, row) => buildString(stringLayer, row, cells));
  let kb = { row: 0, frets: new Array(STRING_COUNT).fill(0) };

  const pluck = (row, fret) => {
    const s = strings[row];
    const cell = cells[fret];
    player.play(noteAt(rowToString(row), fret));
    s.pressDot.setAttribute('cx', cell.cx);
    if (s.pressDot.animate) {
      s.pressDot.animate(
        [{ opacity: 0.7, transform: 'scale(0.8)' }, { opacity: 0, transform: 'scale(0.8)' }],
        { duration: 300, easing: 'ease-out' },
      );
    }
    vibrator.pluck(s, segmentStart(fret, wires));
  };

  const showFret = (row) => {
    const s = strings[row];
    const fret = kb.frets[row];
    s.keyDot.setAttribute('cx', cells[fret].cx);
    s.g.setAttribute('aria-valuenow', fret);
    s.g.setAttribute('aria-valuetext', fretText(row, fret));
  };

  strings.forEach((s) => {
    [...cells, bodyZone(wires)].forEach((cell) => {
      const rect = el('rect', {
        class: 'hit', x: cell.x, y: s.y - STRING_SPACING / 2, width: cell.width, height: STRING_SPACING,
      }, hitLayer);
      rect.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pluck(s.row, cell.fret);
      });
      rect.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        s.hoverDot.setAttribute('cx', cell.cx);
        s.g.classList.add('hover');
      });
      rect.addEventListener('pointerleave', () => s.g.classList.remove('hover'));
    });

    s.g.addEventListener('keydown', (e) => {
      const next = reduceKey({ row: s.row, frets: kb.frets }, e.key);
      if (!next) return;
      e.preventDefault();
      kb = { row: next.row, frets: next.frets };
      if (next.pluck) pluck(s.row, kb.frets[s.row]);
      showFret(s.row);
      if (next.row !== s.row) strings[next.row].g.focus();
    });
    s.g.addEventListener('focus', () => { kb = { ...kb, row: s.row }; });
  });

  return { pluck };
};
