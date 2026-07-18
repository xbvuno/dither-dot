import usePerformanceStore from '../stores/engine/performanceStore';
import usePaletteStore, { EXTRACT_METHOD } from '../stores/data/paletteStore';
import useDitherStore from '../stores/engine/ditherStore';
import useGifStore from '../stores/media/gifStore';
import useParamsStore from '../stores/data/paramsStore';
import useSizeStore from '../stores/media/sizeStore';
import useWebcamStore, { WEBCAM_SOURCE } from '../stores/media/webcamStore';
import useImageStore from '../stores/media/imageStore';
import useProcessingStore from '../stores/engine/processingStore';
import useWatermarkStore from '../stores/media/watermarkStore';
import useViewStore from '../stores/ui/viewStore';

import {
  registerPaletteReference,
  registerRenderSnapshot,
  registerOutputCanvas,
} from '../utils/canvasRegistry';

import {
  normalizePalette,
  hexToRgbUnit,
  captureThumbnailDataUrl,
  drawWebcamFrameToCanvas,
  getTargetDisplaySize,
  getPaletteExtremes,
  getDrawableDimensions,
  loadTexture,
  countUniqueColorsFromImageSource,
  generateRecoloredWatermark,
} from '../utils/shaderHelpers';

import watermarkImage from "../assets/watermark/watermark.png";
import watermarkMiniImage from "../assets/watermark/watermark-mini.png";

const DITHER_WORKER_TIMEOUT_MS = 10000;
const PROCESSING_VISIBILITY_DELAY_MS = 100;
const VIEWER_LOADING_VISIBILITY_DELAY_MS = 100;
const WATERMARK_MARGIN_NORMAL = 4;
const WATERMARK_MARGIN_MINI = 2;

class DitherEngine {
  constructor() {
    this.canvasHost = null;
    this.viewportCanvas = null;
    this.splitOverlayCanvas = null;
    this.splitOverlayCtx = null;
    this.splitOverlayImage = null;
    
    this.activeSource = null;
    this.originalUniqueColors = 0;
    this.previewingOriginal = false;
    
    this.outputCanvas = null;
    this.outputContext = null;
    this.outputReady = false;
    this.outputMode = 'none';
    
    this.isWebcamMode = false;
    this.paletteFrozenForWebcam = false;
    this.watermarkEnabled = false;
    this.disposed = false;
    
    this.worker = null;
    this.latestRequestId = 0;
    this.activeJobs = 0;
    
    this.ditherJobTimeouts = new Map();
    this.workerStartTime = new Map();
    this.textureUpdateStartTime = new Map();
    this.refreshPaletteForRequest = new Map();
    this.ditherEnabledForRequest = new Map();
    this.gifFrameForRequest = new Map();
    
    this.rafId = null;
    this.processingVisibilityTimer = null;
    this.processingVisible = false;
    this.processingQueued = false;
    this.pendingPaletteRefresh = false;
    
    this.noiseFrame = 0;
    
    this.recoloredWatermarkCanvas = null;
    this.recoloredWatermarkMiniCanvas = null;
    this.watermarkImg = null;
    this.watermarkMiniImg = null;
    
    this.webcamVideo = null;
    this.webcamCanvas = null;
    this.webcamCtx = null;
    this.webcamLoopTimer = null;
    this.webcamMirror = false;
    
    this.internalFrameSwap = false;
    this.lifecycleToken = 0;
    this.viewerLoadingTimer = null;
    this.previousColorParams = null;
    
    this.engineState = 'IDLE';
    this.subscriptions = [];

    // Initialize logging preference
    const storedDebug = typeof localStorage !== 'undefined' ? localStorage.getItem('dither-dot:debug') : null;
    this.debugEnabled = storedDebug === 'true'; // false by default

    // Expose engine to Chrome Console
    if (typeof window !== 'undefined') {
      window.ditherEngine = this;
      window.toggleDitherDebug = (enabled) => this.setLogging(enabled);
    }
  }

  log(category, message, ...args) {
    if (!this.debugEnabled) return;
    console.log(
      `%c[DitherEngine][${category}]%c ${message}`,
      'color: #1d4ed8; font-weight: bold; padding: 2px 4px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px;',
      'color: inherit;',
      ...args
    );
  }

  warn(category, message, ...args) {
    console.warn(
      `%c[DitherEngine][${category}]%c ${message}`,
      'color: #b45309; font-weight: bold; padding: 2px 4px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 4px;',
      'color: inherit;',
      ...args
    );
  }

  error(category, message, ...args) {
    console.error(
      `%c[DitherEngine][${category}]%c ${message}`,
      'color: #b91c1c; font-weight: bold; padding: 2px 4px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px;',
      'color: inherit;',
      ...args
    );
  }

