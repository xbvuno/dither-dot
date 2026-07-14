import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  medianCut,
  kMeans,
  octree,
  blendHex,
} from '../utils/colorAlgorithms';
import { resolvePaletteSampleStride } from '../utils/palette/sampling';
import { getPaletteReference } from '../utils/pixiRegistry';
import useProcessingStore from './processingStore';
import usePerformanceStore from './performanceStore';

const MAX_PALETTE_COLORS = 64;
const MIN_PALETTE_COLORS = 2;

let latestGenerationToken = 0;

const paletteWorker = typeof Worker !== 'undefined'
  ? new Worker(new URL('../workers/paletteWorker.js', import.meta.url), { type: 'module' })
  : null;

let paletteWorkerJobId = 0;
const paletteWorkerJobs = new Map();

if (paletteWorker) {
  paletteWorker.onmessage = (event) => {
    const { jobId, palette, error } = event.data || {};
    const job = paletteWorkerJobs.get(jobId);
    if (!job) return;

    paletteWorkerJobs.delete(jobId);

    if (error) {
      job.reject(new Error(error));
      return;
    }

    job.resolve(Array.isArray(palette) ? palette : []);
  };
}

/* ---------------------------------- */
/* CONSTANTS                          */
/* ---------------------------------- */

export const EXTRACT_METHOD = {
  MEDIAN_CUT: 'median_cut',
  OCTREE:     'octree',
  KMEANS:     'kmeans',
  CUSTOM:     'custom',
};

export const AUTOFIT_METHOD = {
  MEDIAN_CUT:    'median_cut',
  ADD_MIDPOINTS: 'add_midpoints',
  INTERPOLATE:   'interpolate',
};

/* ---------------------------------- */
/* HELPERS                            */
/* ---------------------------------- */

let _uid = 1;

function makeColor(hex, locked = false) {
  return { id: _uid++, hex, locked, hidden: false };
}

function runExtraction(pixels, method, count, options = {}) {
  if (method === EXTRACT_METHOD.OCTREE) return octree(pixels, count, options);
  if (method === EXTRACT_METHOD.KMEANS) return kMeans(pixels, count, 8, options);
  return medianCut(pixels, count, options);
}

function runExtractionAsync(pixels, method, count, options = {}) {
  if (!paletteWorker) {
    return Promise.resolve(runExtraction(pixels, method, count, options));
  }

  const bufferCopy = new Uint8ClampedArray(pixels);
  const jobId = ++paletteWorkerJobId;

  return new Promise((resolve, reject) => {
    let settled = false;

    // Safety timeout: if the worker hangs, fall back to main-thread extraction
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      paletteWorkerJobs.delete(jobId);
      console.warn('[palette] Worker timed out, falling back to main thread');
      try {
        const fallback = runExtraction(new Uint8ClampedArray(pixels), method, count, options);
        resolve(fallback);
      } catch (e) {
        reject(e);
      }
    }, 15000);

    const wrappedResolve = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const wrappedReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    paletteWorkerJobs.set(jobId, { resolve: wrappedResolve, reject: wrappedReject });

    try {
      paletteWorker.postMessage(
        {
          jobId,
          pixels: bufferCopy.buffer,
          width: options.width,
          height: options.height,
          method,
          count,
          sampleStride: options.sampleStride,
        },
        [bufferCopy.buffer],
      );
    } catch (error) {
      paletteWorkerJobs.delete(jobId);
      clearTimeout(timeout);
      settled = true;
      reject(error);
    }
  });
}

function syncUidWithColors(colors = []) {
  const maxId = colors.reduce((acc, color) => Math.max(acc, Number(color?.id) || 0), 0);
  _uid = Math.max(_uid, maxId + 1);
}

/* ---------------------------------- */
/* DEFAULT STATE                      */
/* ---------------------------------- */

const DEFAULT_PALETTE = [
  '#1a1a2e', '#16213e', '#0f3460', '#533483',
  '#e94560', '#f5a623', '#f8e71c', '#7ed321',
].map(h => makeColor(h));

const DEFAULT_PALETTE_SETTINGS = {
  colorCount: 8,
  samplingAccuracy: 0.5,
  autoFit: false,
  autoFitMethod: AUTOFIT_METHOD.MEDIAN_CUT,
  method: EXTRACT_METHOD.MEDIAN_CUT,
};

