import init, { Image as WasmImage, Palettes } from 'ddot-wasm';
import wasmUrl from 'ddot-wasm/ddot_wasm_bg.wasm?url';

let wasmInitialized = false;

function colorToHex({ r, g, b }) {
  const R = String(r.toString(16)).padStart(2, '0');
  const G = String(g.toString(16)).padStart(2, '0');
  const B = String(b.toString(16)).padStart(2, '0');
  return `#${R}${G}${B}`;
}

self.onmessage = async (event) => {
  const { jobId, pixels, width, height, method, count } = event.data || {};

  let image = null;
  let wasmPalette = null;

  try {
    if (!wasmInitialized) {
      await init({ module_or_path: wasmUrl });
      wasmInitialized = true;
    }

    const pixelsArray = new Uint8ClampedArray(pixels);
    const imageData = new ImageData(pixelsArray, width, height);
    image = new WasmImage(imageData);

    const generators = Palettes.Generators;

    if (method === 'octree') {
      wasmPalette = generators.Octree.calculate(image, count);
    } else if (method === 'kmeans') {
      wasmPalette = generators.Kmeans.calculate(image, count);
    } else {
      wasmPalette = generators.MedianCut.calculate(image, count);
    }

    const palette = wasmPalette.colors.map(colorToHex);

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
  } finally {
    if (image) {
      try { image.free(); } catch { /* ignore */ }
    }
    if (wasmPalette) {
      try { wasmPalette.free(); } catch { /* ignore */ }
    }
  }
};
