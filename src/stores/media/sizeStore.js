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
            customWidth: curW,
            customHeight: curH,
          },
        };
      }

      // Switching to FREE: start clean with current dimensions
      return {
        ratioLocked: false,
        ratio: curW / curH,
        customSize: {
          customWidth: curW,
          customHeight: curH,
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
        crop: clampCrop(state.crop, safeWidth, safeHeight),
      };
    }),

  setCustomWidth: (newWidth) =>
    set((state) => {
      const w = Math.max(1, Math.round(newWidth));
      let nextHeight = state.customSize.customHeight;
      if (state.ratioLocked && state.ratio) {
        nextHeight = Math.max(1, Math.round(w / state.ratio));
      }
      return {
        customSize: {
          customWidth: w,
          customHeight: nextHeight,
        },
      };
    }),

  setCustomHeight: (newHeight) =>
    set((state) => {
      const h = Math.max(1, Math.round(newHeight));
      let nextWidth = state.customSize.customWidth;
      if (state.ratioLocked && state.ratio) {
        nextWidth = Math.max(1, Math.round(h * state.ratio));
      }
      return {
        customSize: {
          customWidth: nextWidth,
          customHeight: h,
        },
      };
    }),

  setCustomSize: (newSize) =>
    set(() => ({
      customSize: newSize,
    })),

  setScale: (scale) =>
    set((state) => {
      const origW = Number(state.size.width);
      const origH = Number(state.size.height);
      if (!origW || !origH) return {};

      const crop = state.crop || { top: 0, bottom: 0, left: 0, right: 0 };
      const croppedOrigW = Math.max(1, origW - (crop.left || 0) - (crop.right || 0));
      const croppedOrigH = Math.max(1, origH - (crop.top || 0) - (crop.bottom || 0));

      const s = Math.max(0.01, Math.min(1.0, Number(scale) || 0));
      const targetCroppedW = Math.max(1, Math.round(croppedOrigW * s));
      const targetCroppedH = Math.max(1, Math.round(croppedOrigH * s));

      return {
        ratio: targetCroppedW / targetCroppedH,
        customSize: {
          customWidth: targetCroppedW,
          customHeight: targetCroppedH,
        },
      };
    }),

  setCropTop: (val) =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      const prevCroppedW = Math.max(1, w - (state.crop?.left || 0) - (state.crop?.right || 0));

      let nextCrop;
      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, top: val });
        nextCrop = result ? clampCrop(result.crop, w, h) : clampCrop({ ...state.crop, top: val }, w, h);
      } else {
        nextCrop = clampCrop({ ...state.crop, top: val }, w, h);
      }

      const newCroppedW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const newCroppedH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      let nextCustomWidth = newCroppedW;
      let nextCustomHeight = newCroppedH;

      if (state.ratioLocked) {
        const curCustomW = Number(state.customSize.customWidth) || prevCroppedW;
        const scaleFactor = Math.max(0.01, Math.min(1.0, curCustomW / prevCroppedW));
        nextCustomWidth = Math.max(1, Math.round(newCroppedW * scaleFactor));
        nextCustomHeight = Math.max(1, Math.round(newCroppedH * scaleFactor));
      } else {
        nextCustomWidth = Number(state.customSize.customWidth) || newCroppedW;
        nextCustomHeight = Number(state.customSize.customHeight) || newCroppedH;
      }

      return {
        crop: nextCrop,
        ratio: newCroppedW / newCroppedH,
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
      };
    }),

  setCropBottom: (val) =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      const prevCroppedW = Math.max(1, w - (state.crop?.left || 0) - (state.crop?.right || 0));

      let nextCrop;
      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, bottom: val });
        nextCrop = result ? clampCrop(result.crop, w, h) : clampCrop({ ...state.crop, bottom: val }, w, h);
      } else {
        nextCrop = clampCrop({ ...state.crop, bottom: val }, w, h);
      }

      const newCroppedW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const newCroppedH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      let nextCustomWidth = newCroppedW;
      let nextCustomHeight = newCroppedH;

      if (state.ratioLocked) {
        const curCustomW = Number(state.customSize.customWidth) || prevCroppedW;
        const scaleFactor = Math.max(0.01, Math.min(1.0, curCustomW / prevCroppedW));
        nextCustomWidth = Math.max(1, Math.round(newCroppedW * scaleFactor));
        nextCustomHeight = Math.max(1, Math.round(newCroppedH * scaleFactor));
      } else {
        nextCustomWidth = Number(state.customSize.customWidth) || newCroppedW;
        nextCustomHeight = Number(state.customSize.customHeight) || newCroppedH;
      }

      return {
        crop: nextCrop,
        ratio: newCroppedW / newCroppedH,
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
      };
    }),

  setCropLeft: (val) =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      const prevCroppedW = Math.max(1, w - (state.crop?.left || 0) - (state.crop?.right || 0));

      let nextCrop;
      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, left: val });
        nextCrop = result ? clampCrop(result.crop, w, h) : clampCrop({ ...state.crop, left: val }, w, h);
      } else {
        nextCrop = clampCrop({ ...state.crop, left: val }, w, h);
      }

      const newCroppedW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const newCroppedH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      let nextCustomWidth = newCroppedW;
      let nextCustomHeight = newCroppedH;

      if (state.ratioLocked) {
        const curCustomW = Number(state.customSize.customWidth) || prevCroppedW;
        const scaleFactor = Math.max(0.01, Math.min(1.0, curCustomW / prevCroppedW));
        nextCustomWidth = Math.max(1, Math.round(newCroppedW * scaleFactor));
        nextCustomHeight = Math.max(1, Math.round(newCroppedH * scaleFactor));
      } else {
        nextCustomWidth = Number(state.customSize.customWidth) || newCroppedW;
        nextCustomHeight = Number(state.customSize.customHeight) || newCroppedH;
      }

      return {
        crop: nextCrop,
        ratio: newCroppedW / newCroppedH,
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
      };
    }),

  setCropRight: (val) =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      const prevCroppedW = Math.max(1, w - (state.crop?.left || 0) - (state.crop?.right || 0));

      let nextCrop;
      if (state.aspectPreset && state.aspectPreset !== 'free') {
        const result = computeAspectCrop(w, h, state.aspectPreset, state.aspectOrientation, state.aspectOffset, { ...state.crop, right: val });
        nextCrop = result ? clampCrop(result.crop, w, h) : clampCrop({ ...state.crop, right: val }, w, h);
      } else {
        nextCrop = clampCrop({ ...state.crop, right: val }, w, h);
      }

      const newCroppedW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const newCroppedH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      let nextCustomWidth = newCroppedW;
      let nextCustomHeight = newCroppedH;

      if (state.ratioLocked) {
        const curCustomW = Number(state.customSize.customWidth) || prevCroppedW;
        const scaleFactor = Math.max(0.01, Math.min(1.0, curCustomW / prevCroppedW));
        nextCustomWidth = Math.max(1, Math.round(newCroppedW * scaleFactor));
        nextCustomHeight = Math.max(1, Math.round(newCroppedH * scaleFactor));
      } else {
        nextCustomWidth = Number(state.customSize.customWidth) || newCroppedW;
        nextCustomHeight = Number(state.customSize.customHeight) || newCroppedH;
      }

      return {
        crop: nextCrop,
        ratio: newCroppedW / newCroppedH,
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
      };
    }),

  setAspectPreset: (preset) =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      const orientation = state.aspectOrientation || 'landscape';
      const offset = typeof state.aspectOffset === 'number' && !Number.isNaN(state.aspectOffset) ? state.aspectOffset : 0.5;

      if (preset === 'free') {
        return {
          aspectPreset: 'free',
          aspectOrientation: 'landscape',
          aspectOffset: 0.5,
        };
      }

      const result = computeAspectCrop(w, h, preset, orientation, offset, { top: 0, bottom: 0, left: 0, right: 0 });
      if (!result) return { aspectPreset: preset };

      const nextCrop = clampCrop(result.crop, w, h);
      const prevCroppedW = Math.max(1, w - (state.crop?.left || 0) - (state.crop?.right || 0));
      const newCroppedW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const newCroppedH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      let nextCustomWidth = newCroppedW;
      let nextCustomHeight = newCroppedH;

      if (state.ratioLocked) {
        const curCustomW = Number(state.customSize.customWidth) || prevCroppedW;
        const scaleFactor = Math.max(0.01, Math.min(1.0, curCustomW / prevCroppedW));
        nextCustomWidth = Math.max(1, Math.round(newCroppedW * scaleFactor));
        nextCustomHeight = Math.max(1, Math.round(newCroppedH * scaleFactor));
      } else {
        nextCustomWidth = Number(state.customSize.customWidth) || newCroppedW;
        nextCustomHeight = Number(state.customSize.customHeight) || newCroppedH;
      }

      return {
        aspectPreset: preset,
        aspectOrientation: orientation,
        aspectOffset: offset,
        crop: nextCrop,
        ratio: newCroppedW / newCroppedH,
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
      };
    }),

  setAspectOrientation: (orientation) =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      const safeOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';
      const offset = typeof state.aspectOffset === 'number' && !Number.isNaN(state.aspectOffset) ? state.aspectOffset : 0.5;
      const preset = state.aspectPreset || 'free';

      if (preset === 'free') {
        return { aspectOrientation: safeOrientation };
      }

      const result = computeAspectCrop(w, h, preset, safeOrientation, offset, { top: 0, bottom: 0, left: 0, right: 0 });
      if (!result) return { aspectOrientation: safeOrientation };

      const nextCrop = clampCrop(result.crop, w, h);
      const prevCroppedW = Math.max(1, w - (state.crop?.left || 0) - (state.crop?.right || 0));
      const newCroppedW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const newCroppedH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      let nextCustomWidth = newCroppedW;
      let nextCustomHeight = newCroppedH;

      if (state.ratioLocked) {
        const curCustomW = Number(state.customSize.customWidth) || prevCroppedW;
        const scaleFactor = Math.max(0.01, Math.min(1.0, curCustomW / prevCroppedW));
        nextCustomWidth = Math.max(1, Math.round(newCroppedW * scaleFactor));
        nextCustomHeight = Math.max(1, Math.round(newCroppedH * scaleFactor));
      } else {
        nextCustomWidth = Number(state.customSize.customWidth) || newCroppedW;
        nextCustomHeight = Number(state.customSize.customHeight) || newCroppedH;
      }

      return {
        aspectOrientation: safeOrientation,
        crop: nextCrop,
        ratio: newCroppedW / newCroppedH,
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
      };
    }),

  setAspectOffset: (offset) =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      const safeOffset = Math.max(0, Math.min(1.0, typeof offset === 'number' && !Number.isNaN(offset) ? offset : 0.5));
      const orientation = state.aspectOrientation || 'landscape';
      const preset = state.aspectPreset || 'free';

      if (preset === 'free') {
        return { aspectOffset: safeOffset };
      }

      const result = computeAspectCrop(w, h, preset, orientation, safeOffset, state.crop);
      if (!result) return { aspectOffset: safeOffset };

      const nextCrop = clampCrop(result.crop, w, h);
      const prevCroppedW = Math.max(1, w - (state.crop?.left || 0) - (state.crop?.right || 0));
      const newCroppedW = Math.max(1, w - nextCrop.left - nextCrop.right);
      const newCroppedH = Math.max(1, h - nextCrop.top - nextCrop.bottom);

      let nextCustomWidth = newCroppedW;
      let nextCustomHeight = newCroppedH;

      if (state.ratioLocked) {
        const curCustomW = Number(state.customSize.customWidth) || prevCroppedW;
        const scaleFactor = Math.max(0.01, Math.min(1.0, curCustomW / prevCroppedW));
        nextCustomWidth = Math.max(1, Math.round(newCroppedW * scaleFactor));
        nextCustomHeight = Math.max(1, Math.round(newCroppedH * scaleFactor));
      } else {
        nextCustomWidth = Number(state.customSize.customWidth) || newCroppedW;
        nextCustomHeight = Number(state.customSize.customHeight) || newCroppedH;
      }

      return {
        aspectOffset: safeOffset,
        crop: nextCrop,
        ratio: newCroppedW / newCroppedH,
        customSize: {
          customWidth: nextCustomWidth,
          customHeight: nextCustomHeight,
        },
      };
    }),

  resetAspectRatio: () =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      return {
        aspectPreset: 'free',
        aspectOrientation: 'landscape',
        aspectOffset: 0.5,
        crop: { top: 0, bottom: 0, left: 0, right: 0 },
        customSize: {
          customWidth: w,
          customHeight: h,
        },
        ratio: w / h,
      };
    }),

  resetCrop: () =>
    set((state) => {
      const w = Number(state.size.width) || 1;
      const h = Number(state.size.height) || 1;
      return {
        aspectPreset: 'free',
        aspectOffset: 0.5,
        crop: { top: 0, bottom: 0, left: 0, right: 0 },
        customSize: {
          customWidth: w,
          customHeight: h,
        },
        ratio: w / h,
      };
    }),

  resetSizeToCurrent: () =>
    set((state) => {
      const width = Number(state.size.width) || null;
      const height = Number(state.size.height) || null;
      const crop = state.crop || { top: 0, bottom: 0, left: 0, right: 0 };
      const croppedW = width ? Math.max(1, width - (crop.left || 0) - (crop.right || 0)) : null;
      const croppedH = height ? Math.max(1, height - (crop.top || 0) - (crop.bottom || 0)) : null;
      return {
        ratioLocked: true,
        customSize: {
          customWidth: croppedW,
          customHeight: croppedH,
        },
        ratio: (croppedW && croppedH) ? croppedW / croppedH : state.ratio,
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

export const selectIsAspectModified = (state) => {
  return (
    state.aspectPreset !== 'free' ||
    state.aspectOrientation !== 'landscape' ||
    Math.abs((state.aspectOffset ?? 0.5) - 0.5) > 1e-4
  );
};

export const selectIsCropModified = (state) => {
  const c = state.crop;
  return Boolean(c && (c.top !== 0 || c.bottom !== 0 || c.left !== 0 || c.right !== 0));
};

export const selectIsResizeModified = (state) => {
  const origW = Number(state.size.width) || 0;
  const origH = Number(state.size.height) || 0;
  const crop = state.crop || { top: 0, bottom: 0, left: 0, right: 0 };
  const croppedW = Math.max(1, origW - (crop.left || 0) - (crop.right || 0));
  const croppedH = Math.max(1, origH - (crop.top || 0) - (crop.bottom || 0));
  const curW = state.customSize.customWidth != null ? state.customSize.customWidth : croppedW;
  const curH = state.customSize.customHeight != null ? state.customSize.customHeight : croppedH;
  return curW !== croppedW || curH !== croppedH || !state.ratioLocked;
};

export default useSizeStore;