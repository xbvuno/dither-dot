import { create } from 'zustand';

export const WEBCAM_SOURCE = 'webcam://live';

// Module-level sliding-window FPS counter — reset on each start/stop.
let frameTimestamps = [];

// Incremented on every stop (or superseded start) to cancel in-flight getUserMedia results.
let startToken = 0;

const useWebcamStore = create((set, get) => ({
  active: false,
  starting: false,
  stream: null,
  fps: 0,
  targetFps: 15,
  error: '',
  mirrored: false,
  facingMode: 'user', // 'user' (front) or 'environment' (back/rear)
  frameReady: false,
  paletteFrozen: false,
  shoots: [],

  addShoot: (shoot) => set((s) => ({ shoots: [shoot, ...s.shoots] })),
  deleteShoot: (id) => set((s) => ({ shoots: s.shoots.filter((item) => item.id !== id) })),
  clearShoots: () => set({ shoots: [] }),

  startWebcam: async (requestedFacingMode) => {
    if (get().starting) return;
    const mode = requestedFacingMode || get().facingMode || 'user';
    set({ error: '', starting: true, facingMode: mode });

    const token = ++startToken;

    // Stop existing stream if any
    const existingStream = get().stream;
    if (existingStream) {
      existingStream.oninactive = null;
      existingStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      const errorMsg = 'WEBCAM REQUIRES A SECURE CONNECTION (HTTPS) OR LOCALHOST.';
      console.error('[WEBCAM STORE ERROR]', errorMsg);
      set({
        error: errorMsg,
        starting: false,
        active: false,
      });
      return;
    }

    console.log('[WEBCAM STORE] Attempting getUserMedia with facingMode:', mode);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
        console.log('[WEBCAM STORE] Level 1 getUserMedia succeeded.');
      } catch (err1) {
        console.warn('[WEBCAM STORE] Level 1 getUserMedia failed:', err1);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
            },
            audio: false,
          });
          console.log('[WEBCAM STORE] Level 2 getUserMedia succeeded.');
        } catch (err2) {
          console.warn('[WEBCAM STORE] Level 2 getUserMedia failed:', err2);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: mode },
              audio: false,
            });
            console.log('[WEBCAM STORE] Level 3 getUserMedia succeeded.');
          } catch (err3) {
            console.warn('[WEBCAM STORE] Level 3 getUserMedia failed:', err3);
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
            console.log('[WEBCAM STORE] Level 4 fallback getUserMedia succeeded.');
          }
        }
      }

      if (token !== startToken) {
        console.warn('[WEBCAM STORE] Start token changed, stopping acquired stream.');
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const handleTrackEnded = () => {
        if (get().stream === stream) {
          console.warn('[WEBCAM STORE] Camera track ended externally.');
          get().stopWebcam();
        }
      };
      stream.getTracks().forEach((track) => {
        track.onended = handleTrackEnded;
      });
      stream.oninactive = handleTrackEnded;

      frameTimestamps = [];
      const isFront = mode === 'user';
      console.log('[WEBCAM STORE] Webcam active set to TRUE. Stream tracks count:', stream.getTracks().length);
      set({
        active: true,
        starting: false,
        stream,
        fps: 0,
        frameReady: false,
        paletteFrozen: false,
        error: '',
        facingMode: mode,
        mirrored: isFront,
      });
    } catch (err) {
      if (token === startToken) {
        const msg = err instanceof Error ? err.message : 'WEBCAM ACCESS DENIED.';
        console.error('[WEBCAM STORE FATAL ERROR]', err);
        set({ error: msg.toUpperCase(), active: false, starting: false, stream: null });
      }
    }
  },

  stopWebcam: () => {
    startToken++;

    const { stream } = get();
    if (stream) {
      stream.oninactive = null;
      stream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }
    frameTimestamps = [];
    set({ active: false, starting: false, stream: null, fps: 0, error: '', frameReady: false, paletteFrozen: false });
  },

  toggleFacingMode: async () => {
    const currentMode = get().facingMode || 'user';
    const nextMode = currentMode === 'user' ? 'environment' : 'user';
    
    if (get().active) {
      await get().startWebcam(nextMode);
    } else {
      set({ facingMode: nextMode, mirrored: nextMode === 'user' });
    }
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

    const windowStart = now - 1000;
    while (frameTimestamps.length > 0 && frameTimestamps[0] < windowStart) {
      frameTimestamps.shift();
    }

    set({ fps: frameTimestamps.length });
  },

  setFrameReady: (frameReady) => set({ frameReady }),
  setPaletteFrozen: (paletteFrozen) => set({ paletteFrozen }),
}));

export default useWebcamStore;
