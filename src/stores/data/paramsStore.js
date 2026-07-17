import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/* ---------------------------------- */
/* CONTROLS CONFIG                    */
/* ---------------------------------- */

export const COLOR_CONTROLS = {
  gamma: {
    min: 0.3,
    max: 3.0,
    step: 0.01,
    default: 1.0,
    description: 'Adjusts overall brightness in a non-linear way. Values below 1 darken midtones, above 1 brighten them.',
  },

  blacks: {
    min: -0.5,
    max: 0.5,
    step: 0.002,
    default: 0.0,
    description: 'Shifts the dark end of the tonal range. Positive values lift shadows, negative values crush them toward pure black.',
  },

  whites: {
    min: -0.5,
    max: 0.5,
    step: 0.002,
    default: 0.0,
    description: 'Shifts the bright end of the tonal range. Positive values push highlights toward white, negative values pull them down.',
  },

  contrast: {
    min: -100.0,
    max: 500.0,
    step: 1.0,
    default: 0.0,
    description: 'Adjusts image contrast. 0 is unchanged, negative values reduce contrast down to -100, positive values increase it up to 500.',
  },

  saturation: {
    min: 0.0,
    max: 2.0,
    step: 0.01,
    default: 1.0,
    description: 'Controls color intensity. 0 produces a grayscale image, 1 is the original, above 1 over-saturates colors.',
  },

  hue: {
    min: -Math.PI,
    max: Math.PI,
    step: 0.01,
    default: 0.0,
    description: 'Rotates all colors around the color wheel. At ±π the full spectrum is cycled.',
  }
};

/* ---------------------------------- */
/* BLUR CONTROLS CONFIG               */
/* ---------------------------------- */

export const BLUR_CONTROLS = {
  blurStrength: {
    min: 0.0,
    max: 4.0,
    step: 0.05,
    default: 0,
    description: 'Radius of the Kawase blur applied before dithering. Higher values produce a stronger/wider blur.',
  },

  edgeStrength: {
    min: 0.0,
    max: 30.0,
    step: 0.5,
    default: 12.0,
    description: 'Preserves edge sharpness during the blur pass. Higher values reduce blurring near high-contrast edges.',
  },

  passes: {
    min: 1,
    max: 4,
    step: 1,
    default: 2,
    description: 'Number of blur iterations. More passes produce a smoother, wider blur at the cost of performance.',
  }
};

export const NOISE_CONTROLS = {
  noiseCoverage: {
    min: 0.0,
    max: 1.0,
    step: 0.01,
    default: 0.0,
    description: 'Percentage of pixels affected by procedural noise before tonal/color corrections.',
  },
  noiseIntensity: {
    min: 0.0,
    max: 1.0,
    step: 0.01,
    default: 0.2,
    description: 'Blend strength between original image and generated noise color.',
  },
  noiseSaturation: {
    min: 0.0,
    max: 1.0,
    step: 0.01,
    default: 1.0,
    description: 'Color richness of noise. 0 is grayscale noise, 1 keeps full chroma.',
  }
};

const ALL_CONTROLS = { ...NOISE_CONTROLS, ...COLOR_CONTROLS, ...BLUR_CONTROLS };

/* ---------------------------------- */
/* UTILS                              */
/* ---------------------------------- */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function snap(v, min, max, step) {
  const stepped =
    Math.round((v - min) / step) * step + min;

  return clamp(
    Number(stepped.toFixed(6)), // evita floating drift
    min,
    max
  );
}

/* ---------------------------------- */
/* INITIAL STATE                      */
/* ---------------------------------- */

const initialValues = Object.fromEntries(
  Object.entries(ALL_CONTROLS).map(([key, cfg]) => [
    key,
    cfg.default
  ])
);

const UI_DEFAULTS = {
  histogramVisible: true,
  pipelineVisible: false,
  forceCpu: false,
};

/* ---------------------------------- */
/* STORE                              */
/* ---------------------------------- */

const useParamsStore = create(persist((set) => {
  const store = {
    ...initialValues,
    ...UI_DEFAULTS,
    resetParams: () => set(() => ({ ...initialValues, ...UI_DEFAULTS })),
    randomizeParams: () => set(() => {
      const randomized = {};
      for (const [key, cfg] of Object.entries(ALL_CONTROLS)) {
        const range = cfg.max - cfg.min;
        const random = cfg.min + Math.random() * range;
        randomized[key] = snap(random, cfg.min, cfg.max, cfg.step);
      }
      return randomized;
    }),
    setHistogramVisible: (visible) => set(() => ({ histogramVisible: Boolean(visible) })),
    setPipelineVisible: (visible) => set(() => ({ pipelineVisible: Boolean(visible) })),
    setForceCpu: (forceCpu) => set(() => ({ forceCpu: Boolean(forceCpu) })),
    resetKeys: (keys) => set(() => {
      const updates = {};
      for (const key of keys) {
        if (initialValues[key] !== undefined) {
          updates[key] = initialValues[key];
        }
      }
      return updates;
    }),
    randomizeKeys: (keys, controlsConfig) => set(() => {
      const updates = {};
      for (const key of keys) {
        const cfg = controlsConfig[key];
        if (cfg) {
          const range = cfg.max - cfg.min;
          const random = cfg.min + Math.random() * range;
          updates[key] = snap(random, cfg.min, cfg.max, cfg.step);
        }
      }
      return updates;
    }),
  };

  // genera automaticamente tutti i setter
  for (const [key, cfg] of Object.entries(ALL_CONTROLS)) {
    const setterName =
      "set" + key.charAt(0).toUpperCase() + key.slice(1);

    store[setterName] = (value) =>
      set(() => ({
        [key]: snap(value, cfg.min, cfg.max, cfg.step)
      }));
  }

  return store;
}, {
  name: 'dither-dot:params',
  storage: createJSONStorage(() => localStorage),
}));

export default useParamsStore;