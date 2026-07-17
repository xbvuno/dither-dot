import { blendHex, hexToRgb } from './palette/colorMath';
import { medianCut } from './palette/medianCut';
import { kMeans } from './palette/kMeans';
import { octree } from './palette/octree';

/* ---------------------------------- */
/* COLOR UTILITIES                    */
/* ---------------------------------- */

export { hexToRgb, blendHex };

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
