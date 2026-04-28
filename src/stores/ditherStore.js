import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const DITHER_METHOD = {
  FLOYD_STEINBERG: 'floyd_steinberg',
  JJN: 'jjn',
  STUCKI: 'stucki',
  ATKINSON: 'atkinson',
  BURKES: 'burkes',
  SIERRA: 'sierra',
  TWO_ROW_SIERRA: 'two_row_sierra',
  SIERRA_LITE: 'sierra_lite',
  ORDERED_BAYER: 'ordered_bayer',
  RANDOM: 'random',
};

export const DITHER_COLOR_SPACE = {
  LAB: 'lab',
  RGB: 'rgb',
};

export const DITHER_CONTROLS = {
  amount: {
    min: 0.0,
    max: 1.0,
    step: 0.01,
    default: 0.65,
    description: 'Scales the magnitude of dither noise added to each pixel before palette snapping. Lower values produce a more subtle effect.',
  },
  diffusion: {
    min: 0.0,
    max: 2.0,
    step: 0.01,
    default: 1.0,
    description: 'Controls how much quantization error is spread to neighboring pixels. 1 = standard diffusion, 0 = no diffusion (threshold).',
  },
  matrixScale: {
    min: 1.0,
    max: 8.0,
    step: 1.0,
    default: 1.0,
    description: 'Size of the Bayer ordered dither matrix. Larger values produce a coarser, more visible pattern.',
  },
  seed: {
    min: 0.0,
    max: 100.0,
    step: 0.1,
    default: 1.0,
    description: 'Seed for the random noise generator. Changing this value produces a different noise pattern with the same overall intensity.',
  },
};

const INITIAL_DITHER_STATE = {
  enabled: true,
  method: DITHER_METHOD.FLOYD_STEINBERG,
  colorSpace: DITHER_COLOR_SPACE.RGB,
  amount: DITHER_CONTROLS.amount.default,
  diffusion: DITHER_CONTROLS.diffusion.default,
  matrixScale: DITHER_CONTROLS.matrixScale.default,
  seed: DITHER_CONTROLS.seed.default,
};

const useDitherStore = create(persist((set) => ({
  ...INITIAL_DITHER_STATE,

  setEnabled: (enabled) => set({ enabled }),
  setMethod: (method) => set({ method }),
  setColorSpace: (colorSpace) => set({
    colorSpace: colorSpace === DITHER_COLOR_SPACE.RGB
      ? DITHER_COLOR_SPACE.RGB
      : DITHER_COLOR_SPACE.LAB,
  }),
  setAmount: (amount) => set({ amount }),
  setDiffusion: (diffusion) => set({ diffusion }),
  setMatrixScale: (matrixScale) => set({ matrixScale }),
  setSeed: (seed) => set({ seed }),
  resetDither: () => set({ ...INITIAL_DITHER_STATE }),
}), {
  name: 'dither-dot:dither',
  storage: createJSONStorage(() => localStorage),
}));

export default useDitherStore;
