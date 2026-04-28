import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const INITIAL_SIZE_STATE = {
  size: { width: null, height: null },
  ratio: null,
  ratioLocked: true,
  customSize: { customWidth: null, customHeight: null },
};

const useSizeStore = create(persist((set) => ({
  ...INITIAL_SIZE_STATE,

  setRatioLocked: (locked) =>
    set((state) => {
      if (!locked) return { ratioLocked: false };
      // Switching to KEEP: recompute ratio from current custom dimensions
      const w = state.customSize.customWidth;
      const h = state.customSize.customHeight;
      const newRatio = (w && h) ? w / h : state.ratio;
      return { ratioLocked: true, ratio: newRatio };
    }),
  setWidth: (newWidth) =>
    set((state) => ({
      size: { ...state.size, width: newWidth },
      customSize: { ...state.customSize, customWidth: newWidth },
      ratio: newWidth / state.size.height,
    })),

  setHeight: (newHeight) =>
    set((state) => ({
      size: { ...state.size, height: newHeight },
      customSize: { ...state.customSize, customHeight: newHeight },
      ratio: state.size.width / newHeight,
    })),

  setSize: ({ width, height }, options = {}) =>
    set((state) => {
      const safeWidth = Number(width) || null;
      const safeHeight = Number(height) || null;
      const shouldResetCustom = Boolean(options?.resetCustom);

      if (shouldResetCustom) {
        return {
          size: { width: safeWidth, height: safeHeight },
          customSize: {
            customWidth: safeWidth,
            customHeight: safeHeight,
          },
          ratio: (safeWidth && safeHeight) ? safeWidth / safeHeight : state.ratio,
        };
      }

      const prevCustomWidth = Number(state.customSize.customWidth) || null;
      const prevCustomHeight = Number(state.customSize.customHeight) || null;

      const nextCustomWidth = prevCustomWidth
        ? Math.max(1, Math.min(prevCustomWidth, safeWidth || prevCustomWidth))
        : safeWidth;
      const nextCustomHeight = prevCustomHeight
        ? Math.max(1, Math.min(prevCustomHeight, safeHeight || prevCustomHeight))
        : safeHeight;

      const nextRatio = (nextCustomWidth && nextCustomHeight)
        ? nextCustomWidth / nextCustomHeight
        : ((safeWidth && safeHeight) ? safeWidth / safeHeight : state.ratio);

      return {
        size: { width: safeWidth, height: safeHeight },
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
        ratio: nextRatio,
      };
    }),

  setCustomWidth: (newWidth) =>
    set((state) => {
      if (!state.ratioLocked || !state.ratio) {
        return { customSize: { ...state.customSize, customWidth: newWidth } };
      }
      return {
        customSize: {
          customWidth: newWidth,
          customHeight: Math.round(newWidth / state.ratio),
        },
      };
    }),

  setCustomHeight: (newHeight) =>
    set((state) => {
      if (!state.ratioLocked || !state.ratio) {
        return { customSize: { ...state.customSize, customHeight: newHeight } };
      }
      return {
        customSize: {
          customWidth: Math.round(newHeight * state.ratio),
          customHeight: newHeight,
        },
      };
    }),

  setCustomSize: (newSize) =>
    set({ customSize: newSize }),

  resetSizeToCurrent: () =>
    set((state) => {
      const width = Number(state.size.width) || null;
      const height = Number(state.size.height) || null;
      return {
        ratioLocked: true,
        customSize: {
          customWidth: width,
          customHeight: height,
        },
        ratio: (width && height) ? width / height : state.ratio,
      };
    }),

  resetSize: () => set({ ...INITIAL_SIZE_STATE }),
}), {
  name: 'dither-dot:size',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    size: state.size,
    customSize: state.customSize,
    ratio: state.ratio,
    ratioLocked: state.ratioLocked,
  }),
}));

export default useSizeStore;