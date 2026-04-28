import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useWatermarkStore = create(persist((set) => ({
  enabled: true,
  setEnabled: (enabled) => set({ enabled: Boolean(enabled) }),
  toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),
}), {
  name: 'dither-dot:watermark',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ enabled: state.enabled }),
}));

export default useWatermarkStore;
