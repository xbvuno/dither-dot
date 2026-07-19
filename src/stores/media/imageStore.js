import { create } from 'zustand';
import statue from '../../assets/STATUE.jpg';
import useGalleryStore from '../data/galleryStore';
import useGifStore from './gifStore';
import useWebcamStore, { WEBCAM_SOURCE } from './webcamStore';

const IMAGE_STORE_KEY = 'dither-dot:image';

const DEFAULT_IMAGE_STATE = {
  sourceImg: statue,
  sourceName: 'STATUE',
  sourceKind: 'default',
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

const useImageStore = create((set, get) => ({
  ...DEFAULT_IMAGE_STATE,
  viewerLoading: false,
  exportPreviewUrl: null,
  lastRenderJobId: null,

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
}));

export default useImageStore;