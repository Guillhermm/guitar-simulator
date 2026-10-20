const NS = 'http://www.w3.org/2000/svg';

export const ICONS = {
  play: ['M7.5 4.75v14.5L19 12z'],
  stop: ['M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z'],
  back: ['M5.5 5v14', 'M19 5.75v12.5L9 12z'],
  open: ['M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'],
  save: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M4.5 15.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2'],
  new: [
    'M13.5 3.5h-6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-10z',
    'M13.5 3.5v5h5',
    'M12 11.5v6M9 14.5h6',
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
  redo: ['M16 5.5l3.5 4-3.5 4', 'M19.5 9.5H10a5 5 0 0 0 0 10h5'],
  pencil: [
    'M5 19l.8-3.8L16.7 4.3a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L8.8 18.2z',
    'M14.5 6.5l3 3',
  ],
  'pencil-off': [
    'M5 19l.8-3.8L16.7 4.3a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L8.8 18.2z',
    'M14.5 6.5l3 3',
    'M3.5 3.5l17 17',
  ],
  examples: ['M9 6.5h10', 'M9 12h10', 'M9 17.5h10', 'M5 6.5h.01', 'M5 12h.01', 'M5 17.5h.01'],
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
