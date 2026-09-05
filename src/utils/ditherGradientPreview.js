import { DITHER_METHOD } from '../stores/engine/ditherStore';

const PREVIEW_WIDTH = 140;
const PREVIEW_HEIGHT = 18;

const BAYER_8X8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
];

const cache = new Map();

function createGradientBuffer(width, height) {
  const buf = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[y * width + x] = (x / (width - 1)) * 255;
    }
  }
  return buf;
}

function renderDitherGradient(methodId) {
  if (typeof document === 'undefined') return '';
  const width = PREVIEW_WIDTH;
  const height = PREVIEW_HEIGHT;
  const buf = createGradientBuffer(width, height);
  const out = new Uint8Array(width * height);

  const addErr = (x, y, err) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      buf[y * width + x] += err;
    }
  };

  if (methodId === 'disabled') {
    for (let i = 0; i < buf.length; i++) {
      out[i] = Math.max(0, Math.min(255, Math.round(buf[i])));
    }
  } else if (methodId === DITHER_METHOD.ONLY_PALETTE) {
    for (let i = 0; i < buf.length; i++) {
      out[i] = buf[i] < 128 ? 0 : 255;
    }
  } else if (methodId === DITHER_METHOD.ORDERED_BAYER) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const threshold = ((BAYER_8X8[(y % 8) * 8 + (x % 8)] + 0.5) / 64) * 255;
        out[y * width + x] = buf[y * width + x] < threshold ? 0 : 255;
      }
    }
  } else if (methodId === DITHER_METHOD.RANDOM) {
    let seed = 42857;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < buf.length; i++) {
      const threshold = 128 + (rng() - 0.5) * 255 * 0.75;
      out[i] = buf[i] < threshold ? 0 : 255;
    }
  } else {
    // Error diffusion methods
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldVal = buf[idx];
        const newVal = oldVal < 128 ? 0 : 255;
        out[idx] = newVal;
        const err = oldVal - newVal;

        switch (methodId) {
          case DITHER_METHOD.FLOYD_STEINBERG:
            addErr(x + 1, y, (err * 7) / 16);
            addErr(x - 1, y + 1, (err * 3) / 16);
            addErr(x, y + 1, (err * 5) / 16);
            addErr(x + 1, y + 1, (err * 1) / 16);
            break;

          case DITHER_METHOD.ATKINSON:
            addErr(x + 1, y, err / 8);
            addErr(x + 2, y, err / 8);
            addErr(x - 1, y + 1, err / 8);
            addErr(x, y + 1, err / 8);
            addErr(x + 1, y + 1, err / 8);
            addErr(x, y + 2, err / 8);
            break;

          case DITHER_METHOD.JJN:
            addErr(x + 1, y, (err * 7) / 48);
            addErr(x + 2, y, (err * 5) / 48);
            addErr(x - 2, y + 1, (err * 3) / 48);
            addErr(x - 1, y + 1, (err * 5) / 48);
            addErr(x, y + 1, (err * 7) / 48);
            addErr(x + 1, y + 1, (err * 5) / 48);
            addErr(x + 2, y + 1, (err * 3) / 48);
            addErr(x - 2, y + 2, (err * 1) / 48);
            addErr(x - 1, y + 2, (err * 3) / 48);
            addErr(x, y + 2, (err * 5) / 48);
            addErr(x + 1, y + 2, (err * 3) / 48);
            addErr(x + 2, y + 2, (err * 1) / 48);
            break;

          case DITHER_METHOD.STUCKI:
            addErr(x + 1, y, (err * 8) / 42);
            addErr(x + 2, y, (err * 4) / 42);
            addErr(x - 2, y + 1, (err * 2) / 42);
            addErr(x - 1, y + 1, (err * 4) / 42);
            addErr(x, y + 1, (err * 8) / 42);
            addErr(x + 1, y + 1, (err * 4) / 42);
            addErr(x + 2, y + 1, (err * 2) / 42);
            addErr(x - 2, y + 2, (err * 1) / 42);
            addErr(x - 1, y + 2, (err * 2) / 42);
            addErr(x, y + 2, (err * 4) / 42);
            addErr(x + 1, y + 2, (err * 2) / 42);
            addErr(x + 2, y + 2, (err * 1) / 42);
            break;

          case DITHER_METHOD.BURKES:
            addErr(x + 1, y, (err * 8) / 32);
            addErr(x + 2, y, (err * 4) / 32);
            addErr(x - 2, y + 1, (err * 2) / 32);
            addErr(x - 1, y + 1, (err * 4) / 32);
            addErr(x, y + 1, (err * 8) / 32);
            addErr(x + 1, y + 1, (err * 4) / 32);
            addErr(x + 2, y + 1, (err * 2) / 32);
            break;

          case DITHER_METHOD.SIERRA:
            addErr(x + 1, y, (err * 5) / 32);
            addErr(x + 2, y, (err * 3) / 32);
            addErr(x - 2, y + 1, (err * 2) / 32);
            addErr(x - 1, y + 1, (err * 4) / 32);
            addErr(x, y + 1, (err * 5) / 32);
            addErr(x + 1, y + 1, (err * 4) / 32);
            addErr(x + 2, y + 1, (err * 2) / 32);
            addErr(x - 1, y + 2, (err * 2) / 32);
            addErr(x, y + 2, (err * 3) / 32);
            addErr(x + 1, y + 2, (err * 2) / 32);
            break;

          case DITHER_METHOD.TWO_ROW_SIERRA:
            addErr(x + 1, y, (err * 4) / 16);
            addErr(x + 2, y, (err * 3) / 16);
            addErr(x - 2, y + 1, (err * 1) / 16);
            addErr(x - 1, y + 1, (err * 2) / 16);
            addErr(x, y + 1, (err * 3) / 16);
            addErr(x + 1, y + 1, (err * 2) / 16);
            addErr(x + 2, y + 1, (err * 1) / 16);
            break;

          case DITHER_METHOD.SIERRA_LITE:
          default:
            addErr(x + 1, y, (err * 2) / 4);
            addErr(x - 1, y + 1, (err * 1) / 4);
            addErr(x, y + 1, (err * 1) / 4);
            break;
        }
      }
    }
  }

  // Draw to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let i = 0; i < out.length; i++) {
    const val = out[i];
    const p = i * 4;
    data[p] = val;
    data[p + 1] = val;
    data[p + 2] = val;
    data[p + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function getDitherPreview(methodId) {
  if (cache.has(methodId)) {
    return cache.get(methodId);
  }
  const url = renderDitherGradient(methodId);
  cache.set(methodId, url);
  return url;
}
