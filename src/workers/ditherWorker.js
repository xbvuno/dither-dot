import init, { Image as WasmImage, Filters, Dithering, Palette as WasmPalette, Transform, Backend } from 'ddot-wasm';
import wasmUrl from 'ddot-wasm/ddot_wasm_bg.wasm?url';

let wasmInitialized = false;
let activeJobId = null;

// Persistent worker-side canvas elements for offscreen rendering
let viewportCanvas = null;
let viewportCtx = null;
let watermarkBitmap = null;
let watermarkMiniBitmap = null;

let scratchCanvas = null;
let scratchCtx = null;

const WATERMARK_MARGIN_NORMAL = 4;
const WATERMARK_MARGIN_MINI = 2;

function getScratchContext(width, height) {
  if (!scratchCanvas) {
    scratchCanvas = new OffscreenCanvas(width, height);
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  } else {
    if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
      scratchCanvas.width = width;
      scratchCanvas.height = height;
    }
  }
  return scratchCtx;
}

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
  const { type } = event.data;

  if (type === 'initCanvas') {
    viewportCanvas = event.data.canvas;
    viewportCtx = viewportCanvas.getContext('2d');
    console.log("[Worker] Received initCanvas. Canvas context is ready:", !!viewportCtx);
    return;
  }

  if (type === 'setWatermarks') {
    console.log("[Worker] Received setWatermarks. normal:", !!event.data.normal, "mini:", !!event.data.mini);
    if (watermarkBitmap) watermarkBitmap.close();
    if (watermarkMiniBitmap) watermarkMiniBitmap.close();
    watermarkBitmap = event.data.normal;
    watermarkMiniBitmap = event.data.mini;
    return;
  }

  // Otherwise, it is a processing job
  const {
    jobId,
    source,
    previewingOriginal,
    customWidth,
    customHeight,
    paletteRgb,
    dither,
    crop,
    adjustments,
    noise,
    blur,
    forceCpu,
    watermarkEnabled,
  } = event.data;

  activeJobId = jobId;
  console.log("[Worker] Received process job. jobId:", jobId, "previewOriginal:", previewingOriginal, "source width/height:", source?.width, "x", source?.height, "custom size requested:", customWidth, "x", customHeight);

  const backend = forceCpu ? Backend.CPU : Backend.AUTO;
  const startTs = self.performance?.now?.() ?? Date.now();
  const phaseLabel = dither?.enabled ? 'DITHERING' : 'COPY SOURCE';

  try {
    let tWasmInit = 0;
    let tSetup = 0;
    let tNoise = 0;
    let tAdjust = 0;
    let tBlur = 0;
    let tDither = 0;
    let tFinal = 0;

    const tWasmInitStart = performance.now();
    if (!wasmInitialized) {
      await init({ module_or_path: wasmUrl });
      wasmInitialized = true;
    }
    tWasmInit = performance.now() - tWasmInitStart;

    const tSetupStart = performance.now();
    // 1. Draw source ImageBitmap to scratch OffscreenCanvas to retrieve pixel data
    const sCtx = getScratchContext(customWidth, customHeight);
    sCtx.imageSmoothingEnabled = false;
    sCtx.drawImage(source, 0, 0, customWidth, customHeight);
    const imgData = sCtx.getImageData(0, 0, customWidth, customHeight);

    let image = new WasmImage(imgData);

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

    const croppedBuffer = image.pixels;
    const outWidth = image.width;
    const outHeight = image.height;

    let outputPixels;

    if (previewingOriginal) {
      // Just retrieve the filtered original image
      const outputBuffer = image.pixels;
      outputPixels = new Uint8ClampedArray(outputBuffer.buffer);
    } else {
      const tDitherStart = performance.now();
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
      const outputBuffer = image.pixels;
      outputPixels = new Uint8ClampedArray(outputBuffer.buffer);

      if (dither.enabled) {
        applyBinaryAlphaThreshold(outputPixels);
      }
      tFinal = performance.now() - tFinalStart;
    }

    // Render directly to OffscreenCanvas if available
    if (viewportCanvas && viewportCtx) {
      console.log("[Worker] Drawing output pixels to OffscreenCanvas. dimensions:", outWidth, "x", outHeight);
      if (viewportCanvas.width !== outWidth || viewportCanvas.height !== outHeight) {
        console.log("[Worker] Resizing OffscreenCanvas from", viewportCanvas.width, "x", viewportCanvas.height, "to", outWidth, "x", outHeight);
        viewportCanvas.width = outWidth;
        viewportCanvas.height = outHeight;
      }
      viewportCtx.imageSmoothingEnabled = false;
      const imgDataOut = new ImageData(outputPixels, outWidth, outHeight);
      viewportCtx.putImageData(imgDataOut, 0, 0);

      if (watermarkEnabled) {
        const useMini = outWidth < 64 || outHeight < 64;
        const watermark = useMini ? watermarkMiniBitmap : watermarkBitmap;
        if (watermark) {
          const margin = useMini ? WATERMARK_MARGIN_MINI : WATERMARK_MARGIN_NORMAL;
          const x = outWidth - margin - watermark.width;
          const y = outHeight - margin - watermark.height;
          viewportCtx.drawImage(watermark, x, y);
        } else {
          console.warn("[Worker] Watermark requested but bitmap is not loaded!");
        }
      }
    } else {
      console.warn("[Worker] Cannot draw directly to OffscreenCanvas: viewportCanvas is", !!viewportCanvas, "viewportCtx is", !!viewportCtx);
    }

    const elapsed = (self.performance?.now?.() ?? Date.now()) - startTs;

    console.log(
      `[dither-worker] Job ${jobId} image ready (${outWidth}x${outHeight}px):\n` +
      `  - WASM Init:       ${tWasmInit.toFixed(2)}ms\n` +
      `  - Setup & Crop:    ${tSetup.toFixed(2)}ms\n` +
      `  - Noise Filter:    ${tNoise.toFixed(2)}ms\n` +
      `  - Color Adjust:    ${tAdjust.toFixed(2)}ms\n` +
      `  - Blur Pass:       ${tBlur.toFixed(2)}ms\n` +
      `  - Dithering:       ${tDither.toFixed(2)}ms\n` +
      `  - Alpha Threshold: ${tFinal.toFixed(2)}ms\n` +
      `  => Total Image:    ${elapsed.toFixed(2)}ms`
    );

    // Send the rendered output back to the main thread (for export cache)
    const clonedOutput = new Uint8ClampedArray(outputPixels);
    self.postMessage(
      {
        jobId,
        outputPixels: clonedOutput.buffer,
        width: outWidth,
        height: outHeight,
        isImageReady: true,
        timings: {
          noise: tNoise,
          adjustment: tAdjust,
          blur: tBlur,
          dithering: tDither,
        }
      },
      [clonedOutput.buffer],
    );

    // Run stats calculations when browser event loop is idle
    setTimeout(() => {
      if (activeJobId !== jobId) return;

      const tStatsStart = performance.now();
      
      // Clone croppedBuffer to prevent transferring the WASM memory buffer directly
      const referenceCopy = new Uint8Array(croppedBuffer);
      const croppedPixels = new Uint8ClampedArray(referenceCopy.buffer);

      const tHistogramStart = performance.now();
      const rCounts = new Uint32Array(256);
      const gCounts = new Uint32Array(256);
      const bCounts = new Uint32Array(256);
      for (let i = 0; i < croppedPixels.length; i += 4) {
        rCounts[croppedPixels[i]]++;
        gCounts[croppedPixels[i + 1]]++;
        bCounts[croppedPixels[i + 2]]++;
      }
      const tHistogram = performance.now() - tHistogramStart;

      const tColorsStart = performance.now();
      const uniqueColorCount = countUniqueColors(outputPixels);
      const tColors = performance.now() - tColorsStart;

      const statsElapsed = performance.now() - tStatsStart;

      console.log(
        `[dither-worker] Job ${jobId} stats computed (async):\n` +
        `  - Histogram:       ${tHistogram.toFixed(2)}ms\n` +
        `  - Color Count:     ${tColors.toFixed(2)}ms\n` +
        `  => Stats Total:    ${statsElapsed.toFixed(2)}ms`
      );

      if (activeJobId !== jobId) return;

      self.postMessage(
        {
          jobId,
          referencePixels: referenceCopy.buffer,
          uniqueColorCount,
          histogram: [rCounts, gCounts, bCounts],
          width: outWidth,
          height: outHeight,
          isStatsReady: true,
        },
        [referenceCopy.buffer, rCounts.buffer, gCounts.buffer, bCounts.buffer],
      );
    }, 10);

  } catch (error) {
    console.error(`[dither-worker] ERROR ${phaseLabel} (job: ${jobId})`, error);
    self.postMessage({
      jobId,
      error: error instanceof Error ? error.message : 'WASM processing failed',
    });
  } finally {
    if (source) {
      source.close();
    }
  }
};
