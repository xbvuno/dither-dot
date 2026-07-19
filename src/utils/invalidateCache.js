const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
const VERSION_KEY = 'dither-dot:app-version';

try {
  const storedVersion = localStorage.getItem(VERSION_KEY);
  if (storedVersion !== CURRENT_VERSION) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dither-dot:')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    console.log(`[cache] localStorage cleared for version update to ${CURRENT_VERSION}`);
  }
} catch (error) {
  console.warn('[cache] localstorage invalidator failed', error);
}
