// Without a service worker (an old browser, or a page not served over HTTPS or from localhost) the
// app still runs, only not offline.
export const registerServiceWorker = (nav = globalThis.navigator) => {
  if (!nav?.serviceWorker) return Promise.resolve(null);
  return nav.serviceWorker.register('sw.js').catch((error) => {
    console.warn('Offline support is off:', error);
    return null;
  });
};
