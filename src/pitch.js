export const STRING_COUNT = 6;
export const FRET_COUNT = 12;
export const TUNING = [40, 45, 50, 55, 59, 64];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export const noteName = (midi) =>
  `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// string 0 is the low E, string 5 the high E.
export const noteAt = (string, fret) => {
  if (!Number.isInteger(string) || string < 0 || string >= STRING_COUNT) {
    throw new RangeError(`string must be an integer in 0-${STRING_COUNT - 1}, got ${string}`);
  }
  if (!Number.isInteger(fret) || fret < 0 || fret > FRET_COUNT) {
    throw new RangeError(`fret must be an integer in 0-${FRET_COUNT}, got ${fret}`);
  }
  return TUNING[string] + fret;
};

// Distance from the nut to fret n, for n = 1..count (equal temperament).
export const fretPositions = (scaleLength, count = FRET_COUNT) =>
  Array.from({ length: count }, (_, i) => scaleLength * (1 - 2 ** (-(i + 1) / 12)));
