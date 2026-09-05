import { create } from 'zustand';

const useViewStore = create((set) => ({
  previewingOriginal: false,
  setPreviewingOriginal: (v) => set({ previewingOriginal: v }),

  activeSliderId: null,
  setActiveSliderId: (id) => set({ activeSliderId: id }),
  clearActiveSlider: () => set({ activeSliderId: null }),
}));

export default useViewStore;

