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

const useGifStore = create((set) => ({
  ...DEFAULT_GIF_STATE,

  setFrames: (frames, loopCount = 0, options = {}) => {
    const nextFrames = Array.isArray(frames) ? frames : [];
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
      const arr = Array.isArray(indices) ? indices : [indices];
      const valid = arr
        .map((i) => clampFrameIndex(i, state.frames.length))
        .filter((val, idx, self) => self.indexOf(val) === idx);
      return { selectedFrameIndices: valid.length > 0 ? valid : [state.currentFrameIndex] };
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

  markFrameRendering: (index) => {
    set((state) => {
      const safeIndex = clampFrameIndex(index, state.frames.length);
      if (state.frames.length === 0) return state;

      const nextStates = [...state.frameStates];
      nextStates[safeIndex] = 'rendering';
      return { frameStates: nextStates };
    });
  },

  markFrameRendered: (index, thumbnailUrl, renderedFrame = null) => {
    set((state) => {
      const safeIndex = clampFrameIndex(index, state.frames.length);
      if (state.frames.length === 0) return state;

      const nextStates = [...state.frameStates];
      nextStates[safeIndex] = 'done';

      return {
        frameStates: nextStates,
        renderedThumbnails: {
          ...state.renderedThumbnails,
          [safeIndex]: thumbnailUrl,
        },
        renderedFrames: renderedFrame
          ? {
              ...state.renderedFrames,
              [safeIndex]: renderedFrame,
            }
          : state.renderedFrames,
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
        const newPixels = new Uint8ClampedArray(orig.pixels);
        return { ...orig, pixels: newPixels };
      });

      const nextFrames = [
        ...state.frames.slice(0, insertPos),
        ...copies,
        ...state.frames.slice(insertPos),
      ];

      const nextFrameStates = [
        ...state.frameStates.slice(0, insertPos),
        ...copies.map(() => 'pending'),
        ...state.frameStates.slice(insertPos),
      ];

      const shift = copies.length;
      const nextThumbnails = {};
      const nextRenderedFrames = {};

      Object.entries(state.renderedThumbnails).forEach(([key, val]) => {
        const k = Number(key);
        if (k < insertPos) {
          nextThumbnails[k] = val;
        } else {
          nextThumbnails[k + shift] = val;
        }
      });

      Object.entries(state.renderedFrames).forEach(([key, val]) => {
        const k = Number(key);
        if (k < insertPos) {
          nextRenderedFrames[k] = val;
        } else {
          nextRenderedFrames[k + shift] = val;
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
        // Keep the first frame
        targetSet.delete(0);
      }

      const nextFrames = [];
      const nextFrameStates = [];
      const nextThumbnails = {};
      const nextRenderedFrames = {};

      let newIdx = 0;
      for (let oldIdx = 0; oldIdx < state.frames.length; oldIdx += 1) {
        if (!targetSet.has(oldIdx)) {
          nextFrames.push(state.frames[oldIdx]);
          nextFrameStates.push(state.frameStates[oldIdx] || 'pending');
          if (state.renderedThumbnails[oldIdx]) {
            nextThumbnails[newIdx] = state.renderedThumbnails[oldIdx];
          }
          if (state.renderedFrames[oldIdx]) {
            nextRenderedFrames[newIdx] = state.renderedFrames[oldIdx];
          }
          newIdx += 1;
        }
      }

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
          pixels: new Uint8ClampedArray(f.pixels),
        };
      });

      return { clipboardFrames: clipboard };
    });
  },

  cutFrames: (indices) => {
    set((currState) => {
      const targetIndices = (Array.isArray(indices) ? indices : [indices])
        .map((i) => clampFrameIndex(i, currState.frames.length))
        .filter((val, idx, self) => self.indexOf(val) === idx)
        .sort((a, b) => a - b);

      if (targetIndices.length === 0) return currState;

      const clipboard = targetIndices.map((idx) => {
        const f = currState.frames[idx];
        return {
          ...f,
          pixels: new Uint8ClampedArray(f.pixels),
        };
      });

      // If all frames selected, leave at least 1
      const targetSet = new Set(targetIndices);
      if (targetSet.size >= currState.frames.length) {
        targetSet.delete(0);
      }

      const nextFrames = [];
      const nextFrameStates = [];
      const nextThumbnails = {};
      const nextRenderedFrames = {};

      let newIdx = 0;
      for (let oldIdx = 0; oldIdx < currState.frames.length; oldIdx += 1) {
        if (!targetSet.has(oldIdx)) {
          nextFrames.push(currState.frames[oldIdx]);
          nextFrameStates.push(currState.frameStates[oldIdx] || 'pending');
          if (currState.renderedThumbnails[oldIdx]) {
            nextThumbnails[newIdx] = currState.renderedThumbnails[oldIdx];
          }
          if (currState.renderedFrames[oldIdx]) {
            nextRenderedFrames[newIdx] = currState.renderedFrames[oldIdx];
          }
          newIdx += 1;
        }
      }

      const safeCurrentIndex = clampFrameIndex(currState.currentFrameIndex, nextFrames.length);

      return {
        clipboardFrames: clipboard,
        frames: nextFrames,
        frameStates: nextFrameStates,
        renderedThumbnails: nextThumbnails,
        renderedFrames: nextRenderedFrames,
        currentFrameIndex: safeCurrentIndex,
        selectedFrameIndices: [safeCurrentIndex],
      };
    });
  },

  pasteFrames: (targetIndex, position = 'after') => {
    set((state) => {
      if (!state.clipboardFrames || state.clipboardFrames.length === 0) return state;

      const copies = state.clipboardFrames.map((f) => ({
        ...f,
        pixels: new Uint8ClampedArray(f.pixels),
      }));

      const safeTarget = clampFrameIndex(targetIndex, state.frames.length);
      const insertPos = position === 'before' ? safeTarget : safeTarget + 1;

      const nextFrames = [
        ...state.frames.slice(0, insertPos),
        ...copies,
        ...state.frames.slice(insertPos),
      ];

      const nextFrameStates = [
        ...state.frameStates.slice(0, insertPos),
        ...copies.map(() => 'pending'),
        ...state.frameStates.slice(insertPos),
      ];

      const nextThumbnails = {};
      const nextRenderedFrames = {};
      const shift = copies.length;

      Object.entries(state.renderedThumbnails).forEach(([idxKey, val]) => {
        const k = Number(idxKey);
        if (k < insertPos) {
          nextThumbnails[k] = val;
        } else {
          nextThumbnails[k + shift] = val;
        }
      });

      Object.entries(state.renderedFrames).forEach(([idxKey, val]) => {
        const k = Number(idxKey);
        if (k < insertPos) {
          nextRenderedFrames[k] = val;
        } else {
          nextRenderedFrames[k + shift] = val;
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
