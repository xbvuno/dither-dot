import { encode } from 'modern-gif';
import gifWorkerUrl from '../workers/modernGifWorker?url';
import useGifStore from '../stores/media/gifStore';
import { getOutputCanvas } from './canvasRegistry';

function waitForFrameRendered(frameIndex, timeoutMs = 20000) {
  const initial = useGifStore.getState();
  if (initial.frameStates?.[frameIndex] === 'done') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(`Frame ${frameIndex + 1} did not finish rendering in time.`));
    }, timeoutMs);

    const unsubscribe = useGifStore.subscribe((state) => {
      if (state.frameStates?.[frameIndex] === 'done') {
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve();
      }
    });
  });
}

function captureCanvasPixels(canvas) {
  const width = Math.max(1, Number(canvas.width) || 1);
  const height = Math.max(1, Number(canvas.height) || 1);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Unable to read rendered output for GIF export.');
  }

  const pixels = ctx.getImageData(0, 0, width, height).data;
  return {
    width,
    height,
    pixels: new Uint8Array(pixels),
  };
}

function captureCompositedPixels() {
  const outputCanvas = getOutputCanvas();
  if (!outputCanvas) {
    throw new Error('No processed canvas available for GIF export.');
  }

  return captureCanvasPixels(outputCanvas);
}

function getExportBaseName(sourceName = '') {
  return sourceName.replace(/\.[^.]+$/, '').trim() || 'export';
}

function upscaleFramePixels({ width, height, pixels }, upscaleFactor) {
  const factor = Math.max(1, Math.floor(Number(upscaleFactor) || 1));
  if (factor === 1) {
    return { width, height, pixels };
  }

  const nextWidth = width * factor;
  const nextHeight = height * factor;
  const nextPixels = new Uint8Array(nextWidth * nextHeight * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcIndex = (y * width + x) * 4;
      const r = pixels[srcIndex];
      const g = pixels[srcIndex + 1];
      const b = pixels[srcIndex + 2];
      const a = pixels[srcIndex + 3];

      for (let oy = 0; oy < factor; oy += 1) {
        const row = y * factor + oy;
        for (let ox = 0; ox < factor; ox += 1) {
          const col = x * factor + ox;
          const dstIndex = (row * nextWidth + col) * 4;
          nextPixels[dstIndex] = r;
          nextPixels[dstIndex + 1] = g;
          nextPixels[dstIndex + 2] = b;
          nextPixels[dstIndex + 3] = a;
        }
      }
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
    pixels: nextPixels,
  };
}

function waitForFrameSelected(frameIndex, timeoutMs = 4000) {
  const initial = useGifStore.getState();
  if (initial.currentFrameIndex === frameIndex) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(`Frame ${frameIndex + 1} was not selected in time.`));
    }, timeoutMs);

    const unsubscribe = useGifStore.subscribe((state) => {
      if (state.currentFrameIndex === frameIndex) {
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve();
      }
    });
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export async function exportCurrentGif(sourceName, { onProgress, timeoutMs = 20000, upscale = 1, returnDataUrl = false } = {}) {
  const gifState = useGifStore.getState();
  if ((gifState.frames?.length || 0) <= 1) {
    throw new Error('GIF EXPORT REQUIRES A MULTI-FRAME SOURCE.');
  }

  const previousIndex = gifState.currentFrameIndex;
  const previousPlaying = gifState.playing;

  try {
    gifState.setPlaying(false);
    gifState.setExporting(true);

    const encodedFrames = [];
    let exportWidth = 0;
    let exportHeight = 0;

    for (let index = 0; index < gifState.frames.length; index += 1) {
      gifState.setCurrentFrameIndex(index);
      await waitForFrameSelected(index, timeoutMs);
      await waitForFrameRendered(index, timeoutMs);
      await nextAnimationFrame();
      await nextAnimationFrame();

      const captured = upscaleFramePixels(captureCompositedPixels(), upscale);
      exportWidth = captured.width;
      exportHeight = captured.height;

      encodedFrames.push({
        data: captured.pixels,
        delay: Math.max(20, Number(gifState.frames[index]?.delay) || 100),
      });

      onProgress?.({ done: index + 1, total: gifState.frames.length });
    }

    const output = await encode({
      workerUrl: gifWorkerUrl,
      width: exportWidth,
      height: exportHeight,
      frames: encodedFrames,
    });

    if (returnDataUrl) {
      const blob = new Blob([output], { type: 'image/gif' });
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
    }

    const blob = new Blob([output], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${getExportBaseName(sourceName)}.gif`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } finally {
    const currentState = useGifStore.getState();
    currentState.setCurrentFrameIndex(previousIndex);
    currentState.setPlaying(previousPlaying);
    currentState.setExporting(false);
  }
}