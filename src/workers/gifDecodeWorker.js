import { parseGIF, decompressFrames } from 'gifuct-js';

function clearFrameRect(buffer, canvasWidth, dims) {
  const left = Math.max(0, Math.floor(dims.left));
  const top = Math.max(0, Math.floor(dims.top));
  const width = Math.max(0, Math.floor(dims.width));
  const height = Math.max(0, Math.floor(dims.height));

  for (let y = 0; y < height; y += 1) {
    const canvasY = top + y;
    const rowStart = ((canvasY * canvasWidth) + left) * 4;
    const rowEnd = rowStart + (width * 4);
    buffer.fill(0, rowStart, rowEnd);
  }
}

function applyPatch(buffer, canvasWidth, canvasHeight, patch, dims) {
  const left = Math.max(0, Math.floor(dims.left));
  const top = Math.max(0, Math.floor(dims.top));
  const width = Math.max(0, Math.floor(dims.width));
  const height = Math.max(0, Math.floor(dims.height));

  for (let y = 0; y < height; y += 1) {
    const canvasY = top + y;
    if (canvasY < 0 || canvasY >= canvasHeight) continue;

    for (let x = 0; x < width; x += 1) {
      const canvasX = left + x;
      if (canvasX < 0 || canvasX >= canvasWidth) continue;

      const patchIndex = ((y * width) + x) * 4;
      const alpha = patch[patchIndex + 3];
      if (alpha === 0) continue;

      const canvasIndex = ((canvasY * canvasWidth) + canvasX) * 4;
      buffer[canvasIndex] = patch[patchIndex];
      buffer[canvasIndex + 1] = patch[patchIndex + 1];
      buffer[canvasIndex + 2] = patch[patchIndex + 2];
      buffer[canvasIndex + 3] = alpha;
    }
  }
}

function parseLoopCount(parsedGif) {
  try {
    const appFrame = (parsedGif.frames || []).find((frame) => frame?.application?.id === 'NETSCAPE');
    const blocks = appFrame?.application?.blocks;
    if (!Array.isArray(blocks) || blocks.length < 3) return 0;
    return (blocks[1] || 0) + ((blocks[2] || 0) << 8);
  } catch {
    return 0;
  }
}

function decodeGifFrames(arrayBuffer) {
  const parsed = parseGIF(arrayBuffer);
  const decoded = decompressFrames(parsed, true);
  const width = Math.max(1, Number(parsed?.lsd?.width) || 1);
  const height = Math.max(1, Number(parsed?.lsd?.height) || 1);

  const composite = new Uint8ClampedArray(width * height * 4);
  const frames = [];

  let previousDecodedFrame = null;
  let restoreSnapshot = null;

  for (const decodedFrame of decoded) {
    if (previousDecodedFrame?.disposalType === 2) {
      clearFrameRect(composite, width, previousDecodedFrame.dims);
    } else if (previousDecodedFrame?.disposalType === 3 && restoreSnapshot) {
      composite.set(restoreSnapshot);
    }

    const snapshotBeforeDraw = decodedFrame.disposalType === 3
      ? composite.slice()
      : null;

    applyPatch(composite, width, height, decodedFrame.patch, decodedFrame.dims);

    const delay = Math.max(20, Number(decodedFrame.delay) || 100);
    frames.push({
      width,
      height,
      delay,
      pixels: composite.slice(),
    });

    previousDecodedFrame = decodedFrame;
    restoreSnapshot = snapshotBeforeDraw;
  }

  return {
    loop: parseLoopCount(parsed),
    frames,
  };
}

self.onmessage = (event) => {
  const { jobId, gifBuffer } = event.data || {};
  const startTs = self.performance?.now?.() ?? Date.now();

  try {
    const buffer = gifBuffer instanceof ArrayBuffer
      ? gifBuffer
      : gifBuffer?.buffer;

    if (!(buffer instanceof ArrayBuffer)) {
      throw new Error('Invalid GIF buffer payload.');
    }

    const decoded = decodeGifFrames(buffer);
    const transferableFrames = decoded.frames.map((frame) => ({
      width: frame.width,
      height: frame.height,
      delay: frame.delay,
      pixels: frame.pixels.buffer,
    }));

    const elapsed = (self.performance?.now?.() ?? Date.now()) - startTs;

    self.postMessage(
      {
        jobId,
        loop: decoded.loop,
        frames: transferableFrames,
      },
      transferableFrames.map((frame) => frame.pixels),
    );
  } catch (error) {
    console.error(`[gif-worker] ERROR GIF DECODE (job: ${jobId})`, error);
    self.postMessage({
      jobId,
      error: error instanceof Error ? error.message : 'GIF decoding failed.',
    });
  }
};
