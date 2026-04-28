const KERNELS = {
  floyd_steinberg: {
    divisor: 16,
    taps: [
      { dx: 1, dy: 0, weight: 7 },
      { dx: -1, dy: 1, weight: 3 },
      { dx: 0, dy: 1, weight: 5 },
      { dx: 1, dy: 1, weight: 1 },
    ],
  },
  jjn: {
    divisor: 48,
    taps: [
      { dx: 1, dy: 0, weight: 7 },
      { dx: 2, dy: 0, weight: 5 },
      { dx: -2, dy: 1, weight: 3 },
      { dx: -1, dy: 1, weight: 5 },
      { dx: 0, dy: 1, weight: 7 },
      { dx: 1, dy: 1, weight: 5 },
      { dx: 2, dy: 1, weight: 3 },
      { dx: -2, dy: 2, weight: 1 },
      { dx: -1, dy: 2, weight: 3 },
      { dx: 0, dy: 2, weight: 5 },
      { dx: 1, dy: 2, weight: 3 },
      { dx: 2, dy: 2, weight: 1 },
    ],
  },
  stucki: {
    divisor: 42,
    taps: [
      { dx: 1, dy: 0, weight: 8 },
      { dx: 2, dy: 0, weight: 4 },
      { dx: -2, dy: 1, weight: 2 },
      { dx: -1, dy: 1, weight: 4 },
      { dx: 0, dy: 1, weight: 8 },
      { dx: 1, dy: 1, weight: 4 },
      { dx: 2, dy: 1, weight: 2 },
      { dx: -2, dy: 2, weight: 1 },
      { dx: -1, dy: 2, weight: 2 },
      { dx: 0, dy: 2, weight: 4 },
      { dx: 1, dy: 2, weight: 2 },
      { dx: 2, dy: 2, weight: 1 },
    ],
  },
  atkinson: {
    divisor: 8,
    taps: [
      { dx: 1, dy: 0, weight: 1 },
      { dx: 2, dy: 0, weight: 1 },
      { dx: -1, dy: 1, weight: 1 },
      { dx: 0, dy: 1, weight: 1 },
      { dx: 1, dy: 1, weight: 1 },
      { dx: 0, dy: 2, weight: 1 },
    ],
  },
  burkes: {
    divisor: 32,
    taps: [
      { dx: 1, dy: 0, weight: 8 },
      { dx: 2, dy: 0, weight: 4 },
      { dx: -2, dy: 1, weight: 2 },
      { dx: -1, dy: 1, weight: 4 },
      { dx: 0, dy: 1, weight: 8 },
      { dx: 1, dy: 1, weight: 4 },
      { dx: 2, dy: 1, weight: 2 },
    ],
  },
  sierra: {
    divisor: 32,
    taps: [
      { dx: 1, dy: 0, weight: 5 },
      { dx: 2, dy: 0, weight: 3 },
      { dx: -2, dy: 1, weight: 2 },
      { dx: -1, dy: 1, weight: 4 },
      { dx: 0, dy: 1, weight: 5 },
      { dx: 1, dy: 1, weight: 4 },
      { dx: 2, dy: 1, weight: 2 },
      { dx: -1, dy: 2, weight: 2 },
      { dx: 0, dy: 2, weight: 3 },
      { dx: 1, dy: 2, weight: 2 },
    ],
  },
  two_row_sierra: {
    divisor: 16,
    taps: [
      { dx: 1, dy: 0, weight: 4 },
      { dx: 2, dy: 0, weight: 3 },
      { dx: -2, dy: 1, weight: 1 },
      { dx: -1, dy: 1, weight: 2 },
      { dx: 0, dy: 1, weight: 3 },
      { dx: 1, dy: 1, weight: 2 },
      { dx: 2, dy: 1, weight: 1 },
    ],
  },
  sierra_lite: {
    divisor: 4,
    taps: [
      { dx: 1, dy: 0, weight: 2 },
      { dx: -1, dy: 1, weight: 1 },
      { dx: 0, dy: 1, weight: 1 },
    ],
  },
};

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

