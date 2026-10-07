# Guitar Simulator

An acoustic guitar you play in the browser. Six strings in standard tuning (E2 A2 D3 G3 B3 E4), open plus twelve frets, with frets spaced by twelve-tone equal temperament.

## Run it

```sh
npm run serve
```

Then open <http://127.0.0.1:8000>. ES modules do not load from `file://`, so a local server is needed. There is no build step and there are no dependencies: the browser loads `index.html`, `styles.css` and `src/` as they are.

## Play it

- Click or tap a string between two fret wires to play that fret; left of the nut plays it open.
- Keyboard: Tab or Up/Down picks a string, Left/Right/Home/End picks a fret, Space or Enter plucks.

## How the sound is made

Nothing is sampled. Each note is synthesized with the Karplus-Strong plucked-string algorithm (`src/pluck.js`): a burst of noise circulates in a delay line one period long, and a lowpass in the loop takes the high harmonics out faster than the low ones, the way a real string loses its brightness. A first-order allpass supplies the fractional part of the delay, so pitch is not rounded to whole samples; every note lands within a cent of equal temperament. Notes are rendered once into an `AudioBuffer`, cached per note, and played through a gain and a limiter (`src/audio.js`). Notes overlap, so chords ring.

The audio context is created on the first press, inside the user gesture, because browsers block audio until the page is touched.

## Test

```sh
npm test
```

Uses Node's built-in test runner, checked on Node 24.
