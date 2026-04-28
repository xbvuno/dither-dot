import { getPaletteReference } from './pixiRegistry';
import { blendHex, hexToRgb } from './palette/colorMath';
import { medianCut } from './palette/medianCut';
import { kMeans } from './palette/kMeans';
import { octree } from './palette/octree';

/* ---------------------------------- */
/* COLOR UTILITIES                    */
/* ---------------------------------- */

export { hexToRgb, blendHex };

export function getPaletteReferencePixels() {
  const reference = getPaletteReference();
  if (!reference || !reference.pixels) return null;
  return reference.pixels;
}

/* ---------------------------------- */
/* MEDIAN CUT (FIXED + FAST)         */
/* ---------------------------------- */

export { medianCut };

/* ---------------------------------- */
/* KMEANS WRAPPER                    */
/* ---------------------------------- */

export { kMeans };

/* ---------------------------------- */
/* SEED REFINEMENT                   */
/* ---------------------------------- */

export { octree };

/* ---------------------------------- */
/* MIDPOINTS                         */
/* ---------------------------------- */

export function addMidpoints(hexColors, targetCount) {
  const result = [...hexColors];

  while (result.length < targetCount) {
    let best = 0;
    let dist = -1;

    for (let i = 0; i < result.length - 1; i++) {
      const a = hexToRgb(result[i]);
      const b = hexToRgb(result[i + 1]);

      const d =
        (a[0] - b[0]) ** 2 +
        (a[1] - b[1]) ** 2 +
        (a[2] - b[2]) ** 2;

      if (d > dist) {
        dist = d;
        best = i;
      }
    }

    result.splice(best + 1, 0, blendHex(result[best], result[best + 1]));
  }

  return result;
}