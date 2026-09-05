import init, {
  Image as WasmImage,
  Filters,
  Dithering,
  Palettes,
  Palette as WasmPalette,
  Backend,
} from 'ddot-wasm';
import wasmUrl from 'ddot-wasm/ddot_wasm_bg.wasm?url';
import statuePreviewUrl from '../assets/STATUE_PREVIEW.png';
import { hexToRgbUnit } from './shaderHelpers';

let wasmInitialized = false;
let wasmInitPromise = null;
let filtersCache = null;
let baseImageData = null;
let baseImageDataPromise = null;

const previewCache = new Map();
const inFlightPromises = new Map();

// Sequential execution queue to prevent concurrent WASM heap collisions on the main thread
let executionQueue = Promise.resolve();

async function initWasmIfNeeded() {
  if (!wasmInitialized) {
    if (!wasmInitPromise) {
      wasmInitPromise = init({ module_or_path: wasmUrl }).then(() => {
        wasmInitialized = true;
      });
    }
    await wasmInitPromise;
  }
}

async function loadBaseImageData() {
  if (baseImageData) return baseImageData;
  if (!baseImageDataPromise) {
    baseImageDataPromise = (async () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = statuePreviewUrl;

      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(new Error('Failed to load STATUE_PREVIEW.png: ' + e));
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return baseImageData;
    })();
  }
  return baseImageDataPromise;
}

function getTemplateCacheKey(template) {
  if (!template) return '';
  if (template.id === 'custom') {
    const p = template.params || {};
    const d = template.dither || {};
    const pal = template.palette || {};
    return `custom:${p.gamma}_${p.blacks}_${p.whites}_${p.contrast}_${p.saturation}_${p.hue}_${p.noiseEnabled}_${p.noiseCoverage}_${p.noiseIntensity}_${p.blurEnabled}_${p.blurStrength}_${p.passes}_${d.enabled}_${d.method}_${d.amount}_${d.matrixScale}_${d.seed}_${pal.extractMethod}_${pal.id}_${(pal.colors || []).join(',')}`;
  }
  return template.id;
}

export async function generateTemplatePreview(template) {
  if (!template) return '';
  const templateId = template.id;
  const cacheKey = getTemplateCacheKey(template);

  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey);
  }

  if (inFlightPromises.has(cacheKey)) {
    return inFlightPromises.get(cacheKey);
  }

  const promise = (async () => {
    const result = await (executionQueue = executionQueue.then(async () => {
      let wasmImage = null;
      let wasmPalette = null;
      try {
        await initWasmIfNeeded();
        const baseData = await loadBaseImageData();

        const width = baseData.width;
        const height = baseData.height;

        // Copy pixels buffer
        const pixelsCopy = new Uint8ClampedArray(baseData.data);
        const imgData = new ImageData(pixelsCopy, width, height);

        wasmImage = new WasmImage(imgData);

        if (!filtersCache) {
          filtersCache = Filters.getFilters();
        }
        const filters = filtersCache;

        // 1. Noise
        if (template.params?.noiseEnabled) {
          try {
            const noiseFilter = filters?.noise;
            if (noiseFilter) {
              await noiseFilter.apply(wasmImage, {
                coverage: template.params.noiseCoverage || 0,
                intensity: template.params.noiseIntensity || 0,
                saturation: template.params.noiseSaturation || 0,
                phase: 0,
              }, Backend.CPU);
            }
          } catch (e) {
            console.warn(`[template-preview] Noise filter failed for template ${templateId}:`, e);
          }
        }

        // 2. Adjustments
        if (template.params) {
          try {
            const adjustmentFilter = filters?.adjustment;
            if (adjustmentFilter) {
              await adjustmentFilter.apply(wasmImage, {
                gamma: template.params.gamma ?? 1.0,
                blacks: template.params.blacks ?? 0.0,
                whites: template.params.whites ?? 0.0,
                contrast: template.params.contrast ?? 0.0,
                saturation: template.params.saturation ?? 1.0,
                hue: template.params.hue ?? 0.0,
              }, Backend.CPU);
            }
          } catch (e) {
            console.warn(`[template-preview] Adjustment filter failed for template ${templateId}:`, e);
          }
        }

        // 3. Blur
        if (template.params?.blurEnabled) {
          try {
            const blurFilter = filters?.kawase_blur;
            if (blurFilter) {
              await blurFilter.apply(wasmImage, {
                blurStrength: template.params.blurStrength || 0,
                edgeStrength: template.params.edgeStrength || 0,
                passes: template.params.passes || 1,
              }, Backend.CPU);
            }
          } catch (e) {
            console.warn(`[template-preview] Blur filter failed for template ${templateId}:`, e);
          }
        }

        // 4. Dithering
        if (template.dither?.enabled) {
          try {
            if (template.palette?.extractMethod) {
              const count = template.palette.colorCount || 8;
              const generators = Palettes.Generators;
              if (template.palette.extractMethod === 'octree') {
                wasmPalette = generators.Octree.calculate(wasmImage, count);
              } else if (template.palette.extractMethod === 'kmeans') {
                wasmPalette = generators.Kmeans.calculate(wasmImage, count);
              } else {
                wasmPalette = generators.MedianCut.calculate(wasmImage, count);
              }
            } else if (template.palette?.colors?.length) {
              const colors = template.palette.colors.map((hex) => {
                const [r, g, b] = hexToRgbUnit(hex);
                return {
                  r: Math.round(r * 255) & 255,
                  g: Math.round(g * 255) & 255,
                  b: Math.round(b * 255) & 255,
                  a: 255,
                };
              });
              wasmPalette = new WasmPalette(colors);
            }

            if (wasmPalette) {
              const algs = Dithering.getAlgorithms();
              const methodName = template.dither.method === 'ordered_bayer' ? 'bayer' : template.dither.method;
              const alg = algs.find((a) => a.name === methodName);

              if (alg) {
                await alg.apply(wasmImage, wasmPalette, {
                  amount: template.dither.amount ?? 1.0,
                  matrixScale: template.dither.matrixScale ?? 1.0,
                  seed: template.dither.seed ?? 1.0,
                });
              }
            }
          } catch (e) {
            console.warn(`[template-preview] Dither failed for template ${templateId}:`, e);
          } finally {
            if (wasmPalette) {
              wasmPalette.free();
              wasmPalette = null;
            }
          }
        }

        const outBuffer = wasmImage.pixels;
        const outputPixels = new Uint8ClampedArray(outBuffer.buffer);

        // Render to offscreen canvas
        const outCanvas = document.createElement('canvas');
        outCanvas.width = width;
        outCanvas.height = height;
        const outCtx = outCanvas.getContext('2d');
        const outImgData = new ImageData(outputPixels, width, height);
        outCtx.putImageData(outImgData, 0, 0);

        const dataUrl = outCanvas.toDataURL('image/png');
        previewCache.set(cacheKey, dataUrl);
        return dataUrl;
      } catch (err) {
        console.error('[template-preview] Failed to generate preview for template', templateId, err);
        return statuePreviewUrl;
      } finally {
        if (wasmPalette) {
          try { wasmPalette.free(); } catch (_) {}
        }
        if (wasmImage) {
          try { wasmImage.free(); } catch (_) {}
        }
      }
    }).catch((err) => {
      console.error('[template-preview] Queue execution failed:', err);
      return statuePreviewUrl;
    }));

    inFlightPromises.delete(cacheKey);
    return result;
  })();

  inFlightPromises.set(cacheKey, promise);
  return promise;
}
