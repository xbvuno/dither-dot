import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const INITIAL_SIZE_STATE = {
  size: { width: null, height: null },
  ratio: null,
  ratioLocked: true,
  customSize: { customWidth: null, customHeight: null },
  crop: { top: 0, bottom: 0, left: 0, right: 0 },
};

const clampCrop = (crop, w, h) => {
  const safeW = w || 1;
  const safeH = h || 1;
  let { top = 0, bottom = 0, left = 0, right = 0 } = crop || {};

  // Ensure left + right <= safeW - 1
  if (left + right > safeW - 1) {
    const excess = (left + right) - (safeW - 1);
    if (right >= excess) {
      right -= excess;
    } else {
      left -= (excess - right);
      right = 0;
    }
  }

  // Ensure top + bottom <= safeH - 1
  if (top + bottom > safeH - 1) {
    const excess = (top + bottom) - (safeH - 1);
    if (bottom >= excess) {
      bottom -= excess;
    } else {
      top -= (excess - bottom);
      bottom = 0;
    }
  }

  return {
    top: Math.max(0, top),
    bottom: Math.max(0, bottom),
    left: Math.max(0, left),
    right: Math.max(0, right),
  };
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
      crop: clampCrop(state.crop, newWidth, state.size.height),
    })),

  setHeight: (newHeight) =>
    set((state) => ({
      size: { ...state.size, height: newHeight },
      customSize: { ...state.customSize, customHeight: newHeight },
      ratio: state.size.width / newHeight,
      crop: clampCrop(state.crop, state.size.width, newHeight),
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
          crop: { top: 0, bottom: 0, left: 0, right: 0 },
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
        crop: clampCrop(state.crop, nextCustomWidth, nextCustomHeight),
      };
    }),

  setCustomWidth: (newWidth) =>
    set((state) => {
      let nextHeight = state.customSize.customHeight;
      if (state.ratioLocked && state.ratio) {
        nextHeight = Math.round(newWidth / state.ratio);
      }
      return {
        customSize: {
          customWidth: newWidth,
          customHeight: nextHeight,
        },
        crop: clampCrop(state.crop, newWidth, nextHeight),
      };
    }),

  setCustomHeight: (newHeight) =>
    set((state) => {
      let nextWidth = state.customSize.customWidth;
      if (state.ratioLocked && state.ratio) {
        nextWidth = Math.round(newHeight * state.ratio);
      }
      return {
        customSize: {
          customWidth: nextWidth,
          customHeight: newHeight,
        },
        crop: clampCrop(state.crop, nextWidth, newHeight),
      };
    }),

  setCustomSize: (newSize) =>
    set((state) => ({
      customSize: newSize,
      crop: clampCrop(state.crop, newSize.customWidth, newSize.customHeight),
    })),

  setCropTop: (val) =>
    set((state) => ({
      crop: clampCrop({ ...state.crop, top: val }, state.customSize.customWidth, state.customSize.customHeight),
    })),

  setCropBottom: (val) =>
    set((state) => ({
      crop: clampCrop({ ...state.crop, bottom: val }, state.customSize.customWidth, state.customSize.customHeight),
    })),

  setCropLeft: (val) =>
    set((state) => ({
      crop: clampCrop({ ...state.crop, left: val }, state.customSize.customWidth, state.customSize.customHeight),
    })),

  setCropRight: (val) =>
    set((state) => ({
      crop: clampCrop({ ...state.crop, right: val }, state.customSize.customWidth, state.customSize.customHeight),
    })),

  resetCrop: () =>
    set(() => ({
      crop: { top: 0, bottom: 0, left: 0, right: 0 },
    })),

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
        crop: { top: 0, bottom: 0, left: 0, right: 0 },
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
    crop: state.crop,
  }),
}));

export default useSizeStore;