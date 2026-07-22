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
  maxWidth: 1280,
  maxHeight: 720,

  addShoot: (shoot) => set((s) => ({ shoots: [shoot, ...(s.shoots || [])] })),
  deleteShoot: (id) => set((s) => ({ shoots: (s.shoots || []).filter((item) => item.id !== id) })),
  clearShoots: () => set({ shoots: [] }),

  applyResolutionConstraints: async (width, height) => {
    const stream = get().stream;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const maxW = get().maxWidth || 1280;
    const maxH = get().maxHeight || 720;
    const clampedW = Math.min(maxW, Math.max(1, Math.round(Number(width) || 640)));
    const clampedH = Math.min(maxH, Math.max(1, Math.round(Number(height) || 360)));

    try {
      await videoTrack.applyConstraints({
        width: { ideal: clampedW, max: maxW },
        height: { ideal: clampedH, max: maxH },
        facingMode: { ideal: get().facingMode || 'user' },
        frameRate: { ideal: 30, max: 30 },
      });
    } catch (err) {
      console.warn('[WEBCAM CONSTRAINTS WARN]', err);
    }
  },

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
      const errorMsg = 'CAMERA REQUIRES A SECURE CONNECTION (HTTPS) OR LOCALHOST.';
      set({
        error: errorMsg,
        starting: false,
        active: false,
      });
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 640, max: 1280 },
            height: { ideal: 360, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
            },
            audio: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: mode },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      if (token !== startToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const handleTrackEnded = () => {
        if (get().stream === stream) {
          get().stopWebcam();
        }
      };
      stream.getTracks().forEach((track) => {
        track.onended = handleTrackEnded;
      });
      stream.oninactive = handleTrackEnded;

      let detectedMaxW = 1280;
      let detectedMaxH = 720;
      const vTrack = stream.getVideoTracks()[0];
      if (vTrack) {
        if (typeof vTrack.getCapabilities === 'function') {
          const caps = vTrack.getCapabilities();
          if (caps?.width?.max) detectedMaxW = caps.width.max;
          if (caps?.height?.max) detectedMaxH = caps.height.max;
        }
        if (typeof vTrack.getSettings === 'function') {
          const settings = vTrack.getSettings();
          if (settings.width && settings.height) {
            if (!detectedMaxW) detectedMaxW = settings.width;
            if (!detectedMaxH) detectedMaxH = settings.height;
          }
        }
      }

      // Compute native sensor aspect ratio
      const nativeRatio = (detectedMaxW && detectedMaxH) ? (detectedMaxW / detectedMaxH) : (16 / 9);

      // Reference 480px initial sizing:
      // Desktop (> 768px): fixed 480px width, height = Math.round(480 / nativeRatio)
      // Mobile (<= 768px): fixed 480px height, width = Math.round(480 * nativeRatio)
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      let defaultW = 480;
      let defaultH = 360;

      if (isMobile) {
        defaultH = 480;
        defaultW = Math.max(1, Math.round(480 * nativeRatio));
      } else {
        defaultW = 480;
        defaultH = Math.max(1, Math.round(480 / nativeRatio));
      }

      if (vTrack && typeof vTrack.applyConstraints === 'function') {
        try {
          await vTrack.applyConstraints({
            width: { ideal: defaultW, max: detectedMaxW },
            height: { ideal: defaultH, max: detectedMaxH },
            facingMode: { ideal: mode },
            frameRate: { ideal: 30, max: 30 },
          });
        } catch {
          // Ignore
        }
      }

      frameTimestamps = [];
      const isFront = mode === 'user';
      set({
        active: true,
        starting: false,
        stream,
        maxWidth: detectedMaxW,
        maxHeight: detectedMaxH,
        fps: 0,
        frameReady: false,
        paletteFrozen: false,
        error: '',
        facingMode: mode,
        mirrored: isFront,
      });
    } catch (err) {
      if (token === startToken) {
        const msg = err instanceof Error ? err.message : 'CAMERA ACCESS DENIED.';
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
