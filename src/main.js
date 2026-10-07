import { createPlayer } from './audio.js';
import { buildGuitar } from './guitar.js';
import { createTabPanel } from './tab-panel.js';

const wantsGrid = new URLSearchParams(location.search).get('editor') === 'grid';
const { createEditor } = await import(wantsGrid ? './editor-grid.js' : './editor-text.js');

const player = createPlayer();
let panel = null;
const guitar = buildGuitar(document.getElementById('guitar'), {
  player,
  onFretPress: (row, fret) => panel && panel.onFretPress(row, fret),
});
panel = createTabPanel({ dock: document.getElementById('dock'), player, guitar, createEditor });
