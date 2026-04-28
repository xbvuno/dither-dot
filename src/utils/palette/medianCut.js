import { rgbToHex } from './colorMath';
import { extractPackedColorsWithStride } from './sampling';

function avgPackedBucket(colors, start, end) {
  let r = 0, g = 0, b = 0;

  for (let i = start; i < end; i++) {
    const c = colors[i];
    r += (c >> 16) & 255;
    g += (c >> 8) & 255;
    b += c & 255;
  }

  const inv = 1 / (end - start);

  return rgbToHex(r * inv, g * inv, b * inv);
}

function channelRange(colors, start, end) {
  let rMin = 255, gMin = 255, bMin = 255;
  let rMax = 0, gMax = 0, bMax = 0;

  for (let i = start; i < end; i++) {
    const c = colors[i];
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;

    if (r < rMin) rMin = r;
    if (g < gMin) gMin = g;
    if (b < bMin) bMin = b;

    if (r > rMax) rMax = r;
    if (g > gMax) gMax = g;
    if (b > bMax) bMax = b;
  }

  const r = rMax - rMin;
  const g = gMax - gMin;
  const b = bMax - bMin;

  return r > g ? (r > b ? 0 : 2) : (g > b ? 1 : 2);
}

export function medianCut(pixels, count, options = {}) {
  const sampleStride = Math.max(1, Math.round(Number(options?.sampleStride) || 1));
  const colors = extractPackedColorsWithStride(pixels, sampleStride);
  if (!colors.length) return Array(count).fill('#808080');

  let buckets = [{ start: 0, end: colors.length }];

  while (buckets.length < count) {
    let best = -1;
    let bestRange = -1;
    let bestChannel = 0;

    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.end - b.start <= 1) continue;

      const ch = channelRange(colors, b.start, b.end);
      let max = 0;

      for (let j = b.start; j < b.end; j++) {
        const c = colors[j];
        const v = ch === 0 ? (c >> 16) & 255 : ch === 1 ? (c >> 8) & 255 : c & 255;
        if (v > max) max = v;
      }

      if (max > bestRange) {
        bestRange = max;
        best = i;
        bestChannel = ch;
      }
    }

    if (best === -1) break;

    const bucket = buckets[best];
    const mid = (bucket.start + bucket.end) >> 1;

    colors.sort((a, b) => {
      const av = bestChannel === 0 ? (a >> 16) & 255 : bestChannel === 1 ? (a >> 8) & 255 : a & 255;
      const bv = bestChannel === 0 ? (b >> 16) & 255 : bestChannel === 1 ? (b >> 8) & 255 : b & 255;
      return av - bv;
    });

    buckets.splice(best, 1,
      { start: bucket.start, end: mid },
      { start: mid, end: bucket.end }
    );
  }

  const palette = buckets.map(b =>
    avgPackedBucket(colors, b.start, b.end)
  );

  while (palette.length < count) {
    palette.push(palette.at(-1) || '#808080');
  }

  return palette.slice(0, count);
}
