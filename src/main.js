import { createPlayer } from './audio.js';
import { buildGuitar } from './guitar.js';

buildGuitar(document.getElementById('guitar'), { player: createPlayer() });
