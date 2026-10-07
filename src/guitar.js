import { TUNING, FRET_COUNT, STRING_COUNT, noteAt, noteName, fretPositions } from './pitch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 1 mm is 1.2 units. Everything below is measured in millimeters from the nut and converted once.
const MM = 1.2;
export const NUT_X = 234;
export const CENTER_Y = 240;
export const SCALE_MM = 650;
export const SADDLE_MM = 652;
export const SADDLE_X = NUT_X + MM * SADDLE_MM;
export const HIT_LEFT_X = 205;
export const NUT_GAP = 10.32;
const GAP_SLOPE = 3.6 / (SADDLE_X - NUT_X);
// Nylon trebles on rows 0-2, wound basses on rows 3-5. Row 0 is the high e, drawn on top.
export const STRING_WIDTHS = [1.2, 1.4, 1.7, 1.7, 2.0, 2.3];

const BASS_ROWS = 3;
const MIN_AMPLITUDE = 0.1;
const DECAY_SECONDS = 0.7;
const VIBRATION_HZ = 14;

const round2 = (v) => +v.toFixed(2);
export const mmX = (mm) => round2(NUT_X + MM * mm);
export const mmY = (mm) => round2(CENTER_Y + MM * mm);

export const rowToString = (row) => STRING_COUNT - 1 - row;
export const isWound = (row) => row >= STRING_COUNT - 3;
export const isBassRow = (row) => row >= BASS_ROWS;
export const wireXs = () => fretPositions(SCALE_MM, FRET_COUNT).map((mm) => NUT_X + MM * mm);

// The strings fan out from the nut to the saddle, so the gap grows with x. Left of the nut it stays at the nut value.
export const gapAt = (x) => NUT_GAP + GAP_SLOPE * (Math.max(x, NUT_X) - NUT_X);
export const stringY = (row, x = NUT_X) => CENTER_Y + (row - (STRING_COUNT - 1) / 2) * gapAt(x);
// Boundary between row k-1 and row k at x (k = 0 is above the first string, 6 below the last).
export const rowEdgeY = (k, x) => CENTER_Y + (k - STRING_COUNT / 2) * gapAt(x);

// Quadrilateral for one string between two vertical edges. Neighbors compute the shared edges from the
// same expression, so adjacent quads match exactly.
export const quadFor = (row, xa, xb) => [
  [xa, rowEdgeY(row, xa)],
  [xb, rowEdgeY(row, xb)],
  [xb, rowEdgeY(row + 1, xb)],
  [xa, rowEdgeY(row + 1, xa)],
];

// Fret 0 is the zone left of the nut, fret n spans the space between wires n-1 and n.
// The last cell is the body zone from the last wire to the saddle, which plays the open string.
export const hitCells = (wires = wireXs()) => {
  const edges = [HIT_LEFT_X, NUT_X, ...wires, SADDLE_X];
  return edges.slice(0, -1).map((xa, i) => {
    const xb = edges[i + 1];
    return { fret: i <= FRET_COUNT ? i : 0, xa, xb, cx: (xa + xb) / 2, body: i > FRET_COUNT };
  });
};

const CELLS = hitCells();

// The cell under x, with the whole zone left of the nut and anything past the saddle counted as fret 0.
export const cellAt = (x, cells = CELLS) =>
  cells.find((c) => x >= c.xa && x < c.xb) ?? (x < cells[0].xa ? cells[0] : cells[cells.length - 1]);

// Strings crossed by the move prev -> next (points are {x, y} in SVG units), in the order crossed.
// A move that ends exactly on a string counts as crossing it; a move that starts on one never does,
// so the next move from that point does not trigger it twice.
// Left of the nut the strings stop fanning, so the move is split at the nut and each half is linear.
export const crossings = (prev, next, cells = CELLS) => {
  const dx = next.x - prev.x;
  const cuts = [0, 1];
  if ((prev.x - NUT_X) * (next.x - NUT_X) < 0) cuts.splice(1, 0, (NUT_X - prev.x) / dx);
  const pts = cuts.map((t) => ({ t, x: prev.x + t * dx, y: prev.y + t * (next.y - prev.y) }));
  const hits = [];
  for (let row = 0; row < STRING_COUNT; row += 1) {
    const side = pts.map((p) => p.y - stringY(row, p.x));
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [a, b] = [side[i], side[i + 1]];
      if (a === 0 || a * b > 0) continue;
      const u = a / (a - b);
      const x = pts[i].x + u * (pts[i + 1].x - pts[i].x);
      const y = pts[i].y + u * (pts[i + 1].y - pts[i].y);
      hits.push({ row, fret: cellAt(x, cells).fret, x, y, t: pts[i].t + u * (pts[i + 1].t - pts[i].t) });
    }
  }
  return hits.sort((m, n) => m.t - n.t || m.row - n.row).map(({ t, ...rest }) => rest);
};

