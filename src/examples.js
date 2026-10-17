// Reads one example's tab text. The CSP has connect-src 'none', so this is a dynamic import() of a
// same-origin module (script-src 'self'), never a fetch.
export const loadExampleText = async (entry, importer = (path) => import(path)) => {
  const mod = await importer(`../songs/${entry.module}`);
  if (typeof mod.default !== 'string' || mod.default.trim() === '') {
    throw new Error(`Example ${entry.id} has no tab text`);
  }
  return mod.default;
};

// The two ways to open the list differ in one thing: only the one Play opens starts playback after a
// pick. `fromPlay` is read when the pick starts, so a slow load cannot be affected by a later open.
export const createExamplesFlow = ({ show, load, apply, start, fail }) => {
  let fromPlay = false;
  return {
    openFromButton: () => { fromPlay = false; show(); },
    openFromPlay: () => { fromPlay = true; show(); },
    pick: async (entry) => {
      const autoPlay = fromPlay;
      let text;
      try {
        text = await load(entry);
      } catch (error) {
        fail(error);
        return;
      }
      apply(text);
      if (autoPlay) start();
    },
  };
};
