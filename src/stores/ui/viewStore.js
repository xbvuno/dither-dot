import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
      }),
    }
  )
);

export default useViewStore;

