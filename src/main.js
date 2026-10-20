import { createPlayer } from './audio.js';
import { buildGuitar } from './guitar.js';
import { createTabPanel } from './tab-panel.js';
import { installPrint } from './print.js';
import { buildCredit } from './credit.js';
import { installStageFit } from './stage-fit.js';
import { createEditor as createTextEditor } from './editor-text.js';
import { createEditor as createGridEditor } from './editor-grid.js';
import { registerServiceWorker } from './offline.js';

buildCredit(document.querySelector('.credit'));

const player = createPlayer();
let panel = null;
const guitar = buildGuitar(document.getElementById('guitar'), {
  player,
  onFretPress: (row, fret) => panel && panel.onFretPress(row, fret),
});
const root = document.getElementById('app');
panel = createTabPanel({
  dock: document.getElementById('dock'),
  root,
  player,
  guitar,
  editors: { text: createTextEditor, grid: createGridEditor },
});
installStageFit({
  root,
  stage: document.getElementById('stage'),
  probe: document.getElementById('stage-probe'),
  portrait: window.matchMedia('(orientation: portrait) and (max-width: 48rem)'),
});
// The first state is set without animating from the markup's default to the saved one.
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('preload')));

installPrint({ getText: () => panel.getText() });
registerServiceWorker();
