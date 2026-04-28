import { create } from 'zustand';

const useViewStore = create((set) => ({
  previewingOriginal: false,
  setPreviewingOriginal: (v) => set({ previewingOriginal: v }),
}));

export default useViewStore;
