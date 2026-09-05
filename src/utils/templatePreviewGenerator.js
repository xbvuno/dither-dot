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
let filtersCache = null;
let baseImageData = null;

const previewCache = new Map();
const inFlightPromises = new Map();

async function initWasmIfNeeded() {
  if (!wasmInitialized) {
    await init({ module_or_path: wasmUrl });
    wasmInitialized = true;
  }
}

async function loadBaseImageData() {
  if (baseImageData) return baseImageData;

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
}

export async function generateTemplatePreview(template) {
  if (!template) return '';
  const templateId = template.id;

  if (previewCache.has(templateId)) {
    return previewCache.get(templateId);
  }

  if (inFlightPromises.has(templateId)) {
    return inFlightPromises.get(templateId);
  }

  const promise = (async () => {
    try {
      await initWasmIfNeeded();
      const baseData = await loadBaseImageData();

      const width = baseData.width;
      const height = baseData.height;

      // Copy pixels buffer
      const pixelsCopy = new Uint8ClampedArray(baseData.data);
      const imgData = new ImageData(pixelsCopy, width, height);

      const wasmImage = new WasmImage(imgData);

      if (!filtersCache) {
        filtersCache = Filters.getFilters();
      }
      const filters = filtersCache;

      // 1. Noise
      if (template.params?.noiseEnabled) {
        const noiseFilter = filters?.noise;
        if (noiseFilter) {
          await noiseFilter.apply(wasmImage, {
            coverage: template.params.noiseCoverage || 0,
            intensity: template.params.noiseIntensity || 0,
            saturation: template.params.noiseSaturation || 0,
            phase: 0,
          }, Backend.AUTO);
        }
      }

      // 2. Adjustments
      if (template.params) {
        const adjustmentFilter = filters?.adjustment;
        if (adjustmentFilter) {
          await adjustmentFilter.apply(wasmImage, {
            gamma: template.params.gamma ?? 1.0,
            blacks: template.params.blacks ?? 0.0,
            whites: template.params.whites ?? 0.0,
            contrast: template.params.contrast ?? 0.0,
            saturation: template.params.saturation ?? 1.0,
            hue: template.params.hue ?? 0.0,
          }, Backend.AUTO);
        }
      }

      // 3. Blur
      if (template.params?.blurEnabled) {
        const blurFilter = filters?.kawase_blur;
        if (blurFilter) {
          await blurFilter.apply(wasmImage, {
            blurStrength: template.params.blurStrength || 0,
            edgeStrength: template.params.edgeStrength || 0,
            passes: template.params.passes || 1,
          }, Backend.AUTO);
        }
      }

      // 4. Dithering
      if (template.dither?.enabled) {
        let wasmPalette = null;

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
          wasmPalette.free();
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
      wasmImage.free();

      previewCache.set(templateId, dataUrl);
      return dataUrl;
    } catch (err) {
      console.error('[template-preview] Failed to generate preview for template', templateId, err);
      return '';
    } finally {
      inFlightPromises.delete(templateId);
    }
  })();

  inFlightPromises.set(templateId, promise);
  return promise;
}