  setLogging(enabled) {
    this.debugEnabled = Boolean(enabled);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dither-dot:debug', enabled ? 'true' : 'false');
    }
    if (this.worker) {
      this.worker.postMessage({ type: 'setLogging', enabled: this.debugEnabled });
    }
    console.log(
      `%c[DitherEngine]%c Debug logging has been ${enabled ? 'ENABLED' : 'DISABLED'}.`,
      'color: #1d4ed8; font-weight: bold;',
      'color: inherit;'
    );
  }

  setEngineState(nextState) {
    const prevState = this.engineState;
    if (prevState !== nextState) {
      this.engineState = nextState;
      this.log('FSM', 'State transitioned: %s -> %s', prevState, nextState);
    }
  }

  clearViewerLoadingTimer() {
    if (this.viewerLoadingTimer !== null) {
      window.clearTimeout(this.viewerLoadingTimer);
      this.viewerLoadingTimer = null;
    }
  }

  async init(canvasHost, sourceImg) {
    this.log('Pipeline', 'init() entered. sourceImg type/details: %s', typeof sourceImg === 'string' ? sourceImg.slice(0, 50) + "..." : typeof sourceImg);
    this.canvasHost = canvasHost;
    this.disposed = false;
    const lifecycleToken = ++this.lifecycleToken;
    
    this.clearViewerLoadingTimer();
    useImageStore.getState().setViewerLoading(false);
    this.viewerLoadingTimer = window.setTimeout(() => {
      this.viewerLoadingTimer = null;
      if (this.lifecycleToken !== lifecycleToken || this.disposed) return;
      useImageStore.getState().setViewerLoading(true);
    }, VIEWER_LOADING_VISIBILITY_DELAY_MS);

    // Initialize worker
    this.worker = new Worker(new URL('../workers/ditherWorker.js', import.meta.url), { type: 'module' });
    this.bindWorkerHandlers(this.worker);
    this.worker.postMessage({ type: 'setLogging', enabled: this.debugEnabled });

    try {
      this.setEngineState('LOADING');
      this.isWebcamMode = sourceImg === WEBCAM_SOURCE;
      this.paletteFrozenForWebcam = false;
      this.watermarkEnabled = Boolean(useWatermarkStore.getState().enabled);
      
      this.previewingOriginal = Boolean(useViewStore.getState().previewingOriginal);

      let texture;
      if (this.isWebcamMode) {
        texture = await this.initWebcam(lifecycleToken);
        if (!texture) return;
      } else {
        texture = await loadTexture(sourceImg);
        if (this.lifecycleToken !== lifecycleToken || this.disposed) return;
        if (!texture) {
          throw new Error('Unable to create texture from source image');
        }
        this.activeSource = texture;
        try {
          this.originalUniqueColors = await countUniqueColorsFromImageSource(sourceImg);
        } catch (error) {
          this.error('Pipeline', 'Failed to calculate unique colors: %o', error);
          this.originalUniqueColors = 0;
        }
        this.setEngineState('READY');
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
      if (this.lifecycleToken !== lifecycleToken || this.disposed) return;
      if (!watermarkTexture || !watermarkMiniTexture) {
        throw new Error('Unable to create texture from watermark image');
      }

      useSizeStore.getState().setSize({ width, height }, { resetCustom: true });
      this.recreateViewportCanvas();

      if (!this.isWebcamMode) {
        const overlayImg = new Image();
        overlayImg.crossOrigin = 'anonymous';
        overlayImg.onload = () => {
          if (this.lifecycleToken !== lifecycleToken || this.disposed) return;
          this.syncSplitOverlay();
        };
        overlayImg.src = sourceImg;
        this.splitOverlayImage = overlayImg;
      } else {
        this.splitOverlayImage = texture;
      }

      this.watermarkImg = watermarkTexture;
      this.watermarkMiniImg = watermarkMiniTexture;
      this.syncWatermarkPalette();

      const initialDisplaySize = getTargetDisplaySize();
      this.applyDisplaySize(initialDisplaySize.width, initialDisplaySize.height);

      const initParams = useParamsStore.getState();
      this.previousColorParams = {
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

      this.syncVisibleLayer();
      
      // Setup store subscriptions
      this.setupSubscriptions();

      // Trigger initial processing
      this.queueProcessing(true);
      
      this.clearViewerLoadingTimer();
      useImageStore.getState().setViewerLoading(false);
    } catch (error) {
      if (this.lifecycleToken === lifecycleToken && !this.disposed) {
        useProcessingStore.getState().setRenderProcessing(false);
        this.clearViewerLoadingTimer();
        useImageStore.getState().setViewerLoading(false);
        this.setEngineState('ERROR');
        this.error('Pipeline', 'Error during initialization: %o', error);
        alert('Unable to load the selected image. Please try another file.');
      }
    }
  }

  setupSubscriptions() {
    this.subscriptions.push(
      useViewStore.subscribe((state) => {
        const showingOriginal = Boolean(state.previewingOriginal);
        this.previewingOriginal = showingOriginal;
        this.syncVisibleLayer();
        if (!showingOriginal && this.processingQueued) {
          this.queueProcessing(false);
        }
      })
    );

    this.subscriptions.push(
      useParamsStore.subscribe((state, previousState) => {
        const prevParams = this.previousColorParams || {};
        const nextParams = {
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

        const colorParamsChanged = !this.previousColorParams || (
          prevParams.noiseCoverage !== nextParams.noiseCoverage ||
          prevParams.noiseIntensity !== nextParams.noiseIntensity ||
          prevParams.noiseSaturation !== nextParams.noiseSaturation ||
          prevParams.gamma !== nextParams.gamma ||
          prevParams.blacks !== nextParams.blacks ||
          prevParams.whites !== nextParams.whites ||
          prevParams.contrast !== nextParams.contrast ||
          prevParams.saturation !== nextParams.saturation ||
          prevParams.hue !== nextParams.hue
        );

        this.previousColorParams = nextParams;

        if (colorParamsChanged) {
          usePaletteStore.getState().clearPaletteCache?.();
        }

        this.markGifFramesPending();
        this.queueProcessing(true);
      })
    );

    this.subscriptions.push(
      usePaletteStore.subscribe((state, previousState) => {
        this.syncWatermarkPalette();
        this.syncVisibleLayer();

        const methodChanged = state.method !== previousState.method;
        const colorCountChanged = state.colorCount !== previousState.colorCount;
        const samplingAccuracyChanged = state.samplingAccuracy !== previousState.samplingAccuracy;
        const colorsChanged = state.colors !== previousState.colors;
        const shouldRefreshPalette =
          state.method !== EXTRACT_METHOD.CUSTOM && (methodChanged || colorCountChanged || samplingAccuracyChanged);
        const shouldInvalidateFrames = methodChanged || colorCountChanged || samplingAccuracyChanged || colorsChanged;

        if (shouldInvalidateFrames) {
          this.markGifFramesPending();
        }
        this.queueProcessing(shouldRefreshPalette);
      })
    );

    this.subscriptions.push(
      useDitherStore.subscribe(() => {
        this.preserveVisibleOutput();
        this.markGifFramesPending();
        this.queueProcessing(false);
      })
    );

    this.subscriptions.push(
      useSizeStore.subscribe((state, previousState) => {
        const source = this.activeSource;
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

        this.applyDisplaySize(croppedW, croppedH);
        this.syncSplitOverlay();

        if (!this.internalFrameSwap) {
          this.markGifFramesPending();
        }
        this.queueProcessing(true);
      })
    );

    this.subscriptions.push(
      useWatermarkStore.subscribe((state) => {
        this.watermarkEnabled = Boolean(state.enabled);
        this.syncWatermarkPalette();
        this.syncVisibleLayer();
      })
    );

    this.subscriptions.push(
      useWebcamStore.subscribe((state, previousState) => {
        if (state.mirrored !== previousState.mirrored) {
          this.webcamMirror = Boolean(state.mirrored);
          const video = this.webcamVideo;
          const canvas = this.webcamCanvas;
          const ctx = this.webcamCtx;

          if (video && canvas && ctx && video.readyState >= 2) {
            drawWebcamFrameToCanvas(video, canvas, ctx, this.webcamMirror);
          }

          if (this.isWebcamMode) {
            this.queueProcessing(false);
          }
        }

        if (previousState.active && !state.active && this.isWebcamMode) {
          this.cleanupWebcam();
          Promise.resolve().then(() => {
            useImageStore.getState().resetToDefault();
          });
        }
      })
    );

    this.subscriptions.push(
      useGifStore.subscribe((state, previousState) => {
        const hadFrames = (previousState?.frames?.length || 0) > 1;
        const hasFrames = (state?.frames?.length || 0) > 1;
        if (!hasFrames && !hadFrames) return;

        if (!hadFrames && hasFrames) {
          this.swapSourceFrame(state.currentFrameIndex);
          return;
        }

        if (state.currentFrameIndex !== previousState.currentFrameIndex) {
          this.swapSourceFrame(state.currentFrameIndex);
        }
      })
    );

    // Register window layout listener
    const handleLayoutChange = () => {
      if (!this.previewingOriginal) return;
      this.syncVisibleLayer();
      this.syncSplitOverlay();
    };
    window.addEventListener('split-compare-layout-changed', handleLayoutChange);
    this.subscriptions.push(() => {
      window.removeEventListener('split-compare-layout-changed', handleLayoutChange);
    });
  }

  destroy() {
    this.setEngineState('IDLE');
    this.disposed = true;
    
    // Unsubscribe from all stores and event listeners
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];

    // Terminate worker
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {
        this.error('Pipeline', 'Error terminating worker: %o', e);
      }
      this.worker = null;
    }

    // Clear timeouts
    for (const timeoutId of this.ditherJobTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this.ditherJobTimeouts.clear();

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.processingVisibilityTimer !== null) {
      window.clearTimeout(this.processingVisibilityTimer);
      this.processingVisibilityTimer = null;
    }
    this.processingQueued = false;
    this.pendingPaletteRefresh = false;

    // Clean up webcam
    this.cleanupWebcam();

    // Clean up canvas registry
    registerPaletteReference(null);
    registerOutputCanvas(null);
    registerRenderSnapshot({ uniqueColors: 0, originalUniqueColors: 0 });

    this.clearViewerLoadingTimer();
    useImageStore.getState().setViewerLoading(false);
    useProcessingStore.getState().setRenderProcessing(false);

    // Reset references
    this.canvasHost = null;
    this.viewportCanvas = null;
    this.splitOverlayCanvas = null;
    this.splitOverlayCtx = null;
    this.splitOverlayImage = null;
    this.activeSource = null;
    this.outputCanvas = null;
    this.outputContext = null;
    this.outputReady = false;
    this.outputMode = 'none';

    this.workerStartTime.clear();
    this.textureUpdateStartTime.clear();
    this.refreshPaletteForRequest.clear();
    this.ditherEnabledForRequest.clear();
    this.gifFrameForRequest.clear();
  }

  setProcessingVisible(visible) {
    this.processingVisible = visible;
    useProcessingStore.getState().setRenderProcessing(visible);
  }

  setProcessingDelta(delta) {
    this.activeJobs = Math.max(0, this.activeJobs + delta);

    if (this.activeJobs > 0) {
      if (!this.processingVisible && this.processingVisibilityTimer === null) {
        this.processingVisibilityTimer = window.setTimeout(() => {
          this.processingVisibilityTimer = null;
          if (this.activeJobs > 0) {
            this.setProcessingVisible(true);
          }
        }, PROCESSING_VISIBILITY_DELAY_MS);
      }
      return;
    }

    if (this.processingVisibilityTimer !== null) {
      window.clearTimeout(this.processingVisibilityTimer);
      this.processingVisibilityTimer = null;
    }

    useImageStore.getState().setViewerLoading(false);
    this.setProcessingVisible(false);
  }

  async dispatchProcessing(refreshPalette = false) {
    this.log('Pipeline', 'dispatchProcessing() called. refreshPalette: %o', refreshPalette);
    try {
      if (this.engineState !== 'READY' && this.engineState !== 'STREAMING') {
        this.warn('Pipeline', 'dispatchProcessing aborted: engineState is %s (needs READY/STREAMING)', this.engineState);
        return;
      }
      const worker = this.worker;
      if (!worker) {
        this.warn('Pipeline', 'dispatchProcessing aborted: worker is null!');
        return;
      }
      if (this.activeJobs > 0) {
        this.log('Pipeline', 'dispatchProcessing aborted: activeJobs is %d (already processing)', this.activeJobs);
        return;
      }
      if (!this.activeSource) {
        this.warn('Pipeline', 'dispatchProcessing aborted: activeSource is null!');
        return;
      }

      usePerformanceStore.getState().setPipelineStart();

      const paletteState = usePaletteStore.getState();
      const paletteColors = normalizePalette(paletteState.colors, paletteState.colorCount);
      const paletteRgb = paletteColors.map(color => hexToRgbUnit(color.hex));
      
      const ditherState = useDitherStore.getState();
      const ditherEnabled = Boolean(ditherState.enabled);
      
      const gifState = useGifStore.getState();
      const frameIndex = gifState.frames.length > 1 ? gifState.currentFrameIndex : -1;

      this.noiseFrame += 1;
      this.preserveVisibleOutput();

      let sourceBitmap;
      const extractionStartTime = performance.now();
      this.log('Pipeline', 'Creating ImageBitmap from active source: %s', this.activeSource.tagName || this.activeSource.constructor.name);
      try {
        sourceBitmap = await createImageBitmap(this.activeSource);
        const extractionDuration = performance.now() - extractionStartTime;
        this.log('Pipeline', 'ImageBitmap created in %s ms', extractionDuration.toFixed(2));
        usePerformanceStore.getState().recordExtractionEnd(extractionDuration);
      } catch (error) {
        this.error('Pipeline', 'Failed to create ImageBitmap from active source: %o', error);
        this.preserveVisibleOutput();
        return;
      }

      const sizeState = useSizeStore.getState();
      const sourceW = this.activeSource.naturalWidth || this.activeSource.width || 1;
      const sourceH = this.activeSource.naturalHeight || this.activeSource.height || 1;
      const customWidth = sizeState.customSize.customWidth || sourceW;
      const customHeight = sizeState.customSize.customHeight || sourceH;

      const requestId = ++this.latestRequestId;
      this.log('Worker', 'Dispatching job %d. customSize: %d x %d, ditherEnabled: %o', requestId, customWidth, customHeight, ditherEnabled);
      
      this.refreshPaletteForRequest.set(requestId, refreshPalette);
      this.ditherEnabledForRequest.set(requestId, ditherEnabled);
      this.gifFrameForRequest.set(requestId, frameIndex);
      
      if (frameIndex >= 0) {
        gifState.markFrameRendering(frameIndex);
      }
      this.setProcessingDelta(1);
      usePerformanceStore.getState().setCurrentPhase('dithering');

      const workerStartTime = performance.now();
      this.workerStartTime.set(requestId, workerStartTime);

      try {
        const timeoutId = window.setTimeout(() => {
          if (this.disposed) return;
          if (this.workerStartTime.has(requestId)) {
            this.error('Worker', 'dither worker timeout on job %d after %dms', requestId, DITHER_WORKER_TIMEOUT_MS);
            this.recoverFromWorkerFailure(requestId, 'timeout', new Error('Timed out waiting dither worker response'));
          }
        }, DITHER_WORKER_TIMEOUT_MS);
        this.ditherJobTimeouts.set(requestId, timeoutId);

        const crop = sizeState.crop || { top: 0, bottom: 0, left: 0, right: 0 };
        const paramsState = useParamsStore.getState();

        worker.postMessage({
          jobId: requestId,
          source: sourceBitmap,
          previewingOriginal: this.previewingOriginal,
          customWidth,
          customHeight,
          paletteRgb,
          forceCpu: paramsState.forceCpu,
          watermarkEnabled: this.watermarkEnabled,
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
            noisePhase: this.noiseFrame,
          },
          blur: {
            blurStrength: paramsState.blurStrength,
            edgeStrength: paramsState.edgeStrength,
            passes: paramsState.passes,
          },
        }, [sourceBitmap]);
      } catch (error) {
        const timeoutId = this.ditherJobTimeouts.get(requestId);
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
          this.ditherJobTimeouts.delete(requestId);
        }
        this.error('Worker', 'Failed to dispatch job postMessage: %o', error);
        this.gifFrameForRequest.delete(requestId);
        this.setProcessingDelta(-1);
        this.preserveVisibleOutput();
      }
    } catch (err) {
      this.error('Pipeline', 'CRITICAL ERROR inside dispatchProcessing: %o', err);
    }
  }

  flushProcessingQueue() {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.activeJobs > 0) {
      this.processingQueued = true;
      return;
    }

    const shouldRefreshPalette = this.pendingPaletteRefresh;
    this.pendingPaletteRefresh = false;
    this.processingQueued = false;
    this.dispatchProcessing(shouldRefreshPalette);
  }

  queueProcessing(refreshPalette = false) {
    if (this.engineState !== 'READY' && this.engineState !== 'STREAMING') {
      return;
    }
    this.pendingPaletteRefresh = this.pendingPaletteRefresh || refreshPalette;
    this.processingQueued = true;

    if (this.previewingOriginal) {
      return;
    }

    if (this.isWebcamMode) {
      this.flushProcessingQueue();
      return;
    }

    if (this.rafId !== null) {
      return;
    }

    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      this.flushProcessingQueue();
    });
  }

  recoverFromWorkerFailure(jobId, reason, error = null) {
    const hadTrackedJob = this.workerStartTime.has(jobId) || this.ditherJobTimeouts.has(jobId);
    
    // Clear tracking
    const timeoutId = this.ditherJobTimeouts.get(jobId);
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
      this.ditherJobTimeouts.delete(jobId);
    }
    this.workerStartTime.delete(jobId);
    this.textureUpdateStartTime.delete(jobId);
    this.refreshPaletteForRequest.delete(jobId);
    this.ditherEnabledForRequest.delete(jobId);
    this.gifFrameForRequest.delete(jobId);

    usePerformanceStore.getState().setCurrentPhase(null);
    usePerformanceStore.getState().recordPipelineComplete();

    if (hadTrackedJob) {
      this.setProcessingDelta(-1);
    }

    if (jobId === this.latestRequestId) {
      this.preserveVisibleOutput();
      if (this.processingQueued) {
        this.queueProcessing(false);
      }
    }

    const errorMessage = error?.message || String(error || reason || 'Unknown worker failure');
    this.error('Worker', 'dither worker failed on job %d: %s', jobId, errorMessage);

    try {
      this.worker?.terminate();
    } catch {
      // Worker may already be terminated
    }

    this.worker = new Worker(new URL('../workers/ditherWorker.js', import.meta.url), { type: 'module' });
    this.bindWorkerHandlers(this.worker);
    this.worker.postMessage({ type: 'setLogging', enabled: this.debugEnabled });

    // Recreate viewport canvas because old one's control was permanently transferred to crashed worker
    this.recreateViewportCanvas();

    this.warn('Worker', 'restarted dither worker after %s (job %d)', reason, jobId);
  }

  bindWorkerHandlers(targetWorker) {
    targetWorker.onmessage = async (event) => {
      if (targetWorker !== this.worker) {
        this.warn('Worker', 'Worker message received from an inactive worker. Ignored.');
        return;
      }

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

      const latestId = this.latestRequestId;
      this.log('Worker', 'Worker message received. jobId: %d, latestId: %d, isImageReady: %o, isStatsReady: %o, error: %s', jobId, latestId, !!isImageReady, !!isStatsReady, error);

      if (jobId !== latestId) {
        this.log('Worker', 'Worker message discarded (not the latest request).');
        if (isImageReady) {
          this.setProcessingDelta(-1);
          if (this.processingQueued) {
            this.queueProcessing(false);
          }
        }
        return;
      }

      if (error || this.disposed) {
        if (error) this.error('Worker', 'Worker reported error: %o', error);
        if (this.disposed) this.warn('Worker', 'Worker message arrived after engine disposed.');
        this.preserveVisibleOutput();
        this.setProcessingDelta(-1);
        if (this.processingQueued) {
          this.queueProcessing(false);
        }
        return;
      }

      const shouldRefreshPalette = this.refreshPaletteForRequest.get(jobId);
      const wasDitherEnabled = Boolean(this.ditherEnabledForRequest.get(jobId));
      const gifFrameIndex = this.gifFrameForRequest.get(jobId);

      if (isImageReady) {
        this.log('Worker', 'Processing isImageReady inside onmessage. Calling updateOutputTexture...');
        
        // Clear timeout
        const timeoutId = this.ditherJobTimeouts.get(jobId);
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
          this.ditherJobTimeouts.delete(jobId);
        }

        const workerStartTime = this.workerStartTime.get(jobId);
        if (workerStartTime) {
          const workerDuration = performance.now() - workerStartTime;
          usePerformanceStore.getState().recordDithering(workerDuration);
          this.workerStartTime.delete(jobId);
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
        this.updateOutputTexture(output, outWidth, outHeight);
        this.textureUpdateStartTime.set(jobId, textureUpdateStart);
        const textureUpdateDuration = performance.now() - textureUpdateStart;
        usePerformanceStore.getState().recordTextureUpdate(textureUpdateDuration);

        this.outputMode = wasDitherEnabled ? 'dither' : 'clean';
        this.outputReady = true;

        if (gifFrameIndex >= 0) {
          const thumbnailUrl = captureThumbnailDataUrl(this.outputCanvas, 60);
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
        this.syncVisibleLayer();
        const syncDuration = performance.now() - syncStart;
        usePerformanceStore.getState().recordLayerSync(syncDuration);

        usePerformanceStore.getState().recordPipelineComplete();

        if (this.isWebcamMode) {
          useWebcamStore.getState().recordRenderedFrame();

          if (!this.paletteFrozenForWebcam) {
            this.paletteFrozenForWebcam = true;
            const paletteState = usePaletteStore.getState();
            if (paletteState.method !== EXTRACT_METHOD.CUSTOM) {
              paletteState.generatePalette().then(() => {
                usePaletteStore.getState().setMethod(EXTRACT_METHOD.CUSTOM);
                useWebcamStore.getState().setPaletteFrozen(true);
              }).catch((e) => {
                this.error('Palette', 'Webcam palette generation failed: %o', e);
                useWebcamStore.getState().setPaletteFrozen(true);
              });
            } else {
              useWebcamStore.getState().setPaletteFrozen(true);
            }
          }
        }

        this.ditherEnabledForRequest.delete(jobId);

        if (!shouldRefreshPalette) {
          this.setProcessingDelta(-1);
          if (this.processingQueued) {
            this.queueProcessing(false);
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
          originalUniqueColors: this.originalUniqueColors,
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

        this.refreshPaletteForRequest.delete(jobId);
        this.gifFrameForRequest.delete(jobId);

        if (shouldRefreshPalette) {
          try {
            const paletteState = usePaletteStore.getState();
            await paletteState.generatePalette();
          } catch (err) {
            this.error('Palette', 'palette generation failed: %o', err);
          }
          this.setProcessingDelta(-1);
          if (this.processingQueued) {
            this.queueProcessing(false);
          }
        }
      }
    };

    targetWorker.onerror = (event) => {
      const jobId = this.latestRequestId;
      this.recoverFromWorkerFailure(jobId, 'error', event?.error || new Error(event?.message || 'Worker runtime error'));
    };

    targetWorker.onmessageerror = (event) => {
      const jobId = this.latestRequestId;
      this.recoverFromWorkerFailure(jobId, 'messageerror', event?.data || new Error('Worker message deserialization failed'));
    };
  }

  recreateViewportCanvas() {
    this.log('Canvas', 'recreateViewportCanvas() entered');
    if (!this.canvasHost) {
      this.warn('Canvas', 'recreateViewportCanvas: canvasHost is null!');
      return;
    }
    const displaySize = getTargetDisplaySize();
    this.log('Canvas', 'recreateViewportCanvas: target display size is: %d x %d', displaySize.width, displaySize.height);

    const viewportCanvas = document.createElement('canvas');
    viewportCanvas.width = displaySize.width;
    viewportCanvas.height = displaySize.height;
    viewportCanvas.style.position = 'absolute';
    viewportCanvas.style.inset = '0';
    viewportCanvas.style.display = 'block';
    viewportCanvas.style.imageRendering = 'pixelated';

    this.canvasHost.replaceChildren();
    this.canvasHost.appendChild(viewportCanvas);
    this.viewportCanvas = viewportCanvas;
    this.log('Canvas', 'viewportCanvas created and added to DOM');

    // Also recreate the splitCompare overlay canvas
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.inset = '0';
    overlayCanvas.style.display = 'none';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.imageRendering = 'auto';
    this.canvasHost.appendChild(overlayCanvas);
    this.splitOverlayCanvas = overlayCanvas;
    this.splitOverlayCtx = overlayCanvas.getContext('2d');
    this.syncSplitOverlay();

    if (this.worker) {
      this.log('Canvas', 'worker is defined. Transferring control to offscreen...');
      try {
        const offscreen = viewportCanvas.transferControlToOffscreen();
        this.worker.postMessage({ type: 'initCanvas', canvas: offscreen }, [offscreen]);
        this.log('Canvas', 'canvas.transferControlToOffscreen() succeeded and message posted to worker');
      } catch (err) {
        this.error('Canvas', 'failed to transfer control to offscreen: %o', err);
      }
      
      // Force watermarks reset
      this.syncWatermarkPalette();
    } else {
      this.warn('Canvas', 'worker is null! Canvas control NOT transferred.');
    }
  }

  applyDisplaySize(width, height) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 1));

    const viewportCanvas = this.viewportCanvas;
    if (viewportCanvas) {
      viewportCanvas.style.width = `${safeWidth}px`;
      viewportCanvas.style.height = `${safeHeight}px`;
      viewportCanvas.style.imageRendering = 'pixelated';
    }

    window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
    return { width: safeWidth, height: safeHeight };
  }

  preserveVisibleOutput() {
    const ditherEnabled = useDitherStore.getState().enabled;
    const hasOutputCanvas = Boolean(this.outputCanvas);
    const expectedMode = ditherEnabled ? 'dither' : 'clean';
    this.outputReady = hasOutputCanvas && this.outputMode === expectedMode;
    this.syncVisibleLayer();
  }

  updateOutputTexture(data, width, height) {
    this.log('Canvas', 'updateOutputTexture() called. data.length: %d, dimensions: %d x %d', data?.length, width, height);
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

    let canvas = this.outputCanvas;
    let context = this.outputContext;
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

      this.outputCanvas = canvas;
      this.outputContext = context;
    }

    context.putImageData(new ImageData(data, safeWidth, safeHeight), 0, 0);

    if (this.watermarkEnabled) {
      const useMiniWatermark = safeWidth < 64 || safeHeight < 64;
      const watermarkCanvas = useMiniWatermark 
        ? this.recoloredWatermarkMiniCanvas 
        : this.recoloredWatermarkCanvas;

      if (watermarkCanvas) {
        const margin = useMiniWatermark ? WATERMARK_MARGIN_MINI : WATERMARK_MARGIN_NORMAL;
        const x = safeWidth - margin - watermarkCanvas.width;
        const y = safeHeight - margin - watermarkCanvas.height;
        context.drawImage(watermarkCanvas, x, y);
      }
    }

    registerOutputCanvas(this.outputCanvas);
    return this.outputCanvas;
  }

  syncSplitOverlay() {
    const overlayCanvas = this.splitOverlayCanvas;
    const overlayImage = this.splitOverlayImage;
    const renderElement = this.canvasHost;

    if (!overlayCanvas) return;

    const showingOriginalOnly = Boolean(this.previewingOriginal);
    const shouldShowOverlay = showingOriginalOnly;

    if (!shouldShowOverlay || !overlayImage || !renderElement) {
      overlayCanvas.style.display = 'none';
      return;
    }

    const ctx = this.splitOverlayCtx;
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
  }

  syncVisibleLayer() {
    const sizeState = useSizeStore.getState();
    const left = sizeState.crop?.left || 0;
    const right = sizeState.crop?.right || 0;
    const top = sizeState.crop?.top || 0;
    const bottom = sizeState.crop?.bottom || 0;
    const hasCrop = left > 0 || right > 0 || top > 0 || bottom > 0;

    if (this.previewingOriginal) {
      this.syncSplitOverlay();
    } else {
      if (this.splitOverlayCanvas) {
        this.splitOverlayCanvas.style.display = 'none';
      }
    }

    const source = this.activeSource;
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

      this.applyDisplaySize(displayWidth, displayHeight);
    }
  }

  syncWatermarkPalette() {
    const paletteState = usePaletteStore.getState();
    const { darkColor, lightColor } = getPaletteExtremes(
      paletteState.colors,
      paletteState.colorCount,
    );

    const normalCanvas = generateRecoloredWatermark(
      this.watermarkImg,
      darkColor,
      lightColor
    );
    const miniCanvas = generateRecoloredWatermark(
      this.watermarkMiniImg,
      darkColor,
      lightColor
    );

    this.recoloredWatermarkCanvas = normalCanvas;
    this.recoloredWatermarkMiniCanvas = miniCanvas;

    const worker = this.worker;
    if (worker && normalCanvas && miniCanvas) {
      Promise.all([
        createImageBitmap(normalCanvas),
        createImageBitmap(miniCanvas),
      ]).then(([normalBitmap, miniBitmap]) => {
        if (worker === this.worker) {
          worker.postMessage({
            type: 'setWatermarks',
            normal: normalBitmap,
            mini: miniBitmap,
          }, [normalBitmap, miniBitmap]);
        }
      }).catch((e) => {
        this.error('Canvas', 'Failed to send watermarks to worker: %o', e);
      });
    }
  }

  cleanupWebcam() {
    if (this.webcamLoopTimer !== null) {
      window.clearTimeout(this.webcamLoopTimer);
      this.webcamLoopTimer = null;
    }

    const webcamVideo = this.webcamVideo;
    if (webcamVideo) {
      webcamVideo.pause();
      webcamVideo.srcObject = null;
      this.webcamVideo = null;
    }
    this.webcamCanvas = null;
    this.webcamCtx = null;
    this.isWebcamMode = false;
  }

  async initWebcam(lifecycleToken) {
    this.isWebcamMode = true;
    this.paletteFrozenForWebcam = false;

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

    if (this.lifecycleToken !== lifecycleToken || this.disposed) {
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
    
    this.webcamMirror = Boolean(useWebcamStore.getState().mirrored);
    drawWebcamFrameToCanvas(video, webcamCanvas, webcamCtx, this.webcamMirror);

    this.webcamVideo = video;
    this.webcamCanvas = webcamCanvas;
    this.webcamCtx = webcamCtx;
    this.activeSource = webcamCanvas;
    this.originalUniqueColors = 0;

    // Start webcam loop
    const scheduleWebcamFrame = () => {
      if (this.disposed || this.lifecycleToken !== lifecycleToken) return;
      if (this.engineState !== 'STREAMING') {
        this.cleanupWebcam();
        return;
      }
      const { targetFps } = useWebcamStore.getState();
      const interval = Math.max(33, Math.round(1000 / targetFps));

      this.webcamLoopTimer = window.setTimeout(() => {
        this.webcamLoopTimer = null;
        if (this.disposed || this.lifecycleToken !== lifecycleToken) return;

        const v = this.webcamVideo;
        const c = this.webcamCanvas;
        const ctx = this.webcamCtx;

        if (v && c && ctx && v.readyState >= 2) {
          drawWebcamFrameToCanvas(v, c, ctx, this.webcamMirror);
        }

        this.queueProcessing(false);
        scheduleWebcamFrame();
      }, interval);
    };

    this.setEngineState('STREAMING');
    scheduleWebcamFrame();
    return webcamCanvas;
  }

  swapSourceFrame(frameIndex) {
    const gifState = useGifStore.getState();
    const frame = gifState.frames?.[frameIndex];
    if (!frame || !frame.width || !frame.height || !frame.pixels) return;

    const needsFreshCanvas =
      !this.webcamCanvas || // reuse webcamCanvas reference as frameCanvas
      !this.webcamCtx ||
      this.webcamCanvas.width !== frame.width ||
      this.webcamCanvas.height !== frame.height;

    if (needsFreshCanvas) {
      this.webcamCanvas = document.createElement('canvas');
      this.webcamCanvas.width = frame.width;
      this.webcamCanvas.height = frame.height;
      this.webcamCtx = this.webcamCanvas.getContext('2d');
    }

    if (!this.webcamCtx || !this.webcamCanvas) return;

    this.webcamCtx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);

    this.activeSource = this.webcamCanvas;
    this.splitOverlayImage = this.webcamCanvas;

    this.internalFrameSwap = true;
    useSizeStore.getState().setSize({ width: frame.width, height: frame.height }, { resetCustom: false });

    const displaySize = getTargetDisplaySize();
    this.applyDisplaySize(
      displaySize.width,
      displaySize.height,
    );

    this.outputReady = false;
    this.outputMode = 'none';
    this.syncVisibleLayer();

    const cachedFrame = gifState.renderedFrames?.[frameIndex];
    const cachedState = gifState.frameStates?.[frameIndex];
    const shouldForceRefresh = this.pendingPaletteRefresh;
    if (cachedFrame && cachedState === 'done') {
      const cachedPixels = cachedFrame.pixels instanceof Uint8ClampedArray
        ? cachedFrame.pixels
        : new Uint8ClampedArray(cachedFrame.pixels || []);

      if (cachedPixels.length > 0) {
        this.updateOutputTexture(cachedPixels, cachedFrame.width, cachedFrame.height);
        this.outputMode = useDitherStore.getState().enabled ? 'dither' : 'clean';
        this.outputReady = true;

        registerRenderSnapshot({
          uniqueColors: cachedFrame.uniqueColors ?? 0,
          originalUniqueColors: this.originalUniqueColors,
        });

        this.syncVisibleLayer();

        if (shouldForceRefresh) {
          this.queueProcessing(true);
        }

        this.internalFrameSwap = false;
        return;
      }
    }

    this.queueProcessing(false);
    this.internalFrameSwap = false;
  }

  markGifFramesPending() {
    const gifState = useGifStore.getState();
    if ((gifState.frames?.length || 0) > 1) {
      gifState.markAllPending();
    }
  }
}

export const ditherEngine = new DitherEngine();
