import { useCallback, useEffect, useRef } from "react";
import useViewStore from "../../stores/ui/viewStore";
import useSizeStore from "../../stores/media/sizeStore";
import useParamsStore from "../../stores/data/paramsStore";
import usePaletteStore, { EXTRACT_METHOD } from "../../stores/data/paletteStore";
import useDitherStore from "../../stores/engine/ditherStore";
import useGifStore from "../../stores/media/gifStore";
import useProcessingStore from "../../stores/engine/processingStore";
import usePerformanceStore from "../../stores/engine/performanceStore";
import useWatermarkStore from "../../stores/media/watermarkStore";
import useImageStore from "../../stores/media/imageStore";
import useWebcamStore, { WEBCAM_SOURCE } from "../../stores/media/webcamStore";
import {
  registerRenderSnapshot,
  registerPaletteReference,
  registerOutputCanvas,
} from "../../utils/canvasRegistry";
import watermarkImage from "../../assets/watermark/watermark.png";
import watermarkMiniImage from "../../assets/watermark/watermark-mini.png";

// Import hooks
import useDitherWorker from "../../hooks/useDitherWorker";
import useWebcamManager from "../../hooks/useWebcamManager";
import useGifFrameManager from "../../hooks/useGifFrameManager";

// Import helpers
import {
  getPaletteExtremes,
  getDrawableDimensions,
  loadTexture,
  countUniqueColorsFromImageSource,
  getTargetDisplaySize,
  generateRecoloredWatermark,
} from "../../utils/shaderHelpers";

const PROCESSING_DEBOUNCE_MS = 48;
const VIEWER_LOADING_VISIBILITY_DELAY_MS = 100;
const WATERMARK_MARGIN_NORMAL = 4;
const WATERMARK_MARGIN_MINI = 2;

