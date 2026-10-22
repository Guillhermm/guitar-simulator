import { buildIcon } from './icons.js';

export const VOLUME_KEY = 'guitar-simulator.volume.v1';
export const DEFAULT_VOLUME = { level: 1, muted: false };

// A missing, broken or out-of-range saved value falls back field by field, like the ui state.
export const readVolume = (raw) => {
  let data;
  try { data = JSON.parse(raw); } catch { return { ...DEFAULT_VOLUME }; }
  if (!data || typeof data !== 'object') return { ...DEFAULT_VOLUME };
  const level = Number.isFinite(data.level) ? Math.min(1, Math.max(0, data.level)) : DEFAULT_VOLUME.level;
  return { level, muted: data.muted === true };
};

// What the player hears: nothing while muted, else the slider's level.
export const audibleLevel = ({ level, muted }) => (muted ? 0 : level);

export const volumeIcon = (state) => {
  const level = audibleLevel(state);
  if (level === 0) return 'volume-off';
  return level < 0.5 ? 'volume-low' : 'volume-high';
};

// The button mutes and unmutes, as on YouTube. Unmuting a slider left at zero brings it back to
// half, or the button would look like it did nothing.
export const toggleMute = ({ level, muted }) => {
  if (muted || level === 0) return { level: level === 0 ? 0.5 : level, muted: false };
  return { level, muted: true };
};

// Moving the slider is a choice to hear that level, so it also unmutes.
export const slideTo = (level) => ({ level: Math.min(1, Math.max(0, level)), muted: false });

export const buildVolume = ({ parent, player, storage, doc = document }) => {
  let state = DEFAULT_VOLUME;
  try { state = readVolume(storage.getItem(VOLUME_KEY)); } catch { /* blocked storage keeps the default */ }

  const wrap = doc.createElement('div');
  wrap.className = 'volume';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost volume-btn';
  const range = doc.createElement('input');
  range.type = 'range';
  range.className = 'volume-range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.setAttribute('aria-label', 'Volume');
  wrap.append(button, range);
  parent.append(wrap);

  const render = () => {
    const percent = Math.round(audibleLevel(state) * 100);
    const label = state.muted || state.level === 0 ? 'Unmute' : 'Mute';
    button.replaceChildren(buildIcon(volumeIcon(state), doc));
    button.setAttribute('aria-label', label);
    button.dataset.tip = label;
    range.value = String(percent);
    range.setAttribute('aria-valuetext', `${percent}%`);
    player.setVolume(audibleLevel(state));
  };

  const apply = (next) => {
    state = next;
    render();
    try { storage.setItem(VOLUME_KEY, JSON.stringify(state)); } catch { /* the level still applies this session */ }
  };

  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', () => apply(toggleMute(state)));
  range.addEventListener('input', () => apply(slideTo(Number(range.value) / 100)));
  render();
  return { getState: () => state };
};
