import { useCallback, useEffect, useRef } from "react";
import useViewStore from "../stores/viewStore";
import {
  Application,
  Sprite,
  Filter,
  GlProgram,
  Texture,
  TextureStyle,
} from "pixi.js";

import base_vertex from '../shaders/base_vertex.glsl?raw'
import color_adjustments from '../shaders/color_adjustments.glsl?raw'
import kawase_blur from '../shaders/kawase_blur.glsl?raw'
import useSizeStore from "../stores/sizeStore";
import useParamsStore, { BLUR_CONTROLS } from "../stores/paramsStore";
import usePaletteStore, { EXTRACT_METHOD } from "../stores/paletteStore";
import useDitherStore from "../stores/ditherStore";
import useGifStore from "../stores/gifStore";
import useProcessingStore from "../stores/processingStore";
import usePerformanceStore from "../stores/performanceStore";
import useWatermarkStore from "../stores/watermarkStore";
import useImageStore from "../stores/imageStore";
import useWebcamStore, { WEBCAM_SOURCE } from "../stores/webcamStore";
import {
  registerPixiApp,
  registerRenderSnapshot,
  registerSourceImage,
  registerPaletteReference,
  registerOutputCanvas,
} from "../utils/pixiRegistry";
import watermarkImage from "../assets/water-mark.png";
import watermarkMiniImage from "../assets/water-mark-mini.png";

const watermark_palette_fragment = `
in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform vec3 uDarkColor;
uniform vec3 uLightColor;

out vec4 finalColor;

void main()
{
  vec4 tex = texture(uTexture, vTextureCoord);
  float luminance = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = mix(uDarkColor, uLightColor, luminance);
  finalColor = vec4(mapped, tex.a);
}
`;

const MAX_PALETTE_SIZE = 64;
const PROCESSING_DEBOUNCE_MS = 48;
const PROCESSING_VISIBILITY_DELAY_MS = 100;
const VIEWER_LOADING_VISIBILITY_DELAY_MS = 100;
const DITHER_WORKER_TIMEOUT_MS = 10000;
const WATERMARK_MARGIN_NORMAL = 4;
const WATERMARK_MARGIN_MINI = 2;

// scaleMode 'nearest' is applied only to the dithered output texture, not globally.

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

