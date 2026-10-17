const NS = 'http://www.w3.org/2000/svg';

export const ICONS = {
  play: ['M7.5 4.75v14.5L19 12z'],
  stop: ['M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z'],
  back: ['M5.5 5v14', 'M19 5.75v12.5L9 12z'],
  open: ['M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'],
  save: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M4.5 15.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2'],
  clear: [
    'M4.5 7h15',
    'M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2',
    'M6.5 7l.8 11.5a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7',
    'M10 11v5M14 11v5',
  ],
  print: [
    'M7.5 8.5V4.5h9v4',
    'M7.5 17.5h-2a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'M7.5 14h9v5.5h-9z',
    'M17.5 11.75h.01',
  ],
  profile: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M12 12.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z',
    'M6.6 18.2c.9-2.2 2.9-3.45 5.4-3.45s4.5 1.25 5.4 3.45',
  ],
  undo: ['M8 5.5 4.5 9.5 8 13.5', 'M4.5 9.5H14a5 5 0 0 1 0 10H9'],
  chevron: ['M6 9.5l6 6 6-6'],
};

// Stroke styling lives in the .icon rule in styles.css; the markup carries geometry only.
export const buildIcon = (name, doc = document) => {
  const paths = ICONS[name];
  if (!paths) throw new Error(`Unknown icon: ${name}`);
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  paths.forEach((d) => {
    const path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  });
  return svg;
};
