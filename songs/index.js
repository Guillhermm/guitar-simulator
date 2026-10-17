// To add a song: drop a module in this folder that exports the tab text as its default export, then
// add an entry here. `module` is the file name inside songs/, loaded on demand with import().
export const SONGS = [
  {
    id: 'technique-study',
    title: 'Technique study',
    artist: 'Guitar Simulator team',
    arranger: 'Guitar Simulator team',
    note: 'Every technique the simulator plays, one short phrase each.',
    module: 'technique-study.js',
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy (opening)',
    artist: 'Ludwig van Beethoven',
    arranger: 'Guitar Simulator team',
    note: 'The first four bars of the melody on the top two strings.',
    module: 'ode-to-joy.js',
  },
];