function buildFilterChain(colorFilter, blurFilters, blurStrength, blurPasses) {
  if (!Array.isArray(blurFilters) || blurFilters.length === 0 || Number(blurStrength) <= 0) {
    return [colorFilter];
  }

  const passCount = Math.max(1, Math.floor(blurPasses));
  return [colorFilter, ...blurFilters.slice(0, passCount)];
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

function resolveContainDrawRect(sourceWidth, sourceHeight, displayWidth, displayHeight) {
  const safeSourceWidth = Math.max(1, Number(sourceWidth) || 1);
  const safeSourceHeight = Math.max(1, Number(sourceHeight) || 1);
  const safeDisplayWidth = Math.max(1, Number(displayWidth) || 1);
  const safeDisplayHeight = Math.max(1, Number(displayHeight) || 1);

  // Draw source at native size (1:1). If it exceeds viewport bounds,
  // canvas clipping will crop it rather than scaling it.
  const width = safeSourceWidth;
  const height = safeSourceHeight;

  return {
    x: Math.round((safeDisplayWidth - width) / 2),
    y: Math.round((safeDisplayHeight - height) / 2),
    width,
    height,
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

  return Texture.from(image);
}

function resolveExtractDimensions(pixelLength, preferredWidth, preferredHeight) {
  const pixelCount = Math.floor(pixelLength / 4);
  let width = Math.max(1, Math.floor(preferredWidth));
  let height = Math.max(1, Math.floor(preferredHeight));

  if (width * height === pixelCount) {
    return { width, height };
  }

  if (pixelCount % width === 0) {
    return { width, height: Math.floor(pixelCount / width) };
  }

  if (pixelCount % height === 0) {
    return { width: Math.floor(pixelCount / height), height };
  }

  width = Math.max(1, Math.floor(Math.sqrt(pixelCount)));
  while (width > 1 && pixelCount % width !== 0) {
    width -= 1;
  }

  return {
    width,
    height: Math.max(1, Math.floor(pixelCount / width)),
  };
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

function extractProcessedPixels(
  app,
  sourceSprite,
  originalSprite,
  outputSprite,
  watermarkSprite,
  watermarkMiniSprite,
  splitMaskLeft = null,
  splitMaskRight = null,
) {
  const sizeState = useSizeStore.getState();
  const left = sizeState.crop?.left || 0;
  const right = sizeState.crop?.right || 0;
  const top = sizeState.crop?.top || 0;
  const bottom = sizeState.crop?.bottom || 0;
  const hasCrop = left > 0 || right > 0 || top > 0 || bottom > 0;

  const customW = sizeState.customSize.customWidth || app.renderer.width;
  const customH = sizeState.customSize.customHeight || app.renderer.height;

  const prevSourceVisible = sourceSprite.visible;
  const prevOriginalVisible = originalSprite?.visible;
  const prevOutputVisible = outputSprite.visible;
  const prevSourceMask = sourceSprite.mask;
  const prevOutputMask = outputSprite.mask;
  const prevWatermarkVisible = watermarkSprite?.visible;
  const prevWatermarkMiniVisible = watermarkMiniSprite?.visible;
  const prevSplitLeftVisible = splitMaskLeft?.visible;
  const prevSplitRightVisible = splitMaskRight?.visible;

  const prevSourceX = sourceSprite.x;
  const prevSourceY = sourceSprite.y;
  const prevSourceW = sourceSprite.width;
  const prevSourceH = sourceSprite.height;
  const prevRendererW = app.renderer.width;
  const prevRendererH = app.renderer.height;

  if (hasCrop) {
    app.renderer.resize(customW, customH);
    sourceSprite.x = 0;
    sourceSprite.y = 0;
    sourceSprite.width = customW;
    sourceSprite.height = customH;
  }

  sourceSprite.visible = true;
  if (originalSprite) originalSprite.visible = false;
  outputSprite.visible = false;
  sourceSprite.mask = null;
  outputSprite.mask = null;
  if (watermarkSprite) watermarkSprite.visible = false;
  if (watermarkMiniSprite) watermarkMiniSprite.visible = false;
  if (splitMaskLeft) splitMaskLeft.visible = false;
  if (splitMaskRight) splitMaskRight.visible = false;

  const extracted = app.renderer.extract.pixels({ target: app.stage });

  if (hasCrop) {
    app.renderer.resize(prevRendererW, prevRendererH);
    sourceSprite.x = prevSourceX;
    sourceSprite.y = prevSourceY;
    sourceSprite.width = prevSourceW;
    sourceSprite.height = prevSourceH;
  }

  sourceSprite.visible = prevSourceVisible;
  if (originalSprite && typeof prevOriginalVisible === 'boolean') {
    originalSprite.visible = prevOriginalVisible;
  }
  outputSprite.visible = prevOutputVisible;
  sourceSprite.mask = prevSourceMask;
  outputSprite.mask = prevOutputMask;
  if (watermarkSprite && typeof prevWatermarkVisible === 'boolean') {
    watermarkSprite.visible = prevWatermarkVisible;
  }
  if (watermarkMiniSprite && typeof prevWatermarkMiniVisible === 'boolean') {
    watermarkMiniSprite.visible = prevWatermarkMiniVisible;
  }
  if (splitMaskLeft && typeof prevSplitLeftVisible === 'boolean') {
    splitMaskLeft.visible = prevSplitLeftVisible;
  }
  if (splitMaskRight && typeof prevSplitRightVisible === 'boolean') {
    splitMaskRight.visible = prevSplitRightVisible;
  }

  const pixels = extracted?.pixels ?? extracted;
  const buffer = new Uint8ClampedArray(pixels);
  const { width, height } = resolveExtractDimensions(buffer.length, customW, customH);

  return { pixels: buffer, width, height };
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

function applyDisplaySize(
  app,
  sourceSprite,
  outputSprite,
  width,
  height,
  watermarkSprite = null,
  watermarkMiniSprite = null,
  watermarkEnabled = true,
) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));

  app.renderer.resize(safeWidth, safeHeight);

  if (app.canvas) {
    app.canvas.style.width = `${safeWidth}px`;
    app.canvas.style.height = `${safeHeight}px`;
    app.canvas.style.imageRendering = 'pixelated';
  }

  const sizeState = useSizeStore.getState();
  const left = sizeState.crop?.left || 0;
  const right = sizeState.crop?.right || 0;
  const top = sizeState.crop?.top || 0;
  const bottom = sizeState.crop?.bottom || 0;
  const hasCrop = left > 0 || right > 0 || top > 0 || bottom > 0;

  if (sourceSprite) {
    if (hasCrop) {
      const customW = sizeState.customSize.customWidth || safeWidth;
      const customH = sizeState.customSize.customHeight || safeHeight;
      sourceSprite.x = -left;
      sourceSprite.y = -top;
      sourceSprite.width = customW;
      sourceSprite.height = customH;
    } else {
      sourceSprite.x = 0;
      sourceSprite.y = 0;
      sourceSprite.width = safeWidth;
      sourceSprite.height = safeHeight;
    }
  }

  if (outputSprite) {
    outputSprite.x = 0;
    outputSprite.y = 0;
    outputSprite.width = safeWidth;
    outputSprite.height = safeHeight;
  }

  if (watermarkSprite) {
    watermarkSprite.scale.set(1);
    watermarkSprite.position.set(
      safeWidth - WATERMARK_MARGIN_NORMAL,
      safeHeight - WATERMARK_MARGIN_NORMAL,
    );
  }

  if (watermarkMiniSprite) {
    watermarkMiniSprite.scale.set(1);
    watermarkMiniSprite.position.set(
      safeWidth - WATERMARK_MARGIN_MINI,
      safeHeight - WATERMARK_MARGIN_MINI,
    );
  }

  const useMiniWatermark = safeWidth < 64 || safeHeight < 64;
  if (watermarkSprite) {
    watermarkSprite.visible = watermarkEnabled && !useMiniWatermark;
  }
  if (watermarkMiniSprite) {
    watermarkMiniSprite.visible = watermarkEnabled && useMiniWatermark;
  }

  return { width: safeWidth, height: safeHeight };
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
  const appRef = useRef(null);
  const sourceSpriteRef = useRef(null);
  const originalSpriteRef = useRef(null);
  const outputSpriteRef = useRef(null);
  const watermarkSpriteRef = useRef(null);
  const watermarkMiniSpriteRef = useRef(null);
  const watermarkFilterRef = useRef(null);
  const colorFilterRef = useRef(null);
  const blurFiltersRef = useRef([]);
  const outputTextureRef = useRef(null);
  const retiredOutputTexturesRef = useRef([]);
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

  // Performance tracking
  // Split overlay
  const splitOverlayCanvasRef = useRef(null);
  const splitOverlayCtxRef = useRef(null);
  const splitOverlayImageRef = useRef(null);

  // Performance tracking
  const workerStartTimeRef = useRef(new Map());
  const textureUpdateStartTimeRef = useRef(new Map());

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

  const syncSourceFilters = useCallback(() => {
    const sourceSprite = sourceSpriteRef.current;
    if (!sourceSprite || !colorFilterRef.current || blurFiltersRef.current.length === 0) return;

    const { blurStrength, passes } = useParamsStore.getState();

    sourceSprite.filters = buildFilterChain(
      colorFilterRef.current,
      blurFiltersRef.current,
      blurStrength,
      passes,
    );
  }, []);

  // Draws the original (unprocessed) source image into a 2D canvas overlay that sits on top
  // of the Pixi canvas for hold-to-compare only.
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
    const app = appRef.current;
    const sourceSprite = sourceSpriteRef.current;
    const originalSprite = originalSpriteRef.current;
    const outputSprite = outputSpriteRef.current;
    const watermarkSprite = watermarkSpriteRef.current;
    const watermarkMiniSprite = watermarkMiniSpriteRef.current;
    if (!sourceSprite || !originalSprite || !outputSprite) return;

    const sizeState = useSizeStore.getState();
    const left = sizeState.crop?.left || 0;
    const right = sizeState.crop?.right || 0;
    const top = sizeState.crop?.top || 0;
    const bottom = sizeState.crop?.bottom || 0;
    const hasCrop = left > 0 || right > 0 || top > 0 || bottom > 0;

    const hasOutputTexture = Boolean(outputTextureRef.current);
    const showOutput = hasOutputTexture && outputReadyRef.current;

    const displayWidth = Math.max(
      1,
      Math.round(Number(app?.renderer?.width) || sourceSprite.width || outputSprite.width || 1),
    );
    const displayHeight = Math.max(
      1,
      Math.round(Number(app?.renderer?.height) || sourceSprite.height || outputSprite.height || 1),
    );

    if (hasCrop) {
      const customW = sizeState.customSize.customWidth;
      const customH = sizeState.customSize.customHeight;

      sourceSprite.x = -left;
      sourceSprite.y = -top;
      sourceSprite.width = customW;
      sourceSprite.height = customH;

      originalSprite.x = -left;
      originalSprite.y = -top;
      originalSprite.width = customW;
      originalSprite.height = customH;

      outputSprite.x = 0;
      outputSprite.y = 0;
      outputSprite.width = displayWidth;
      outputSprite.height = displayHeight;
    } else {
      sourceSprite.x = 0;
      sourceSprite.y = 0;
      originalSprite.x = 0;
      originalSprite.y = 0;
      outputSprite.x = 0;
      outputSprite.y = 0;
      sourceSprite.width = displayWidth;
      sourceSprite.height = displayHeight;
      originalSprite.width = displayWidth;
      originalSprite.height = displayHeight;
      outputSprite.width = displayWidth;
      outputSprite.height = displayHeight;
    }
    originalSprite.mask = null;
    originalSprite.visible = false;

    if (previewingOriginalRef.current) {
      sourceSprite.mask = null;
      outputSprite.mask = null;
      sourceSprite.visible = false;
      outputSprite.visible = false;
      originalSprite.visible = false;
      syncSplitOverlay();
      if (watermarkSprite) watermarkSprite.visible = false;
      if (watermarkMiniSprite) watermarkMiniSprite.visible = false;
      return;
    }

    // Not in compare mode — hide the overlay.
    if (splitOverlayCanvasRef.current) splitOverlayCanvasRef.current.style.display = 'none';

    sourceSprite.mask = null;
    outputSprite.mask = null;

    sourceSprite.visible = !showOutput;
    outputSprite.visible = showOutput;

    const useMiniWatermark = displayWidth < 64 || displayHeight < 64;
    if (watermarkSprite) {
      watermarkSprite.visible = Boolean(watermarkEnabledRef.current) && !useMiniWatermark;
    }
    if (watermarkMiniSprite) {
      watermarkMiniSprite.visible = Boolean(watermarkEnabledRef.current) && useMiniWatermark;
    }
  }, [syncSplitOverlay]);

  const syncWatermarkPalette = useCallback(() => {
    const watermarkFilter = watermarkFilterRef.current;
    if (!watermarkFilter) return;

    const paletteState = usePaletteStore.getState();
    const { darkColor, lightColor } = getPaletteExtremes(
      paletteState.colors,
      paletteState.colorCount,
    );

    const uniforms = watermarkFilter.resources.uniforms.uniforms;
    uniforms.uDarkColor = new Float32Array(darkColor);
    uniforms.uLightColor = new Float32Array(lightColor);
  }, []);

  const preserveVisibleOutput = useCallback(() => {
    const ditherEnabled = useDitherStore.getState().enabled;
    const hasOutputTexture = Boolean(outputTextureRef.current);
    const expectedMode = ditherEnabled ? 'dither' : 'clean';
    outputReadyRef.current = hasOutputTexture && outputModeRef.current === expectedMode;
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
    registerOutputCanvas(outputCanvasRef.current);

    if (!outputTextureRef.current || needsFreshCanvas) {
      const previousTexture = outputTextureRef.current;
      outputTextureRef.current = Texture.from(canvas);
      outputTextureRef.current.source.scaleMode = 'nearest';

      if (previousTexture) {
        retiredOutputTexturesRef.current.push(previousTexture);
      }
    }

    outputTextureRef.current.source.update?.();

    return outputTextureRef.current;
  }, []);

  const dispatchProcessing = useCallback((refreshPalette = false) => {
    const app = appRef.current;
    const worker = workerRef.current;
    const sourceSprite = sourceSpriteRef.current;
    const outputSprite = outputSpriteRef.current;
    const watermarkSprite = watermarkSpriteRef.current;
    const watermarkMiniSprite = watermarkMiniSpriteRef.current;
    if (!app || !worker || !sourceSprite || !outputSprite || !watermarkSprite || !watermarkMiniSprite || activeJobsRef.current > 0) return;

    // While comparing, never dispatch processing jobs.
    if (previewingOriginalRef.current) return;

    // Start performance tracking
    usePerformanceStore.getState().setPipelineStart();

    const paletteState = usePaletteStore.getState();
    const paletteColors = normalizePalette(paletteState.colors, paletteState.colorCount);
    const paletteRgb = paletteColors.map(color => hexToRgbUnit(color.hex));
    const ditherState = useDitherStore.getState();
    const ditherEnabled = Boolean(ditherState.enabled);
    const gifState = useGifStore.getState();
    const frameIndex = gifState.frames.length > 1 ? gifState.currentFrameIndex : -1;
    const colorUniforms = colorFilterRef.current?.resources?.uniforms?.uniforms;

    if (colorUniforms) {
      noiseFrameRef.current += 1;
      colorUniforms.uNoisePhase = noiseFrameRef.current;
    }

    preserveVisibleOutput();

    let extraction;
    let extractionStartTime;

    try {
      extractionStartTime = performance.now();
      extraction = extractProcessedPixels(
        app,
        sourceSprite,
        originalSpriteRef.current,
        outputSprite,
        watermarkSprite,
        watermarkMiniSprite,
      );
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

    // Track worker start time
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

      worker.postMessage({
        jobId: requestId,
        processedPixels: extraction.pixels.buffer,
        width: extraction.width,
        height: extraction.height,
        paletteRgb,
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
  }, [preserveVisibleOutput, setProcessingDelta]);

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

    // Defer all processing work while compare mode is active.
    if (previewingOriginalRef.current) {
      return;
    }

    // Bypass debounce delay in webcam mode for real-time rendering
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
    const app = appRef.current;
    const sourceSprite = sourceSpriteRef.current;
    const originalSprite = originalSpriteRef.current;
    const outputSprite = outputSpriteRef.current;
    const watermarkSprite = watermarkSpriteRef.current;
    const watermarkMiniSprite = watermarkMiniSpriteRef.current;

    if (!app || !sourceSprite || !originalSprite || !outputSprite || !watermarkSprite || !watermarkMiniSprite) return;

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

    const previousTexture = sourceSprite.texture;
    const nextTexture = Texture.from(frameCanvasRef.current);
    sourceSprite.texture = nextTexture;
    originalSprite.texture = nextTexture;
    nextTexture.source.update?.();

  // Keep the overlay source in sync with the current GIF frame.
  splitOverlayImageRef.current = frameCanvasRef.current;

    if (previousTexture && previousTexture !== nextTexture) {
      previousTexture.destroy(true);
    }

    internalFrameSwapRef.current = true;
    setSize({ width: frame.width, height: frame.height }, { resetCustom: false });

    const displaySize = getTargetDisplaySize();
    applyDisplaySize(
      app,
      sourceSprite,
      outputSprite,
      displaySize.width,
      displaySize.height,
      watermarkSprite,
      watermarkMiniSprite,
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
        const cachedTexture = updateOutputTexture(cachedPixels, cachedFrame.width, cachedFrame.height);
        outputModeRef.current = useDitherStore.getState().enabled ? 'dither' : 'clean';
        outputReadyRef.current = true;

        if (outputSpriteRef.current) {
          outputSpriteRef.current.texture = cachedTexture;
          outputSpriteRef.current.width = displaySize.width;
          outputSpriteRef.current.height = displaySize.height;
        }

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

    if (!sourceImg || !canvasHostRef.current || appRef.current) return;

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
        texture = Texture.from(webcamCanvas);
        originalUniqueColorsRef.current = 0;
      } else {
        texture = await loadTexture(sourceImg);
        if (lifecycleTokenRef.current !== lifecycleToken) return;

        if (!texture) {
          throw new Error('Unable to create texture from source image');
        }

        try {
          originalUniqueColorsRef.current = await countUniqueColorsFromImageSource(sourceImg);
        } catch (error) {
          console.error(error);
          originalUniqueColorsRef.current = 0;
        }
      }

      const { width, height } = texture;

      if (!width || !height) {
        throw new Error('Source texture has invalid size');
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

      const app = new Application();
      await app.init({
        preference: "webgl",
        width: initialDisplaySize.width,
        height: initialDisplaySize.height,
        backgroundAlpha: 0,
      });
      app.stage.sortableChildren = true;

      if (lifecycleTokenRef.current !== lifecycleToken) {
        app.destroy(true);
        return;
      }

      canvasHostRef.current.replaceChildren();
      canvasHostRef.current.appendChild(app.canvas);
      app.canvas.style.position = 'absolute';
      app.canvas.style.inset = '0';
      app.canvas.style.display = 'block';
      appRef.current = app;

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

      registerPixiApp(app);

      const sourceSprite = new Sprite(texture);
      sourceSpriteRef.current = sourceSprite;
      app.stage.addChild(sourceSprite);

      const originalSprite = new Sprite(texture);
      originalSprite.visible = false;
      originalSpriteRef.current = originalSprite;
      app.stage.addChild(originalSprite);

      const outputSprite = new Sprite(texture);
      outputSprite.visible = false;
      outputSpriteRef.current = outputSprite;
      app.stage.addChild(outputSprite);

      const watermarkSprite = new Sprite(watermarkTexture);
      watermarkSprite.anchor.set(1, 1);
      watermarkSprite.zIndex = 100;
      watermarkSpriteRef.current = watermarkSprite;
      app.stage.addChild(watermarkSprite);

      const watermarkMiniSprite = new Sprite(watermarkMiniTexture);
      watermarkMiniSprite.anchor.set(1, 1);
      watermarkMiniSprite.zIndex = 101;
      watermarkMiniSprite.visible = false;
      watermarkMiniSpriteRef.current = watermarkMiniSprite;
      app.stage.addChild(watermarkMiniSprite);

      const watermarkProgram = new GlProgram({
        fragment: watermark_palette_fragment,
        vertex: base_vertex,
      });

      watermarkFilterRef.current = new Filter({
        glProgram: watermarkProgram,
        resources: {
          uniforms: {
            uDarkColor: { value: new Float32Array([0, 0, 0]), type: "vec3<f32>" },
            uLightColor: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
          },
        },
      });

      watermarkSprite.filters = [watermarkFilterRef.current];
      watermarkMiniSprite.filters = [watermarkFilterRef.current];
      syncWatermarkPalette();

      applyDisplaySize(
        app,
        sourceSprite,
        outputSprite,
        initialDisplaySize.width,
        initialDisplaySize.height,
        watermarkSprite,
        watermarkMiniSprite,
        watermarkEnabledRef.current,
      );

      const colorProgram = new GlProgram({
        fragment: color_adjustments,
        vertex: base_vertex,
      });

      const initParams = useParamsStore.getState();

      colorFilterRef.current = new Filter({
        glProgram: colorProgram,
        resources: {
          uniforms: {
            uNoiseCoverage: { value: initParams.noiseCoverage, type: "f32" },
            uNoiseIntensity: { value: initParams.noiseIntensity, type: "f32" },
            uNoiseSaturation: { value: initParams.noiseSaturation, type: "f32" },
            uNoisePhase: { value: 0, type: "f32" },
            uGamma: { value: initParams.gamma, type: "f32" },
            uBlacks: { value: initParams.blacks, type: "f32" },
            uWhites: { value: initParams.whites, type: "f32" },
            uContrast: { value: initParams.contrast, type: "f32" },
            uSaturation: { value: initParams.saturation, type: "f32" },
            uHue: { value: initParams.hue, type: "f32" },
          },
        },
      });

      const blurProgram = new GlProgram({
        fragment: kawase_blur,
        vertex: base_vertex,
      });

      blurFiltersRef.current = Array.from({ length: BLUR_CONTROLS.passes.max }, () => (
        new Filter({
          glProgram: blurProgram,
          resources: {
            uniforms: {
              uTexelSize: {
                value: new Float32Array([
                  1 / Math.max(1, initialDisplaySize.width),
                  1 / Math.max(1, initialDisplaySize.height),
                ]),
                type: "vec2<f32>",
              },
              uOffset: { value: initParams.blurStrength, type: "f32" },
              uEdgeStrength: { value: initParams.edgeStrength, type: "f32" },
            },
          },
        })
      ));

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

        worker = new Worker(new URL('../workers/ditherWorker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        bindWorkerHandlers(worker);
        console.warn(`[pipeline] restarted dither worker after ${reason} (job ${jobId})`);
      };

      restartDitherWorkerRef.current = recoverFromWorkerFailure;

      const bindWorkerHandlers = (targetWorker) => {
        targetWorker.onmessage = async (event) => {
          if (lifecycleTokenRef.current !== lifecycleToken) return;

          const { jobId, referencePixels, outputPixels, width: outWidth, height: outHeight, uniqueColorCount, histogram, error } = event.data;
          const latestId = latestRequestIdRef.current;
          const shouldRefreshPalette = refreshPaletteForRequestRef.current.get(jobId);
          const wasDitherEnabled = Boolean(ditherEnabledForRequestRef.current.get(jobId));
          const gifFrameIndex = gifFrameForRequestRef.current.get(jobId);

          clearDitherJobTimeout(jobId);

          // Record worker processing time
          const workerStartTime = workerStartTimeRef.current.get(jobId);
          if (workerStartTime) {
            const workerDuration = performance.now() - workerStartTime;
            usePerformanceStore.getState().recordDithering(workerDuration);
            workerStartTimeRef.current.delete(jobId);
          }

          refreshPaletteForRequestRef.current.delete(jobId);
          ditherEnabledForRequestRef.current.delete(jobId);
          gifFrameForRequestRef.current.delete(jobId);

          if (jobId !== latestId) {
            setProcessingDelta(-1);
            if (processingQueuedRef.current) {
              queueProcessing(false);
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

          if (shouldRefreshPalette) {
            try {
              const paletteState = usePaletteStore.getState();
              await paletteState.generatePalette();
            } catch (err) {
              console.error('[pipeline] palette generation failed:', err);
            }
            queueProcessing(false);
            setProcessingDelta(-1);
            return;
          }

          const output = new Uint8ClampedArray(outputPixels);

          // Track texture update timing
          const textureUpdateStart = performance.now();
          usePerformanceStore.getState().setCurrentPhase('texture');
          const nextTexture = updateOutputTexture(output, outWidth, outHeight);
          textureUpdateStartTimeRef.current.set(jobId, textureUpdateStart);
          const textureUpdateDuration = performance.now() - textureUpdateStart;
          usePerformanceStore.getState().recordTextureUpdate(textureUpdateDuration);

          outputModeRef.current = wasDitherEnabled ? 'dither' : 'clean';
          outputReadyRef.current = true;

          const displaySize = getTargetDisplaySize();

          if (outputSpriteRef.current) {
            outputSpriteRef.current.texture = nextTexture;
            outputSpriteRef.current.width = displaySize.width;
            outputSpriteRef.current.height = displaySize.height;
          }

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

          // Track visible layer sync timing
          const syncStart = performance.now();
          usePerformanceStore.getState().setCurrentPhase('sync');
          syncVisibleLayer();
          const syncDuration = performance.now() - syncStart;
          usePerformanceStore.getState().recordLayerSync(syncDuration);

          // Record pipeline completion
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

          setProcessingDelta(-1);
          if (processingQueuedRef.current) {
            queueProcessing(false);
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

      worker = new Worker(new URL('../workers/ditherWorker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      bindWorkerHandlers(worker);

      syncSourceFilters();
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
            const sourceSprite = sourceSpriteRef.current;

            if (video && canvas && ctx && video.readyState >= 2) {
              drawWebcamFrameToCanvas(video, canvas, ctx, webcamMirrorRef.current);
              sourceSprite?.texture?.source?.update?.();
            }

            // Always queue processing in webcam mode to process the latest frame as soon as worker is free
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

      // When a GIF is first loaded, currentFrameIndex is usually already 0.
      // Force a source-frame swap so processing is queued and timeline state can advance from pending.
      if (!hadFrames && hasFrames) {
        swapSourceFrame(state.currentFrameIndex);
        return;
      }

      if (state.currentFrameIndex !== previousState.currentFrameIndex) {
        swapSourceFrame(state.currentFrameIndex);
      }
    });

    const unsubParams = useParamsStore.subscribe((state, previousState) => {
      if (!colorFilterRef.current || blurFiltersRef.current.length === 0) return;

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

      const cu = colorFilterRef.current.resources.uniforms.uniforms;
      cu.uNoiseCoverage = state.noiseCoverage;
      cu.uNoiseIntensity = state.noiseIntensity;
      cu.uNoiseSaturation = state.noiseSaturation;
      cu.uGamma = state.gamma;
      cu.uBlacks = state.blacks;
      cu.uWhites = state.whites;
      cu.uContrast = state.contrast;
      cu.uSaturation = state.saturation;
      cu.uHue = state.hue;

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

      for (const blurFilter of blurFiltersRef.current) {
        const bu = blurFilter.resources.uniforms.uniforms;
        bu.uOffset = state.blurStrength;
        bu.uEdgeStrength = state.edgeStrength;
      }

      syncSourceFilters();
      markGifFramesPending();
      queueProcessing(true);
    });

    const unsubWebcam = useWebcamStore.subscribe((state, previousState) => {
      // --- Mirror toggled ---
      if (state.mirrored !== previousState.mirrored) {
        webcamMirrorRef.current = Boolean(state.mirrored);

        const video = webcamVideoRef.current;
        const canvas = webcamCanvasRef.current;
        const ctx = webcamCtxRef.current;
        const sourceSprite = sourceSpriteRef.current;

        if (video && canvas && ctx && video.readyState >= 2) {
          drawWebcamFrameToCanvas(video, canvas, ctx, webcamMirrorRef.current);
          sourceSprite?.texture?.source?.update?.();
        }

        if (isWebcamModeRef.current) {
          queueProcessing(false);
        }
      }

      // --- Camera stopped externally (track ended, permission revoked, USB unplug) ---
      // When stopWebcam() is triggered by a hardware/permission event rather than
      // the user pressing STOP, imageStore still points to WEBCAM_SOURCE and the
      // frame loop is still running.  Reset the image source so the renderer tears
      // down cleanly via the normal sourceImg change path.
      if (previousState.active && !state.active && isWebcamModeRef.current) {
        // Stop the frame-capture loop immediately so we don't keep trying to draw
        // from a dead video element.
        if (webcamLoopTimerRef.current !== null) {
          window.clearTimeout(webcamLoopTimerRef.current);
          webcamLoopTimerRef.current = null;
        }
        // Defer to next microtask so the Zustand listener finishes before we
        // trigger a cascade of store updates.
        Promise.resolve().then(() => {
          useImageStore.getState().resetToDefault();
        });
      }
    });

    const unsubPalette = usePaletteStore.subscribe((state, previousState) => {
      syncWatermarkPalette();

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
      const app = appRef.current;
      const sourceSprite = sourceSpriteRef.current;
      const outputSprite = outputSpriteRef.current;
      const watermarkSprite = watermarkSpriteRef.current;
      const watermarkMiniSprite = watermarkMiniSpriteRef.current;
      if (!app || !sourceSprite || !outputSprite || !watermarkSprite || !watermarkMiniSprite) return;

      const w = Math.max(
        1,
        Math.floor(Number(state.customSize.customWidth) || Number(state.size.width) || sourceSprite.width || 1),
      );
      const h = Math.max(
        1,
        Math.floor(Number(state.customSize.customHeight) || Number(state.size.height) || sourceSprite.height || 1),
      );

      const prevW = Math.max(
        1,
        Math.floor(
          Number(previousState?.customSize?.customWidth) ||
          Number(previousState?.size?.width) ||
          sourceSprite.width ||
          1,
        ),
      );
      const prevH = Math.max(
        1,
        Math.floor(
          Number(previousState?.customSize?.customHeight) ||
          Number(previousState?.size?.height) ||
          sourceSprite.height ||
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

      applyDisplaySize(
        app,
        sourceSprite,
        outputSprite,
        croppedW,
        croppedH,
        watermarkSprite,
        watermarkMiniSprite,
        watermarkEnabledRef.current,
      );

      const rendererPixelWidth = Math.max(1, Math.round(Number(app.renderer?.width) || croppedW));
      const rendererPixelHeight = Math.max(1, Math.round(Number(app.renderer?.height) || croppedH));

      if (blurFiltersRef.current.length > 0) {
        for (const blurFilter of blurFiltersRef.current) {
          blurFilter.resources.uniforms.uniforms.uTexelSize = new Float32Array([
            1 / rendererPixelWidth,
            1 / rendererPixelHeight,
          ]);
        }
      }

      syncSplitOverlay();

      if (!internalFrameSwapRef.current) {
        markGifFramesPending();
      }
      queueProcessing(true);
    });

    const unsubWatermark = useWatermarkStore.subscribe((state) => {
      watermarkEnabledRef.current = Boolean(state.enabled);

      const app = appRef.current;
      const sourceSprite = sourceSpriteRef.current;
      const outputSprite = outputSpriteRef.current;
      const watermarkSprite = watermarkSpriteRef.current;
      const watermarkMiniSprite = watermarkMiniSpriteRef.current;
      if (!app || !sourceSprite || !outputSprite || !watermarkSprite || !watermarkMiniSprite) return;

      applyDisplaySize(
        app,
        sourceSprite,
        outputSprite,
        Math.max(1, Number(app.renderer?.width) || sourceSprite.width || 1),
        Math.max(1, Number(app.renderer?.height) || sourceSprite.height || 1),
        watermarkSprite,
        watermarkMiniSprite,
        watermarkEnabledRef.current,
      );
    });

    return () => {
      disposedRef.current = true;
      lifecycleTokenRef.current += 1;
      registerSourceImage(null);
      registerPaletteReference(null);
      registerPixiApp(null);
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

      outputTextureRef.current?.destroy(true);
      outputTextureRef.current = null;

      for (const texture of retiredOutputTexturesRef.current) {
        texture?.destroy(true);
      }
      retiredOutputTexturesRef.current = [];

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

      sourceSpriteRef.current = null;
      originalSpriteRef.current = null;
      outputSpriteRef.current = null;
      watermarkSpriteRef.current = null;
      watermarkMiniSpriteRef.current = null;
      watermarkFilterRef.current = null;
      colorFilterRef.current = null;
      blurFiltersRef.current = [];

      splitOverlayCanvasRef.current?.remove();
      splitOverlayCanvasRef.current = null;
      splitOverlayCtxRef.current = null;
      splitOverlayImageRef.current = null;

      appRef.current?.destroy(true);
      appRef.current = null;

      unsubParams();
      unsubWebcam();
      unsubPalette();
      unsubDither();
      unsubSize();
      unsubWatermark();
      unsubGif();
    };
  }, [clearViewerLoadingTimer, preserveVisibleOutput, queueProcessing, setProcessingDelta, setProcessingVisible, setSize, sourceImg, swapSourceFrame, syncSourceFilters, syncSplitOverlay, syncVisibleLayer, syncWatermarkPalette, updateOutputTexture]);

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
        }}
      />
    </div>
  );
}