const COMPILED_KERNELS = Object.fromEntries(
  Object.entries(KERNELS).map(([name, kernel]) => {
    const tapCount = kernel.taps.length;
    const dx = new Int8Array(tapCount);
    const dy = new Int8Array(tapCount);
    const factor = new Float32Array(tapCount);

    for (let i = 0; i < tapCount; i++) {
      const tap = kernel.taps[i];
      dx[i] = tap.dx;
      dy[i] = tap.dy;
      factor[i] = tap.weight / kernel.divisor;
    }

    return [name, { dx, dy, factor, tapCount }];
  }),
);

function hash2D(x, y, seed) {
  const t = Math.sin((x + seed * 0.17) * 12.9898 + (y + seed * 1.31) * 78.233) * 43758.5453;
  return t - Math.floor(t);
}

const REF_X = 0.95047;
const REF_Y = 1.00000;
const REF_Z = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const SRGB_TO_LINEAR_8 = new Float32Array(256);

for (let i = 0; i < 256; i++) {
  const s = i / 255;
  SRGB_TO_LINEAR_8[i] = s <= 0.04045
    ? s / 12.92
    : ((s + 0.055) / 1.055) ** 2.4;
}

function labF(t) {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function rgbUnitToLab(r, g, b, outLab) {
  const rb = (r <= 0 ? 0 : r >= 1 ? 255 : (r * 255 + 0.5) | 0);
  const gb = (g <= 0 ? 0 : g >= 1 ? 255 : (g * 255 + 0.5) | 0);
  const bb = (b <= 0 ? 0 : b >= 1 ? 255 : (b * 255 + 0.5) | 0);

  const lr = SRGB_TO_LINEAR_8[rb];
  const lg = SRGB_TO_LINEAR_8[gb];
  const lb = SRGB_TO_LINEAR_8[bb];

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / REF_X;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) / REF_Y;
  const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / REF_Z;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  outLab[0] = 116 * fy - 16;
  outLab[1] = 500 * (fx - fy);
  outLab[2] = 200 * (fy - fz);
}

function nearestPaletteIndexLab(r, g, b, paletteLab, paletteLen, tempLab) {
  rgbUnitToLab(r, g, b, tempLab);
  const l = tempLab[0];
  const a = tempLab[1];
  const labB = tempLab[2];

  let best = 0;
  let bestDist = Infinity;

  for (let i = 0, base = 0; i < paletteLen; i++, base += 3) {
    const dl = l - paletteLab[base];
    const da = a - paletteLab[base + 1];
    const db = labB - paletteLab[base + 2];
    const dist = dl * dl + da * da + db * db;

    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }

  return best;
}

function nearestPaletteIndexRgb(r, g, b, paletteFlat, paletteLen) {
  let best = 0;
  let bestDist = Infinity;

  for (let i = 0, base = 0; i < paletteLen; i++, base += 3) {
    const dr = r - paletteFlat[base];
    const dg = g - paletteFlat[base + 1];
    const db = b - paletteFlat[base + 2];
    const dist = dr * dr + dg * dg + db * db;

    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }

  return best;
}

