import init, {
  Image as WasmImage,
  MedianCutGenerator,
  OctreeGenerator,
  KMeansGenerator,
} from 'ddot-wasm';
import wasmUrl from 'ddot-wasm/ddot_wasm_bg.wasm?url';

let wasmInitialized = false;
let isProcessing = false;
let pendingJob = null;

function colorToHex({ r, g, b }) {
  const R = String(r.toString(16)).padStart(2, '0');
  const G = String(g.toString(16)).padStart(2, '0');
  const B = String(b.toString(16)).padStart(2, '0');
  return `#${R}${G}${B}`;
}

function createGenerator(method) {
  if (method === 'octree') {
    return new OctreeGenerator();
  } else if (method === 'kmeans') {
    return new KMeansGenerator();
  }
  return new MedianCutGenerator();
}

async function executeJob(jobData) {
  const { jobId, pixels, width, height, frames, method, count } = jobData;

  let image = null;
  let wasmPalette = null;
  let generator = null;

  try {
    if (!wasmInitialized) {
      await init({ module_or_path: wasmUrl });
      wasmInitialized = true;
    }

    const targetColorCount = Math.max(2, Math.min(256, Number(count) || 8));
    const params = { n_of_colors: targetColorCount };

    // Multi-frame 2-pass extraction
    if (Array.isArray(frames) && frames.length > 0) {
      const intermediateColors = [];

      // Pass 1: Extract targetColorCount colors from each selected frame
      for (const frame of frames) {
        if (!frame?.pixels || !frame?.width || !frame?.height) continue;
        let frameImg = null;
        let frameGen = null;
        let framePalette = null;
        try {
          const pixelsArray = new Uint8ClampedArray(frame.pixels);
          const imageData = new ImageData(pixelsArray, frame.width, frame.height);
          frameImg = new WasmImage(imageData);
          frameGen = createGenerator(method);
          framePalette = frameGen.calculate(frameImg, params);
          if (framePalette?.colors) {
            for (const col of framePalette.colors) {
              intermediateColors.push({ r: col.r, g: col.g, b: col.b });
            }
          }
        } finally {
          if (framePalette) { try { framePalette.free(); } catch { /* ignore */ } }
          if (frameGen) { try { frameGen.free(); } catch { /* ignore */ } }
          if (frameImg) { try { frameImg.free(); } catch { /* ignore */ } }
        }
      }

      if (intermediateColors.length <= targetColorCount) {
        const palette = intermediateColors.map(colorToHex);
        self.postMessage({ jobId, palette });
        return;
      }

      // Pass 2: Re-quantize aggregated intermediate colors down to targetColorCount
      const poolWidth = intermediateColors.length;
      const poolHeight = 1;
      const poolPixels = new Uint8ClampedArray(poolWidth * 4);
      for (let i = 0; i < poolWidth; i++) {
        const c = intermediateColors[i];
        const idx = i * 4;
        poolPixels[idx] = c.r;
        poolPixels[idx + 1] = c.g;
        poolPixels[idx + 2] = c.b;
        poolPixels[idx + 3] = 255;
      }

      let pass2Img = null;
      let pass2Gen = null;
      let pass2Palette = null;
      try {
        const pass2ImgData = new ImageData(poolPixels, poolWidth, poolHeight);
        pass2Img = new WasmImage(pass2ImgData);
        pass2Gen = createGenerator(method);
        pass2Palette = pass2Gen.calculate(pass2Img, params);
        const palette = pass2Palette.colors.map(colorToHex);
        self.postMessage({ jobId, palette });
        return;
      } finally {
        if (pass2Palette) { try { pass2Palette.free(); } catch { /* ignore */ } }
        if (pass2Gen) { try { pass2Gen.free(); } catch { /* ignore */ } }
        if (pass2Img) { try { pass2Img.free(); } catch { /* ignore */ } }
      }
    }

    // Single frame extraction
    const pixelsArray = new Uint8ClampedArray(pixels);
    const imageData = new ImageData(pixelsArray, width, height);
    image = new WasmImage(imageData);

    generator = createGenerator(method);
    wasmPalette = generator.calculate(image, params);

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
    if (generator) {
      try { generator.free(); } catch { /* ignore */ }
      generator = null;
    }
    if (image) {
      try { image.free(); } catch { /* ignore */ }
      image = null;
    }
    if (wasmPalette) {
      try { wasmPalette.free(); } catch { /* ignore */ }
      wasmPalette = null;
    }
  }
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (pendingJob) {
      const current = pendingJob;
      pendingJob = null;
      await executeJob(current);
    }
  } finally {
    isProcessing = false;
    if (pendingJob) {
      processQueue();
    }
  }
}

self.onmessage = (event) => {
  const data = event.data || {};
  if (!data.jobId) return;

  // If another job is already queued and hasn't started yet, drop it immediately
  if (pendingJob) {
    self.postMessage({
      jobId: pendingJob.jobId,
      aborted: true,
    });
  }

  pendingJob = data;
  processQueue();
};
