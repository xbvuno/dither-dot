import { medianCut, kMeans, octree } from '../utils/colorAlgorithms';

function runExtraction(pixels, method, count, options = {}) {
  if (method === 'octree') return octree(pixels, count, options);
  if (method === 'kmeans') return kMeans(pixels, count, 8, options);
  return medianCut(pixels, count, options);
}

self.onmessage = (event) => {
  const { jobId, pixels, method, count, sampleStride } = event.data || {};
  const startTs = self.performance?.now?.() ?? Date.now();
  console.log(`[palette-worker] STARTING PALETTE GENERATION (job: ${jobId}, method: ${method}, count: ${count})`);

  try {
    const sourcePixels = new Uint8ClampedArray(pixels);
    const palette = runExtraction(sourcePixels, method, count, { sampleStride });

    const elapsed = (self.performance?.now?.() ?? Date.now()) - startTs;
    console.log(`[palette-worker] COMPLETED PALETTE GENERATION (job: ${jobId}) in ${Math.round(elapsed)}ms`);

    self.postMessage({
      jobId,
      palette,
    });
  } catch (error) {
    console.error(`[palette-worker] ERROR PALETTE GENERATION (job: ${jobId})`, error);
    self.postMessage({
      jobId,
      error: error instanceof Error ? error.message : 'Palette worker processing failed',
    });
  }
};
