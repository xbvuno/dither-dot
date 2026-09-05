export function normalizePath(path) {
  if (!path) return '/';
  const clean = path.split('?')[0].split('#')[0].trim();
  const trimmed = clean.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export const navigate = (to, options) => {
  if (typeof window === 'undefined') return;
  const targetPath = normalizePath(to);
  if (options?.replace) {
    window.history.replaceState({}, '', targetPath);
  } else {
    window.history.pushState({}, '', targetPath);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
};