// A finger in cell n stops the string at wire n, which leaves wire n to the saddle vibrating.
export const segmentStart = (fret, wires = wireXs()) => (fret === 0 ? NUT_X : wires[fret - 1]);

export const pitchClass = (midi) => noteName(midi).replace(/-?\d+$/, '');

export const stringLabel = (row) => `String ${row + 1}, ${pitchClass(TUNING[rowToString(row)])}`;
export const fretText = (row, fret) =>
  `Fret ${fret}, note ${pitchClass(noteAt(rowToString(row), fret))}`;

// The control point of the quadratic peaks at the amplitude, so the string's midpoint moves half of it.
export const amplitudeFor = (row) => (isBassRow(row) ? 9 : 6);

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

// Body outline: half-widths in mm from the neck joint, mirrored about the center line.
const BODY_HALF_WIDTHS = [
  [325, 31], [338, 70], [360, 103], [395, 127], [428, 136.5], [465, 132], [492, 123], [511, 119],
  [535, 123], [575, 141], [620, 166], [665, 181], [695, 184], [735, 179], [775, 160], [800, 120],
  [811, 60], [813, 0],
];

// Closed Catmull-Rom spline through the outline points, as cubic Bezier segments.
export const bodyPath = () => {
  const upper = BODY_HALF_WIDTHS.map(([x, h]) => [x, -h]);
  const lower = BODY_HALF_WIDTHS.slice(0, -1).reverse().map(([x, h]) => [x, h]);
  const P = [...upper, ...lower].map(([x, y]) => [mmX(x), mmY(y)]);
  const n = P.length;
  const f = (v) => v.toFixed(1);
  let d = `M ${P[0][0]} ${P[0][1]}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${p2[0]} ${p2[1]}`;
  }
  return `${d} Z`;
};

// Half width of the fretboard in mm at m mm from the nut.
export const boardHalfWidth = (m) => 26 + (5 * m) / 325.2;
const BOARD_END_MM = 442;

export const boardPath = () => {
  const pts = [];
  for (let m = 0; m <= BOARD_END_MM; m += 2) pts.push(`${mmX(m)} ${mmY(-boardHalfWidth(m))}`);
  return `M ${mmX(0)} ${mmY(-boardHalfWidth(0))} L ${pts.join(' L ')} L ${mmX(BOARD_END_MM)} ${mmY(boardHalfWidth(BOARD_END_MM))} L ${mmX(0)} ${mmY(boardHalfWidth(0))} Z`;
};

export const headstockPath = () => {
  const X = mmX;
  const Y = mmY;
  return `M ${X(0)} ${Y(-28)} L ${X(-18)} ${Y(-29)} C ${X(-60)} ${Y(-32)} ${X(-130)} ${Y(-37)} ${X(-158)} ${Y(-39)} Q ${X(-175)} ${Y(-39)} ${X(-175)} ${Y(-22)} Q ${X(-179)} ${Y(0)} ${X(-175)} ${Y(22)} Q ${X(-175)} ${Y(39)} ${X(-158)} ${Y(39)} C ${X(-130)} ${Y(37)} ${X(-60)} ${Y(32)} ${X(-18)} ${Y(29)} L ${X(0)} ${Y(28)} Z`;
};

// Roller x offsets (mm left of the nut) and the side each row's string winds on.
const ROLLER_MM = [40, 72, 104];
const ROLLER_Y_MM = 18.5;
export const rollerFor = (row) => {
  const top = row < 3;
  const idx = top ? row : STRING_COUNT - 1 - row;
  return { x: mmX(-ROLLER_MM[idx]), y: mmY((top ? -1 : 1) * ROLLER_Y_MM) };
};

// Where the string ties off at the bridge, 12 mm apart.
export const tieHole = (row) => ({ x: mmX(662), y: mmY((row - (STRING_COUNT - 1) / 2) * 12) });

const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (parent) parent.appendChild(node);
  return node;
};

const points = (quad) => quad.map(([x, y]) => `${round2(x)},${round2(y)}`).join(' ');

