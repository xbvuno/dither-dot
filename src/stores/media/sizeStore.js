import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const INITIAL_SIZE_STATE = {
  size: { width: null, height: null },
  ratio: null,
  ratioLocked: true,
  customSize: { customWidth: null, customHeight: null },
  crop: { top: 0, bottom: 0, left: 0, right: 0 },
  aspectPreset: 'free',
  aspectOrientation: 'landscape',
  aspectOffset: 0.5,
};

export const getAspectCroppedAxis = (width, height, preset, orientation = 'landscape') => {
  if (!preset || preset === 'free') return null;
  const w = Number(width) || 1;
  const h = Number(height) || 1;
  const safeOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';

  let ratioW = 1;
  let ratioH = 1;
  if (preset === '1:1') {
    ratioW = 1;
    ratioH = 1;
  } else if (preset === '4:3') {
    ratioW = safeOrientation === 'portrait' ? 3 : 4;
    ratioH = safeOrientation === 'portrait' ? 4 : 3;
  } else if (preset === '16:9') {
    ratioW = safeOrientation === 'portrait' ? 9 : 16;
    ratioH = safeOrientation === 'portrait' ? 16 : 9;
  }

  const targetRatio = ratioW / ratioH;
  const imgRatio = w / h;
  return imgRatio >= targetRatio ? 'x' : 'y';
};

export const computeAspectCrop = (width, height, preset, orientation = 'landscape', offset = 0.5, currentCrop = {}) => {
  const w = Number(width) || 1;
  const h = Number(height) || 1;

  if (!preset || preset === 'free') {
    return null;
  }

  const safeOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';
  const numOffset = typeof offset === 'number' && !Number.isNaN(offset) ? offset : 0.5;
  const p = Math.max(0, Math.min(1.0, numOffset));

  let ratioW = 1;
  let ratioH = 1;
  if (preset === '1:1') {
    ratioW = 1;
    ratioH = 1;
  } else if (preset === '4:3') {
    ratioW = safeOrientation === 'portrait' ? 3 : 4;
    ratioH = safeOrientation === 'portrait' ? 4 : 3;
  } else if (preset === '16:9') {
    ratioW = safeOrientation === 'portrait' ? 9 : 16;
    ratioH = safeOrientation === 'portrait' ? 16 : 9;
  }

  const targetRatio = ratioW / ratioH;
  const imgRatio = w / h;

  if (imgRatio >= targetRatio) {
    // Image is wider than or equal to target ratio -> X (left/right) is dependent
    // Independent axis is Y (top/bottom)
    const top = Math.max(0, Math.min(h - 1, Number(currentCrop?.top) || 0));
    const maxBottom = Math.max(0, h - top - 1);
    const bottom = Math.max(0, Math.min(maxBottom, Number(currentCrop?.bottom) || 0));
    const hAvail = Math.max(1, h - top - bottom);

    const targetW = Math.max(1, Math.min(w, Math.round(hAvail * targetRatio)));
    const totalCropX = Math.max(0, w - targetW);
    const cropLeft = Math.round(totalCropX * p);
    const cropRight = totalCropX - cropLeft;

    return {
      crop: { top, bottom, left: cropLeft, right: cropRight },
      croppedAxis: 'x',
    };
  } else {
    // Image is taller than target ratio -> Y (top/bottom) is dependent
    // Independent axis is X (left/right)
    const left = Math.max(0, Math.min(w - 1, Number(currentCrop?.left) || 0));
    const maxRight = Math.max(0, w - left - 1);
    const right = Math.max(0, Math.min(maxRight, Number(currentCrop?.right) || 0));
    const wAvail = Math.max(1, w - left - right);

    const targetH = Math.max(1, Math.min(h, Math.round(wAvail / targetRatio)));
    const totalCropY = Math.max(0, h - targetH);
    const cropTop = Math.round(totalCropY * p);
    const cropBottom = totalCropY - cropTop;

    return {
      crop: { top: cropTop, bottom: cropBottom, left, right },
      croppedAxis: 'y',
    };
  }
};

