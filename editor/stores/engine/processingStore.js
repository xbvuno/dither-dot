import { create } from 'zustand';

function computeProcessing(renderProcessing, paletteProcessingCount) {
  return Boolean(renderProcessing || paletteProcessingCount > 0);
}

function computeProcessingLabel(renderProcessing, paletteProcessingCount) {
  if (renderProcessing && paletteProcessingCount > 0) {
    return 'UPDATING IMAGE + PALETTE';
  }
  if (renderProcessing) {
    return 'RENDERING IMAGE';
  }
  if (paletteProcessingCount > 0) {
    return 'EXTRACTING PALETTE';
  }
  return 'READY';
}

const useProcessingStore = create((set) => ({
  renderProcessing: false,
  paletteProcessingCount: 0,
  isProcessing: false,
  processingLabel: 'READY',

  setRenderProcessing: (renderProcessing) => set((state) => ({
    renderProcessing,
    isProcessing: computeProcessing(renderProcessing, state.paletteProcessingCount),
    processingLabel: computeProcessingLabel(renderProcessing, state.paletteProcessingCount),
  })),

  beginPaletteProcessing: () => set((state) => {
    const paletteProcessingCount = state.paletteProcessingCount + 1;
    return {
      paletteProcessingCount,
      isProcessing: computeProcessing(state.renderProcessing, paletteProcessingCount),
      processingLabel: computeProcessingLabel(state.renderProcessing, paletteProcessingCount),
    };
  }),

  endPaletteProcessing: () => set((state) => {
    const paletteProcessingCount = Math.max(0, state.paletteProcessingCount - 1);
    return {
      paletteProcessingCount,
      isProcessing: computeProcessing(state.renderProcessing, paletteProcessingCount),
      processingLabel: computeProcessingLabel(state.renderProcessing, paletteProcessingCount),
    };
  }),
}));

export default useProcessingStore;
