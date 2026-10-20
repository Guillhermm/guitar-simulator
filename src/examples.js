// Reads one example's tab text. Each song is an ES module exporting its tab, so this is a dynamic
// import() of a same-origin module (script-src 'self').
export const loadExampleText = async (entry, importer = (path) => import(path)) => {
  const mod = await importer(`../songs/${entry.module}`);
  if (typeof mod.default !== 'string' || mod.default.trim() === '') {
    throw new Error(`Example ${entry.id} has no tab text`);
  }
  return mod.default;
};

// Picking a song is asking to hear it, so a pick plays once it loads, however the list was opened
// (Guilherme, 2026-10-20). The pick's click is the gesture that lets the audio start.
export const createExamplesFlow = ({ show, load, apply, start, fail }) => ({
  open: () => show(),
  pick: async (entry) => {
    let text;
    try {
      text = await load(entry);
    } catch (error) {
      fail(error);
      return;
    }
    apply(text);
    start();
  },
});
