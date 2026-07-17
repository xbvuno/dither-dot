import { create } from 'zustand';
import statue from '../assets/STATUE.jpg';
import sunset from '../assets/SUNSET.jpg';
import flames from '../assets/FLAMES.jpg';
import pizzaCow from '../assets/PIZZA_COW.gif';
import {
  clearGalleryHistoryFromDb,
  loadGalleryHistoryFromDb,
  saveGalleryHistoryToDb,
} from '../utils/galleryIndexedDb';

export const GALLERY_PRESETS = [
  { id: 'preset-statue', src: statue, name: 'STATUE' },
  { id: 'preset-sunset', src: sunset, name: 'SUNSET' },
  { id: 'preset-flames', src: flames, name: 'FLAMES' },
  { id: 'preset-pizza-cow', src: pizzaCow, name: 'PIZZA_COW' },
];

const MAX_HISTORY_ITEMS = 20;

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const src = typeof entry.src === 'string' ? entry.src : '';
  const name = typeof entry.name === 'string' ? entry.name : 'IMPORTED';
  if (!src) return null;

  const kind = entry.kind === 'gif' ? 'gif' : 'image';
  const gifDataUrl = kind === 'gif' && typeof entry.gifDataUrl === 'string' ? entry.gifDataUrl : null;

  return {
    id: typeof entry.id === 'string' ? entry.id : `hist-${Date.now()}`,
    src,
    name,
    kind,
    gifDataUrl,
  };
}

const useGalleryStore = create((set) => ({
  history: [],
  hasHydratedHistory: false,

  hydrateHistory: async () => {
    const storedHistory = await loadGalleryHistoryFromDb();
    const normalized = Array.isArray(storedHistory)
      ? storedHistory.map(normalizeHistoryEntry).filter(Boolean)
      : [];
    set({
      history: normalized.slice(0, MAX_HISTORY_ITEMS),
      hasHydratedHistory: true,
    });
  },

  pushHistory: (src, name) => {
    let nextHistory = [];
    set((state) => {
      const deduped = state.history.filter((e) => e.src !== src);
      const entry = {
        id: `hist-${Date.now()}`,
        src,
        name,
        kind: 'image',
        gifDataUrl: null,
      };
      nextHistory = [entry, ...deduped].slice(0, MAX_HISTORY_ITEMS);
      return { history: nextHistory };
    });
    void saveGalleryHistoryToDb(nextHistory);
  },

  pushGifHistory: (previewSrc, name, gifDataUrl) => {
    let nextHistory = [];
    set((state) => {
      const deduped = state.history.filter((e) => e.gifDataUrl !== gifDataUrl);
      const entry = {
        id: `hist-${Date.now()}`,
        src: previewSrc,
        name,
        kind: 'gif',
        gifDataUrl,
      };
      nextHistory = [entry, ...deduped].slice(0, MAX_HISTORY_ITEMS);
      return { history: nextHistory };
    });
    void saveGalleryHistoryToDb(nextHistory);
  },

  removeHistoryItem: (id) => {
    let nextHistory = [];
    set((state) => {
      nextHistory = state.history.filter((entry) => entry.id !== id);
      return { history: nextHistory };
    });
    void saveGalleryHistoryToDb(nextHistory);
  },

  renameHistoryItem: (id, name) => {
    let nextHistory = [];
    set((state) => {
      nextHistory = state.history.map((entry) =>
        entry.id === id ? { ...entry, name } : entry
      );
      return { history: nextHistory };
    });
    void saveGalleryHistoryToDb(nextHistory);
  },

  clearHistory: () => {
    set({ history: [] });
    void clearGalleryHistoryFromDb();
  },
}));

void useGalleryStore.getState().hydrateHistory();

export default useGalleryStore;
