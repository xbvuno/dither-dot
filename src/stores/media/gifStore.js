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
  loopCount: 0,
  decoding: false,
  exporting: false,
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

const useGifStore = create((set) => ({
  ...DEFAULT_GIF_STATE,

  setFrames: (frames, loopCount = 0) => {
    const nextFrames = Array.isArray(frames) ? frames : [];
    const firstFrameDelay = nextFrames[0]?.delay;
    set({
      frames: nextFrames,
      currentFrameIndex: 0,
      playing: false,
      playbackDelay: clampDelay(firstFrameDelay),
      frameStates: nextFrames.map(() => 'pending'),
      renderedThumbnails: {},
      renderedFrames: {},
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

  setPlaybackDelay: (delay) => {
    set((state) => {
      const nextDelay = clampDelay(delay);
      if (state.frames.length <= 0) {
        return { playbackDelay: nextDelay };
      }

      const safeIndex = clampFrameIndex(state.currentFrameIndex, state.frames.length);
      const nextFrames = [...state.frames];
      const currentFrame = nextFrames[safeIndex];
      nextFrames[safeIndex] = {
        ...currentFrame,
        delay: nextDelay,
      };

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
}));

export default useGifStore;
