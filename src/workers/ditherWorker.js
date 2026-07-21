import init, { Image as WasmImage, Filters, Dithering, Palette as WasmPalette, Transform, Backend } from 'ddot-wasm';
import wasmUrl from 'ddot-wasm/ddot_wasm_bg.wasm?url';

let wasmInitialized = false;
let filtersCache = null;
let activeJobId = null;
let debugEnabled = false;

// Persistent worker-side canvas elements for offscreen rendering
let viewportCanvas = null;
let viewportCtx = null;
let watermarkBitmap = null;
let watermarkMiniBitmap = null;

let scratchCanvas = null;
let scratchCtx = null;

const WATERMARK_MARGIN_NORMAL = 4;
const WATERMARK_MARGIN_MINI = 2;

const getWorkerCategoryColor = (category) => {
  const cat = String(category || '').toLowerCase();
  switch (cat) {
    case 'canvas': return '#059669';    // Emerald Green
    case 'watermark': return '#16a34a'; // Medium Green
    case 'pipeline':
    case 'job': return '#15803d';       // Forest Green
    case 'wasm':
    case 'init': return '#4d7c0f';       // Olive Green
    default: return '#0d9488';          // Teal Green
  }
};

function log(category, message, ...args) {
  if (!debugEnabled) return;
  const color = getWorkerCategoryColor(category);
  console.log(
    '%c[DitherWorker][%s]%c\u00A0%s',
    `color: ${color}; font-weight: bold;`,
    category,
    'color: inherit;',
    message,
    ...args
  );
}

function warn(category, message, ...args) {
  const color = getWorkerCategoryColor(category);
  console.warn(
    '%c[DitherWorker][%s]%c\u00A0%s',
    `color: ${color}; font-weight: bold;`,
    category,
    'color: inherit;',
    message,
    ...args
  );
}

function error(category, message, ...args) {
  const color = getWorkerCategoryColor(category);
  console.error(
    '%c[DitherWorker][%s]%c\u00A0%s',
    `color: ${color}; font-weight: bold;`,
    category,
    'color: inherit;',
    message,
    ...args
  );
}