const BUILTIN_PALETTES = [
  {
    id: 'builtin-1b',
    name: '1bit',
    colors: ['#000000', '#FFFFFF']
  },
  {
    id: 'builtin-dawnbringer16',
    name: 'DawnBringer 16',
    colors: ['#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161', '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'],
  },
  {
    id: 'builtin-cga4',
    name: 'CGA Palette 1',
    colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
  },
  {
    id: 'builtin-gameboy',
    name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'builtin-pico8',
    name: 'PICO-8',
    colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  },
  {
    id: 'builtin-endesga32',
    name: 'Endesga 32',
    colors: ['#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466', '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'],
  },
  {
    id: 'builtin-resurrect64',
    name: 'Resurrect 64',
    colors: ['#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a', '#694f62', '#7f708a', '#9babb2', '#c7dcd0', '#ffffff', '#6e2727', '#b33831', '#ea4f36', '#f57d4a', '#ae2334', '#e83b3b', '#fb6b1d', '#f79617', '#f9c22b', '#7a3045', '#9e4539', '#cd683d', '#e6904e', '#fbb954', '#4c3e24', '#676633', '#a2a947', '#d5e04b', '#fbff86', '#165a4c', '#239063', '#1ebc73', '#91db69', '#cddf6c', '#313638', '#374e4a', '#547e64', '#92a984', '#b2ba90', '#0b5e65', '#0b8a8f', '#0eaf9b', '#30e1b9', '#8ff8e2', '#323353', '#484a77', '#4d65b4', '#4d9be6', '#8fd3ff', '#45293f', '#6b3e75', '#905ea9', '#a884f3', '#eaaded', '#753c54', '#a24b6f', '#cf657f', '#ed8099', '#831c5d', '#c32454', '#f04f78', '#f68181', '#fca790', '#fdcbb0'],
  },
  {
    id: 'builtin-sweetie16',
    name: 'Sweetie 16',
    colors: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  },
  {
    id: 'builtin-zughy32',
    name: 'Zughy 32',
    colors: ['#472d3c', '#5e3643', '#7a444a', '#a05b53', '#bf7958', '#eea160', '#f4cca1', '#b6d53c', '#71aa34', '#397b44', '#3c5956', '#302c2e', '#5a5353', '#7d7071', '#a0938e', '#cfc6b8', '#dff6f5', '#8aebf1', '#28ccdf', '#3978a8', '#394778', '#39314b', '#564064', '#8e478c', '#cd6093', '#ffaeb6', '#f4b41b', '#f47e1b', '#e6482e', '#a93b3b', '#827094', '#4f546b'],
  },
  {
    id: 'builtin-oil6',
    name: 'Oil 6',
    colors: ['#fbf5ef', '#f2d3ab', '#c69fa5', '#8b6d9c', '#494d7e', '#272744'],
  },
  {
    id: 'builtin-apollo16',
    name: 'Apollo 16',
    colors: ['#172038', '#253a5e', '#3c5e8b', '#4f8fba', '#73bed3', '#a4dddb', '#19332d', '#25562e', '#468232', '#75a743', '#a8ca58', '#d0da91', '#4d2b32', '#7a4841', '#ad7757', '#c09473'],
  },
  {
    id: 'builtin-ega16',
    name: 'EGA 16',
    colors: ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'],
  },
  {
    id: 'builtin-appleii-lores',
    name: 'Apple II Lo-Res',
    colors: ['#000000', '#722640', '#40337f', '#e434fe', '#0e5940', '#808080', '#1b9afe', '#bfb3ff', '#403b00', '#e46501', '#808080', '#fe9980', '#1bd901', '#bfbfbf', '#83f0ff', '#ffffff'],
  },
  {
    id: 'builtin-c64',
    name: 'Commodore 64',
    colors: ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'],
  },
  {
    id: 'builtin-nes',
    name: 'Nintendo Entertainment System',
    colors: ['#000000', '#fcfcfc', '#f8f8f8', '#bcbcbc', '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8', '#0000fc', '#b8b8f8', '#6888fc', '#0058f8', '#0000bc', '#d8b8f8', '#9878f8', '#6844fc', '#4428bc', '#f8b8f8', '#f878f8', '#d800cc', '#940084', '#f8a4c0', '#f85898', '#e40058', '#a80020', '#f0d0b0', '#f87858', '#f83800', '#a81000', '#fce0a8', '#fca044', '#e45c10', '#881400', '#f8d878', '#f8b800', '#ac7c00', '#503000', '#d8f878', '#b8f818', '#00b800', '#007800', '#b8f8b8', '#58d854', '#00a800', '#006800', '#b8f8d8', '#58f898', '#00a844', '#005800', '#00fcfc', '#00e8d8', '#008888', '#004058', '#f8d8f8', '#787878'],
  },
  {
    id: 'builtin-vga256-16',
    name: 'VGA 16 Core',
    colors: ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0', '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'],
  },
];

