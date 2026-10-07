const RING_SECONDS = 4;
const PEAK = 0.9;
const FADE_SECONDS = 0.02;

// Karplus-Strong. The loop holds a two-tap averager (lowpass, 0.5 sample of
// delay at DC) and a first-order allpass that supplies the fractional part of
// the delay, so the pitch is not quantized to whole samples.
export const renderPluck = ({ frequency, sampleRate, duration, random = Math.random }) => {
  if (!(frequency > 0) || !(sampleRate > 0) || !(duration > 0)) {
    throw new RangeError('frequency, sampleRate and duration must be positive');
  }
  const total = sampleRate / frequency;
  // The allpass is accurate for delays in [0.5, 1.5), so keep d in that range.
  const wholeDelay = Math.floor(total - 1);
  if (wholeDelay < 1) throw new RangeError(`frequency ${frequency} is too high for ${sampleRate} Hz`);
  const d = total - 0.5 - wholeDelay;
  const c = (1 - d) / (1 + d);
  const loopGain = 10 ** (-3 / (frequency * RING_SECONDS));

  const length = Math.max(1, Math.round(duration * sampleRate));
  const out = new Float32Array(length);

  // Excitation: noise with its mean removed, softened by one pass of
  // smoothing so the attack is bright but not harsh.
  const burst = wholeDelay + 1;
  const noise = new Float64Array(burst);
  let mean = 0;
  for (let i = 0; i < burst; i++) {
    noise[i] = random() * 2 - 1;
    mean += noise[i] / burst;
  }
  let prev = 0;
  for (let i = 0; i < Math.min(burst, length); i++) {
    const v = noise[i] - mean;
    out[i] = 0.7 * v + 0.3 * prev;
    prev = v;
  }

  let lpPrev = 0;
  let apPrev = 0;
  for (let n = burst; n < length; n++) {
    const lp = 0.5 * (out[n - wholeDelay] + out[n - wholeDelay - 1]);
    const ap = c * lp + lpPrev - c * apPrev;
    lpPrev = lp;
    apPrev = ap;
    out[n] = loopGain * ap;
  }

  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? PEAK / peak : 0;
  const fade = Math.min(length, Math.round(FADE_SECONDS * sampleRate));
  for (let i = 0; i < length; i++) {
    const tail = length - i;
    out[i] *= scale * (tail < fade ? tail / fade : 1);
  }
  return out;
};
