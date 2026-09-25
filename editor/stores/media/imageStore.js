import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import useGalleryStore, { createRandomItems, INITIAL_RANDOM_SEEDS } from '../data/galleryStore';
import useGifStore from './gifStore';
import useWebcamStore, { WEBCAM_SOURCE } from './webcamStore';

const IMAGE_STORE_KEY = 'dither-dot:image';

// Default fallback random image is RANDOM 4 (abstract-art)
const fallbackRandom = createRandomItems(INITIAL_RANDOM_SEEDS)[3];

export const DEFAULT_IMAGE_STATE = {
  sourceImg: fallbackRandom.src,
  sourceName: fallbackRandom.name,
  sourceKind: 'default',
};

let autoDefaultPromise = null;
let hasAttemptedAutoDefault = false;

export async function fetchAutoDefaultImage(force = false) {
  if (hasAttemptedAutoDefault && !force) return autoDefaultPromise;
  hasAttemptedAutoDefault = true;
  if (autoDefaultPromise) return autoDefaultPromise;

  autoDefaultPromise = (async () => {
    const fallbackItem = createRandomItems(INITIAL_RANDOM_SEEDS)[3];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`https://picsum.photos/800/600?random=${Date.now()}`, {
        signal: controller.signal,
        cache: 'no-cache',
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Picsum HTTP error: ${response.status}`);
      }

      const finalUrl = response.url || `https://picsum.photos/800/600`;
      const picsumId = response.headers.get('picsum-id');
      const name = picsumId ? `RANDOM #${picsumId}` : 'RANDOM';

      // Verify the image can be loaded as an HTMLImageElement with anonymous crossOrigin
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image texture from Picsum'));
        img.src = finalUrl;
      });

      // Verify state hasn't been changed by user interaction while fetch was in-flight
      const currentState = useImageStore.getState();
      if (!force && currentState.sourceKind !== 'default') {
        return;
      }

      const newItem = {
        id: picsumId ? `random-picsum-${picsumId}` : `random-${Date.now()}`,
        name,
        src: finalUrl,
        thumb: picsumId ? `https://picsum.photos/id/${picsumId}/200/200` : finalUrl,
        isRandom: true,
      };

      useGalleryStore.getState().addRandomImage(newItem);
      useImageStore.getState().setSourceDirect(newItem.src, newItem.name, 'default');
      return newItem;
    } catch (error) {
      console.warn('Auto default image fetch failed, falling back to RANDOM 4:', error);
      const random4 =
        useGalleryStore.getState().randomImages?.find((img) => img.name === 'RANDOM 4') || fallbackItem;
      useImageStore.getState().setSourceDirect(random4.src, random4.name, 'default');
      return fallbackItem;
    } finally {
      autoDefaultPromise = null;
    }
  })();

  return autoDefaultPromise;
}

function purgeOversizedPersistedState(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.state?.sourceImg) {
          delete parsed.state.sourceImg;
          delete parsed.state.sourceName;
          delete parsed.state.sourceKind;
          localStorage.setItem(storageKey, JSON.stringify(parsed));
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read image data.'));
    reader.readAsDataURL(blob);
  });
}

purgeOversizedPersistedState(IMAGE_STORE_KEY);

const useImageStore = create(
  persist(
    (set, get) => ({
      ...DEFAULT_IMAGE_STATE,
      viewerLoading: false,
      engineReady: false,
      exportPreviewUrl: null,
      exportUpscale: 1,
      lastRenderJobId: null,

      setEngineReady: (ready) => set({ engineReady: Boolean(ready) }),

      setExportUpscale: (upscale) => set({ exportUpscale: Math.max(1, Math.floor(Number(upscale) || 1)) }),

      setSourceFromBlob: async (blob, fileName = 'clipboard-image.png', options = {}) => {
        useWebcamStore.getState().stopWebcam?.();
        const nextUrl = await readBlobAsDataUrl(blob);
        if (!options?.skipHistory) {
          useGalleryStore.getState().pushHistory(nextUrl, fileName);
        }
        set({ sourceImg: nextUrl, sourceName: fileName, sourceKind: 'imported' });
      },

      setSourceFromFile: async (file) => {
        await get().setSourceFromBlob(file, file?.name || 'imported-image');
      },

      // Select an existing preset or history URL without creating a new blob
      setSourceDirect: (src, name, kind = 'preset') => {
        if (src !== WEBCAM_SOURCE) {
          useWebcamStore.getState().stopWebcam?.();
        }
        useGifStore.getState().clearFrames?.();
        set({ sourceImg: src, sourceName: name, sourceKind: kind });
      },

      setSourceName: (name) => set({ sourceName: name }),

      setViewerLoading: (viewerLoading) => set({ viewerLoading: Boolean(viewerLoading) }),

      setExportPreviewUrl: (url) => set({ exportPreviewUrl: url || null }),

      clearExportPreviewUrl: () => set({ exportPreviewUrl: null }),

      resetToDefault: () => {
        useWebcamStore.getState().stopWebcam?.();
        useGifStore.getState().clearFrames?.();
        set({ ...DEFAULT_IMAGE_STATE, exportPreviewUrl: null });
        fetchAutoDefaultImage().catch((err) => {
          console.warn('Failed to fetch auto default on reset:', err);
        });
      },
    }),
    {
      name: IMAGE_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        exportUpscale: state.exportUpscale,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.sourceImg = DEFAULT_IMAGE_STATE.sourceImg;
          state.sourceName = DEFAULT_IMAGE_STATE.sourceName;
          state.sourceKind = DEFAULT_IMAGE_STATE.sourceKind;
        }
      },
    }
  )
);

export default useImageStore;