export default function ShaderImage({ sourceImg }) {
  const setSize = useSizeStore(s => s.setSize);
  const setRenderProcessing = useProcessingStore(s => s.setRenderProcessing);
  const previewingOriginal = useViewStore(s => s.previewingOriginal);
  const showingOriginal = Boolean(previewingOriginal);
  const previewingOriginalRef = useRef(showingOriginal);

  const renderRef = useRef(null);
  const canvasHostRef = useRef(null);
  const viewportCanvasRef = useRef(null);
  const splitOverlayCanvasRef = useRef(null);
  const splitOverlayCtxRef = useRef(null);
  const splitOverlayImageRef = useRef(null);

  const activeSourceRef = useRef(null);
  const watermarkImgRef = useRef(null);
  const watermarkMiniImgRef = useRef(null);
  const recoloredWatermarkCanvasRef = useRef(null);
  const recoloredWatermarkMiniCanvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const outputContextRef = useRef(null);
  const disposedRef = useRef(false);
  const lifecycleTokenRef = useRef(0);
  const outputReadyRef = useRef(false);
  const outputModeRef = useRef('none');
  const viewerLoadingTimerRef = useRef(null);
  const originalUniqueColorsRef = useRef(0);
  const watermarkEnabledRef = useRef(Boolean(useWatermarkStore.getState().enabled));

  const isWebcamModeRef = useRef(false);
  const paletteFrozenForWebcamRef = useRef(false);

  const previousColorParamsRef = useRef(null);

  // Shared hooks refs
  const pendingPaletteRefreshRef = useRef(false);
  const processingQueuedRef = useRef(false);
  const engineStateRef = useRef('IDLE');

  const applyDisplaySize = useCallback((width, height) => {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 1));

    const viewportCanvas = viewportCanvasRef.current;
    if (viewportCanvas) {
      viewportCanvas.style.width = `${safeWidth}px`;
      viewportCanvas.style.height = `${safeHeight}px`;
      viewportCanvas.style.imageRendering = 'pixelated';
    }

    window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));

    return { width: safeWidth, height: safeHeight };
  }, []);

  const extractProcessedPixels = useCallback(() => {
    const source = activeSourceRef.current;
    if (!source) {
      return { pixels: new Uint8ClampedArray(), width: 0, height: 0 };
    }

    const sizeState = useSizeStore.getState();
    const sourceW = source.naturalWidth || source.width || 1;
    const sourceH = source.naturalHeight || source.height || 1;

    const customW = sizeState.customSize.customWidth || sourceW;
    const customH = sizeState.customSize.customHeight || sourceH;

    const canvas = document.createElement('canvas');
    canvas.width = customW;
    canvas.height = customH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { pixels: new Uint8ClampedArray(), width: 0, height: 0 };
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, customW, customH);
    const imgData = ctx.getImageData(0, 0, customW, customH);

    return { pixels: imgData.data, width: customW, height: customH };
  }, []);

  const clearViewerLoadingTimer = useCallback(() => {
    if (viewerLoadingTimerRef.current !== null) {
      window.clearTimeout(viewerLoadingTimerRef.current);
      viewerLoadingTimerRef.current = null;
    }
  }, []);

  const syncSplitOverlay = useCallback(() => {
    const overlayCanvas = splitOverlayCanvasRef.current;
    const overlayImage = splitOverlayImageRef.current;
    const renderElement = renderRef.current;

    if (!overlayCanvas) return;

    const showingOriginalOnly = Boolean(previewingOriginalRef.current);
    const shouldShowOverlay = showingOriginalOnly;

    if (!shouldShowOverlay || !overlayImage || !renderElement) {
      overlayCanvas.style.display = 'none';
      return;
    }

    const ctx = splitOverlayCtxRef.current;
    if (!ctx) return;

    const sourceDims = getDrawableDimensions(overlayImage);
    if (!sourceDims) {
      overlayCanvas.style.display = 'none';
      return;
    }

    const sizeState = useSizeStore.getState();
    const customW = sizeState.customSize.customWidth || sourceDims.width;
    const customH = sizeState.customSize.customHeight || sourceDims.height;
    const left = sizeState.crop?.left || 0;
    const right = sizeState.crop?.right || 0;
    const top = sizeState.crop?.top || 0;
    const bottom = sizeState.crop?.bottom || 0;

    const scaleX = customW ? (sourceDims.width / customW) : 1;
    const scaleY = customH ? (sourceDims.height / customH) : 1;
    const nativeLeft = Math.round(left * scaleX);
    const nativeRight = Math.round(right * scaleX);
    const nativeTop = Math.round(top * scaleY);
    const nativeBottom = Math.round(bottom * scaleY);

    const displayWidth = Math.max(1, sourceDims.width - nativeLeft - nativeRight);
    const displayHeight = Math.max(1, sourceDims.height - nativeTop - nativeBottom);

    if (overlayCanvas.width !== displayWidth || overlayCanvas.height !== displayHeight) {
      overlayCanvas.width = displayWidth;
      overlayCanvas.height = displayHeight;
    }

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(
      overlayImage,
      nativeLeft,
      nativeTop,
      displayWidth,
      displayHeight,
      0,
      0,
      displayWidth,
      displayHeight
    );
    ctx.restore();

    overlayCanvas.style.display = 'block';
  }, []);

  const syncVisibleLayer = useCallback(() => {
    const sizeState = useSizeStore.getState();
    const left = sizeState.crop?.left || 0;
    const right = sizeState.crop?.right || 0;
    const top = sizeState.crop?.top || 0;
    const bottom = sizeState.crop?.bottom || 0;
    const hasCrop = left > 0 || right > 0 || top > 0 || bottom > 0;

    const hasOutput = outputReadyRef.current && outputCanvasRef.current;

    if (previewingOriginalRef.current) {
      syncSplitOverlay();
      return;
    } else {
      if (splitOverlayCanvasRef.current) {
        splitOverlayCanvasRef.current.style.display = 'none';
      }
    }

    const viewportCanvas = viewportCanvasRef.current;
    if (!viewportCanvas) return;

    if (hasOutput) {
      const canvas = outputCanvasRef.current;
      viewportCanvas.width = canvas.width;
      viewportCanvas.height = canvas.height;
      const ctx = viewportCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(canvas, 0, 0);
      }
      applyDisplaySize(canvas.width, canvas.height, watermarkEnabledRef.current);
    } else {
      const source = activeSourceRef.current;
      if (source) {
        const sourceW = source.naturalWidth || source.width || 1;
        const sourceH = source.naturalHeight || source.height || 1;

        const customW = sizeState.customSize.customWidth || sourceW;
        const customH = sizeState.customSize.customHeight || sourceH;

        const cropLeft = hasCrop ? left : 0;
        const cropTop = hasCrop ? top : 0;
        const cropRight = hasCrop ? right : 0;
        const cropBottom = hasCrop ? bottom : 0;

        const displayWidth = Math.max(1, customW - cropLeft - cropRight);
        const displayHeight = Math.max(1, customH - cropTop - cropBottom);

        viewportCanvas.width = displayWidth;
        viewportCanvas.height = displayHeight;
        const ctx = viewportCanvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, displayWidth, displayHeight);
          ctx.drawImage(
            source,
            cropLeft,
            cropTop,
            displayWidth,
            displayHeight,
            0,
            0,
            displayWidth,
            displayHeight
          );
        }
        applyDisplaySize(displayWidth, displayHeight, watermarkEnabledRef.current);
      }
    }
  }, [syncSplitOverlay, applyDisplaySize]);

  const syncWatermarkPalette = useCallback(() => {
    const paletteState = usePaletteStore.getState();
    const { darkColor, lightColor } = getPaletteExtremes(
      paletteState.colors,
      paletteState.colorCount,
    );

    recoloredWatermarkCanvasRef.current = generateRecoloredWatermark(
      watermarkImgRef.current,
      darkColor,
      lightColor
    );
    recoloredWatermarkMiniCanvasRef.current = generateRecoloredWatermark(
      watermarkMiniImgRef.current,
      darkColor,
      lightColor
    );
  }, []);

  const preserveVisibleOutput = useCallback(() => {
    const ditherEnabled = useDitherStore.getState().enabled;
    const hasOutputCanvas = Boolean(outputCanvasRef.current);
    const expectedMode = ditherEnabled ? 'dither' : 'clean';
    outputReadyRef.current = hasOutputCanvas && outputModeRef.current === expectedMode;
    syncVisibleLayer();
  }, [syncVisibleLayer]);

  const updateOutputTexture = useCallback((data, width, height) => {
    const pixelCount = Math.floor(data.length / 4);
    let safeWidth = Math.max(1, Math.floor(width));
    let safeHeight = Math.max(1, Math.floor(height));

    if (safeWidth * safeHeight !== pixelCount) {
      if (pixelCount % safeWidth === 0) {
        safeHeight = Math.floor(pixelCount / safeWidth);
      } else {
        safeWidth = Math.max(1, Math.floor(Math.sqrt(pixelCount)));
        while (safeWidth > 1 && pixelCount % safeWidth !== 0) {
          safeWidth -= 1;
        }
        safeHeight = Math.max(1, Math.floor(pixelCount / safeWidth));
      }
    }

    let canvas = outputCanvasRef.current;
    let context = outputContextRef.current;
    const needsFreshCanvas =
      !canvas ||
      !context ||
      canvas.width !== safeWidth ||
      canvas.height !== safeHeight;

    if (needsFreshCanvas) {
      canvas = document.createElement('canvas');
      canvas.width = safeWidth;
      canvas.height = safeHeight;
      context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Unable to initialize CPU dither output canvas context');
      }

      outputCanvasRef.current = canvas;
      outputContextRef.current = context;
    }

    context.putImageData(new ImageData(data, safeWidth, safeHeight), 0, 0);

    if (watermarkEnabledRef.current) {
      const useMiniWatermark = safeWidth < 64 || safeHeight < 64;
      const watermarkCanvas = useMiniWatermark 
        ? recoloredWatermarkMiniCanvasRef.current 
        : recoloredWatermarkCanvasRef.current;

      if (watermarkCanvas) {
        const margin = useMiniWatermark ? WATERMARK_MARGIN_MINI : WATERMARK_MARGIN_NORMAL;
        const x = safeWidth - margin - watermarkCanvas.width;
        const y = safeHeight - margin - watermarkCanvas.height;
        context.drawImage(watermarkCanvas, x, y);
      }
    }

    registerOutputCanvas(outputCanvasRef.current);

    const viewportCanvas = viewportCanvasRef.current;
    if (viewportCanvas) {
      viewportCanvas.width = safeWidth;
      viewportCanvas.height = safeHeight;
      const viewCtx = viewportCanvas.getContext('2d');
      if (viewCtx) {
        viewCtx.imageSmoothingEnabled = false;
        viewCtx.clearRect(0, 0, safeWidth, safeHeight);
        viewCtx.drawImage(canvas, 0, 0);
      }
    }

    return outputCanvasRef.current;
  }, []);

  // Hook for Worker / Processing
  const {
    queueProcessing,
  } = useDitherWorker({
    activeSourceRef,
    originalUniqueColorsRef,
    previewingOriginalRef,
    outputCanvasRef,
    outputContextRef,
    outputReadyRef,
    outputModeRef,
    isWebcamModeRef,
    paletteFrozenForWebcamRef,
    watermarkEnabledRef,
    recoloredWatermarkCanvasRef,
    recoloredWatermarkMiniCanvasRef,
    lifecycleTokenRef,
    disposedRef,
    preserveVisibleOutput,
    extractProcessedPixels,
    updateOutputTexture,
    syncVisibleLayer,
    engineStateRef,
  });

  // Hook for Webcam
  const {
    initWebcam,
    cleanupWebcam,
  } = useWebcamManager({
    activeSourceRef,
    originalUniqueColorsRef,
    isWebcamModeRef,
    paletteFrozenForWebcamRef,
    lifecycleTokenRef,
    disposedRef,
    queueProcessing,
    engineStateRef,
  });

  // Hook for GIF timeline
  const {
    internalFrameSwapRef,
  } = useGifFrameManager({
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
  });

  // Observe show original changes
  useEffect(() => {
    previewingOriginalRef.current = showingOriginal;
    syncVisibleLayer();

    if (!showingOriginal && processingQueuedRef.current) {
      queueProcessing(false);
    }
  }, [queueProcessing, showingOriginal, syncVisibleLayer]);

  // Observe layout changes
  useEffect(() => {
    const handleLayoutChange = () => {
      if (!previewingOriginalRef.current) return;
      syncVisibleLayer();
      syncSplitOverlay();
    };

    window.addEventListener('split-compare-layout-changed', handleLayoutChange);
    return () => {
      window.removeEventListener('split-compare-layout-changed', handleLayoutChange);
    };
  }, [syncVisibleLayer, syncSplitOverlay]);

  // Initialize and load texture
  useEffect(() => {
    if (!sourceImg || !canvasHostRef.current || viewportCanvasRef.current) return;

    disposedRef.current = false;
    const lifecycleToken = ++lifecycleTokenRef.current;
    clearViewerLoadingTimer();
    useImageStore.getState().setViewerLoading(false);
    viewerLoadingTimerRef.current = window.setTimeout(() => {
      viewerLoadingTimerRef.current = null;
      if (lifecycleTokenRef.current !== lifecycleToken || disposedRef.current) return;
      useImageStore.getState().setViewerLoading(true);
    }, VIEWER_LOADING_VISIBILITY_DELAY_MS);

    async function init() {
      engineStateRef.current = 'LOADING';
      const isWebcam = sourceImg === WEBCAM_SOURCE;
      isWebcamModeRef.current = isWebcam;
      paletteFrozenForWebcamRef.current = false;

      let texture;

      if (isWebcam) {
        texture = await initWebcam(lifecycleToken);
        if (!texture) return;
        engineStateRef.current = 'STREAMING';
      } else {
        texture = await loadTexture(sourceImg);
        if (lifecycleTokenRef.current !== lifecycleToken) return;

        if (!texture) {
          throw new Error('Unable to create texture from source image');
        }
        activeSourceRef.current = texture;

        try {
          originalUniqueColorsRef.current = await countUniqueColorsFromImageSource(sourceImg);
        } catch (error) {
          console.error(error);
          originalUniqueColorsRef.current = 0;
        }
        engineStateRef.current = 'READY';
      }

      const width = texture.naturalWidth || texture.width || 0;
      const height = texture.naturalHeight || texture.height || 0;

      if (!width || !height) {
        throw new Error('Source image has invalid size');
      }

      const [watermarkTexture, watermarkMiniTexture] = await Promise.all([
        loadTexture(watermarkImage),
        loadTexture(watermarkMiniImage),
      ]);
      if (lifecycleTokenRef.current !== lifecycleToken) return;

      if (!watermarkTexture || !watermarkMiniTexture) {
        throw new Error('Unable to create texture from watermark image');
      }

      setSize({ width, height }, { resetCustom: true });

      const initialDisplaySize = getTargetDisplaySize();

      const viewportCanvas = document.createElement('canvas');
      viewportCanvas.width = initialDisplaySize.width;
      viewportCanvas.height = initialDisplaySize.height;
      viewportCanvas.style.position = 'absolute';
      viewportCanvas.style.inset = '0';
      viewportCanvas.style.display = 'block';
      viewportCanvas.style.imageRendering = 'pixelated';
      canvasHostRef.current.replaceChildren();
      canvasHostRef.current.appendChild(viewportCanvas);
      viewportCanvasRef.current = viewportCanvas;

      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.style.position = 'absolute';
      overlayCanvas.style.inset = '0';
      overlayCanvas.style.display = 'none';
      overlayCanvas.style.pointerEvents = 'none';
      overlayCanvas.style.imageRendering = 'auto';
      canvasHostRef.current.appendChild(overlayCanvas);
      splitOverlayCanvasRef.current = overlayCanvas;
      splitOverlayCtxRef.current = overlayCanvas.getContext('2d');

      if (!isWebcam) {
        const overlayImg = new Image();
        overlayImg.crossOrigin = 'anonymous';
        overlayImg.onload = () => {
          if (lifecycleTokenRef.current !== lifecycleToken || disposedRef.current) return;
          syncSplitOverlay();
        };
        overlayImg.src = sourceImg;
        splitOverlayImageRef.current = overlayImg;
      } else {
        splitOverlayImageRef.current = texture;
      }

      watermarkImgRef.current = watermarkTexture;
      watermarkMiniImgRef.current = watermarkMiniTexture;
      syncWatermarkPalette();

      applyDisplaySize(
        initialDisplaySize.width,
        initialDisplaySize.height,
        watermarkEnabledRef.current,
      );

      const initParams = useParamsStore.getState();

      const nextColorParams = {
        noiseCoverage: initParams.noiseCoverage,
        noiseIntensity: initParams.noiseIntensity,
        noiseSaturation: initParams.noiseSaturation,
        gamma: initParams.gamma,
        blacks: initParams.blacks,
        whites: initParams.whites,
        contrast: initParams.contrast,
        saturation: initParams.saturation,
        hue: initParams.hue,
      };
      previousColorParamsRef.current = nextColorParams;

      syncVisibleLayer();
      queueProcessing(true);
    }

    init().catch((error) => {
      engineStateRef.current = 'ERROR';
      clearViewerLoadingTimer();
      useImageStore.getState().setViewerLoading(false);
      console.error(error);
      if (!disposedRef.current && lifecycleTokenRef.current === lifecycleToken) {
        alert('Unable to load the selected image. Please try another file.');
      }
    });

    const markGifFramesPending = () => {
      const gifState = useGifStore.getState();
      if ((gifState.frames?.length || 0) > 1) {
        gifState.markAllPending();
      }
    };

    const unsubParams = useParamsStore.subscribe((state, previousState) => {
      const processingParamsChanged = !previousState || (
        state.noiseCoverage !== previousState.noiseCoverage ||
        state.noiseIntensity !== previousState.noiseIntensity ||
        state.noiseSaturation !== previousState.noiseSaturation ||
        state.gamma !== previousState.gamma ||
        state.blacks !== previousState.blacks ||
        state.whites !== previousState.whites ||
        state.contrast !== previousState.contrast ||
        state.saturation !== previousState.saturation ||
        state.hue !== previousState.hue ||
        state.blurStrength !== previousState.blurStrength ||
        state.edgeStrength !== previousState.edgeStrength ||
        state.passes !== previousState.passes
      );

      if (!processingParamsChanged) {
        return;
      }

      const nextColorParams = {
        noiseCoverage: state.noiseCoverage,
        noiseIntensity: state.noiseIntensity,
        noiseSaturation: state.noiseSaturation,
        gamma: state.gamma,
        blacks: state.blacks,
        whites: state.whites,
        contrast: state.contrast,
        saturation: state.saturation,
        hue: state.hue,
      };

      const prevColorParams = previousColorParamsRef.current;
      const colorParamsChanged = Boolean(
        prevColorParams && (
          prevColorParams.noiseCoverage !== nextColorParams.noiseCoverage ||
          prevColorParams.noiseIntensity !== nextColorParams.noiseIntensity ||
          prevColorParams.noiseSaturation !== nextColorParams.noiseSaturation ||
          prevColorParams.gamma !== nextColorParams.gamma ||
          prevColorParams.blacks !== nextColorParams.blacks ||
          prevColorParams.whites !== nextColorParams.whites ||
          prevColorParams.contrast !== nextColorParams.contrast ||
          prevColorParams.saturation !== nextColorParams.saturation ||
          prevColorParams.hue !== nextColorParams.hue
        )
      );

      previousColorParamsRef.current = nextColorParams;

      if (colorParamsChanged) {
        usePaletteStore.getState().clearPaletteCache?.();
      }

      markGifFramesPending();
      queueProcessing(true);
    });

    const unsubPalette = usePaletteStore.subscribe((state, previousState) => {
      syncWatermarkPalette();
      syncVisibleLayer();

      const methodChanged = state.method !== previousState.method;
      const colorCountChanged = state.colorCount !== previousState.colorCount;
      const samplingAccuracyChanged = state.samplingAccuracy !== previousState.samplingAccuracy;
      const colorsChanged = state.colors !== previousState.colors;
      const shouldRefreshPalette =
        state.method !== EXTRACT_METHOD.CUSTOM && (methodChanged || colorCountChanged || samplingAccuracyChanged);
      const shouldInvalidateFrames = methodChanged || colorCountChanged || samplingAccuracyChanged || colorsChanged;

      if (shouldInvalidateFrames) {
        markGifFramesPending();
      }
      queueProcessing(shouldRefreshPalette);
    });

    const unsubDither = useDitherStore.subscribe(() => {
      preserveVisibleOutput();
      markGifFramesPending();
      queueProcessing(false);
    });

    const unsubSize = useSizeStore.subscribe((state, previousState) => {
      const source = activeSourceRef.current;
      if (!source) return;

      const sourceW = source.naturalWidth || source.width || 1;
      const sourceH = source.naturalHeight || source.height || 1;

      const w = Math.max(
        1,
        Math.floor(Number(state.customSize.customWidth) || Number(state.size.width) || sourceW || 1),
      );
      const h = Math.max(
        1,
        Math.floor(Number(state.customSize.customHeight) || Number(state.size.height) || sourceH || 1),
      );

      const prevW = Math.max(
        1,
        Math.floor(
          Number(previousState?.customSize?.customWidth) ||
          Number(previousState?.size?.width) ||
          sourceW ||
          1,
        ),
      );
      const prevH = Math.max(
        1,
        Math.floor(
          Number(previousState?.customSize?.customHeight) ||
          Number(previousState?.size?.height) ||
          sourceH ||
          1,
        ),
      );

      const left = state.crop?.left || 0;
      const right = state.crop?.right || 0;
      const top = state.crop?.top || 0;
      const bottom = state.crop?.bottom || 0;

      const prevLeft = previousState?.crop?.left || 0;
      const prevRight = previousState?.crop?.right || 0;
      const prevTop = previousState?.crop?.top || 0;
      const prevBottom = previousState?.crop?.bottom || 0;

      if (w === prevW && h === prevH && left === prevLeft && right === prevRight && top === prevTop && bottom === prevBottom) {
        return;
      }

      const croppedW = Math.max(1, w - left - right);
      const croppedH = Math.max(1, h - top - bottom);

      applyDisplaySize(croppedW, croppedH, watermarkEnabledRef.current);
      syncSplitOverlay();

      if (!internalFrameSwapRef.current) {
        markGifFramesPending();
      }
      queueProcessing(true);
    });

    const unsubWatermark = useWatermarkStore.subscribe((state) => {
      watermarkEnabledRef.current = Boolean(state.enabled);
      syncWatermarkPalette();
      syncVisibleLayer();
    });

    return () => {
      engineStateRef.current = 'IDLE';
      disposedRef.current = true;
      lifecycleTokenRef.current += 1;
      registerPaletteReference(null);
      registerOutputCanvas(null);
      registerRenderSnapshot({ uniqueColors: 0, originalUniqueColors: 0 });

      clearViewerLoadingTimer();
      useImageStore.getState().setViewerLoading(false);

      cleanupWebcam();

      outputCanvasRef.current = null;
      outputContextRef.current = null;
      outputReadyRef.current = false;
      outputModeRef.current = 'none';
      setRenderProcessing(false);

      viewportCanvasRef.current = null;
      splitOverlayCanvasRef.current?.remove();
      splitOverlayCanvasRef.current = null;
      splitOverlayCtxRef.current = null;
      splitOverlayImageRef.current = null;

      unsubParams();
      unsubPalette();
      unsubDither();
      unsubSize();
      unsubWatermark();
    };
  }, [
    sourceImg,
    setSize,
    clearViewerLoadingTimer,
    syncWatermarkPalette,
    syncVisibleLayer,
    syncSplitOverlay,
    applyDisplaySize,
    queueProcessing,
    preserveVisibleOutput,
    initWebcam,
    cleanupWebcam,
    internalFrameSwapRef,
    setRenderProcessing,
  ]);

  return (
    <div
      ref={renderRef}
      className="relative flex items-center justify-center overflow-hidden bg-[#0a0a0a]"
      style={{ width: '100%', height: '100%' }}
    >
      <div
        ref={canvasHostRef}
        className="relative shadow-2xl"
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
    </div>
  );
}
