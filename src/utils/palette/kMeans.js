import { hexToRgb, rgbToHex } from './colorMath';
import { extractColorHistogram } from './sampling';
import { medianCut } from './medianCut';

function runKMeansCore(colors, centroids, count, iterations) {
  const weightedFromIter = Math.max(0, iterations - 2);

  const sumsR = new Float64Array(count);
  const sumsG = new Float64Array(count);
  const sumsB = new Float64Array(count);
  const counts = new Float64Array(count);

  for (let iter = 0; iter < iterations; iter++) {
    sumsR.fill(0);
    sumsG.fill(0);
    sumsB.fill(0);
    counts.fill(0);

    const weighted = iter >= weightedFromIter;

    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      const w = c[3] || 1;

      let best = 0;
      let bestDist = 1e20;

      for (let j = 0; j < count; j++) {
        const dr = c[0] - centroids[j][0];
        const dg = c[1] - centroids[j][1];
        const db = c[2] - centroids[j][2];

        const d = weighted
          ? dr * dr * 0.2126 + dg * dg * 0.7152 + db * db * 0.0722
          : dr * dr + dg * dg + db * db;

        if (d < bestDist) {
          bestDist = d;
          best = j;
        }
      }

      sumsR[best] += c[0] * w;
      sumsG[best] += c[1] * w;
      sumsB[best] += c[2] * w;
      counts[best] += w;
    }

    let changed = false;

    for (let i = 0; i < count; i++) {
      if (counts[i] === 0) continue;

      const inv = 1 / counts[i];
      const r = (sumsR[i] * inv) | 0;
      const g = (sumsG[i] * inv) | 0;
      const b = (sumsB[i] * inv) | 0;

      if (r !== centroids[i][0] || g !== centroids[i][1] || b !== centroids[i][2]) {
        changed = true;
      }

      centroids[i][0] = r;
      centroids[i][1] = g;
      centroids[i][2] = b;
    }

    if (!changed) break;
  }

  return centroids;
}

export function kMeans(pixels, count, iterations = 8) {
  const options = arguments[3] || {};
  const sampleStride = Math.max(1, Math.round(Number(options?.sampleStride) || 4));
  const colors = extractColorHistogram(pixels, sampleStride);
  if (!colors.length) return Array(count).fill('#808080');

  let centroids = medianCut(pixels, count, { sampleStride }).map(hexToRgb);
  centroids = runKMeansCore(colors, centroids, count, iterations);

  return centroids.map(([r, g, b]) => rgbToHex(r, g, b));
}

export function refinePaletteWithKMeansSeeds(pixels, seedHexes, count, iterations = 3, options = {}) {
  const sampleStride = Math.max(1, Math.round(Number(options?.sampleStride) || 2));
  const colors = extractColorHistogram(pixels, sampleStride);

  const seeds = seedHexes.slice(0, count);
  while (seeds.length < count) seeds.push(seeds.at(-1) || '#808080');

  let centroids = seeds.map(hexToRgb);
  centroids = runKMeansCore(colors, centroids, count, iterations);

  return centroids.map(c => rgbToHex(c[0], c[1], c[2]));
}