export function runCpuErrorDiffusion(
  imageData,
  width,
  height,
  paletteRgb,
  method,
  amount,
  diffusion,
  seedValue = 1,
  matrixScale = 1,
  colorSpace = 'lab',
) {
  if (!paletteRgb?.length) {
    return imageData;
  }

  const orderedMethod = method === 'ordered_bayer';
  const randomMethod = method === 'random';
  const kernel = COMPILED_KERNELS[method];

  if (!orderedMethod && !randomMethod && !kernel) {
    return imageData;
  }

  const parsedAmount = Number(amount) || 0;
  const parsedDiffusion = Number(diffusion) || 0;
  const strength = Math.min(1, parsedAmount * parsedDiffusion);
  const amountClamped = Math.max(0, Math.min(1, parsedAmount));
  const seed = Number(seedValue) || 1;
  const bayerScale = Math.max(1, Math.round(Number(matrixScale) || 1));
  const source = imageData;
  const out = new Uint8ClampedArray(source.length);
  const inv255 = 1 / 255;
  const useLabDistance = String(colorSpace || 'lab').toLowerCase() !== 'rgb';

  const paletteLen = paletteRgb.length;
  const paletteFlat = new Float32Array(paletteLen * 3);
  const paletteLab = new Float32Array(paletteLen * 3);
  const paletteByte = new Uint8Array(paletteLen * 3);
  const tempLab = new Float32Array(3);
  for (let i = 0, base = 0; i < paletteLen; i++, base += 3) {
    const color = paletteRgb[i];
    const r = color[0];
    const g = color[1];
    const b = color[2];
    paletteFlat[base] = r;
    paletteFlat[base + 1] = g;
    paletteFlat[base + 2] = b;
    // Bitwise rounding faster than Math.round
    paletteByte[base] = (r * 255 + 0.5) | 0;
    paletteByte[base + 1] = (g * 255 + 0.5) | 0;
    paletteByte[base + 2] = (b * 255 + 0.5) | 0;
    rgbUnitToLab(r, g, b, tempLab);
    paletteLab[base] = tempLab[0];
    paletteLab[base + 1] = tempLab[1];
    paletteLab[base + 2] = tempLab[2];
  }

  // Precalculate row offsets for cache friendliness
  const rowOffsets = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    rowOffsets[y] = y * width;
  }

  // Determine Bayer scale as bitshift for faster indexing
  let bayerShift = 2;
  if (bayerScale === 2) bayerShift = 1;
  else if (bayerScale === 4) bayerShift = 2;

  if (orderedMethod) {
    for (let y = 0; y < height; y++) {
      const rowBase = rowOffsets[y];
      for (let x = 0; x < width; x++) {
        const idx4 = (rowBase + x) * 4;
        const srcA = source[idx4 + 3];
        out[idx4 + 3] = srcA;

        if (srcA === 0) {
          out[idx4] = source[idx4];
          out[idx4 + 1] = source[idx4 + 1];
          out[idx4 + 2] = source[idx4 + 2];
          continue;
        }

        let r = source[idx4] * inv255;
        let g = source[idx4 + 1] * inv255;
        let b = source[idx4 + 2] * inv255;

        // Use bitshift instead of modulo for Bayer indexing
        const bx = (x >> bayerShift) & 3;
        const by = (y >> bayerShift) & 3;
        const threshold = BAYER4[by * 4 + bx] / 16 - 0.5;
        const delta = threshold * amountClamped;
        r += delta;
        g += delta * 0.9;
        b += delta * 0.8;

        // Inline clamping (avoid function call)
        r = r < 0 ? 0 : (r > 1 ? 1 : r);
        g = g < 0 ? 0 : (g > 1 ? 1 : g);
        b = b < 0 ? 0 : (b > 1 ? 1 : b);

        const nearestIndex = useLabDistance
          ? nearestPaletteIndexLab(r, g, b, paletteLab, paletteLen, tempLab)
          : nearestPaletteIndexRgb(r, g, b, paletteFlat, paletteLen);
        const nearestBase = nearestIndex * 3;
        out[idx4] = paletteByte[nearestBase];
        out[idx4 + 1] = paletteByte[nearestBase + 1];
        out[idx4 + 2] = paletteByte[nearestBase + 2];
      }
    }
    return out;
  }

  if (randomMethod) {
    for (let y = 0; y < height; y++) {
      const rowBase = rowOffsets[y];
      for (let x = 0; x < width; x++) {
        const idx4 = (rowBase + x) * 4;
        const srcA = source[idx4 + 3];
        out[idx4 + 3] = srcA;

        if (srcA === 0) {
          out[idx4] = source[idx4];
          out[idx4 + 1] = source[idx4 + 1];
          out[idx4 + 2] = source[idx4 + 2];
          continue;
        }

        let r = source[idx4] * inv255;
        let g = source[idx4 + 1] * inv255;
        let b = source[idx4 + 2] * inv255;

        const noise = hash2D(x, y, seed) - 0.5;
        const delta = noise * amountClamped;
        r += delta;
        g += delta;
        b += delta;

        // Inline clamping
        r = r < 0 ? 0 : (r > 1 ? 1 : r);
        g = g < 0 ? 0 : (g > 1 ? 1 : g);
        b = b < 0 ? 0 : (b > 1 ? 1 : b);

        const nearestIndex = useLabDistance
          ? nearestPaletteIndexLab(r, g, b, paletteLab, paletteLen, tempLab)
          : nearestPaletteIndexRgb(r, g, b, paletteFlat, paletteLen);
        const nearestBase = nearestIndex * 3;
        out[idx4] = paletteByte[nearestBase];
        out[idx4 + 1] = paletteByte[nearestBase + 1];
        out[idx4 + 2] = paletteByte[nearestBase + 2];
      }
    }
    return out;
  }

  const working = new Float32Array(width * height * 3);

  for (let i = 0, j = 0; i < source.length; i += 4, j += 3) {
    working[j] = source[i] * inv255;
    working[j + 1] = source[i + 1] * inv255;
    working[j + 2] = source[i + 2] * inv255;
    out[i + 3] = source[i + 3];
  }

  // Cache kernel arrays for faster loop access
  const dxArr = kernel.dx;
  const dyArr = kernel.dy;
  const factorArr = kernel.factor;
  const tapCount = kernel.tapCount;

  if (strength <= 0) {
    // Fast path: no diffusion needed
    for (let y = 0; y < height; y++) {
      const rowBase = rowOffsets[y];
      for (let x = 0; x < width; x++) {
        const pixelIndex = rowBase + x;
        const idx3 = pixelIndex * 3;
        const idx4 = pixelIndex * 4;

        let r = working[idx3];
        let g = working[idx3 + 1];
        let b = working[idx3 + 2];

        // Inline clamping
        r = r < 0 ? 0 : (r > 1 ? 1 : r);
        g = g < 0 ? 0 : (g > 1 ? 1 : g);
        b = b < 0 ? 0 : (b > 1 ? 1 : b);

        const nearestIndex = useLabDistance
          ? nearestPaletteIndexLab(r, g, b, paletteLab, paletteLen, tempLab)
          : nearestPaletteIndexRgb(r, g, b, paletteFlat, paletteLen);
        const nearestBase = nearestIndex * 3;
        out[idx4] = paletteByte[nearestBase];
        out[idx4 + 1] = paletteByte[nearestBase + 1];
        out[idx4 + 2] = paletteByte[nearestBase + 2];
      }
    }
  } else {
    // Full path: with error diffusion
    for (let y = 0; y < height; y++) {
      const rowBase = rowOffsets[y];
      for (let x = 0; x < width; x++) {
        const pixelIndex = rowBase + x;
        const idx3 = pixelIndex * 3;
        const idx4 = pixelIndex * 4;

        let r = working[idx3];
        let g = working[idx3 + 1];
        let b = working[idx3 + 2];

        // Inline clamping
        r = r < 0 ? 0 : (r > 1 ? 1 : r);
        g = g < 0 ? 0 : (g > 1 ? 1 : g);
        b = b < 0 ? 0 : (b > 1 ? 1 : b);

        const nearestIndex = useLabDistance
          ? nearestPaletteIndexLab(r, g, b, paletteLab, paletteLen, tempLab)
          : nearestPaletteIndexRgb(r, g, b, paletteFlat, paletteLen);
        const nearestBase = nearestIndex * 3;
        const nearestR = paletteFlat[nearestBase];
        const nearestG = paletteFlat[nearestBase + 1];
        const nearestB = paletteFlat[nearestBase + 2];

        out[idx4] = paletteByte[nearestBase];
        out[idx4 + 1] = paletteByte[nearestBase + 1];
        out[idx4 + 2] = paletteByte[nearestBase + 2];

        const errR = (r - nearestR) * strength;
        const errG = (g - nearestG) * strength;
        const errB = (b - nearestB) * strength;

        for (let tapIndex = 0; tapIndex < tapCount; tapIndex++) {
          const nx = x + dxArr[tapIndex];
          const ny = y + dyArr[tapIndex];

          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          // Use precalculated row offset
          const nIdx3 = (rowOffsets[ny] + nx) * 3;
          const factor = factorArr[tapIndex];

          working[nIdx3] += errR * factor;
          working[nIdx3 + 1] += errG * factor;
          working[nIdx3 + 2] += errB * factor;
        }
      }
    }
  }

  return out;
}
