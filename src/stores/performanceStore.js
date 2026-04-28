import { create } from 'zustand';

const usePerformanceStore = create((set) => ({
  // Timing data structure
  timing: {
    pipelineTotal: 0,
    extraction: 0,
    paletteGeneration: 0,
    dithering: 0,
    textureUpdate: 0,
    layerSync: 0,
  },

  // Individual phase timings (used for hover display)
  pipelineStart: null,
  extractionStart: null,
  pipelineEnd: null,
  currentPhase: null,
  paletteGenerationCached: false,
  // Carries palette timing across pipeline resets (e.g. after shouldRefreshPalette cycle)
  pendingPaletteCarryOver: 0,
  pendingPaletteCachedCarryOver: false,

  setPipelineStart: () => set((state) => ({
    pipelineStart: performance.now(),
    pipelineEnd: null,
    currentPhase: 'extraction',
    pendingPaletteCarryOver: 0,
    pendingPaletteCachedCarryOver: false,
    paletteGenerationCached: state.pendingPaletteCachedCarryOver,
    timing: {
      pipelineTotal: 0,
      extraction: 0,
      paletteGeneration: state.pendingPaletteCarryOver,
      dithering: 0,
      textureUpdate: 0,
      layerSync: 0,
    },
  })),

  setCurrentPhase: (currentPhase) => set({ currentPhase }),

  setExtractionStart: () => set({
    extractionStart: performance.now(),
  }),

  recordExtractionEnd: (extractionDuration) => set((state) => ({
    currentPhase: state.currentPhase === 'extraction' ? null : state.currentPhase,
    timing: {
      ...state.timing,
      extraction: extractionDuration,
    },
  })),

  recordPaletteGeneration: (duration, options = {}) => set((state) => ({
    currentPhase: state.currentPhase === 'palette' ? null : state.currentPhase,
    pendingPaletteCarryOver: duration,
    pendingPaletteCachedCarryOver: Boolean(options?.cached),
    paletteGenerationCached: Boolean(options?.cached),
    timing: {
      ...state.timing,
      paletteGeneration: duration,
    },
  })),

  recordDithering: (duration) => set((state) => ({
    currentPhase: state.currentPhase === 'dithering' ? null : state.currentPhase,
    timing: {
      ...state.timing,
      dithering: duration,
    },
  })),

  recordTextureUpdate: (duration) => set((state) => ({
    currentPhase: state.currentPhase === 'texture' ? null : state.currentPhase,
    timing: {
      ...state.timing,
      textureUpdate: duration,
    },
  })),

  recordLayerSync: (duration) => set((state) => ({
    currentPhase: state.currentPhase === 'sync' ? null : state.currentPhase,
    timing: {
      ...state.timing,
      layerSync: duration,
    },
  })),

  recordPipelineComplete: () => set((state) => {
    const { extraction, paletteGeneration, dithering, textureUpdate, layerSync } = state.timing;
    // Sum the three main phases: extraction + palette + dithering (+ minor phases)
    const pipelineTotal = extraction + paletteGeneration + dithering + textureUpdate + layerSync;
    return {
      pipelineEnd: performance.now(),
      currentPhase: null,
      timing: {
        ...state.timing,
        pipelineTotal: Math.max(0, pipelineTotal),
      },
    };
  }),

  resetTiming: () => set({
    timing: {
      pipelineTotal: 0,
      extraction: 0,
      paletteGeneration: 0,
      dithering: 0,
      textureUpdate: 0,
      layerSync: 0,
    },
    pipelineStart: null,
    extractionStart: null,
    pipelineEnd: null,
    currentPhase: null,
    paletteGenerationCached: false,
    pendingPaletteCarryOver: 0,
    pendingPaletteCachedCarryOver: false,
  }),
}));

export default usePerformanceStore;
