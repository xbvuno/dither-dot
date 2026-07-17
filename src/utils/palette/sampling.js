export function resolvePaletteSampleStride(accuracy, pixelsLength) {
  const a = Number.isFinite(accuracy) ? Math.max(0, Math.min(1, accuracy)) : 0.5;
  const pixelCount = Math.max(1, Math.floor((pixelsLength || 0) / 4));

  let baseStride = 1;
  if (pixelCount > 8000000) baseStride = 8;
  else if (pixelCount > 2000000) baseStride = 4;
  else if (pixelCount > 500000) baseStride = 2;

  // 1.0 => x1 (best quality), 0.0 => x4 (best speed)
  const qualityFactor = 1 + Math.round((1 - a) * 3);
  return Math.max(1, Math.min(32, baseStride * qualityFactor));
}

export function extractColorHistogram(pixels, sampleStride = 1) {
  const step = 4 * Math.max(1, sampleStride | 0);
  const map = new Map();

  for (let i = 0; i < pixels.length; i += step) {
    if (pixels[i + 3] < 128) continue;

    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = r * 65536 + g * 256 + b;

    map.set(key, (map.get(key) || 0) + 1);
  }

  const out = new Array(map.size);
  let idx = 0;

  for (const [key, weight] of map) {
    out[idx++] = [
      (key >> 16) & 255,
      (key >> 8) & 255,
      key & 255,
      weight,
    ];
  }

  return out;
}


export function extractPackedColorsWithStride(pixels, sampleStride = 1) {
  const out = [];
  const step = 4 * Math.max(1, sampleStride | 0);

  for (let i = 0; i < pixels.length; i += step) {
    if (pixels[i + 3] < 128) continue;
    out.push((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
  }

  return out;
}
