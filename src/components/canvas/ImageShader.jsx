import { useCallback, useEffect, useRef } from "react";
import useViewStore from "../../stores/ui/viewStore";
import useSizeStore from "../../stores/media/sizeStore";
import useParamsStore, { BLUR_CONTROLS } from "../../stores/data/paramsStore";
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
  registerSourceImage,
  registerPaletteReference,
  registerOutputCanvas,
} from "../../utils/canvasRegistry";
import watermarkImage from "../../assets/watermark/watermark.png";
import watermarkMiniImage from "../../assets/watermark/watermark-mini.png";

const MAX_PALETTE_SIZE = 64;
const PROCESSING_DEBOUNCE_MS = 48;
const PROCESSING_VISIBILITY_DELAY_MS = 100;
const VIEWER_LOADING_VISIBILITY_DELAY_MS = 100;
const DITHER_WORKER_TIMEOUT_MS = 10000;
const WATERMARK_MARGIN_NORMAL = 4;
const WATERMARK_MARGIN_MINI = 2;

function hexToRgbUnit(hex) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function getRgbLuminance([r, g, b]) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function getPaletteExtremes(colors, colorCount) {
  const normalized = normalizePalette(colors, colorCount);
  if (normalized.length === 0) {
    return {
      darkColor: [0, 0, 0],
      lightColor: [1, 1, 1],
    };
  }

  let darkest = hexToRgbUnit(normalized[0].hex);
  let lightest = darkest;
  let minLuma = getRgbLuminance(darkest);
  let maxLuma = minLuma;

  for (let i = 1; i < normalized.length; i += 1) {
    const rgb = hexToRgbUnit(normalized[i].hex);
    const luma = getRgbLuminance(rgb);
    if (luma < minLuma) {
      minLuma = luma;
      darkest = rgb;
    }
    if (luma > maxLuma) {
      maxLuma = luma;
      lightest = rgb;
    }
  }

  return {
    darkColor: darkest,
    lightColor: lightest,
  };
}

function normalizePalette(colors, colorCount) {
  const targetSize = Math.max(2, Math.min(MAX_PALETTE_SIZE, Number(colorCount) || 2));
  const active = colors.filter(color => !color.hidden);
  const picked = active.slice(0, targetSize);
  const fallback = picked[picked.length - 1] ?? active[0] ?? { hex: '#000000' };

  while (picked.length < targetSize) {
    picked.push(fallback);
  }

  return picked;
}

function drawWebcamFrameToCanvas(video, canvas, ctx, mirrored) {
  if (!video || !canvas || !ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mirrored) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function getDrawableDimensions(source) {
  if (!source) return null;

  const width = Number(
    source.videoWidth
    ?? source.naturalWidth
    ?? source.width
    ?? 0,
  );
  const height = Number(
    source.videoHeight
    ?? source.naturalHeight
    ?? source.height
    ?? 0,
  );

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

async function loadTexture(sourceImg) {
  if (!sourceImg) return null;

  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image source'));
    image.src = sourceImg;
  });

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Loaded image has invalid dimensions');
  }

  return image;
}

function countUniqueColorsFromPixels(pixels) {
  const unique = new Set();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    unique.add((pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2]);
  }

  return unique.size;
}

function captureThumbnailDataUrl(sourceCanvas, targetWidth = 60) {
  if (!sourceCanvas) return '';

  const width = Math.max(1, Math.floor(Number(sourceCanvas.width) || 1));
  const height = Math.max(1, Math.floor(Number(sourceCanvas.height) || 1));
  const scale = targetWidth / width;
  const targetHeight = Math.max(1, Math.round(height * scale));

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = targetWidth;
  thumbCanvas.height = targetHeight;

  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return thumbCanvas.toDataURL('image/png');
}

async function countUniqueColorsFromImageSource(sourceImg) {
  if (!sourceImg) return 0;

  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load source image for color counting'));
    image.src = sourceImg;
  });

  const width = Math.max(1, Number(image.naturalWidth) || 1);
  const height = Math.max(1, Number(image.naturalHeight) || 1);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 0;

  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return countUniqueColorsFromPixels(imageData.data);
}

