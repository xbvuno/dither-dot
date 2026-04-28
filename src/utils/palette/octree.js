import { rgbToHex } from './colorMath';
import { refinePaletteWithKMeansSeeds } from './kMeans';

export function octree(pixels, colorCount, options = {}) {
  const target = Math.max(1, Number(colorCount) || 1);
  const sampleStride = Math.max(1, Math.round(Number(options?.sampleStride) || 1));
  const MAX_DEPTH = 8;

  function Node(level) {
    this.level = level;
    this.r = 0;
    this.g = 0;
    this.b = 0;
    this.n = 0;
    this.children = null;
    this.isLeaf = level >= MAX_DEPTH;
  }

  const root = new Node(0);
  const reducible = Array.from({ length: MAX_DEPTH }, () => []);
  let leafCount = 0;

  function add(r, g, b) {
    let node = root;

    while (true) {
      node.r += r;
      node.g += g;
      node.b += b;
      node.n++;

      if (node.isLeaf) return;

      const shift = 7 - node.level;
      const idx =
        (((r >> shift) & 1) << 2) |
        (((g >> shift) & 1) << 1) |
        ((b >> shift) & 1);

      if (!node.children) node.children = new Array(8);

      let child = node.children[idx];
      if (!child) {
        child = new Node(node.level + 1);
        node.children[idx] = child;

        if (child.isLeaf) {
          leafCount++;
        } else {
          reducible[child.level].push(child);
        }
      }

      node = child;
    }
  }

  function collapseNode(node) {
    if (!node || !node.children) return false;

    let removedLeaves = 0;
    const stack = [];

    for (let i = 0; i < 8; i++) {
      const child = node.children[i];
      if (child) stack.push(child);
    }

    while (stack.length) {
      const current = stack.pop();

      if (current.isLeaf) {
        removedLeaves++;
        continue;
      }

      if (!current.children) continue;

      for (let i = 0; i < 8; i++) {
        const child = current.children[i];
        if (child) stack.push(child);
      }
    }

    if (removedLeaves === 0) return false;

    node.children = null;
    node.isLeaf = true;
    leafCount = leafCount - removedLeaves + 1;
    return true;
  }

  function reduceOnce() {
    for (let level = MAX_DEPTH - 1; level >= 1; level--) {
      const nodes = reducible[level];
      if (!nodes || nodes.length === 0) continue;

      let bestIndex = -1;
      let minPixels = Infinity;

      for (let i = 0; i < nodes.length; i++) {
        const candidate = nodes[i];
        if (!candidate || candidate.isLeaf || !candidate.children) continue;

        if (candidate.n < minPixels) {
          minPixels = candidate.n;
          bestIndex = i;
        }
      }

      if (bestIndex === -1) {
        reducible[level] = [];
        continue;
      }

      const node = nodes.splice(bestIndex, 1)[0];
      return collapseNode(node);
    }

    return false;
  }

  const step = 4 * sampleStride;
  for (let i = 0; i < pixels.length; i += step) {
    if (pixels[i + 3] < 128) continue;
    add(pixels[i], pixels[i + 1], pixels[i + 2]);
  }

  while (leafCount > target) {
    if (!reduceOnce()) break;
  }

  const leaves = [];

  function walk(node) {
    if (!node) return;
    if (node.isLeaf) {
      if (node.n) {
        leaves.push([
          Math.round(node.r / node.n),
          Math.round(node.g / node.n),
          Math.round(node.b / node.n),
          node.n,
        ]);
      }
      return;
    }

    if (node.children) {
      for (let i = 0; i < 8; i++) {
        const child = node.children[i];
        if (child) walk(child);
      }
    }
  }

  walk(root);

  if (!leaves.length) return Array(target).fill('#808080');

  leaves.sort((a, b) => b[3] - a[3]);
  const seeds = leaves.slice(0, target).map(c => rgbToHex(c[0], c[1], c[2]));
  while (seeds.length < target) seeds.push(seeds.at(-1) || '#808080');

  return refinePaletteWithKMeansSeeds(pixels, seeds, target, 3, { sampleStride });
}
