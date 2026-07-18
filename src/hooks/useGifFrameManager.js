import { useCallback, useEffect, useRef } from "react";
import useGifStore from "../stores/media/gifStore";
import useDitherStore from "../stores/engine/ditherStore";
import { registerRenderSnapshot } from "../utils/canvasRegistry";
import { getTargetDisplaySize } from "../utils/shaderHelpers";

export default function useGifFrameManager({
  activeSourceRef,
  splitOverlayImageRef,
  originalUniqueColorsRef,
  watermarkEnabledRef,
  setSize,
  applyDisplaySize,
  syncVisibleLayer,
  updateOutputTexture,
  queueProcessing,
  outputReadyRef,
  outputModeRef,
  pendingPaletteRefreshRef,
}) {
  const frameCanvasRef = useRef(null);
  const frameContextRef = useRef(null);
  const internalFrameSwapRef = useRef(false);

  const swapSourceFrame = useCallback((frameIndex) => {
    const gifState = useGifStore.getState();
    const frame = gifState.frames?.[frameIndex];
    if (!frame || !frame.width || !frame.height || !frame.pixels) return;

    const needsFreshCanvas =
      !frameCanvasRef.current ||
      !frameContextRef.current ||
      frameCanvasRef.current.width !== frame.width ||
      frameCanvasRef.current.height !== frame.height;

    if (needsFreshCanvas) {
      frameCanvasRef.current = document.createElement('canvas');
      frameCanvasRef.current.width = frame.width;
      frameCanvasRef.current.height = frame.height;
      frameContextRef.current = frameCanvasRef.current.getContext('2d');
    }

    if (!frameContextRef.current || !frameCanvasRef.current) return;

    frameContextRef.current.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);

    activeSourceRef.current = frameCanvasRef.current;
    splitOverlayImageRef.current = frameCanvasRef.current;

    internalFrameSwapRef.current = true;
    setSize({ width: frame.width, height: frame.height }, { resetCustom: false });

    const displaySize = getTargetDisplaySize();
    applyDisplaySize(
      displaySize.width,
      displaySize.height,
      watermarkEnabledRef.current,
    );

    outputReadyRef.current = false;
    outputModeRef.current = 'none';
    syncVisibleLayer();

    const cachedFrame = gifState.renderedFrames?.[frameIndex];
    const cachedState = gifState.frameStates?.[frameIndex];
    const shouldForceRefresh = pendingPaletteRefreshRef?.current;
    if (cachedFrame && cachedState === 'done') {
      const cachedPixels = cachedFrame.pixels instanceof Uint8ClampedArray
        ? cachedFrame.pixels
        : new Uint8ClampedArray(cachedFrame.pixels || []);

      if (cachedPixels.length > 0) {
        updateOutputTexture(cachedPixels, cachedFrame.width, cachedFrame.height);
        outputModeRef.current = useDitherStore.getState().enabled ? 'dither' : 'clean';
        outputReadyRef.current = true;

        registerRenderSnapshot({
          uniqueColors: cachedFrame.uniqueColors ?? 0,
          originalUniqueColors: originalUniqueColorsRef.current,
        });

        syncVisibleLayer();

        if (shouldForceRefresh) {
          queueProcessing(true);
        }

        internalFrameSwapRef.current = false;
        return;
      }
    }

    queueProcessing(false);
    internalFrameSwapRef.current = false;
  }, [
    activeSourceRef,
    splitOverlayImageRef,
    originalUniqueColorsRef,
    watermarkEnabledRef,
    setSize,
    applyDisplaySize,
    syncVisibleLayer,
    updateOutputTexture,
    queueProcessing,
    outputReadyRef,
    outputModeRef,
    pendingPaletteRefreshRef,
  ]);

  // Subscribe to gif timeline changes
  useEffect(() => {
    const unsubGif = useGifStore.subscribe((state, previousState) => {
      const hadFrames = (previousState?.frames?.length || 0) > 1;
      const hasFrames = (state?.frames?.length || 0) > 1;
      if (!hasFrames && !hadFrames) return;

      if (!hadFrames && hasFrames) {
        swapSourceFrame(state.currentFrameIndex);
        return;
      }

      if (state.currentFrameIndex !== previousState.currentFrameIndex) {
        swapSourceFrame(state.currentFrameIndex);
      }
    });

    return () => {
      unsubGif();
      frameCanvasRef.current = null;
      frameContextRef.current = null;
      internalFrameSwapRef.current = false;
    };
  }, [swapSourceFrame]);

  return {
    frameCanvasRef,
    frameContextRef,
    internalFrameSwapRef,
    swapSourceFrame,
  };
}
