import { create } from 'zustand';
import statue from '../../assets/STATUE.jpg';
import sunset from '../../assets/SUNSET.jpg';
import flames from '../../assets/FLAMES.jpg';
import pizzaCow from '../../assets/PIZZA_COW.gif';
import {
  clearGalleryHistoryFromDb,
  loadGalleryHistoryFromDb,
  saveGalleryHistoryToDb,
} from '../../utils/galleryIndexedDb';

export const GALLERY_PRESETS = [
  { id: 'preset-statue', src: statue, name: 'STATUE' },
  { id: 'preset-sunset', src: sunset, name: 'SUNSET' },
  { id: 'preset-flames', src: flames, name: 'FLAMES' },
  { id: 'preset-pizza-cow', src: pizzaCow, name: 'PIZZA_COW', isGif: true },
];

export const INITIAL_RANDOM_SEEDS = [
  'cyber-cat',
  'retro-wave',
  'urban-neon',
  'abstract-art',
  'vapor-grid',
  'cosmic-dust',
];

export function createRandomItems(seeds = INITIAL_RANDOM_SEEDS) {
  return seeds.map((seed, index) => ({
    id: `random-${seed}`,
    name: `RANDOM ${index + 1}`,
    src: `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`,
    thumb: `https://picsum.photos/seed/${encodeURIComponent(seed)}/200/200`,
    isRandom: true,
  }));
}

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

function isPresetItem(src, name, gifDataUrl) {
  const normName = String(name || '').trim().toUpperCase();
  if (normName.startsWith('RANDOM') || (typeof src === 'string' && src.includes('picsum.photos'))) {
    return true;
  }
  return GALLERY_PRESETS.some((p) => {
    const pName = p.name.toUpperCase();
    if (pName === normName) return true;
    if (src && p.src === src) return true;
    if (gifDataUrl && p.src === gifDataUrl) return true;
    return false;
  });
}

const useGalleryStore = create((set, get) => ({
  history: [],
  hasHydratedHistory: false,
  randomImages: createRandomItems(),

  refreshRandomImages: () => {
    const timestamp = Date.now();
    const newSeeds = Array.from({ length: 6 }, (_, i) => `rnd-${timestamp}-${i + 1}`);
    const newItems = createRandomItems(newSeeds);
    set({ randomImages: newItems });
    return newItems;
  },

  hydrateHistory: async () => {
    const storedHistory = await loadGalleryHistoryFromDb();
    const normalized = Array.isArray(storedHistory)
      ? storedHistory.map(normalizeHistoryEntry).filter(Boolean)
      : [];
    const filtered = normalized.filter((entry) => !isPresetItem(entry.src, entry.name, entry.gifDataUrl));
    set({
      history: filtered.slice(0, MAX_HISTORY_ITEMS),
      hasHydratedHistory: true,
    });
  },

  pushHistory: (src, name) => {
    if (isPresetItem(src, name)) return;
    let nextHistory = [];
    set((state) => {
      const deduped = state.history.filter((e) => e.src !== src && e.name.toUpperCase() !== String(name || '').toUpperCase());
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
    if (isPresetItem(previewSrc, name, gifDataUrl)) return;
    let nextHistory = [];
    set((state) => {
      const deduped = state.history.filter((e) => e.gifDataUrl !== gifDataUrl && e.name.toUpperCase() !== String(name || '').toUpperCase());
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
