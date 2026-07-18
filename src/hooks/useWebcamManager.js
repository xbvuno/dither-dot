import { useCallback, useEffect, useRef } from "react";
import useWebcamStore from "../stores/media/webcamStore";
import useImageStore from "../stores/media/imageStore";
import { drawWebcamFrameToCanvas } from "../utils/shaderHelpers";

export default function useWebcamManager({
  activeSourceRef,
  originalUniqueColorsRef,
  isWebcamModeRef,
  paletteFrozenForWebcamRef,
  lifecycleTokenRef,
  queueProcessing,
  engineStateRef,
}) {
  const webcamVideoRef = useRef(null);
  const webcamCanvasRef = useRef(null);
  const webcamCtxRef = useRef(null);
  const webcamLoopTimerRef = useRef(null);
  const webcamMirrorRef = useRef(Boolean(useWebcamStore.getState().mirrored));

  const cleanupWebcam = useCallback(() => {
    if (webcamLoopTimerRef.current !== null) {
      window.clearTimeout(webcamLoopTimerRef.current);
      webcamLoopTimerRef.current = null;
    }

    const webcamVideo = webcamVideoRef.current;
    if (webcamVideo) {
      webcamVideo.pause();
      webcamVideo.srcObject = null;
      webcamVideoRef.current = null;
    }
    webcamCanvasRef.current = null;
    webcamCtxRef.current = null;
    isWebcamModeRef.current = false;
  }, [isWebcamModeRef]);

  const initWebcam = useCallback(async (lifecycleToken) => {
    isWebcamModeRef.current = true;
    paletteFrozenForWebcamRef.current = false;

    const webcamStream = useWebcamStore.getState().stream;
    if (!webcamStream) throw new Error('Webcam stream is not available');

    const video = document.createElement('video');
    video.srcObject = webcamStream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to initialize webcam video'));
    });

    try {
      await video.play();
    } catch (err) {
      throw new Error(`Webcam play failed: ${err?.message ?? err}`);
    }

    if (lifecycleTokenRef.current !== lifecycleToken) {
      video.pause();
      video.srcObject = null;
      return null;
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const webcamCanvas = document.createElement('canvas');
    webcamCanvas.width = vw;
    webcamCanvas.height = vh;
    const webcamCtx = webcamCanvas.getContext('2d');
    if (!webcamCtx) throw new Error('Cannot get 2D context for webcam canvas');
    
    webcamMirrorRef.current = Boolean(useWebcamStore.getState().mirrored);
    drawWebcamFrameToCanvas(video, webcamCanvas, webcamCtx, webcamMirrorRef.current);

    webcamVideoRef.current = video;
    webcamCanvasRef.current = webcamCanvas;
    webcamCtxRef.current = webcamCtx;
    activeSourceRef.current = webcamCanvas;
    originalUniqueColorsRef.current = 0;

    // Start webcam loop
    const scheduleWebcamFrame = () => {
      if (disposedRef.current || lifecycleTokenRef.current !== lifecycleToken) return;
      if (engineStateRef.current !== 'STREAMING') {
        cleanupWebcam();
        return;
      }
      const { targetFps } = useWebcamStore.getState();
      const interval = Math.max(33, Math.round(1000 / targetFps));

      webcamLoopTimerRef.current = window.setTimeout(() => {
        webcamLoopTimerRef.current = null;
        if (disposedRef.current || lifecycleTokenRef.current !== lifecycleToken) return;

        const v = webcamVideoRef.current;
        const c = webcamCanvasRef.current;
        const ctx = webcamCtxRef.current;

        if (v && c && ctx && v.readyState >= 2) {
          drawWebcamFrameToCanvas(v, c, ctx, webcamMirrorRef.current);
        }

        queueProcessing(false);
        scheduleWebcamFrame();
      }, interval);
    };

    scheduleWebcamFrame();
    return webcamCanvas;
  }, [activeSourceRef, originalUniqueColorsRef, isWebcamModeRef, paletteFrozenForWebcamRef, lifecycleTokenRef, disposedRef, queueProcessing, engineStateRef]);

  // Subscribe to webcam changes
  useEffect(() => {
    const unsubWebcam = useWebcamStore.subscribe((state, previousState) => {
      if (state.mirrored !== previousState.mirrored) {
        webcamMirrorRef.current = Boolean(state.mirrored);

        const video = webcamVideoRef.current;
        const canvas = webcamCanvasRef.current;
        const ctx = webcamCtxRef.current;

        if (video && canvas && ctx && video.readyState >= 2) {
          drawWebcamFrameToCanvas(video, canvas, ctx, webcamMirrorRef.current);
        }

        if (isWebcamModeRef.current) {
          queueProcessing(false);
        }
      }

      if (previousState.active && !state.active && isWebcamModeRef.current) {
        cleanupWebcam();
        Promise.resolve().then(() => {
          useImageStore.getState().resetToDefault();
        });
      }
    });

    return () => {
      unsubWebcam();
      cleanupWebcam();
    };
  }, [cleanupWebcam, queueProcessing, isWebcamModeRef]);

  return {
    webcamVideoRef,
    webcamCanvasRef,
    webcamCtxRef,
    webcamLoopTimerRef,
    webcamMirrorRef,
    initWebcam,
    cleanupWebcam,
  };
}
