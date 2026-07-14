import init, { Image as WasmImage, FilterHandle, Filters, Dithering, Palette as WasmPalette, Transform, Backend } from 'wasm-pkg';
import wasmUrl from 'wasm-pkg/ddot_wasm_bg.wasm?url';

let wasmInitialized = false;
let activeJobId = null;

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
    adjustments,
    noise,
    blur,
    forceCpu,
  } = event.data;

  activeJobId = jobId;

  const backend = forceCpu ? Backend.CPU : Backend.AUTO;

  const startTs = self.performance?.now?.() ?? Date.now();
  const phaseLabel = dither?.enabled ? 'DITHERING' : 'COPY SOURCE';

  try {
    let tWasmInit = 0;
    let tSetup = 0;
    let tNoise = 0;
    let tAdjust = 0;
    let tBlur = 0;
    let tHistogram = 0;
    let tDither = 0;
    let tFinal = 0;
    let tColors = 0;

    const tWasmInitStart = performance.now();
    // Dynamically initialize WASM if not already done
    if (!wasmInitialized) {
      await init({ module_or_path: wasmUrl });
      wasmInitialized = true;
    }
    tWasmInit = performance.now() - tWasmInitStart;

    const tSetupStart = performance.now();
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
    tSetup = performance.now() - tSetupStart;

    const filters = Filters.getFilters();

    const tNoiseStart = performance.now();
    // 2. Apply noise filter if enabled
    if (noise && noise.noiseCoverage > 0 && noise.noiseIntensity > 0) {
      const noiseFilter = filters.noise;
      if (noiseFilter) {
        await noiseFilter.apply(image, {
          coverage: noise.noiseCoverage,
          intensity: noise.noiseIntensity,
          saturation: noise.noiseSaturation,
          phase: noise.noisePhase || 0,
        }, backend);
      }
    }
    tNoise = performance.now() - tNoiseStart;

    const tAdjustStart = performance.now();
    // 3. Apply adjustment filter if provided
    if (adjustments) {
      const adjustmentFilter = filters.adjustment;
      if (adjustmentFilter) {
        await adjustmentFilter.apply(image, {
          gamma: adjustments.gamma,
          blacks: adjustments.blacks,
          whites: adjustments.whites,
          contrast: adjustments.contrast,
          saturation: adjustments.saturation,
          hue: adjustments.hue,
        }, backend);
      }
    }
    tAdjust = performance.now() - tAdjustStart;

    const tBlurStart = performance.now();
    // 4. Apply Kawase blur if enabled
    if (blur && blur.blurStrength > 0 && blur.passes > 0) {
      const blurFilter = filters.kawase_blur;
      if (blurFilter) {
        await blurFilter.apply(image, {
          blurStrength: blur.blurStrength,
          edgeStrength: blur.edgeStrength,
          passes: blur.passes,
        }, backend);
      }
    }
    tBlur = performance.now() - tBlurStart;

    // Get pre-dithered filtered pixels for palette generation and stats reference
    const croppedBuffer = image.pixels;

    const tDitherStart = performance.now();
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
    tDither = performance.now() - tDitherStart;

    const tFinalStart = performance.now();
    // 4. Retrieve final pixel values as transferable buffer
    const outputBuffer = image.pixels; // Uint8Array copy from WASM memory
    const outputPixels = new Uint8ClampedArray(outputBuffer.buffer);

    if (dither.enabled) {
      applyBinaryAlphaThreshold(outputPixels);
    }
    tFinal = performance.now() - tFinalStart;

    // Clone output pixels to count colors asynchronously without locking the thread
    const statsOutputPixels = outputPixels.slice();

    const elapsed = (self.performance?.now?.() ?? Date.now()) - startTs;

    console.log(
      `[dither-worker] Job ${jobId} image ready (${width}x${height}px):\n` +
      `  - WASM Init:       ${tWasmInit.toFixed(2)}ms\n` +
      `  - Setup & Crop:    ${tSetup.toFixed(2)}ms\n` +
      `  - Noise Filter:    ${tNoise.toFixed(2)}ms\n` +
      `  - Color Adjust:    ${tAdjust.toFixed(2)}ms\n` +
      `  - Blur Pass:       ${tBlur.toFixed(2)}ms\n` +
      `  - Dithering:       ${tDither.toFixed(2)}ms\n` +
      `  - Alpha Threshold: ${tFinal.toFixed(2)}ms\n` +
      `  => Total Image:    ${elapsed.toFixed(2)}ms`
    );

    // Send the rendered output back to the main thread immediately
    self.postMessage(
      {
        jobId,
        outputPixels: outputPixels.buffer,
        width: image.width,
        height: image.height,
        isImageReady: true,
        timings: {
          noise: tNoise,
          adjustment: tAdjust,
          blur: tBlur,
          dithering: tDither,
        }
      },
      [outputPixels.buffer],
    );

    // Run stats calculations when the browser event loop is idle / free
    setTimeout(() => {
      if (activeJobId !== jobId) {
        return;
      }

      const tStatsStart = performance.now();

      const tHistogramStart = performance.now();
      const croppedPixels = new Uint8ClampedArray(croppedBuffer.buffer);

      // Compute RGB histogram counts
      const rCounts = new Uint32Array(256);
      const gCounts = new Uint32Array(256);
      const bCounts = new Uint32Array(256);
      for (let i = 0; i < croppedPixels.length; i += 4) {
        rCounts[croppedPixels[i]]++;
        gCounts[croppedPixels[i + 1]]++;
        bCounts[croppedPixels[i + 2]]++;
      }
      tHistogram = performance.now() - tHistogramStart;

      const tColorsStart = performance.now();
      const uniqueColorCount = countUniqueColors(statsOutputPixels);
      tColors = performance.now() - tColorsStart;

      const statsElapsed = performance.now() - tStatsStart;

      console.log(
        `[dither-worker] Job ${jobId} stats computed (async):\n` +
        `  - Histogram:       ${tHistogram.toFixed(2)}ms\n` +
        `  - Color Count:     ${tColors.toFixed(2)}ms\n` +
        `  => Stats Total:    ${statsElapsed.toFixed(2)}ms`
      );

      if (activeJobId !== jobId) {
        return;
      }

      self.postMessage(
        {
          jobId,
          referencePixels: croppedBuffer.buffer,
          uniqueColorCount,
          histogram: [rCounts, gCounts, bCounts],
          width: image.width,
          height: image.height,
          isStatsReady: true,
        },
        [croppedBuffer.buffer, rCounts.buffer, gCounts.buffer, bCounts.buffer],
      );
    }, 10);
  } catch (error) {
    console.error(`[dither-worker] ERROR ${phaseLabel} (job: ${jobId})`, error);
    self.postMessage({
      jobId,
      error: error instanceof Error ? error.message : 'WASM processing failed',
    });
  }
};
