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

async function executeJob(jobData) {
  const { jobId, pixels, width, height, method, count } = jobData;

  let image = null;
  let wasmPalette = null;
  let generator = null;

  try {
    if (!wasmInitialized) {
      await init({ module_or_path: wasmUrl });
      wasmInitialized = true;
    }

    const pixelsArray = new Uint8ClampedArray(pixels);
    const imageData = new ImageData(pixelsArray, width, height);
    image = new WasmImage(imageData);

    if (method === 'octree') {
      generator = new OctreeGenerator();
    } else if (method === 'kmeans') {
      generator = new KMeansGenerator();
    } else {
      generator = new MedianCutGenerator();
    }

    const params = { n_of_colors: Math.max(2, Math.min(256, Number(count) || 8)) };
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