function getScratchContext(width, height) {
  if (!scratchCanvas) {
    scratchCanvas = new OffscreenCanvas(width, height);
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
    if (!scratchCtx) {
      error('Canvas', 'Failed to acquire 2D context for scratch canvas.');
      throw new Error('Scratch canvas 2D context is unavailable');
    }
  } else if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    // Assigning .width or .height resets the canvas bitmap and can invalidate
    // the previously-acquired 2D context, causing drawImage to silently do nothing
    // and getImageData to return all-zero (black) pixels. Recreate the canvas entirely.
    scratchCanvas = new OffscreenCanvas(width, height);
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
    if (!scratchCtx) {
      error('Canvas', 'Failed to acquire 2D context when recreating scratch canvas.');
      throw new Error('Scratch canvas 2D context is unavailable');
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

  if (type === 'setLogging') {
    debugEnabled = Boolean(event.data.enabled);
    return;
  }

  if (type === 'initCanvas') {
    viewportCanvas = event.data.canvas;
    viewportCtx = viewportCanvas.getContext('2d');
    log('Canvas', 'Received initCanvas. Canvas context is ready: %o', !!viewportCtx);
    return;
  }

  if (type === 'setWatermarks') {
    log('Watermark', 'Received setWatermarks. normal: %o, mini: %o', !!event.data.normal, !!event.data.mini);
    if (watermarkBitmap) watermarkBitmap.close();
    if (watermarkMiniBitmap) watermarkMiniBitmap.close();
    watermarkBitmap = event.data.normal;
    watermarkMiniBitmap = event.data.mini;
    return;
  }

  if (type === 'drawFrame') {
    const { pixels, width, height, watermarkEnabled } = event.data;
    if (viewportCanvas && viewportCtx) {
      if (viewportCanvas.width !== width || viewportCanvas.height !== height) {
        viewportCanvas.width = width;
        viewportCanvas.height = height;
      }
      viewportCtx.imageSmoothingEnabled = false;
      const imgDataOut = new ImageData(new Uint8ClampedArray(pixels), width, height);
      viewportCtx.putImageData(imgDataOut, 0, 0);

      if (watermarkEnabled) {
        const useMini = width < 64 || height < 64;
        const watermark = useMini ? watermarkMiniBitmap : watermarkBitmap;
        if (watermark) {
          const margin = useMini ? WATERMARK_MARGIN_MINI : WATERMARK_MARGIN_NORMAL;
          const x = width - margin - watermark.width;
          const y = height - margin - watermark.height;
          viewportCtx.drawImage(watermark, x, y);
        } else {
          warn('Watermark', 'Watermark requested but bitmap is not loaded!');
        }
      }
    } else {
      warn('Canvas', 'Cannot draw directly to OffscreenCanvas: viewportCanvas is %o, viewportCtx is %o', !!viewportCanvas, !!viewportCtx);
    }
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
    skipStats,
  } = event.data;

  activeJobId = jobId;

  const backend = forceCpu ? Backend.CPU : Backend.AUTO;
  const startTs = self.performance?.now?.() ?? Date.now();
  const phaseLabel = dither?.enabled ? 'DITHERING' : 'COPY SOURCE';

  let image = null;
  let croppedImage = null;
  let wasmPalette = null;

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

    image = new WasmImage(imgData);

    // Apply crop if settings are provided
    if (crop && (crop.top > 0 || crop.bottom > 0 || crop.left > 0 || crop.right > 0)) {
      croppedImage = Transform.Crop(image, {
        top: crop.top,
        left: crop.left,
        right: crop.right,
        bottom: crop.bottom
      });
    }
    const activeImage = croppedImage || image;
    tSetup = performance.now() - tSetupStart;

    if (!filtersCache) {
      filtersCache = Filters.getFilters();
    }
    const filters = filtersCache;

    const tNoiseStart = performance.now();
    if (noise && noise.noiseCoverage > 0 && noise.noiseIntensity > 0) {
      const noiseFilter = filters.noise;
      if (noiseFilter) {
        await noiseFilter.apply(activeImage, {
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
        await adjustmentFilter.apply(activeImage, {
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
        await blurFilter.apply(activeImage, {
          blurStrength: blur.blurStrength,
          edgeStrength: blur.edgeStrength,
          passes: blur.passes,
        }, backend);
      }
    }
    tBlur = performance.now() - tBlurStart;

    const croppedBuffer = activeImage.pixels;
    const outWidth = activeImage.width;
    const outHeight = activeImage.height;

    // Clone the pre-dither pixels immediately — dithering mutates image.pixels in-place,
    // so reading croppedBuffer later would yield quantized (post-dither) pixel data instead
    // of the original source colors, causing palette extraction to see only palette colors.
    const croppedSnapshot = new Uint8Array(croppedBuffer);

    let outputPixels;

    if (previewingOriginal) {
      // Just retrieve the filtered original image
      const outputBuffer = activeImage.pixels;
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
        wasmPalette = new WasmPalette(colors);

        const algs = Dithering.getAlgorithms();
        const methodName = dither.method === 'ordered_bayer' ? 'bayer' : dither.method;
        const alg = algs.find(a => a.name === methodName);
        if (alg) {
          await alg.apply(activeImage, wasmPalette, {
            amount: dither.amount,
            matrixScale: dither.matrixScale,
            seed: dither.seed,
          });
        }
      }
      tDither = performance.now() - tDitherStart;

      const tFinalStart = performance.now();
      const outputBuffer = activeImage.pixels;
      outputPixels = new Uint8ClampedArray(outputBuffer.buffer);

      if (dither.enabled) {
        applyBinaryAlphaThreshold(outputPixels);
      }
      tFinal = performance.now() - tFinalStart;
    }

    // Render directly to OffscreenCanvas if available
    if (viewportCanvas && viewportCtx) {
      if (viewportCanvas.width !== outWidth || viewportCanvas.height !== outHeight) {
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
          warn('Watermark', 'Watermark requested but bitmap is not loaded!');
        }
      }
    } else {
      warn('Canvas', 'Cannot draw directly to OffscreenCanvas: viewportCanvas is %o, viewportCtx is %o', !!viewportCanvas, !!viewportCtx);
    }

    const elapsed = (self.performance?.now?.() ?? Date.now()) - startTs;

    log(
      'Worker',
      `Job ${jobId} image ready (${outWidth}x${outHeight}px):\n` +
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
    const referenceCopy = new Uint8Array(croppedSnapshot);
    self.postMessage(
      {
        jobId,
        outputPixels: clonedOutput.buffer,
        referencePixels: referenceCopy.buffer,
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
      [clonedOutput.buffer, referenceCopy.buffer],
    );

    // Run stats calculations when browser event loop is idle
    if (!skipStats) {
      setTimeout(() => {
        if (activeJobId !== jobId) return;

        const tStatsStart = performance.now();
        
        // Use the pre-dither snapshot — croppedBuffer was already mutated by dithering
        const referenceCopy = new Uint8Array(croppedSnapshot);
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

        log(
          'Worker',
          `Job ${jobId} stats computed (async):\n` +
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
    }

  } catch (errorObj) {
    error('Worker', 'ERROR %s (job: %d): %o', phaseLabel, jobId, errorObj);
    self.postMessage({
      jobId,
      error: errorObj instanceof Error ? errorObj.message : 'WASM processing failed',
    });
  } finally {
    if (source) {
      try { source.close(); } catch { /* ignore */ }
    }
    if (croppedImage) {
      try { croppedImage.free(); } catch { /* ignore */ }
    }
    if (image) {
      try { image.free(); } catch { /* ignore */ }
    }
    if (wasmPalette) {
      try { wasmPalette.free(); } catch { /* ignore */ }
    }
  }
};
