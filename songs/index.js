// To add a song: drop a module in this folder that exports the tab text as its default export, then
// add an entry here. `module` is the file name inside songs/, loaded on demand with import().
export const SONGS = [
  {
    id: 'minueto-op1-1',
    title: 'Minueto Op. 1 No. 1 in E major',
    artist: 'Guilherme Almeida Zeni',
    arranger: 'Guitar Simulator team',
    note: 'Allegro, from the piano score. Melody over a bass in first position, a short run up to the 9th fret.',
    module: 'minueto-op1-1.js',
  },
  {
    id: 'minueto-op1-2',
    title: 'Minueto Op. 1 No. 2 in G minor',
    artist: 'Guilherme Almeida Zeni',
    arranger: 'Guitar Simulator team',
    note: 'Andante, from the piano score. Opens with the accelerating run and ends with it in the bass.',
    module: 'minueto-op1-2.js',
  },
  {
    id: 'minueto-op1-3',
    title: 'Minueto Op. 1 No. 3 in C major',
    artist: 'Guilherme Almeida Zeni',
    arranger: 'Guitar Simulator team',
    note: 'Andante grazioso, from the piano score. The middle section moves to the 7th position in thirds and octaves.',
    module: 'minueto-op1-3.js',
  },
  {
    id: 'guitar-chords',
    title: 'Guitar chords in practice',
    artist: 'Guitar Simulator team',
    arranger: 'Guitar Simulator team',
    note: 'The 31 most used shapes, open and barre, each strummed and then picked, and four progressions that use them.',
    module: 'guitar-chords.js',
  },
  {
    id: 'technique-study',
    title: 'Technique study',
    artist: 'Guitar Simulator team',
    arranger: 'Guitar Simulator team',
    note: 'Every technique the simulator plays, one short phrase each.',
    module: 'technique-study.js',
  },
];
