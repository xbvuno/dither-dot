import { create } from 'zustand';

export const WEBCAM_SOURCE = 'webcam://live';

// Module-level sliding-window FPS counter — reset on each start/stop.
let frameTimestamps = [];

// Incremented on every stop (or superseded start) to cancel in-flight getUserMedia results.
let startToken = 0;

const useWebcamStore = create((set, get) => ({
  active: false,
  // True while getUserMedia() is pending, so the UI can show a loading state
  // and prevent concurrent start calls.
  starting: false,
  stream: null,
  fps: 0,
  targetFps: 15,
  error: '',
  mirrored: false,
  // Becomes true after the very first processed frame is rendered live,
  // used to gate screenshot actions.
  frameReady: false,
  paletteFrozen: false,

  startWebcam: async () => {
    if (get().active || get().starting) return;
    set({ error: '', starting: true });

    const token = ++startToken;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });

      // stopWebcam() was called (or a newer startWebcam() superseded this one)
      // while getUserMedia was pending — discard the acquired stream immediately.
      if (token !== startToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // Attach disconnect listeners so an external camera loss (USB unplug,
      // permission revocation, OS kill) is detected and the app transitions to
      // a clean stopped state.
      const handleTrackEnded = () => {
        // Guard: only react if this is still the active stream.
        if (get().stream === stream) {
          get().stopWebcam();
        }
      };
      stream.getTracks().forEach((track) => {
        track.onended = handleTrackEnded;
      });
      stream.oninactive = handleTrackEnded;

      frameTimestamps = [];
      set({ active: true, starting: false, stream, fps: 0, frameReady: false, paletteFrozen: false, error: '' });
    } catch (err) {
      if (token === startToken) {
        const msg = err instanceof Error ? err.message : 'WEBCAM ACCESS DENIED.';
        set({ error: msg.toUpperCase(), active: false, starting: false, stream: null });
      }
    }
  },

  stopWebcam: () => {
    // Bumping the token invalidates any getUserMedia still in-flight.
    startToken++;

    const { stream } = get();
    if (stream) {
      // Remove listeners *before* stopping tracks so that track.stop()
      // doesn't re-trigger this handler recursively.
      stream.oninactive = null;
      stream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }
    frameTimestamps = [];
    set({ active: false, starting: false, stream: null, fps: 0, error: '', frameReady: false, paletteFrozen: false });
  },

  setTargetFps: (value) => {
    set({ targetFps: Math.max(5, Math.min(30, Math.round(Number(value) || 15))) });
  },

  toggleMirrored: () => {
    set((state) => ({ mirrored: !state.mirrored }));
  },

  recordRenderedFrame: () => {
    const now = performance.now();
    frameTimestamps.push(now);
    const cutoff = now - 1000;
    frameTimestamps = frameTimestamps.filter((t) => t >= cutoff);
    const update = { fps: frameTimestamps.length };
    // Only fire a state update for frameReady once per session, not every frame.
    if (!get().frameReady) update.frameReady = true;
    set(update);
  },

  setPaletteFrozen: (frozen) => {
    set({ paletteFrozen: Boolean(frozen) });
  },

  resetFps: () => {
    frameTimestamps = [];
    set({ fps: 0 });
  },
}));

export default useWebcamStore;
