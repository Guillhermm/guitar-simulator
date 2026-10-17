export const ASPECT = 1240 / 480;

// Never collapse the guitar to nothing: a zero scale makes the SVG matrix singular and breaks hit-testing.
export const MIN_K = 0.1;

// The widest guitar that fits a region. Rotated (phone portrait) the long axis runs down the screen.
export const fit = (w, h, rotated = false) => (rotated ? Math.min(h, w * ASPECT) : Math.min(w, h * ASPECT));

const usable = (n) => Number.isFinite(n) && n > 0;

// The scale that takes the guitar from the collapsed region to what the open dock leaves free.
// The SVG is laid out at the collapsed size always, so 1 means no dock or nothing worth measuring.
export const openScale = (region, inset, rotated = false) => {
  if (!region || !inset || !usable(region.w) || !usable(region.h)) return 1;
  const closed = fit(region.w, region.h, rotated);
  const open = fit(region.w - (inset.w || 0), region.h - (inset.h || 0), rotated);
  if (!usable(open)) return MIN_K;
  return Math.min(1, Math.max(MIN_K, open / closed));
};

// Reads the layout through a probe element that CSS sizes with --open-w and --open-h (the room the
// open dock takes) and --reserve (the strip for the hint and credit), then publishes --k.
export const installStageFit = ({ root, stage, probe, portrait, win = window }) => {
  const apply = () => {
    const box = stage.getBoundingClientRect();
    const p = win.getComputedStyle(probe);
    const edge = parseFloat(p.paddingLeft) || 0;
    const region = { w: box.width - 2 * edge, h: box.height - (parseFloat(p.paddingTop) || 0) };
    const inset = { w: parseFloat(p.width) || 0, h: parseFloat(p.height) || 0 };
    root.style.setProperty('--k', String(openScale(region, inset, portrait.matches)));
  };
  apply();
  const observer = new win.ResizeObserver(apply);
  observer.observe(stage);
  observer.observe(probe);
  portrait.addEventListener('change', apply);
  win.addEventListener('orientationchange', apply);
  return { apply, dispose: () => { observer.disconnect(); portrait.removeEventListener('change', apply); win.removeEventListener('orientationchange', apply); } };
};
