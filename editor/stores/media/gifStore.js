import { create } from 'zustand';

const DEFAULT_GIF_STATE = {
  frames: [],
  currentFrameIndex: 0,
  playing: false,
  playbackDelay: 100,
  playbackSpeed: 1,
  frameStates: [],
  renderedThumbnails: {},
  renderedFrames: {},
  thumbnailsEnabled: true,
  loopCount: 0,
  decoding: false,
  selectedFrameIndices: [0],
  zoom: 1,
  exporting: false,
  clipboardFrames: [],
};

const clampFrameIndex = (index, max) => {
  if (max <= 0) return 0;
  const value = Number(index);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max - 1, Math.floor(value)));
};

const clampSpeed = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.1, Math.min(10, n));
};

const clampDelay = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(20, Math.min(5000, Math.round(n)));
};

const clampZoom = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.25, Math.min(1.0, Math.round(n * 100) / 100));
};

let originIdCounter = 0;
let instanceIdCounter = 0;

export const createOriginId = () => `orig_${Date.now().toString(36)}_${(++originIdCounter).toString(36)}`;
export const createInstanceId = () => `tl_${Date.now().toString(36)}_${(++instanceIdCounter).toString(36)}`;

const useGifStore = create((set) => ({
  ...DEFAULT_GIF_STATE,

  setFrames: (frames, loopCount = 0, options = {}) => {
    const rawFrames = Array.isArray(frames) ? frames : [];
    const nextFrames = rawFrames.map((frame) => {
      const originId = frame.originId || frame.id || createOriginId();
      return {
        ...frame,
        id: frame.id || createInstanceId(),
        originId,
        delay: clampDelay(frame.delay),
      };
    });
    const firstFrameDelay = nextFrames[0]?.delay;
    const thumbnailsEnabled = options.thumbnailsEnabled !== undefined ? Boolean(options.thumbnailsEnabled) : true;
    set({
      frames: nextFrames,
      currentFrameIndex: 0,
      selectedFrameIndices: [0],
      playing: false,
      playbackDelay: clampDelay(firstFrameDelay),
      frameStates: nextFrames.map(() => 'pending'),
      renderedThumbnails: {},
      renderedFrames: {},
      thumbnailsEnabled,
      loopCount: Number.isFinite(loopCount) ? loopCount : 0,
      decoding: false,
    });
  },

  clearFrames: () => {
    set({ ...DEFAULT_GIF_STATE });
  },

  setDecoding: (decoding) => {
    set({ decoding: Boolean(decoding) });
  },

  setExporting: (exporting) => {
    set({ exporting: Boolean(exporting) });
  },

  setSelectedFrameIndices: (indices) => {
    set((state) => {
      const arr = Array.isArray(indices) ? indices : (indices == null ? [] : [indices]);
      const valid = arr
        .map((i) => clampFrameIndex(i, state.frames.length))
        .filter((val, idx, self) => self.indexOf(val) === idx);
      return { selectedFrameIndices: valid };
    });
  },

  setZoom: (zoom) => {
    set({ zoom: clampZoom(zoom) });
  },

  setCurrentFrameIndex: (index) => {
    set((state) => {
      const nextIndex = clampFrameIndex(index, state.frames.length);
      const nextDelay = clampDelay(state.frames[nextIndex]?.delay);

      return {
        currentFrameIndex: nextIndex,
        playbackDelay: nextDelay,
      };
    });
  },

  setPlaying: (playing) => {
    set({ playing: Boolean(playing) });
  },

  setPlaybackSpeed: (speed) => {
    set({ playbackSpeed: clampSpeed(speed) });
  },

  setThumbnailsEnabled: (enabled) => {
    set({ thumbnailsEnabled: Boolean(enabled) });
  },

  setPlaybackDelay: (delay) => {
    set((state) => {
      const nextDelay = clampDelay(delay);
      if (state.frames.length <= 0) {
        return { playbackDelay: nextDelay };
      }

      const targetIndices = state.selectedFrameIndices && state.selectedFrameIndices.length > 0
        ? state.selectedFrameIndices
        : [state.currentFrameIndex];

      const targetsSet = new Set(targetIndices.map((i) => clampFrameIndex(i, state.frames.length)));
      const nextFrames = state.frames.map((frame, idx) => {
        if (targetsSet.has(idx)) {
          return {
            ...frame,
            delay: nextDelay,
          };
        }
        return frame;
      });

      return {
        frames: nextFrames,
        playbackDelay: nextDelay,
      };
    });
  },

  markFrameRendering: (indexOrOrigin) => {
    set((state) => {
      if (state.frames.length === 0) return state;

      let targetOriginId = null;
      let targetIndex = -1;

      if (typeof indexOrOrigin === 'number') {
        targetIndex = clampFrameIndex(indexOrOrigin, state.frames.length);
        targetOriginId = state.frames[targetIndex]?.originId;
      } else if (typeof indexOrOrigin === 'string') {
        targetOriginId = indexOrOrigin;
      }

      const nextStates = state.frameStates.map((st, idx) => {
        if (idx === targetIndex || (targetOriginId && state.frames[idx]?.originId === targetOriginId)) {
          return 'rendering';
        }
        return st;
      });

      return { frameStates: nextStates };
    });
  },

  markFrameRendered: (indexOrOrigin, thumbnailUrl, renderedFrame = null) => {
    set((state) => {
      if (state.frames.length === 0) return state;

      let targetOriginId = null;
      let targetIndex = -1;

      if (typeof indexOrOrigin === 'number') {
        targetIndex = clampFrameIndex(indexOrOrigin, state.frames.length);
        targetOriginId = state.frames[targetIndex]?.originId || String(targetIndex);
      } else if (typeof indexOrOrigin === 'string') {
        targetOriginId = indexOrOrigin;
        targetIndex = state.frames.findIndex((f) => f.originId === targetOriginId);
      }

      const nextThumbnails = { ...state.renderedThumbnails };
      const nextRenderedFrames = { ...state.renderedFrames };

      if (targetOriginId) {
        if (thumbnailUrl !== undefined) nextThumbnails[targetOriginId] = thumbnailUrl;
        if (renderedFrame) nextRenderedFrames[targetOriginId] = renderedFrame;
      }

      const nextStates = state.frameStates.map((st, idx) => {
        const matches = (idx === targetIndex) || (targetOriginId && state.frames[idx]?.originId === targetOriginId);
        if (matches) {
          if (thumbnailUrl !== undefined) nextThumbnails[idx] = thumbnailUrl;
          if (renderedFrame) nextRenderedFrames[idx] = renderedFrame;
          return 'done';
        }
        return st;
      });

      return {
        frameStates: nextStates,
        renderedThumbnails: nextThumbnails,
        renderedFrames: nextRenderedFrames,
      };
    });
  },

  markAllPending: () => {
    set((state) => ({
      frameStates: state.frames.map(() => 'pending'),
      renderedThumbnails: {},
      renderedFrames: {},
    }));
  },

  duplicateFrames: (indices) => {
    set((state) => {
      if (!state.frames.length) return state;
      const targets = (Array.isArray(indices) ? indices : [indices])
        .map((i) => clampFrameIndex(i, state.frames.length))
        .sort((a, b) => a - b);
      if (!targets.length) return state;

      const insertPos = Math.max(...targets) + 1;
      const copies = targets.map((idx) => {
        const orig = state.frames[idx];
        return {
          ...orig,
          id: createInstanceId(),
          originId: orig.originId || orig.id || createOriginId(),
          delay: orig.delay,
          pixels: orig.pixels, // Reuses shared address in memory
        };
      });

      const nextFrames = [
        ...state.frames.slice(0, insertPos),
        ...copies,
        ...state.frames.slice(insertPos),
      ];

      const nextThumbnails = {};
      const nextRenderedFrames = {};

      Object.entries(state.renderedThumbnails).forEach(([k, v]) => {
        if (isNaN(Number(k))) nextThumbnails[k] = v;
      });
      Object.entries(state.renderedFrames).forEach(([k, v]) => {
        if (isNaN(Number(k))) nextRenderedFrames[k] = v;
      });

      const nextFrameStates = [];
      nextFrames.forEach((frame, idx) => {
        const originId = frame.originId;
        const cached = nextRenderedFrames[originId];
        const thumb = nextThumbnails[originId];
        if (cached) {
          nextFrameStates[idx] = 'done';
          nextRenderedFrames[idx] = cached;
        } else {
          nextFrameStates[idx] = 'pending';
        }
        if (thumb) {
          nextThumbnails[idx] = thumb;
        }
      });

      const newSelected = copies.map((_, i) => insertPos + i);

      return {
        frames: nextFrames,
        frameStates: nextFrameStates,
        renderedThumbnails: nextThumbnails,
        renderedFrames: nextRenderedFrames,
        currentFrameIndex: insertPos,
        selectedFrameIndices: newSelected,
      };
    });
  },

  deleteFrames: (indices) => {
    set((state) => {
      if (state.frames.length <= 1) return state;
      const targetSet = new Set(
        (Array.isArray(indices) ? indices : [indices]).map((i) => clampFrameIndex(i, state.frames.length))
      );

      // Do not allow deleting all frames: keep at least 1
      if (targetSet.size >= state.frames.length) {
        targetSet.delete(0);
      }

      const nextFrames = [];
      const deletedFrames = [];

      for (let i = 0; i < state.frames.length; i += 1) {
        if (targetSet.has(i)) {
          deletedFrames.push(state.frames[i]);
        } else {
          nextFrames.push(state.frames[i]);
        }
      }

      // Track remaining originIds across timeline and clipboard
      const activeOriginIds = new Set(nextFrames.map((f) => f.originId));
      const clipboardOriginIds = new Set((state.clipboardFrames || []).map((f) => f.originId));

      const nextThumbnails = {};
      const nextRenderedFrames = {};

      // Only retain origin caches if originId is still referenced somewhere
      Object.entries(state.renderedThumbnails).forEach(([k, v]) => {
        if (isNaN(Number(k))) {
          if (activeOriginIds.has(k) || clipboardOriginIds.has(k)) {
            nextThumbnails[k] = v;
          }
        }
      });

      Object.entries(state.renderedFrames).forEach(([k, v]) => {
        if (isNaN(Number(k))) {
          if (activeOriginIds.has(k) || clipboardOriginIds.has(k)) {
            nextRenderedFrames[k] = v;
          }
        }
      });

      // Break references on completely removed frames to enable GC deallocation
      deletedFrames.forEach((df) => {
        if (df && !activeOriginIds.has(df.originId) && !clipboardOriginIds.has(df.originId)) {
          df.pixels = null;
        }
      });

      const nextFrameStates = [];
      nextFrames.forEach((frame, idx) => {
        const originId = frame.originId;
        const cached = nextRenderedFrames[originId];
        const thumb = nextThumbnails[originId];
        if (cached) {
          nextFrameStates[idx] = 'done';
          nextRenderedFrames[idx] = cached;
        } else {
          nextFrameStates[idx] = 'pending';
        }
        if (thumb) {
          nextThumbnails[idx] = thumb;
        }
      });

      const safeCurrentIndex = clampFrameIndex(state.currentFrameIndex, nextFrames.length);

      return {
        frames: nextFrames,
        frameStates: nextFrameStates,
        renderedThumbnails: nextThumbnails,
        renderedFrames: nextRenderedFrames,
        currentFrameIndex: safeCurrentIndex,
        selectedFrameIndices: [safeCurrentIndex],
      };
    });
  },

  copyFrames: (indices) => {
    set((state) => {
      const targetIndices = (Array.isArray(indices) ? indices : [indices])
        .map((i) => clampFrameIndex(i, state.frames.length))
        .filter((val, idx, self) => self.indexOf(val) === idx)
        .sort((a, b) => a - b);

      if (targetIndices.length === 0) return state;

      const clipboard = targetIndices.map((idx) => {
        const f = state.frames[idx];
        return {
          ...f,
          id: createInstanceId(),
          originId: f.originId || f.id || createOriginId(),
          pixels: f.pixels, // Shared reference
          delay: f.delay,
        };
      });

      return { clipboardFrames: clipboard };
    });
  },

  cutFrames: (indices) => {
    const state = useGifStore.getState();
    const targetIndices = (Array.isArray(indices) ? indices : [indices])
      .map((i) => clampFrameIndex(i, state.frames.length))
      .filter((val, idx, self) => self.indexOf(val) === idx)
      .sort((a, b) => a - b);

    if (targetIndices.length === 0) return;

    const clipboard = targetIndices.map((idx) => {
      const f = state.frames[idx];
      return {
        ...f,
        id: createInstanceId(),
        originId: f.originId || f.id || createOriginId(),
        pixels: f.pixels,
        delay: f.delay,
      };
    });

    useGifStore.setState({ clipboardFrames: clipboard });
    state.deleteFrames(targetIndices);
  },

  pasteFrames: (targetIndex, position = 'after') => {
    set((state) => {
      if (!state.clipboardFrames || state.clipboardFrames.length === 0) return state;

      const safeTarget = clampFrameIndex(targetIndex, state.frames.length);
      const insertPos = position === 'before' ? safeTarget : safeTarget + 1;

      const copies = state.clipboardFrames.map((f) => ({
        ...f,
        id: createInstanceId(),
        originId: f.originId || f.id || createOriginId(),
        pixels: f.pixels, // Shared reference
        delay: f.delay,
      }));

      const nextFrames = [
        ...state.frames.slice(0, insertPos),
        ...copies,
        ...state.frames.slice(insertPos),
      ];

      const nextThumbnails = {};
      const nextRenderedFrames = {};

      Object.entries(state.renderedThumbnails).forEach(([k, v]) => {
        if (isNaN(Number(k))) nextThumbnails[k] = v;
      });
      Object.entries(state.renderedFrames).forEach(([k, v]) => {
        if (isNaN(Number(k))) nextRenderedFrames[k] = v;
      });

      const nextFrameStates = [];
      nextFrames.forEach((frame, idx) => {
        const originId = frame.originId;
        const cached = nextRenderedFrames[originId];
        const thumb = nextThumbnails[originId];
        if (cached) {
          nextFrameStates[idx] = 'done';
          nextRenderedFrames[idx] = cached;
        } else {
          nextFrameStates[idx] = 'pending';
        }
        if (thumb) {
          nextThumbnails[idx] = thumb;
        }
      });

      const newSelected = copies.map((_, i) => insertPos + i);

      return {
        frames: nextFrames,
        frameStates: nextFrameStates,
        renderedThumbnails: nextThumbnails,
        renderedFrames: nextRenderedFrames,
        currentFrameIndex: insertPos,
        selectedFrameIndices: newSelected,
      };
    });
  },
}));

export default useGifStore;
