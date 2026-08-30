/**
 * Curve evaluation utilities for RGB tone curves.
 * Implements smooth Fritsch-Carlson Monotone Cubic Spline interpolation
 * (the exact algorithm used in professional photographic tone curve editors).
 */

export function getDefaultCurvePoints() {
  return [
    { x: 0, y: 0 },
    { x: 128, y: 128 },
    { x: 255, y: 255 },
  ];
}

export const DEFAULT_CURVE_POINTS = [
  { x: 0, y: 0 },
  { x: 128, y: 128 },
  { x: 255, y: 255 },
];

/**
 * Builds a 256-entry lookup table (LUT) from sorted control points
 * using the Fritsch-Carlson monotone cubic spline method.
 */
export function buildCurveLut(points) {
  const lut = new Uint8Array(256);
  if (!points || points.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Deduplicate and sort points by X
  const uniqueMap = new Map();
  points.forEach((p) => uniqueMap.set(p.x, p.y));
  const sorted = Array.from(uniqueMap.entries())
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
    .sort((a, b) => a.x - b.x);

  const n = sorted.length;
  if (n === 1) {
    lut.fill(Math.max(0, Math.min(255, Math.round(sorted[0].y))));
    return lut;
  }

  // Ensure endpoints exist
  if (sorted[0].x > 0) {
    sorted.unshift({ x: 0, y: sorted[0].y });
  }
  if (sorted[sorted.length - 1].x < 255) {
    sorted.push({ x: 255, y: sorted[sorted.length - 1].y });
  }

  const numPts = sorted.length;
  const deltas = new Float64Array(numPts - 1);
  const slopes = new Float64Array(numPts);

  // 1. Calculate secant slopes
  for (let i = 0; i < numPts - 1; i++) {
    const dx = sorted[i + 1].x - sorted[i].x;
    const dy = sorted[i + 1].y - sorted[i].y;
    deltas[i] = dx === 0 ? 0 : dy / dx;
  }

  // 2. Initialize tangents
  slopes[0] = deltas[0];
  slopes[numPts - 1] = deltas[numPts - 2];
  for (let i = 1; i < numPts - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      slopes[i] = 0;
    } else {
      slopes[i] = (deltas[i - 1] + deltas[i]) / 2;
    }
  }

  // 3. Fritsch-Carlson monotonicity adjustments
  for (let i = 0; i < numPts - 1; i++) {
    if (deltas[i] === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
    } else {
      const alpha = slopes[i] / deltas[i];
      const beta = slopes[i + 1] / deltas[i];
      const dist = alpha * alpha + beta * beta;
      if (dist > 9) {
        const tau = 3 / Math.sqrt(dist);
        slopes[i] = tau * alpha * deltas[i];
        slopes[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  // 4. Fill lookup table
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < numPts - 2 && sorted[seg + 1].x < x) {
      seg++;
    }

    const p0 = sorted[seg];
    const p1 = sorted[seg + 1];
    const h = p1.x - p0.x;

    if (h === 0) {
      lut[x] = Math.max(0, Math.min(255, Math.round(p0.y)));
      continue;
    }

    const t = (x - p0.x) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const y = h00 * p0.y + h10 * h * slopes[seg] + h01 * p1.y + h11 * h * slopes[seg + 1];
    lut[x] = Math.max(0, Math.min(255, Math.round(y)));
  }

  return lut;
}

/**
 * Evaluates curve output for given input x (0-255).
 */
export function evaluateCurve(points, x) {
  const lut = buildCurveLut(points);
  const clampedX = Math.max(0, Math.min(255, Math.round(x)));
  return lut[clampedX];
}

/**
 * Applies R, G, B curve transformations to a color using prebuilt LUTs.
 */
export function applyRgbCurves(r, g, b, curves) {
  const lutR = buildCurveLut(curves.r);
  const lutG = buildCurveLut(curves.g);
  const lutB = buildCurveLut(curves.b);

  return {
    r: lutR[Math.max(0, Math.min(255, Math.round(r)))],
    g: lutG[Math.max(0, Math.min(255, Math.round(g)))],
    b: lutB[Math.max(0, Math.min(255, Math.round(b)))],
  };
}
