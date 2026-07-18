import { useCallback, useEffect, useRef } from "react";
import usePerformanceStore from "../stores/engine/performanceStore";
import usePaletteStore, { EXTRACT_METHOD } from "../stores/data/paletteStore";
import useDitherStore from "../stores/engine/ditherStore";
import useGifStore from "../stores/media/gifStore";
import useParamsStore from "../stores/data/paramsStore";
import useSizeStore from "../stores/media/sizeStore";
import useWebcamStore from "../stores/media/webcamStore";
import useImageStore from "../stores/media/imageStore";
import useProcessingStore from "../stores/engine/processingStore";
import { registerPaletteReference, registerRenderSnapshot } from "../utils/canvasRegistry";
import {
  normalizePalette,
  hexToRgbUnit,
  captureThumbnailDataUrl,
} from "../utils/shaderHelpers";

const DITHER_WORKER_TIMEOUT_MS = 10000;
const PROCESSING_VISIBILITY_DELAY_MS = 100;

export default function useDitherWorker({
  activeSourceRef,
  originalUniqueColorsRef,
  previewingOriginalRef,
  outputCanvasRef,
  outputReadyRef,
  outputModeRef,
  isWebcamModeRef,
  paletteFrozenForWebcamRef,
  watermarkEnabledRef,
  lifecycleTokenRef,
  disposedRef,
  preserveVisibleOutput,
  updateOutputTexture,
  syncVisibleLayer,
  engineStateRef,
  recreateViewportCanvas,
  workerRef,
}) {
  const setRenderProcessing = useProcessingStore(s => s.setRenderProcessing);

  const latestRequestIdRef = useRef(0);
  const activeJobsRef = useRef(0);
  const ditherJobTimeoutsRef = useRef(new Map());
  const workerStartTimeRef = useRef(new Map());
  const textureUpdateStartTimeRef = useRef(new Map());
  const refreshPaletteForRequestRef = useRef(new Map());
  const ditherEnabledForRequestRef = useRef(new Map());
  const gifFrameForRequestRef = useRef(new Map());

  const rafIdRef = useRef(null);
  const processingVisibilityTimerRef = useRef(null);
  const processingVisibleRef = useRef(false);
  const processingQueuedRef = useRef(false);
  const pendingPaletteRefreshRef = useRef(false);

  const noiseFrameRef = useRef(0);
  const restartDitherWorkerRef = useRef(null);

  const setProcessingVisible = useCallback((visible) => {
    processingVisibleRef.current = visible;
    setRenderProcessing(visible);
  }, [setRenderProcessing]);

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

  const dispatchProcessing = useCallback(async (refreshPalette = false) => {
    if (engineStateRef.current !== 'READY' && engineStateRef.current !== 'STREAMING') {
      return;
    }
    const worker = workerRef.current;
    if (!worker || activeJobsRef.current > 0) return;

    if (!activeSourceRef.current) return;

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

    let sourceBitmap;
    const extractionStartTime = performance.now();
    try {
      sourceBitmap = await createImageBitmap(activeSourceRef.current);
      const extractionDuration = performance.now() - extractionStartTime;
      usePerformanceStore.getState().recordExtractionEnd(extractionDuration);
    } catch (error) {
      console.error('[pipeline] failed to create ImageBitmap from active source:', error);
      preserveVisibleOutput();
      return;
    }

    const sizeState = useSizeStore.getState();
    const sourceW = activeSourceRef.current.naturalWidth || activeSourceRef.current.width || 1;
    const sourceH = activeSourceRef.current.naturalHeight || activeSourceRef.current.height || 1;
    const customWidth = sizeState.customSize.customWidth || sourceW;
    const customHeight = sizeState.customSize.customHeight || sourceH;

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

      const crop = sizeState.crop || { top: 0, bottom: 0, left: 0, right: 0 };
      const paramsState = useParamsStore.getState();

      worker.postMessage({
        jobId: requestId,
        source: sourceBitmap,
        previewingOriginal: previewingOriginalRef.current,
        customWidth,
        customHeight,
        paletteRgb,
        forceCpu: paramsState.forceCpu,
        watermarkEnabled: watermarkEnabledRef.current,
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
      }, [sourceBitmap]);
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
  }, [
    setProcessingDelta,
    preserveVisibleOutput,
    previewingOriginalRef,
    disposedRef,
    engineStateRef,
    watermarkEnabledRef,
  ]);

  const flushProcessingQueue = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
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
    if (engineStateRef.current !== 'READY' && engineStateRef.current !== 'STREAMING') {
      return;
    }
    pendingPaletteRefreshRef.current = pendingPaletteRefreshRef.current || refreshPalette;
    processingQueuedRef.current = true;

    if (previewingOriginalRef.current) {
      return;
    }

    if (isWebcamModeRef.current) {
      flushProcessingQueue();
      return;
    }

    if (rafIdRef.current !== null) {
      return;
    }

    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      flushProcessingQueue();
    });
  }, [flushProcessingQueue, previewingOriginalRef, isWebcamModeRef, engineStateRef]);

  // Handle worker initialization and communication
  useEffect(() => {
    if (disposedRef.current) return;

    const lifecycleToken = lifecycleTokenRef.current;

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

      // Recreate viewport canvas because old one's control was permanently transferred to crashed worker
      recreateViewportCanvas();

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

    worker = new Worker(new URL('../workers/ditherWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    bindWorkerHandlers(worker);

    // Recreate and transfer canvas immediately to the newly initialized worker
    recreateViewportCanvas();

    return () => {
      worker?.terminate();
      workerRef.current = null;
      for (const timeoutId of ditherJobTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      ditherJobTimeoutsRef.current.clear();
      latestRequestIdRef.current = 0;
      activeJobsRef.current = 0;
      workerStartTimeRef.current.clear();
      textureUpdateStartTimeRef.current.clear();
      refreshPaletteForRequestRef.current.clear();
      ditherEnabledForRequestRef.current.clear();
      gifFrameForRequestRef.current.clear();

      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (processingVisibilityTimerRef.current !== null) {
        window.clearTimeout(processingVisibilityTimerRef.current);
        processingVisibilityTimerRef.current = null;
      }
      processingQueuedRef.current = false;
      pendingPaletteRefreshRef.current = false;
    };
  }, [
    lifecycleTokenRef,
    updateOutputTexture,
    syncVisibleLayer,
    preserveVisibleOutput,
    originalUniqueColorsRef,
    isWebcamModeRef,
    paletteFrozenForWebcamRef,
    disposedRef,
    outputCanvasRef,
    queueProcessing,
    recreateViewportCanvas,
    workerRef,
  ]);

  return {
    queueProcessing,
    flushProcessingQueue,
    latestRequestIdRef,
    workerRef,
    activeJobsRef,
    noiseFrameRef,
  };
}