function getTargetDisplaySize() {
  const { size, customSize, crop } = useSizeStore.getState();
  const width = Math.max(1, Math.floor(Number(customSize.customWidth) || Number(size.width) || 1));
  const height = Math.max(1, Math.floor(Number(customSize.customHeight) || Number(size.height) || 1));

  const left = crop?.left || 0;
  const right = crop?.right || 0;
  const top = crop?.top || 0;
  const bottom = crop?.bottom || 0;

  return {
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

function generateRecoloredWatermark(watermarkImg, darkColor, lightColor) {
  if (!watermarkImg) return null;
  const canvas = document.createElement('canvas');
  canvas.width = watermarkImg.width;
  canvas.height = watermarkImg.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(watermarkImg, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const dr = darkColor[0] * 255;
  const dg = darkColor[1] * 255;
  const db = darkColor[2] * 255;

  const lr = lightColor[0] * 255;
  const lg = lightColor[1] * 255;
  const lb = lightColor[2] * 255;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    const a = data[i+3];
    if (a === 0) continue;

    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;

    data[i] = dr + (lr - dr) * luma;
    data[i+1] = dg + (lg - dg) * luma;
    data[i+2] = db + (lb - db) * luma;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export default function ShaderImage({ sourceImg }) {
  const setSize = useSizeStore(s => s.setSize);
  const nativeWidth = useSizeStore(s => s.size.width);
  const nativeHeight = useSizeStore(s => s.size.height);
  const customWidth = useSizeStore(s => s.customSize.customWidth);
  const customHeight = useSizeStore(s => s.customSize.customHeight);
  const setRenderProcessing = useProcessingStore(s => s.setRenderProcessing);
  const previewingOriginal = useViewStore(s => s.previewingOriginal);
  const showingOriginal = Boolean(previewingOriginal);
  const previewingOriginalRef = useRef(showingOriginal);

  const renderRef = useRef(null);
  const canvasHostRef = useRef(null);
  const viewportCanvasRef = useRef(null);
  const activeSourceRef = useRef(null);
  const watermarkImgRef = useRef(null);
  const watermarkMiniImgRef = useRef(null);
  const recoloredWatermarkCanvasRef = useRef(null);
  const recoloredWatermarkMiniCanvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const outputContextRef = useRef(null);
  const frameCanvasRef = useRef(null);
  const frameContextRef = useRef(null);
  const workerRef = useRef(null);
  const restartDitherWorkerRef = useRef(null);
  const ditherJobTimeoutsRef = useRef(new Map());
  const latestRequestIdRef = useRef(0);
  const activeJobsRef = useRef(0);
  const refreshPaletteForRequestRef = useRef(new Map());
  const ditherEnabledForRequestRef = useRef(new Map());
  const gifFrameForRequestRef = useRef(new Map());
  const disposedRef = useRef(false);
  const lifecycleTokenRef = useRef(0);
  const outputReadyRef = useRef(false);
  const outputModeRef = useRef('none');
  const processingTimerRef = useRef(null);
  const processingVisibilityTimerRef = useRef(null);
  const viewerLoadingTimerRef = useRef(null);
  const processingVisibleRef = useRef(false);
  const processingQueuedRef = useRef(false);
  const pendingPaletteRefreshRef = useRef(false);
  const previousColorParamsRef = useRef(null);
  const originalUniqueColorsRef = useRef(0);
  const watermarkEnabledRef = useRef(Boolean(useWatermarkStore.getState().enabled));
  const internalFrameSwapRef = useRef(false);
  
  // Performance tracking
  // Webcam
  const webcamVideoRef = useRef(null);
  const webcamCanvasRef = useRef(null);
  const webcamCtxRef = useRef(null);
  const webcamLoopTimerRef = useRef(null);
  const isWebcamModeRef = useRef(false);
  const paletteFrozenForWebcamRef = useRef(false);
  const webcamMirrorRef = useRef(Boolean(useWebcamStore.getState().mirrored));
  const noiseFrameRef = useRef(0);

  // Split overlay
  const splitOverlayCanvasRef = useRef(null);
  const splitOverlayCtxRef = useRef(null);
  const splitOverlayImageRef = useRef(null);

  // Performance tracking
  const workerStartTimeRef = useRef(new Map());
  const textureUpdateStartTimeRef = useRef(new Map());

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

  const setProcessingVisible = useCallback((visible) => {
    processingVisibleRef.current = visible;
    setRenderProcessing(visible);
  }, [setRenderProcessing]);

  const clearViewerLoadingTimer = useCallback(() => {
    if (viewerLoadingTimerRef.current !== null) {
      window.clearTimeout(viewerLoadingTimerRef.current);
      viewerLoadingTimerRef.current = null;
    }
  }, []);

  const setProcessingDelta = useCallback((delta) => {
    activeJobsRef.current = Math.max(0, activeJobsRef.current + delta);

    if (activeJobsRef.current > 0) {
      if (!processingVisibleRef.current && processingVisibilityTimerRef.current === null) {
        processingVisibilityTimerRef.current = window.setTimeout(() => {
          processingVisibilityTimerRef.current = null;
          if (activeJobsRef.current > 0) {
            setProcessingVisible(true);
          }
        }, PROCESSING_VISIBILITY_DELAY_MS);
      }
      return;
    }

    if (processingVisibilityTimerRef.current !== null) {
      window.clearTimeout(processingVisibilityTimerRef.current);
      processingVisibilityTimerRef.current = null;
    }

    useImageStore.getState().setViewerLoading(false);
    setProcessingVisible(false);
  }, [setProcessingVisible]);

  // Draws the original (unprocessed) source image into a 2D canvas overlay that sits on top
  // of the viewport canvas for hold-to-compare only.
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

    // Draw the cropped sub-rectangle of the original image
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

    // Not in compare mode — hide the overlay.
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
  }, [syncSplitOverlay]);

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

  const dispatchProcessing = useCallback((refreshPalette = false) => {
    const worker = workerRef.current;
    if (!worker || activeJobsRef.current > 0) return;

    if (previewingOriginalRef.current) return;

    usePerformanceStore.getState().setPipelineStart();

    const paletteState = usePaletteStore.getState();
    const paletteColors = normalizePalette(paletteState.colors, paletteState.colorCount);
    const paletteRgb = paletteColors.map(color => hexToRgbUnit(color.hex));
    const ditherState = useDitherStore.getState();
    const ditherEnabled = Boolean(ditherState.enabled);
    const gifState = useGifStore.getState();
    const frameIndex = gifState.frames.length > 1 ? gifState.currentFrameIndex : -1;

    noiseFrameRef.current += 1;

    preserveVisibleOutput();

    let extraction;
    let extractionStartTime;

    try {
      extractionStartTime = performance.now();
      extraction = extractProcessedPixels();
      const extractionDuration = performance.now() - extractionStartTime;
      usePerformanceStore.getState().recordExtractionEnd(extractionDuration);
    } catch (error) {
      console.error(error);
      preserveVisibleOutput();
      return;
    }

    const requestId = ++latestRequestIdRef.current;
    refreshPaletteForRequestRef.current.set(requestId, refreshPalette);
    ditherEnabledForRequestRef.current.set(requestId, ditherEnabled);
    gifFrameForRequestRef.current.set(requestId, frameIndex);
    if (frameIndex >= 0) {
      gifState.markFrameRendering(frameIndex);
    }
    setProcessingDelta(1);
    usePerformanceStore.getState().setCurrentPhase('dithering');

    const workerStartTime = performance.now();
    workerStartTimeRef.current.set(requestId, workerStartTime);

    try {
      const timeoutId = window.setTimeout(() => {
        if (disposedRef.current) return;
        if (workerStartTimeRef.current.has(requestId)) {
          console.error(`[pipeline] dither worker timeout on job ${requestId} after ${DITHER_WORKER_TIMEOUT_MS}ms`);
          restartDitherWorkerRef.current?.(requestId, 'timeout', new Error('Timed out waiting dither worker response'));
        }
      }, DITHER_WORKER_TIMEOUT_MS);
      ditherJobTimeoutsRef.current.set(requestId, timeoutId);

      const sizeState = useSizeStore.getState();
      const crop = sizeState.crop || { top: 0, bottom: 0, left: 0, right: 0 };
      const paramsState = useParamsStore.getState();

      worker.postMessage({
        jobId: requestId,
        processedPixels: extraction.pixels.buffer,
        width: extraction.width,
        height: extraction.height,
        paletteRgb,
        forceCpu: paramsState.forceCpu,
        dither: {
          enabled: ditherEnabled,
          method: ditherState.method,
          amount: ditherState.amount,
          seed: ditherState.seed,
          matrixScale: ditherState.matrixScale,
        },
        crop: {
          top: crop.top || 0,
          bottom: crop.bottom || 0,
          left: crop.left || 0,
          right: crop.right || 0,
        },
        adjustments: {
          gamma: paramsState.gamma,
          blacks: paramsState.blacks,
          whites: paramsState.whites,
          contrast: paramsState.contrast,
          saturation: paramsState.saturation,
          hue: paramsState.hue,
        },
        noise: {
          noiseCoverage: paramsState.noiseCoverage,
          noiseIntensity: paramsState.noiseIntensity,
          noiseSaturation: paramsState.noiseSaturation,
          noisePhase: noiseFrameRef.current,
        },
        blur: {
          blurStrength: paramsState.blurStrength,
          edgeStrength: paramsState.edgeStrength,
          passes: paramsState.passes,
        },
      }, [extraction.pixels.buffer]);
    } catch (error) {
      const timeoutId = ditherJobTimeoutsRef.current.get(requestId);
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        ditherJobTimeoutsRef.current.delete(requestId);
      }
      console.error(error);
      gifFrameForRequestRef.current.delete(requestId);
      setProcessingDelta(-1);
      preserveVisibleOutput();
    }
  }, [setProcessingDelta]);

  const flushProcessingQueue = useCallback(() => {
    if (processingTimerRef.current !== null) {
      window.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }

    if (activeJobsRef.current > 0) {
      processingQueuedRef.current = true;
      return;
    }

    const shouldRefreshPalette = pendingPaletteRefreshRef.current;
    pendingPaletteRefreshRef.current = false;
    processingQueuedRef.current = false;
    dispatchProcessing(shouldRefreshPalette);
  }, [dispatchProcessing]);

  const queueProcessing = useCallback((refreshPalette = false) => {
    pendingPaletteRefreshRef.current = pendingPaletteRefreshRef.current || refreshPalette;
    processingQueuedRef.current = true;

    if (previewingOriginalRef.current) {
      return;
    }

    if (isWebcamModeRef.current) {
      flushProcessingQueue();
      return;
    }

    if (processingTimerRef.current !== null) {
      return;
    }

    processingTimerRef.current = window.setTimeout(() => {
      flushProcessingQueue();
    }, PROCESSING_DEBOUNCE_MS);
  }, [flushProcessingQueue]);

  useEffect(() => {
    previewingOriginalRef.current = showingOriginal;
    syncVisibleLayer();

    if (!showingOriginal && processingQueuedRef.current) {
      queueProcessing(false);
    }
  }, [queueProcessing, showingOriginal, syncVisibleLayer]);

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
    const shouldForceRefresh = pendingPaletteRefreshRef.current;
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
  }, [queueProcessing, setSize, syncVisibleLayer, updateOutputTexture]);

  useEffect(() => {
    registerSourceImage(sourceImg || null);
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
      const isWebcam = sourceImg === WEBCAM_SOURCE;
      isWebcamModeRef.current = isWebcam;
      paletteFrozenForWebcamRef.current = false;

      let texture;

      if (isWebcam) {
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
          return;
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
        texture = webcamCanvas;
        activeSourceRef.current = webcamCanvas;
        originalUniqueColorsRef.current = 0;
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
        splitOverlayImageRef.current = webcamCanvasRef.current;
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

      const clearDitherJobTimeout = (jobId) => {
        const timeoutId = ditherJobTimeoutsRef.current.get(jobId);
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
          ditherJobTimeoutsRef.current.delete(jobId);
        }
      };

      const clearDitherJobTracking = (jobId) => {
        clearDitherJobTimeout(jobId);
        workerStartTimeRef.current.delete(jobId);
        textureUpdateStartTimeRef.current.delete(jobId);
        refreshPaletteForRequestRef.current.delete(jobId);
        ditherEnabledForRequestRef.current.delete(jobId);
        gifFrameForRequestRef.current.delete(jobId);
      };

      let worker = null;

      const recoverFromWorkerFailure = (jobId, reason, error = null) => {
        const hadTrackedJob = workerStartTimeRef.current.has(jobId) || ditherJobTimeoutsRef.current.has(jobId);
        clearDitherJobTracking(jobId);
        usePerformanceStore.getState().setCurrentPhase(null);
        usePerformanceStore.getState().recordPipelineComplete();

        if (hadTrackedJob) {
          setProcessingDelta(-1);
        }

        if (jobId === latestRequestIdRef.current) {
          preserveVisibleOutput();
          if (processingQueuedRef.current) {
            queueProcessing(false);
          }
        }

        const errorMessage = error?.message || String(error || reason || 'Unknown worker failure');
        console.error(`[pipeline] dither worker failed on job ${jobId}: ${errorMessage}`);

        try {
          worker?.terminate();
        } catch {
          // Worker may already be terminated.
        }

        worker = new Worker(new URL('../../workers/ditherWorker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        bindWorkerHandlers(worker);
        console.warn(`[pipeline] restarted dither worker after ${reason} (job ${jobId})`);
      };

      restartDitherWorkerRef.current = recoverFromWorkerFailure;
      const bindWorkerHandlers = (targetWorker) => {
        targetWorker.onmessage = async (event) => {
          if (lifecycleTokenRef.current !== lifecycleToken) return;

          const {
            jobId,
            referencePixels,
            outputPixels,
            width: outWidth,
            height: outHeight,
            uniqueColorCount,
            histogram,
            error,
            isImageReady,
            isStatsReady,
          } = event.data;

          const latestId = latestRequestIdRef.current;

          if (jobId !== latestId) {
            if (isImageReady) {
              setProcessingDelta(-1);
              if (processingQueuedRef.current) {
                queueProcessing(false);
              }
            }
            return;
          }

          if (error || disposedRef.current) {
            if (error) console.error(error);
            preserveVisibleOutput();
            setProcessingDelta(-1);
            if (processingQueuedRef.current) {
              queueProcessing(false);
            }
            return;
          }

          const shouldRefreshPalette = refreshPaletteForRequestRef.current.get(jobId);
          const wasDitherEnabled = Boolean(ditherEnabledForRequestRef.current.get(jobId));
          const gifFrameIndex = gifFrameForRequestRef.current.get(jobId);

          if (isImageReady) {
            clearDitherJobTimeout(jobId);

            const workerStartTime = workerStartTimeRef.current.get(jobId);
            if (workerStartTime) {
              const workerDuration = performance.now() - workerStartTime;
              usePerformanceStore.getState().recordDithering(workerDuration);
              workerStartTimeRef.current.delete(jobId);
            }

            if (event.data.timings) {
              const { noise, adjustment, blur, dithering } = event.data.timings;
              usePerformanceStore.setState((state) => ({
                timing: {
                  ...state.timing,
                  noise: noise || 0,
                  adjustment: adjustment || 0,
                  blur: blur || 0,
                  dithering: dithering || 0,
                }
              }));
            }

            const output = new Uint8ClampedArray(outputPixels);

            const textureUpdateStart = performance.now();
            usePerformanceStore.getState().setCurrentPhase('texture');
            updateOutputTexture(output, outWidth, outHeight);
            textureUpdateStartTimeRef.current.set(jobId, textureUpdateStart);
            const textureUpdateDuration = performance.now() - textureUpdateStart;
            usePerformanceStore.getState().recordTextureUpdate(textureUpdateDuration);

            outputModeRef.current = wasDitherEnabled ? 'dither' : 'clean';
            outputReadyRef.current = true;

            if (gifFrameIndex >= 0) {
              const thumbnailUrl = captureThumbnailDataUrl(outputCanvasRef.current, 60);
              const cachedFrame = {
                width: outWidth,
                height: outHeight,
                pixels: new Uint8ClampedArray(output),
                uniqueColors: uniqueColorCount ?? 0,
              };
              if (thumbnailUrl) {
                useGifStore.getState().markFrameRendered(gifFrameIndex, thumbnailUrl, cachedFrame);
              } else {
                useGifStore.getState().markFrameRendered(gifFrameIndex, '', cachedFrame);
              }
            }

            const syncStart = performance.now();
            usePerformanceStore.getState().setCurrentPhase('sync');
            syncVisibleLayer();
            const syncDuration = performance.now() - syncStart;
            usePerformanceStore.getState().recordLayerSync(syncDuration);

            usePerformanceStore.getState().recordPipelineComplete();

            if (isWebcamModeRef.current) {
              useWebcamStore.getState().recordRenderedFrame();

              if (!paletteFrozenForWebcamRef.current) {
                paletteFrozenForWebcamRef.current = true;
                const paletteState = usePaletteStore.getState();
                if (paletteState.method !== EXTRACT_METHOD.CUSTOM) {
                  paletteState.generatePalette().then(() => {
                    usePaletteStore.getState().setMethod(EXTRACT_METHOD.CUSTOM);
                    useWebcamStore.getState().setPaletteFrozen(true);
                  }).catch(() => {
                    useWebcamStore.getState().setPaletteFrozen(true);
                  });
                } else {
                  useWebcamStore.getState().setPaletteFrozen(true);
                }
              }
            }

            ditherEnabledForRequestRef.current.delete(jobId);

            if (!shouldRefreshPalette) {
              setProcessingDelta(-1);
              if (processingQueuedRef.current) {
                queueProcessing(false);
              }
            }
          }

          if (isStatsReady) {
            const reference = new Uint8ClampedArray(referencePixels);
            registerPaletteReference({
              width: outWidth,
              height: outHeight,
              pixels: reference,
              histogram: histogram,
            });
            registerRenderSnapshot({
              uniqueColors: uniqueColorCount ?? 0,
              originalUniqueColors: originalUniqueColorsRef.current,
            });

            if (gifFrameIndex >= 0) {
              const gifState = useGifStore.getState();
              const existingFrame = gifState.frames[gifFrameIndex];
              if (existingFrame) {
                useGifStore.getState().markFrameRendered(gifFrameIndex, existingFrame.thumbnailUrl, {
                  ...existingFrame.cachedFrame,
                  uniqueColors: uniqueColorCount ?? 0,
                });
              }
            }

            refreshPaletteForRequestRef.current.delete(jobId);
            gifFrameForRequestRef.current.delete(jobId);

            if (shouldRefreshPalette) {
              try {
                const paletteState = usePaletteStore.getState();
                await paletteState.generatePalette();
              } catch (err) {
                console.error('[pipeline] palette generation failed:', err);
              }
              setProcessingDelta(-1);
              if (processingQueuedRef.current) {
                queueProcessing(false);
              }
            }
          }
        };

        targetWorker.onerror = (event) => {
          const jobId = latestRequestIdRef.current;
          recoverFromWorkerFailure(jobId, 'error', event?.error || new Error(event?.message || 'Worker runtime error'));
        };

        targetWorker.onmessageerror = (event) => {
          const jobId = latestRequestIdRef.current;
          recoverFromWorkerFailure(jobId, 'messageerror', event?.data || new Error('Worker message deserialization failed'));
        };
      };

      worker = new Worker(new URL('../../workers/ditherWorker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      bindWorkerHandlers(worker);

      syncVisibleLayer();
      queueProcessing(true);

      if (isWebcam) {
        const scheduleWebcamFrame = () => {
          if (disposedRef.current || lifecycleTokenRef.current !== lifecycleToken) return;
          const { targetFps } = useWebcamStore.getState();
          const interval = Math.max(33, Math.round(1000 / targetFps));

          webcamLoopTimerRef.current = window.setTimeout(() => {
            webcamLoopTimerRef.current = null;
            if (disposedRef.current || lifecycleTokenRef.current !== lifecycleToken) return;

            const video = webcamVideoRef.current;
            const canvas = webcamCanvasRef.current;
            const ctx = webcamCtxRef.current;

            if (video && canvas && ctx && video.readyState >= 2) {
              drawWebcamFrameToCanvas(video, canvas, ctx, webcamMirrorRef.current);
            }

            queueProcessing(false);

            scheduleWebcamFrame();
          }, interval);
        };

        scheduleWebcamFrame();
      }
    }

    init().catch((error) => {
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
        if (webcamLoopTimerRef.current !== null) {
          window.clearTimeout(webcamLoopTimerRef.current);
          webcamLoopTimerRef.current = null;
        }
        Promise.resolve().then(() => {
          useImageStore.getState().resetToDefault();
        });
      }
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
      disposedRef.current = true;
      lifecycleTokenRef.current += 1;
      registerSourceImage(null);
      registerPaletteReference(null);
      registerOutputCanvas(null);
      registerRenderSnapshot({ uniqueColors: 0, originalUniqueColors: 0 });

      if (processingTimerRef.current !== null) {
        window.clearTimeout(processingTimerRef.current);
        processingTimerRef.current = null;
      }

      if (processingVisibilityTimerRef.current !== null) {
        window.clearTimeout(processingVisibilityTimerRef.current);
        processingVisibilityTimerRef.current = null;
      }

      clearViewerLoadingTimer();
      useImageStore.getState().setViewerLoading(false);

      workerRef.current?.terminate();
      for (const timeoutId of ditherJobTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      ditherJobTimeoutsRef.current.clear();
      restartDitherWorkerRef.current = null;

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

      workerRef.current = null;

      outputCanvasRef.current = null;
      outputContextRef.current = null;
      outputReadyRef.current = false;
      outputModeRef.current = 'none';
      activeJobsRef.current = 0;
      setProcessingVisible(false);
      workerStartTimeRef.current.clear();
      textureUpdateStartTimeRef.current.clear();
      refreshPaletteForRequestRef.current.clear();
      ditherEnabledForRequestRef.current = new Map();
      gifFrameForRequestRef.current = new Map();
      frameCanvasRef.current = null;
      frameContextRef.current = null;
      setProcessingVisible(false);

      viewportCanvasRef.current = null;
      splitOverlayCanvasRef.current?.remove();
      splitOverlayCanvasRef.current = null;
      splitOverlayCtxRef.current = null;
      splitOverlayImageRef.current = null;

      unsubParams();
      unsubWebcam();
      unsubPalette();
      unsubDither();
      unsubSize();
      unsubWatermark();
      unsubGif();
    };
  }, [clearViewerLoadingTimer, preserveVisibleOutput, queueProcessing, setProcessingDelta, setProcessingVisible, setSize, sourceImg, swapSourceFrame, syncSplitOverlay, syncVisibleLayer, syncWatermarkPalette, updateOutputTexture]);

  const crop = useSizeStore(s => s.crop) || { top: 0, bottom: 0, left: 0, right: 0 };
  const { top = 0, bottom = 0, left = 0, right = 0 } = crop;

  const scaleX = customWidth ? (nativeWidth / customWidth) : 1;
  const scaleY = customHeight ? (nativeHeight / customHeight) : 1;
  const nativeLeft = Math.round(left * scaleX);
  const nativeRight = Math.round(right * scaleX);
  const nativeTop = Math.round(top * scaleY);
  const nativeBottom = Math.round(bottom * scaleY);

  const renderWidth = showingOriginal
    ? Math.max(1, (Number(nativeWidth) || Number(customWidth) || 1) - nativeLeft - nativeRight)
    : Math.max(1, (Number(customWidth) || Number(nativeWidth) || 1) - left - right);
  const renderHeight = showingOriginal
    ? Math.max(1, (Number(nativeHeight) || Number(customHeight) || 1) - nativeTop - nativeBottom)
    : Math.max(1, (Number(customHeight) || Number(nativeHeight) || 1) - top - bottom);

  return (
    <div ref={renderRef} style={{ width: renderWidth, height: renderHeight, position: 'relative' }} id='render'>
      {sourceImg !== WEBCAM_SOURCE && (
        <img
          src={sourceImg}
          alt=""
          aria-hidden="true"
          className="render-underlay"
          style={{
            visibility: 'hidden',
            opacity: 1,
          }}
        />
      )}
      <div
        ref={canvasHostRef}
        className="render-canvas-layer"
        style={{
          visibility: 'visible',
          opacity: 1,
          position: 'absolute',
          inset: '0',
        }}
      />
    </div>
  );
}
