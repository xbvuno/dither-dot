import { create } from 'zustand';
import useGalleryStore, { createRandomItems, INITIAL_RANDOM_SEEDS } from '../data/galleryStore';
import useGifStore from './gifStore';
import useWebcamStore, { WEBCAM_SOURCE } from './webcamStore';

const IMAGE_STORE_KEY = 'dither-dot:image';

const defaultRandom = createRandomItems(INITIAL_RANDOM_SEEDS)[0];

const DEFAULT_IMAGE_STATE = {
  sourceImg: defaultRandom.src,
  sourceName: defaultRandom.name,
  sourceKind: 'preset',
};

function purgeOversizedPersistedState(storageKey, maxChars = 250_000) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw && raw.length > maxChars) {
      localStorage.removeItem(storageKey);
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

import { persist, createJSONStorage } from 'zustand/middleware';

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
      },
    }),
    {
      name: IMAGE_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        if (state.sourceKind === 'webcam' || state.sourceImg === WEBCAM_SOURCE) {
          return {
            sourceImg: DEFAULT_IMAGE_STATE.sourceImg,
            sourceName: DEFAULT_IMAGE_STATE.sourceName,
            sourceKind: DEFAULT_IMAGE_STATE.sourceKind,
            exportUpscale: state.exportUpscale,
          };
        }
        return {
          sourceImg: state.sourceImg,
          sourceName: state.sourceName,
          sourceKind: state.sourceKind,
          exportUpscale: state.exportUpscale,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (
          state &&
          (state.sourceImg === WEBCAM_SOURCE ||
            state.sourceKind === 'webcam' ||
            !state.sourceImg ||
            (state.sourceName === 'STATUE' && state.sourceKind === 'default'))
        ) {
          state.sourceImg = DEFAULT_IMAGE_STATE.sourceImg;
          state.sourceName = DEFAULT_IMAGE_STATE.sourceName;
          state.sourceKind = DEFAULT_IMAGE_STATE.sourceKind;
        }
      },
    }
  )
);

export default useImageStore;