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
      const origW = Number(state.size.width) || 1;
      const origH = Number(state.size.height) || 1;
      const crop = state.crop || { top: 0, bottom: 0, left: 0, right: 0 };
      const curW = Math.max(1, origW - (crop.left || 0) - (crop.right || 0));
      const curH = Math.max(1, origH - (crop.top || 0) - (crop.bottom || 0));

      if (locked) {
        // Switching to KEEP: start clean at 100% scale (scale: 1.0)
        return {
          ratioLocked: true,
          ratio: curW / curH,
          customSize: {
            customWidth: origW,
            customHeight: origH,
          },
        };
      }

      // Switching to FREE: start clean with current dimensions
      return {
        ratioLocked: false,
        ratio: curW / curH,
        customSize: {
          customWidth: origW,
          customHeight: origH,
        },
      };
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

  setScale: (scale) =>
    set((state) => {
      const origW = Number(state.size.width);
      const origH = Number(state.size.height);
      if (!origW || !origH) return {};

      const crop = state.crop || { top: 0, bottom: 0, left: 0, right: 0 };
      const croppedOrigW = Math.max(1, origW - (crop.left || 0) - (crop.right || 0));
      const croppedOrigH = Math.max(1, origH - (crop.top || 0) - (crop.bottom || 0));

      const s = Math.max(0, Math.min(1.0, Number(scale) || 0));
      const targetCroppedW = s === 0 ? 1 : Math.max(1, Math.round(croppedOrigW * s));
      const targetCroppedH = s === 0 ? 1 : Math.max(1, Math.round(croppedOrigH * s));

      const newCustomW = targetCroppedW + (crop.left || 0) + (crop.right || 0);
      const newCustomH = targetCroppedH + (crop.top || 0) + (crop.bottom || 0);

      return {
        ratio: targetCroppedW / targetCroppedH,
        customSize: {
          customWidth: newCustomW,
          customHeight: newCustomH,
        },
      };
    }),

  setCropTop: (val) =>
    set((state) => {
      const nextCrop = clampCrop({ ...state.crop, top: val }, state.customSize.customWidth, state.customSize.customHeight);
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setCropBottom: (val) =>
    set((state) => {
      const nextCrop = clampCrop({ ...state.crop, bottom: val }, state.customSize.customWidth, state.customSize.customHeight);
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setCropLeft: (val) =>
    set((state) => {
      const nextCrop = clampCrop({ ...state.crop, left: val }, state.customSize.customWidth, state.customSize.customHeight);
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setCropRight: (val) =>
    set((state) => {
      const nextCrop = clampCrop({ ...state.crop, right: val }, state.customSize.customWidth, state.customSize.customHeight);
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  resetCrop: () =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      return {
        crop: { top: 0, bottom: 0, left: 0, right: 0 },
        ratio: w / h,
      };
    }),

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