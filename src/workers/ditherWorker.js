import init, { Image as WasmImage, FilterHandle, Dithering, Palette as WasmPalette, Transform } from 'wasm-pkg';
import wasmUrl from 'wasm-pkg/ddot_wasm_bg.wasm?url';

let wasmInitialized = false;

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

self.onmessage = async (event) => {
  const {
    jobId,
    processedPixels,
    width,
    height,
    paletteRgb,
    dither,
    crop,
  } = event.data;

  const startTs = self.performance?.now?.() ?? Date.now();
  const phaseLabel = dither?.enabled ? 'DITHERING' : 'COPY SOURCE';

  try {
    // Dynamically initialize WASM if not already done
    if (!wasmInitialized) {
      await init({ module_or_path: wasmUrl });
      wasmInitialized = true;
    }

    // 1. Initialize WASM image wrapper from the transferred buffer
    // ImageData constructor is supported in workers in modern browsers
    const pixelsArray = new Uint8ClampedArray(processedPixels);
    const imageData = new ImageData(pixelsArray, width, height);
    let image = new WasmImage(imageData);

    // Apply crop if settings are provided
    if (crop && (crop.top > 0 || crop.bottom > 0 || crop.left > 0 || crop.right > 0)) {
      image = Transform.Crop(image, {
        top: crop.top,
        left: crop.left,
        right: crop.right,
        bottom: crop.bottom
      });
    }

    const croppedBuffer = image.pixels;
    const croppedPixels = new Uint8ClampedArray(croppedBuffer.buffer);

    // Compute RGB histogram counts before dithering
    const rCounts = new Uint32Array(256);
    const gCounts = new Uint32Array(256);
    const bCounts = new Uint32Array(256);
    for (let i = 0; i < croppedPixels.length; i += 4) {
      rCounts[croppedPixels[i]]++;
      gCounts[croppedPixels[i + 1]]++;
      bCounts[croppedPixels[i + 2]]++;
    }

    // 2. Apply dither algorithm on CPU
    if (dither.enabled) {
      const colors = paletteRgb.map(color => {
        return {
          r: Math.round(color[0] * 255) & 255,
          g: Math.round(color[1] * 255) & 255,
          b: Math.round(color[2] * 255) & 255,
          a: 255
        };
      });
      const wasmPalette = new WasmPalette(colors);

      const algs = Dithering.getAlgorithms();
      const methodName = dither.method === 'ordered_bayer' ? 'bayer' : dither.method;
      const alg = algs.find(a => a.name === methodName);
      if (alg) {
        await alg.apply(image, wasmPalette, {
          amount: dither.amount,
          matrixScale: dither.matrixScale,
          seed: dither.seed,
        });
      }
    }

    // 4. Retrieve final pixel values as transferable buffer
    const outputBuffer = image.pixels; // Uint8Array copy from WASM memory
    const outputPixels = new Uint8ClampedArray(outputBuffer.buffer);

    if (dither.enabled) {
      applyBinaryAlphaThreshold(outputPixels);
    }

    const elapsed = (self.performance?.now?.() ?? Date.now()) - startTs;

    self.postMessage(
      {
        jobId,
        referencePixels: croppedBuffer.buffer,
        outputPixels: outputPixels.buffer,
        width: image.width,
        height: image.height,
        uniqueColorCount: countUniqueColors(outputPixels),
        elapsed,
        histogram: [rCounts, gCounts, bCounts],
      },
      [croppedBuffer.buffer, outputPixels.buffer, rCounts.buffer, gCounts.buffer, bCounts.buffer],
    );
  } catch (error) {
    console.error(`[dither-worker] ERROR ${phaseLabel} (job: ${jobId})`, error);
    self.postMessage({
      jobId,
      error: error instanceof Error ? error.message : 'WASM processing failed',
    });
  }
};