function makeDefaultPalette() {
  return DEFAULT_PALETTE.map((color) => ({
    ...color,
    id: _uid++,
  }));
}

function normalizeHex(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split('').map((c) => c + c).join('').toLowerCase()}`;
  }
  return null;
}

function normalizePaletteHexList(list) {
  const unique = [];
  const seen = new Set();

  for (const entry of list || []) {
    const hex = normalizeHex(entry);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    unique.push(hex);
    if (unique.length >= MAX_PALETTE_COLORS) break;
  }

  return unique;
}

function splitColors(colors = []) {
  return {
    used: colors.filter((c) => !c.hidden),
    unused: colors.filter((c) => c.hidden),
  };
}

function toCustomPresetName(name) {
  const raw = String(name || '').trim() || 'Custom Palette';
  return raw.toLowerCase().startsWith('(custom) ') ? raw : `(custom) ${raw}`;
}

/* ---------------------------------- */
/* STORE                              */
/* ---------------------------------- */

const usePaletteStore = create(persist((set, get) => ({

  /* ---- settings ---- */
  ...DEFAULT_PALETTE_SETTINGS,

  /* ---- palette ---- */
  colors: makeDefaultPalette(),
  isGeneratingPalette: false,
  customPaletteName: 'Custom Palette',
  lastAppliedPalette: null,
  selectedLibraryPaletteId: null,
  userPalettes: [],
  builtinPalettes: BUILTIN_PALETTES,

  /* ---- actions ---- */

  setColorCount: (n) => {
    set(s => {
      const nextCount = Math.max(MIN_PALETTE_COLORS, Math.min(MAX_PALETTE_COLORS, Number(n) || MIN_PALETTE_COLORS));

      if (s.method === EXTRACT_METHOD.CUSTOM) {
        const { used, unused } = splitColors(s.colors);

        if (nextCount < used.length) {
          const keepUsed = used.slice(0, nextCount);
          const movedToUnused = used.slice(nextCount).map((c) => ({ ...c, hidden: true }));
          return { colorCount: nextCount, colors: [...keepUsed, ...movedToUnused, ...unused] };
        }

        if (nextCount > used.length) {
          const need = nextCount - used.length;
          const reveal = unused.slice(0, need).map((c) => ({ ...c, hidden: false }));
          const remainingUnused = unused.slice(need);
          const missing = Math.max(0, need - reveal.length);
          const padded = Array.from({ length: missing }, () => ({ ...makeColor('#000000'), hidden: false }));
          return { colorCount: nextCount, colors: [...used, ...reveal, ...padded, ...remainingUnused] };
        }

        return { colorCount: nextCount };
      }

      return { colorCount: nextCount };
    });
  },

  setSamplingAccuracy: (value) => set(() => {
    const next = Number(value);
    return {
      samplingAccuracy: Math.max(0.1, Math.min(1, Number.isFinite(next) ? next : 0.5)),
    };
  }),

  setAutoFit:       (v) => set({ autoFit: v }),
  setAutoFitMethod: (m) => set({ autoFitMethod: m }),

  setMethod: (m) => {
    if (m === EXTRACT_METHOD.CUSTOM) {
      // keep current palette but unlock everything
      set(s => ({
        method: EXTRACT_METHOD.CUSTOM,
        customPaletteName: s.customPaletteName || 'Custom Palette',
        colors: s.colors.map(c => ({ ...c, locked: false })),
      }));
      return;
    }

    set({ method: m });
  },

  clearPaletteCache: () => {
    // No-op: palette is always regenerated
  },

  generatePalette: async () => {
    const { beginPaletteProcessing, endPaletteProcessing } = useProcessingStore.getState();
    beginPaletteProcessing();
    usePerformanceStore.getState().setCurrentPhase('palette');

    const paletteGenerationStart = performance.now();
    let didFinishProcessing = false;
    const finishProcessing = (durationOverride = null, cached = false) => {
      if (didFinishProcessing) return;
      didFinishProcessing = true;
      // Record the total palette generation time
      const duration = Number.isFinite(durationOverride) && durationOverride >= 0
        ? durationOverride
        : (performance.now() - paletteGenerationStart);
      usePerformanceStore.getState().recordPaletteGeneration(duration, { cached });
      endPaletteProcessing();
    };

    const generationToken = ++latestGenerationToken;
    set({ isGeneratingPalette: true });

    const { method, colorCount, colors, samplingAccuracy } = get();

    // In CUSTOM mode the palette is user-authored and must never be regenerated.
    if (method === EXTRACT_METHOD.CUSTOM) {
      if (generationToken === latestGenerationToken) {
        set({ isGeneratingPalette: false });
      }
      finishProcessing();
      return;
    }

    const algoMethod = method === EXTRACT_METHOD.CUSTOM
      ? EXTRACT_METHOD.MEDIAN_CUT
      : method;

    const locked = colors.filter(c => c.locked);
    const slots  = colorCount - locked.length;

    if (slots <= 0) {
      if (generationToken === latestGenerationToken) {
        set({ colors: locked.slice(0, colorCount), isGeneratingPalette: false });
      }
      finishProcessing();
      return;
    }

    const reference = getPaletteReference();
    const pixels = reference?.pixels;
    if (!pixels) {
      if (generationToken === latestGenerationToken) {
        set({ isGeneratingPalette: false });
      }
      finishProcessing();
      return;
    }

    try {
      const sampleStride = resolvePaletteSampleStride(samplingAccuracy, pixels.length);
      const extracted = await runExtractionAsync(pixels, algoMethod, slots, {
        sampleStride,
        width: reference.width || 1,
        height: reference.height || 1,
      });

      if (generationToken !== latestGenerationToken) {
        finishProcessing();
        return;
      }

      const newColors = [
        ...locked,
        ...extracted.map(h => makeColor(h)),
      ].slice(0, colorCount);

      set({ colors: newColors, isGeneratingPalette: false });

      const measuredDuration = performance.now() - paletteGenerationStart;

      finishProcessing(measuredDuration, false);
    } catch (error) {
      console.error(error);
      if (generationToken === latestGenerationToken) {
        set({ isGeneratingPalette: false });
      }
      usePerformanceStore.getState().setCurrentPhase(null);
      finishProcessing();
    }
  },

  setColor: (id, hex) => set(s => ({
    colors: s.colors.map(c => c.id === id ? { ...c, hex: normalizeHex(hex) || c.hex } : c),
  })),

  setCustomPaletteName: (name) => set({
    customPaletteName: String(name || '').slice(0, 64),
  }),

  setLastAppliedPalette: (name, hexes) => set(() => {
    const normalized = normalizePaletteHexList(hexes);
    if (normalized.length < MIN_PALETTE_COLORS) return {};
    return {
      lastAppliedPalette: {
        name: String(name || 'Custom Palette').trim() || 'Custom Palette',
        colors: normalized,
      },
    };
  }),

  toggleLock: (id) => set(s => ({
    colors: s.colors.map(c => c.id === id ? { ...c, locked: !c.locked } : c),
  })),

  removeColor: (id) => set(s => {
    const target = s.colors.find((c) => c.id === id);
    if (!target) return s;

    const colors = s.colors.filter(c => c.id !== id);
    const activeCount = colors.filter(c => !c.hidden).length;
    const nextCount = target.hidden
      ? s.colorCount
      : Math.max(MIN_PALETTE_COLORS, Math.min(s.colorCount - 1, activeCount));

    return { colors, colorCount: nextCount };
  }),

  addColor: () => set(s => {
    const active = s.colors.filter(c => !c.hidden);
    const hidden = s.colors.filter(c => c.hidden);
    if (active.length + hidden.length >= MAX_PALETTE_COLORS) return s;

    const last = active[active.length - 1];
    const prev = active[active.length - 2];
    const newHex = prev
      ? blendHex(last.hex, prev.hex)
      : last ? blendHex(last.hex, '#808080') : '#808080';

    const canIncreaseUsed = s.colorCount < MAX_PALETTE_COLORS;
    const newColor = makeColor(newHex);

    if (canIncreaseUsed) {
      return {
        colorCount: s.colorCount + 1,
        colors: [...active, { ...newColor, hidden: false }, ...hidden],
      };
    }

    return { colors: [...active, { ...newColor, hidden: true }, ...hidden] };
  }),

  reorderColors: (fromId, toId) => set((s) => {
    if (fromId === toId) return s;
    const fromIndex = s.colors.findIndex((c) => c.id === fromId);
    const toIndex = s.colors.findIndex((c) => c.id === toId);
    if (fromIndex < 0 || toIndex < 0) return s;

    const next = [...s.colors];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { colors: next };
  }),

  moveColorCustom: (fromId, toId) => set((s) => {
    const source = s.colors.find((c) => c.id === fromId);
    const target = s.colors.find((c) => c.id === toId);
    if (!source || !target || source.id === target.id) return s;

    const { used, unused } = splitColors(s.colors);

    if (source.hidden && !target.hidden) {
      const sourceUnusedIndex = unused.findIndex((c) => c.id === source.id);
      const targetUsedIndex = used.findIndex((c) => c.id === target.id);
      if (sourceUnusedIndex < 0 || targetUsedIndex < 0) return s;

      const nextUsed = [...used];
      const nextUnused = [...unused];
      const [picked] = nextUnused.splice(sourceUnusedIndex, 1);
      nextUsed.splice(targetUsedIndex, 0, { ...picked, hidden: false });

      if (nextUsed.length > s.colorCount) {
        const movedOut = nextUsed.pop();
        if (movedOut) {
          nextUnused.unshift({ ...movedOut, hidden: true });
        }
      }

      return {
        colors: [
          ...nextUsed.map((c) => ({ ...c, hidden: false })),
          ...nextUnused.map((c) => ({ ...c, hidden: true })),
        ],
      };
    }

    const fromIndex = s.colors.findIndex((c) => c.id === fromId);
    const toIndex = s.colors.findIndex((c) => c.id === toId);
    if (fromIndex < 0 || toIndex < 0) return s;

    const next = [...s.colors];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { colors: next };
  }),

  applyPaletteByHexes: (hexes, name = null, persistAsUser = false) => set((s) => {
    const normalized = normalizePaletteHexList(hexes);
    if (normalized.length < MIN_PALETTE_COLORS) return s;

    const nextCount = Math.max(MIN_PALETTE_COLORS, Math.min(MAX_PALETTE_COLORS, normalized.length));
    const colors = normalized.map((hex, index) => ({ ...makeColor(hex), hidden: index >= nextCount, locked: false }));

    const updates = {
      method: EXTRACT_METHOD.CUSTOM,
      customPaletteName: String(name || 'Custom Palette').trim() || 'Custom Palette',
      colorCount: nextCount,
      colors,
      lastAppliedPalette: {
        name: String(name || 'Custom Palette').trim() || 'Custom Palette',
        colors: normalized,
      },
      selectedLibraryPaletteId: null,
    };

    if (persistAsUser) {
      const paletteName = String(name || `Imported ${new Date().toLocaleDateString()}`).trim() || 'Imported Palette';
      const entry = {
        id: `user-${Date.now()}`,
        name: paletteName,
        colors: normalized,
      };
      updates.userPalettes = [entry, ...s.userPalettes].slice(0, 64);
      updates.selectedLibraryPaletteId = entry.id;
    }

    return updates;
  }),

  saveCurrentPaletteToLibrary: () => set((s) => {
    const visible = s.colors.filter((c) => !c.hidden).map((c) => c.hex);
    const normalized = normalizePaletteHexList(visible);
    if (normalized.length < MIN_PALETTE_COLORS) return s;

    const name = String(s.customPaletteName || 'Custom Palette').trim() || 'Custom Palette';
    const entry = {
      id: `user-${Date.now()}`,
      name,
      colors: normalized,
    };

    return {
      lastAppliedPalette: {
        name,
        colors: normalized,
      },
      selectedLibraryPaletteId: entry.id,
      userPalettes: [entry, ...s.userPalettes].slice(0, 64),
    };
  }),

  applyLibraryPaletteById: (paletteId) => set((s) => {
    const all = [...s.userPalettes, ...s.builtinPalettes];
    const entry = all.find((p) => p.id === paletteId);
    if (!entry) return s;

    const normalized = normalizePaletteHexList(entry.colors);
    if (normalized.length < MIN_PALETTE_COLORS) return s;

    const nextCount = Math.max(MIN_PALETTE_COLORS, Math.min(MAX_PALETTE_COLORS, normalized.length));
    const colors = normalized.map((hex, index) => ({ ...makeColor(hex), hidden: index >= nextCount, locked: false }));

    const isBuiltinPreset = s.builtinPalettes.some((p) => p.id === entry.id);
    const nextName = isBuiltinPreset ? toCustomPresetName(entry.name) : entry.name;

    return {
      method: EXTRACT_METHOD.CUSTOM,
      colorCount: nextCount,
      customPaletteName: nextName,
      colors,
      selectedLibraryPaletteId: entry.id,
      lastAppliedPalette: {
        name: nextName,
        colors: normalized,
      },
    };
  }),

  importUserPalettes: (palettes = []) => set((s) => {
    const normalized = (Array.isArray(palettes) ? palettes : [])
      .map((entry, index) => {
        const colors = normalizePaletteHexList(entry?.colors || []);
        if (colors.length < MIN_PALETTE_COLORS) return null;
        return {
          id: entry?.id || `user-import-${Date.now()}-${index}`,
          name: String(entry?.name || `Imported ${index + 1}`).slice(0, 64),
          colors,
        };
      })
      .filter(Boolean)
      .slice(0, 64);

    return {
      userPalettes: normalized,
      selectedLibraryPaletteId: normalized.some((p) => p.id === s.selectedLibraryPaletteId)
        ? s.selectedLibraryPaletteId
        : null,
    };
  }),

  removeUserPalette: (paletteId) => set((s) => ({
    userPalettes: s.userPalettes.filter((entry) => entry.id !== paletteId),
    selectedLibraryPaletteId: s.selectedLibraryPaletteId === paletteId ? null : s.selectedLibraryPaletteId,
  })),

  resetPalette: () => set(() => {
    return {
      ...DEFAULT_PALETTE_SETTINGS,
      colors: makeDefaultPalette(),
      isGeneratingPalette: false,
    };
  }),
}), {
  name: 'dither-dot:palette',
  storage: createJSONStorage(() => localStorage),
  onRehydrateStorage: () => (state) => {
    syncUidWithColors(state?.colors || []);
    if (!state) return;

    const persistedVisible = normalizePaletteHexList(
      (state.colors || [])
        .filter((color) => !color?.hidden)
        .map((color) => color?.hex),
    );

    const hasValidPersistedPalette = persistedVisible.length >= MIN_PALETTE_COLORS;
    if (hasValidPersistedPalette) {
      if (state.selectedLibraryPaletteId) {
        const allIds = new Set([
          ...(state.userPalettes || []).map((entry) => entry.id),
          ...BUILTIN_PALETTES.map((entry) => entry.id),
        ]);
        if (!allIds.has(state.selectedLibraryPaletteId)) {
          state.selectedLibraryPaletteId = null;
        }
      }
      return;
    }

    if (!state.selectedLibraryPaletteId) return;

    const all = [...(state.userPalettes || []), ...BUILTIN_PALETTES];
    const selected = all.find((entry) => entry.id === state.selectedLibraryPaletteId);
    if (!selected) {
      state.selectedLibraryPaletteId = null;
      return;
    }

    const normalized = normalizePaletteHexList(selected.colors || []);
    if (normalized.length < MIN_PALETTE_COLORS) {
      return;
    }

    const isBuiltinPreset = BUILTIN_PALETTES.some((entry) => entry.id === selected.id);
    const nextName = isBuiltinPreset ? toCustomPresetName(selected.name) : selected.name;

    const nextCount = Math.max(MIN_PALETTE_COLORS, Math.min(MAX_PALETTE_COLORS, normalized.length));
    state.method = EXTRACT_METHOD.CUSTOM;
    state.customPaletteName = nextName;
    state.colorCount = nextCount;
    state.colors = normalized.map((hex, index) => ({ ...makeColor(hex), hidden: index >= nextCount, locked: false }));
    state.lastAppliedPalette = { name: nextName, colors: normalized };
  },
  partialize: (state) => ({
    colorCount: state.colorCount,
    samplingAccuracy: state.samplingAccuracy,
    autoFit: state.autoFit,
    autoFitMethod: state.autoFitMethod,
    method: state.method,
    colors: state.colors,
    customPaletteName: state.customPaletteName,
    lastAppliedPalette: state.lastAppliedPalette,
    selectedLibraryPaletteId: state.selectedLibraryPaletteId,
    userPalettes: state.userPalettes,
  }),
}));

export default usePaletteStore;
