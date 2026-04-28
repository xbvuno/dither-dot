import { runCpuErrorDiffusion } from '../utils/cpuDither';

function countUniqueColors(pixels) {
  const unique = new Set();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    unique.add((pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2]);
  }

  return unique.size;
}

function applyBinaryAlphaThreshold(pixels) {
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = pixels[index] >= 128 ? 255 : 0;
  }
}

self.onmessage = (event) => {
  const {
    jobId,
    processedPixels,
    width,
    height,
    paletteRgb,
    dither,
  } = event.data;

  const startTs = self.performance?.now?.() ?? Date.now();
  const phaseLabel = dither?.enabled ? 'DITHERING' : 'COPY SOURCE';
  console.log(`[dither-worker] STARTING ${phaseLabel} (job: ${jobId})`);

  try {
    const source = new Uint8ClampedArray(processedPixels);

    let output = dither.enabled
      ? runCpuErrorDiffusion(
          source,
          width,
          height,
          paletteRgb,
          dither.method,
          dither.amount,
          dither.diffusion,
          dither.seed,
          dither.matrixScale,
          dither.colorSpace,
        )
      : new Uint8ClampedArray(source);

    if (output.buffer === source.buffer) {
      output = new Uint8ClampedArray(output);
    }

    if (dither.enabled) {
      applyBinaryAlphaThreshold(output);
    }

    const elapsed = (self.performance?.now?.() ?? Date.now()) - startTs;
    console.log(`[dither-worker] COMPLETED ${phaseLabel} (job: ${jobId}) in ${Math.round(elapsed)}ms`);

    self.postMessage(
      {
        jobId,
        referencePixels: source.buffer,
        outputPixels: output.buffer,
        width,
        height,
        uniqueColorCount: countUniqueColors(output),
      },
      [source.buffer, output.buffer],
    );
  } catch (error) {
    console.error(`[dither-worker] ERROR ${phaseLabel} (job: ${jobId})`, error);
    self.postMessage({
      jobId,
      error: error instanceof Error ? error.message : 'Worker processing failed',
    });
  }
};