const clampCrop = (crop, w, h) => {
  const safeW = Number(w) || 1;
  const safeH = Number(h) || 1;
  let top = Number(crop?.top) || 0;
  let bottom = Number(crop?.bottom) || 0;
  let left = Number(crop?.left) || 0;
  let right = Number(crop?.right) || 0;

  if (Number.isNaN(top)) top = 0;
  if (Number.isNaN(bottom)) bottom = 0;
  if (Number.isNaN(left)) left = 0;
  if (Number.isNaN(right)) right = 0;

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
    top: Math.max(0, Math.round(top)),
    bottom: Math.max(0, Math.round(bottom)),
    left: Math.max(0, Math.round(left)),
    right: Math.max(0, Math.round(right)),
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
          aspectPreset: 'free',
          aspectOrientation: 'landscape',
          aspectOffset: 0.5,
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
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;

      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, top: val });
        if (result) {
          const nextCrop = clampCrop(result.crop, w, h);
          const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
          const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
          return {
            crop: nextCrop,
            ratio: curW / curH,
          };
        }
      }

      const nextCrop = clampCrop({ ...state.crop, top: val }, state.customSize.customWidth, state.customSize.customHeight);
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setCropBottom: (val) =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;

      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, bottom: val });
        if (result) {
          const nextCrop = clampCrop(result.crop, w, h);
          const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
          const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
          return {
            crop: nextCrop,
            ratio: curW / curH,
          };
        }
      }

      const nextCrop = clampCrop({ ...state.crop, bottom: val }, state.customSize.customWidth, state.customSize.customHeight);
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setCropLeft: (val) =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;

      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, left: val });
        if (result) {
          const nextCrop = clampCrop(result.crop, w, h);
          const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
          const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
          return {
            crop: nextCrop,
            ratio: curW / curH,
          };
        }
      }

      const nextCrop = clampCrop({ ...state.crop, left: val }, state.customSize.customWidth, state.customSize.customHeight);
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setCropRight: (val) =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;

      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, right: val });
        if (result) {
          const nextCrop = clampCrop(result.crop, w, h);
          const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
          const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
          return {
            crop: nextCrop,
            ratio: curW / curH,
          };
        }
      }

      const nextCrop = clampCrop({ ...state.crop, right: val }, state.customSize.customWidth, state.customSize.customHeight);
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);
      return {
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setAspectPreset: (preset) =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      const orientation = state.aspectOrientation || 'landscape';
      const offset = typeof state.aspectOffset === 'number' && !Number.isNaN(state.aspectOffset) ? state.aspectOffset : 0.5;

      if (preset === 'free') {
        return {
          aspectPreset: 'free',
        };
      }

      const result = computeAspectCrop(w, h, preset, orientation, offset, { top: 0, bottom: 0, left: 0, right: 0 });
      if (!result) return { aspectPreset: preset };

      const nextCrop = clampCrop(result.crop, w, h);
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      return {
        aspectPreset: preset,
        aspectOrientation: orientation,
        aspectOffset: offset,
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setAspectOrientation: (orientation) =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      const safeOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';
      const offset = typeof state.aspectOffset === 'number' && !Number.isNaN(state.aspectOffset) ? state.aspectOffset : 0.5;
      const preset = state.aspectPreset || 'free';

      if (preset === 'free') {
        return { aspectOrientation: safeOrientation };
      }

      const result = computeAspectCrop(w, h, preset, safeOrientation, offset, { top: 0, bottom: 0, left: 0, right: 0 });
      if (!result) return { aspectOrientation: safeOrientation };

      const nextCrop = clampCrop(result.crop, w, h);
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      return {
        aspectOrientation: safeOrientation,
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  setAspectOffset: (offset) =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      const safeOffset = Math.max(0, Math.min(1.0, typeof offset === 'number' && !Number.isNaN(offset) ? offset : 0.5));
      const orientation = state.aspectOrientation || 'landscape';
      const preset = state.aspectPreset || 'free';

      if (preset === 'free') {
        return { aspectOffset: safeOffset };
      }

      const result = computeAspectCrop(w, h, preset, orientation, safeOffset, state.crop);
      if (!result) return { aspectOffset: safeOffset };

      const nextCrop = clampCrop(result.crop, w, h);
      const curW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const curH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      return {
        aspectOffset: safeOffset,
        crop: nextCrop,
        ratio: curW / curH,
      };
    }),

  resetCrop: () =>
    set((state) => {
      const w = Number(state.size.width) || Number(state.customSize.customWidth) || 1;
      const h = Number(state.size.height) || Number(state.customSize.customHeight) || 1;
      return {
        aspectPreset: 'free',
        aspectOffset: 0.5,
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
        aspectPreset: 'free',
        aspectOrientation: 'landscape',
        aspectOffset: 0.5,
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
    aspectPreset: state.aspectPreset,
    aspectOrientation: state.aspectOrientation,
    aspectOffset: state.aspectOffset,
  }),
}));

export default useSizeStore;