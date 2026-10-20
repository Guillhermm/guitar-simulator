// To add a song: drop a module in this folder that exports the tab text as its default export, then
// add an entry here. `module` is the file name inside songs/, loaded on demand with import(). `group`
// puts it in a column of its own in the Examples dialog; without one it goes under More examples.
// The dialog sorts by title, so the order here does not matter.
export const SONGS = [
  {
    id: 'minueto-op1-1',
    title: 'Minueto Op. 1 No. 1 in E major',
    artist: 'Guilherme Almeida Zeni',
    arranger: 'Guitar Simulator AI Team',
    note: 'Allegro, from the piano score. Melody over a bass in first position, a short run up to the 9th fret.',
    module: 'minueto-op1-1.js',
    group: 'Minuetos Op. 1',
  },
  {
    id: 'minueto-op1-2',
    title: 'Minueto Op. 1 No. 2 in G minor',
    artist: 'Guilherme Almeida Zeni',
    arranger: 'Guitar Simulator AI Team',
    note: 'Andante, from the piano score. Opens with the accelerating run and ends with it in the bass.',
    module: 'minueto-op1-2.js',
    group: 'Minuetos Op. 1',
  },
  {
    id: 'minueto-op1-3',
    title: 'Minueto Op. 1 No. 3 in C major',
    artist: 'Guilherme Almeida Zeni',
    arranger: 'Guitar Simulator AI Team',
    note: 'Andante grazioso, from the piano score. The middle section moves to the 7th position in thirds and octaves.',
    module: 'minueto-op1-3.js',
    group: 'Minuetos Op. 1',
  },
  {
    id: 'rondo-alla-turca',
    title: 'Rondo alla Turca',
    artist: 'Wolfgang Amadeus Mozart',
    arranger: 'Guitar Simulator AI Team',
    note: 'The whole movement, without repeats, from a public-domain edition. Melody over bass, mostly in first position.',
    module: 'rondo-alla-turca.js',
  },
  {
    id: 'guitar-chords',
    title: 'Guitar chords in practice',
    artist: 'Guitar Simulator AI Team',
    arranger: 'Guitar Simulator AI Team',
    note: 'The 31 most used shapes, open and barre, each strummed and then picked, and four progressions that use them.',
    module: 'guitar-chords.js',
  },
  {
    id: 'technique-study',
    title: 'Technique study',
    artist: 'Guitar Simulator AI Team',
    arranger: 'Guitar Simulator AI Team',
    note: 'Every technique the simulator plays, one short phrase each.',
    module: 'technique-study.js',
  },
];