const stop = (parent, offset, color) => el('stop', { offset, 'stop-color': color }, parent);

const buildDefs = (svg, body) => {
  const defs = el('defs', {}, svg);
  const top = el('linearGradient', { id: 'top-grad', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  stop(top, 0, '#D79B55');
  stop(top, 1, '#BF8040');
  const clip = el('clipPath', { id: 'body-clip' }, defs);
  el('path', { d: body }, clip);
};

const buildBody = (svg, body) => {
  const g = el('g', { class: 'body' }, svg);
  el('path', { d: body, fill: '#000', opacity: 0.25, transform: 'translate(3 6)', class: 'drop' }, g);
  el('path', { d: body, fill: 'none', 'stroke-width': 5.6, 'stroke-linejoin': 'round', class: 'rim' }, g);
  el('path', { d: body, fill: 'url(#top-grad)', stroke: '#20150E', 'stroke-width': 3.6 }, g);
  for (let i = -70; i <= 70; i += 1) {
    const y = mmY(i * 2.6);
    el('line', {
      x1: mmX(325), x2: mmX(815), y1: y, y2: y, stroke: '#7A4A1E', 'stroke-width': 0.8, 'clip-path': 'url(#body-clip)',
      'stroke-opacity': 0.05 + ((((i * 7) % 5) + 5) % 5) * 0.012,
    }, g);
  }
  el('line', { x1: mmX(325), x2: mmX(812), y1: CENTER_Y, y2: CENTER_Y, stroke: '#7A4A1E', 'stroke-opacity': 0.25, 'stroke-width': 0.8 }, g);

  const cx = mmX(487);
  const ring = (r, fill) => el('circle', { cx, cy: CENTER_Y, r: r * MM, fill }, g);
  ring(62, '#1B120C');
  ring(61, '#E9D8AE');
  ring(59.5, '#1B120C');
  el('circle', { cx, cy: CENTER_Y, r: 52.5 * MM, fill: 'none', stroke: '#8E5A2C', 'stroke-width': 12 * MM }, g);
  el('circle', {
    cx, cy: CENTER_Y, r: 52.5 * MM, fill: 'none', stroke: '#E9D8AE', 'stroke-width': 6 * MM, 'stroke-dasharray': `${3.2 * MM} ${3.2 * MM}`,
  }, g);
  ring(46.5, '#1B120C');
  ring(45.5, '#E9D8AE');
  ring(44.5, '#1B120C');
  ring(43, '#0B0705');
};

const buildNeck = (svg, wires) => {
  const g = el('g', { class: 'neck' }, svg);
  el('path', {
    d: `M ${mmX(0)} ${mmY(-27.5)} L ${mmX(325)} ${mmY(-32.5)} L ${mmX(325)} ${mmY(32.5)} L ${mmX(0)} ${mmY(27.5)} Z`,
    fill: '#7A4424',
  }, g);
  const board = boardPath();
  el('path', { d: board, fill: '#000', opacity: 0.28, transform: 'translate(1.5 3)' }, g);
  el('path', { d: board, fill: '#241A14' }, g);

  const wireMm = wires.map((x) => (x - NUT_X) / MM);
  wires.forEach((x, i) => el('line', {
    x1: round2(x), x2: round2(x), y1: mmY(-boardHalfWidth(wireMm[i])), y2: mmY(boardHalfWidth(wireMm[i])), stroke: '#CFCBC0', 'stroke-width': 2.5,
  }, g));

  // Side dots sit on the treble edge of the board, at the middle of the fret space.
  [3, 5, 7, 9, 12, 15, 17, 19].forEach((fret) => {
    const lo = wireMm[fret - 2] ?? 0;
    const mid = lo + (wireMm[fret - 1] - lo) / 2;
    const offsets = fret === 12 ? [-2, 2] : [0];
    offsets.forEach((dx) => el('circle', { cx: mmX(mid + dx), cy: mmY(boardHalfWidth(mid)), r: 1.6, fill: '#EFE6D0', opacity: 0.8 }, g));
  });

  el('rect', { x: mmX(-1.5), y: mmY(-boardHalfWidth(0)), width: 3 * MM, height: 2 * boardHalfWidth(0) * MM, fill: '#F3EBD8' }, g);
};

const buildBridge = (svg) => {
  const g = el('g', { class: 'bridge' }, svg);
  el('rect', { x: mmX(640), y: mmY(-92.5), width: 28 * MM, height: 185 * MM, rx: 5 * MM, fill: '#3B2016' }, g);
  el('rect', { x: mmX(650.5), y: mmY(-40), width: 3 * MM, height: 80 * MM, fill: '#EDE6D2' }, g);
  for (let row = 0; row < STRING_COUNT; row += 1) {
    const hole = tieHole(row);
    el('circle', { cx: hole.x, cy: hole.y, r: 1.6 * MM, fill: '#0B0705' }, g);
  }
};

const buildHeadstock = (svg) => {
  const g = el('g', { class: 'headstock' }, svg);
  const path = headstockPath();
  el('path', { d: path, fill: '#000', opacity: 0.25, transform: 'translate(2 4)', class: 'drop' }, g);
  el('path', { d: path, fill: '#4A2619', 'stroke-width': 1.2, class: 'rim' }, g);
  [-1, 1].forEach((s) => {
    const cy = s * ROLLER_Y_MM;
    el('rect', { x: mmX(-120), y: mmY(cy - 8.5), width: 101 * MM, height: 17 * MM, rx: 8.5 * MM, fill: '#120D0A' }, g);
  });
  [-1, 1].forEach((s) => {
    ROLLER_MM.forEach((d) => {
      const cy = s * ROLLER_Y_MM;
      el('rect', { x: mmX(-d) - 4.5 * MM, y: mmY(cy - 9.5), width: 9 * MM, height: 19 * MM, rx: 2, fill: '#D8D6CE' }, g);
      el('rect', { x: mmX(-d) - 5 * MM, y: mmY(s * 34 - 3), width: 10 * MM, height: 6 * MM, fill: '#B9B7AE' }, g);
      el('ellipse', {
        cx: mmX(-d), cy: mmY(s * 42), rx: 5.5 * MM, ry: 8 * MM, fill: '#EAE3D0', stroke: '#9C9684', 'stroke-width': 0.8,
      }, g);
    });
  });
};

const lineAttrs = (a, b) => ({ x1: round2(a.x), y1: round2(a.y), x2: round2(b.x), y2: round2(b.y) });
const at = (row, x) => ({ x, y: stringY(row, x) });

const buildString = (layer, row, cells) => {
  const wound = isWound(row);
  const cls = wound ? ' wound' : '';
  const width = STRING_WIDTHS[row];
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

  const focus = points(quadFor(row, HIT_LEFT_X, SADDLE_X));
  el('polygon', { class: 'focus-halo', points: focus, 'stroke-width': 5 }, g);
  el('polygon', { class: 'focus-ring', points: focus, 'stroke-width': 2 }, g);

  const nut = at(row, NUT_X);
  const saddle = at(row, SADDLE_X);
  const attrs = lineAttrs(nut, saddle);
  const shadow = el('line', { class: 'string-shadow', ...attrs, 'stroke-width': width + 1, transform: 'translate(0 1.4)' }, g);
  const line = el('line', { class: `string-line${cls}`, ...attrs, 'stroke-width': width }, g);
  const main = [shadow, line];
  if (wound) {
    main.push(el('line', { class: 'string-wire', ...attrs, 'stroke-width': width, 'stroke-dasharray': '0.7 0.9' }, g));
  }
  el('line', { class: `string-line${cls}`, ...lineAttrs(saddle, tieHole(row)), 'stroke-width': width }, g);
  el('line', { class: `string-line${cls}`, ...lineAttrs(nut, rollerFor(row)), 'stroke-width': width }, g);

  const ghost = el('path', { class: `string-ghost${cls}`, 'stroke-width': width }, g);
  const live = el('path', { class: `string-live${cls}`, 'stroke-width': width }, g);
  const dot = (name) => el('circle', { class: name, cx: cells[0].cx, cy: stringY(row, cells[0].cx), r: 4 }, g);

  return { g, main, ghost, live, hoverDot: dot('hover-dot'), pressDot: dot('press-dot'), keyDot: dot('key-dot'), row, end: saddle };
};

const createVibrator = (reducedMotion) => {
  const active = new Map();
  let raf = 0;

  const trim = (s, x, y) => s.main.forEach((n) => { n.setAttribute('x2', round2(x)); n.setAttribute('y2', round2(y)); });

  const restore = (s) => {
    trim(s, s.end.x, s.end.y);
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
      const { from } = v;
      const cx = (from.x + s.end.x) / 2;
      const cy = (from.y + s.end.y) / 2;
      const path = (sign) => `M ${round2(from.x)} ${round2(from.y)} Q ${round2(cx)} ${round2(cy + sign * d)} ${round2(s.end.x)} ${round2(s.end.y)}`;
      s.live.setAttribute('d', path(1));
      s.ghost.setAttribute('d', path(-1));
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
    const from = at(s.row, fromX);
    trim(s, from.x, from.y);
    s.live.style.opacity = 1;
    s.ghost.style.opacity = 0.4;
    active.set(s, { start: performance.now(), amplitude: amplitudeFor(s.row), from });
    if (!raf) raf = requestAnimationFrame(frame);
  };

  return { pluck };
};

export const buildGuitar = (svg, { player, onFretPress = () => {} }) => {
  const wires = wireXs();
  const cells = hitCells(wires);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vibrator = createVibrator(reducedMotion);
  const body = bodyPath();

  buildDefs(svg, body);
  buildBody(svg, body);
  buildNeck(svg, wires);
  buildBridge(svg);
  buildHeadstock(svg);
  const stringLayer = el('g', { class: 'strings' }, svg);
  const hitLayer = el('g', { class: 'hit-layer' }, svg);
  // Pressing a fret must leave focus in the tab editor, which writes the pressed note.
  hitLayer.addEventListener('mousedown', (e) => e.preventDefault());

  // A touch pointerdown is not a user activation, so the release resumes audio the press could not.
  svg.addEventListener('pointerup', player.resume);

  const toSvg = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };
  const last = new Map();
  const endDrag = (e) => last.delete(e.pointerId);
  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    last.set(e.pointerId, toSvg(e));
    // Synthetic events carry ids the browser does not know, and capture throws for those.
    try { svg.setPointerCapture(e.pointerId); } catch { /* the drag still tracks inside the svg */ }
  });
  svg.addEventListener('pointermove', (e) => {
    const prev = last.get(e.pointerId);
    if (!prev) return;
    const next = toSvg(e);
    last.set(e.pointerId, next);
    crossings(prev, next).forEach((c) => pluck(c.row, c.fret, cellAt(c.x, cells)));
  });
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  const strings = Array.from({ length: STRING_COUNT }, (_, row) => buildString(stringLayer, row, cells));
  let kb = { row: 0, frets: new Array(STRING_COUNT).fill(0) };

  const moveDot = (dot, row, cell) => {
    dot.setAttribute('cx', cell.cx);
    dot.setAttribute('cy', stringY(row, cell.cx));
  };

  const fingertip = (s, row, cell) => {
    const dot = el('circle', {
      cx: cell.cx, cy: stringY(row, cell.cx), r: 5.5, fill: '#F3EBD8', opacity: 0, 'pointer-events': 'none',
    }, stringLayer);
    if (!dot.animate) { dot.remove(); return; }
    const gone = dot.animate([{ opacity: 0.85 }, { opacity: 0.85, offset: 0.4 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
    gone.onfinish = () => dot.remove();
  };

  // Visual only: the vibration, the press dot and, on a fretted cell, a fingertip that fades.
  const strike = (row, fret, cell = cells[fret]) => {
    const s = strings[row];
    moveDot(s.pressDot, row, cell);
    if (s.pressDot.animate) {
      s.pressDot.animate(
        [{ opacity: 0.7, transform: 'scale(0.8)' }, { opacity: 0, transform: 'scale(0.8)' }],
        { duration: 300, easing: 'ease-out' },
      );
    }
    if (fret > 0 && !cell.body) fingertip(s, row, cell);
    vibrator.pluck(s, segmentStart(fret, wires));
  };

  const pluck = (row, fret, cell = cells[fret]) => {
    player.play(noteAt(rowToString(row), fret));
    strike(row, fret, cell);
    onFretPress(row, fret);
  };

  const showFret = (row) => {
    const s = strings[row];
    const fret = kb.frets[row];
    moveDot(s.keyDot, row, cells[fret]);
    s.g.setAttribute('aria-valuenow', fret);
    s.g.setAttribute('aria-valuetext', fretText(row, fret));
  };

  strings.forEach((s) => {
    cells.forEach((cell) => {
      const poly = el('polygon', { class: 'hit', points: points(quadFor(s.row, cell.xa, cell.xb)) }, hitLayer);
      poly.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pluck(s.row, cell.fret, cell);
      });
      poly.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        moveDot(s.hoverDot, s.row, cell);
        s.g.classList.add('hover');
      });
      poly.addEventListener('pointerleave', () => s.g.classList.remove('hover'));
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

  return { pluck, strike };
};
