import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import useGifStore from '../media/gifStore';

const useViewStore = create(
  persist(
    (set) => ({
      previewingOriginal: false,
      setPreviewingOriginal: (v) => set({ previewingOriginal: v }),

      splitView: false,
      setSplitView: (v) => {
        set({ splitView: Boolean(v) });
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      },
      toggleSplitView: () => {
        set((s) => ({ splitView: !s.splitView }));
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      },

      splitDirection: 'vertical',
      setSplitDirection: (d) => {
        set({ splitDirection: d || 'vertical' });
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      },

      splitFirstView: 'pre_dithering',
      setSplitFirstView: (v) => {
        const val = v === 'post_process' ? 'pre_dithering' : (v || 'pre_dithering');
        set({ splitFirstView: val });
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      },

      previewScrollbars: true,
      setPreviewScrollbars: (v) => set({ previewScrollbars: Boolean(v) }),

      gifThumbnails: true,
      setGifThumbnails: (v) => {
        const val = Boolean(v);
        set({ gifThumbnails: val });
        try {
          useGifStore.getState().setThumbnailsEnabled(val);
        } catch {
          // ignore if gifStore is not yet initialized
        }
      },

      activeSliderId: null,
      setActiveSliderId: (id) => set({ activeSliderId: id }),
      clearActiveSlider: () => set({ activeSliderId: null }),
    }),
    {
      name: 'dither-dot:view-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        splitView: state.splitView,
        splitDirection: state.splitDirection,
        splitFirstView: state.splitFirstView === 'post_process' ? 'pre_dithering' : state.splitFirstView,
        previewScrollbars: state.previewScrollbars,
        gifThumbnails: state.gifThumbnails,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && (state.splitFirstView === 'post_process' || !state.splitFirstView)) {
          state.splitFirstView = 'pre_dithering';
        }
      },
    }
  )
);

export default useViewStore;

