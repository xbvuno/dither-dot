import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, Copy, X, FileUp, Clipboard, Camera, CameraOff, FlipHorizontal, Trash2, Film, Dices } from 'lucide-react';
import useImageStore from '../stores/media/imageStore';
import useGalleryStore, { GALLERY_PRESETS } from '../stores/data/galleryStore';
import { getOutputCanvas } from '../utils/canvasRegistry';
import useParamsStore from '../stores/data/paramsStore';
import useGifStore from '../stores/media/gifStore';
import useWebcamStore, { WEBCAM_SOURCE } from '../stores/media/webcamStore';
import useWatermarkStore from '../stores/media/watermarkStore';
import watermarkImage from '../assets/watermark/watermark.png';
import watermarkMiniImage from '../assets/watermark/watermark-mini.png';

const SUPPORTED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'avif',
  'svg',
]);

const INPUT_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,image/avif,image/svg+xml';

function getExtension(fileName = '') {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function stripExtension(name = '') {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

function isLikelyImageFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
  return SUPPORTED_EXTENSIONS.has(getExtension(file.name));
}

const LARGE_IMAGE_THRESHOLD = 1920 * 1080;

function isGifFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.toLowerCase() === 'image/gif') return true;
  return getExtension(file.name) === 'gif';
}

function isWebpFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.toLowerCase() === 'image/webp') return true;
  return getExtension(file.name) === 'webp';
}

function getSourceExtension(src = '') {
  return getExtension(String(src).split(/[?#]/)[0]);
}

function isAnimatedSource(src = '') {
  const ext = getSourceExtension(src);
  return ext === 'gif' || ext === 'webp';
}

async function getImageDimensions(blob) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Failed to read image dimensions.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getReducedDimensions(width, height) {
  const pixelCount = width * height;
  if (pixelCount <= LARGE_IMAGE_THRESHOLD) {
    return { width, height };
  }

  const scale = Math.sqrt(LARGE_IMAGE_THRESHOLD / pixelCount);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function scaleDownBlob(blob, targetWidth, targetHeight) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image for resizing.'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((scaledBlob) => {
        if (!scaledBlob) {
          reject(new Error('Failed to resize image.'));
          return;
        }
        resolve(scaledBlob);
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function rgbaFrameToPngBlob(frame) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  ctx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to convert GIF frame to PNG.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function decodeGifWithWorker(blob, callbacks = {}) {
  const worker = new Worker(new URL('../workers/gifDecodeWorker.js', import.meta.url), { type: 'module' });
  const gifBuffer = await blob.arrayBuffer();
  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const { onFirstFrame, onFrame, onComplete } = callbacks;
  const isProgressive = typeof onFirstFrame === 'function';

  if (isProgressive) {
    worker.onmessage = (event) => {
      const payload = event.data || {};
      if (payload.jobId !== jobId) return;

      if (payload.error) {
        worker.terminate();
        onComplete?.(new Error(payload.error));
        return;
      }

      if (payload.type === 'frame') {
        const reconstructedFrame = {
          width: payload.frame.width,
          height: payload.frame.height,
          delay: payload.frame.delay,
          pixels: new Uint8ClampedArray(payload.frame.pixels),
        };
        if (payload.frameIndex === 0) {
          onFirstFrame(reconstructedFrame, payload.totalFrames, payload.loop);
        } else {
          onFrame?.(payload.frameIndex, reconstructedFrame);
        }
      } else if (payload.type === 'complete') {
        worker.terminate();
        onComplete?.(null);
      }
    };

    worker.onerror = () => {
      worker.terminate();
      onComplete?.(new Error('GIF decoding worker crashed.'));
    };

    worker.postMessage({ jobId, gifBuffer }, [gifBuffer]);
    return worker;
  }

  // Fallback to promise-based decoding
  try {
    const result = await new Promise((resolve, reject) => {
      const frames = [];
      let loopCount = 0;

      worker.onmessage = (event) => {
        const payload = event.data || {};
        if (payload.jobId !== jobId) return;

        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }

        if (payload.type === 'frame') {
          frames[payload.frameIndex] = {
            width: payload.frame.width,
            height: payload.frame.height,
            delay: payload.frame.delay,
            pixels: new Uint8ClampedArray(payload.frame.pixels),
          };
          loopCount = payload.loop;
        } else if (payload.type === 'complete') {
          resolve({ frames, loop: loopCount });
        }
      };

      worker.onerror = () => {
        reject(new Error('GIF decoding worker crashed.'));
      };

      worker.postMessage({ jobId, gifBuffer }, [gifBuffer]);
    });

    return result;
  } finally {
    try { worker.terminate(); } catch {}
  }
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read GIF data.'));
    reader.readAsDataURL(blob);
  });
}

async function getStaticPreviewFromBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to extract static preview.'));
    };
    img.src = objectUrl;
  });
}

function LargeImageDialog({ file, name, dims, onConfirm, onCancel }) {
  const gif = isGifFile(file);
  const reduced = getReducedDimensions(dims.width, dims.height);
  const [isReducing, setIsReducing] = useState(false);

  const handleReduce = async () => {
    if (gif || isReducing) return;
    setIsReducing(true);
    try {
      const scaledBlob = await scaleDownBlob(file, reduced.width, reduced.height);
      const reducedName = `${getExportBaseName(name)}-${reduced.width}x${reduced.height}.png`;
      await onConfirm(scaledBlob, reducedName);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'IMAGE REDUCTION FAILED.');
    } finally {
      setIsReducing(false);
    }
  };

  const handleContinue = async () => {
    await onConfirm(file, name);
  };

  return createPortal(
    <div className='large-file-overlay' onClick={onCancel}>
      <div className='large-file-dialog' onClick={event => event.stopPropagation()}>
        <p className='large-file-dialog-title'>LARGE IMAGE DETECTED</p>
        <p className='large-file-dialog-dims'>CURRENT SIZE: {dims.width} x {dims.height}</p>
        <p className='large-file-dialog-body'>
          LARGE IMAGE. PROCESSING MAY BE SLOW.
          {gif && <><br />GIFS WITH MANY FRAMES MAY BECOME SIGNIFICANTLY SLOWER.</>}
        </p>
        <div className='large-file-dialog-actions'>
          {!gif && (
            <button
              type='button'
              className='bv-option-btn large-file-btn-reduce'
              onClick={handleReduce}
              disabled={isReducing}
            >
              {isReducing ? 'REDUCING...' : `REDUCE TO ${reduced.width}x${reduced.height}`}
            </button>
          )}
          <button
            type='button'
            className='bv-option-btn'
            onClick={handleContinue}
            disabled={isReducing}
          >
            CONTINUE {dims.width}x{dims.height}
          </button>
          <button
            type='button'
            className='bv-option-btn danger-btn'
            onClick={onCancel}
            disabled={isReducing}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function buildClipboardFileName(mimeType = 'image/png') {
  const extension = mimeType.split('/')[1] || 'png';
  return `clipboard-${Date.now()}.${extension}`;
}

async function validateImageFile(file) {
  if (!file) {
    throw new Error('No file selected.');
  }

  if (!isLikelyImageFile(file)) {
    throw new Error('The selected file is not a supported image format.');
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close?.();
      return;
    } catch {
      // Fallback to HTMLImageElement decode below.
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image could not be decoded.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getExportBaseName(sourceName = '') {
  return sourceName.replace(/\.[^.]+$/, '').trim() || 'export';
}

async function saveCanvasAsPng(canvas, sourceName) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${getExportBaseName(sourceName)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

async function copyCanvasToClipboard(canvas) {
  if (!navigator.clipboard?.write) {
    throw new Error('Clipboard write API is not available in this browser.');
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 'image/png');
  });
}

function getExportCanvasOrThrow() {
  const canvas = getOutputCanvas();
  if (!canvas) {
    throw new Error('No output to export yet. Process an image first.');
  }
  return canvas;
}

async function compositeWithWatermark(canvas) {
  if (!useWatermarkStore.getState().enabled) return canvas;

  const useMini = canvas.width < 64 || canvas.height < 64;
  const src = useMini ? watermarkMiniImage : watermarkImage;
  const margin = useMini ? 2 : 4;

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });

  const composite = document.createElement('canvas');
  composite.width = canvas.width;
  composite.height = canvas.height;
  const ctx = composite.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.drawImage(img, canvas.width - margin - img.naturalWidth, canvas.height - margin - img.naturalHeight);
  return composite;
}

/* ---------------------------------- */
/* WEBCAM SECTION                     */
/* ---------------------------------- */

function WebcamSection() {
  const frameReady = useWebcamStore(s => s.frameReady);
  const error = useWebcamStore(s => s.error);
  const mirrored = useWebcamStore(s => s.mirrored);
  const targetFps = useWebcamStore(s => s.targetFps);
  const toggleMirrored = useWebcamStore(s => s.toggleMirrored);
  const setTargetFps = useWebcamStore(s => s.setTargetFps);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!status) return undefined;

    const timeoutId = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const withOutputCanvas = async (action) => {
    try {
      const canvas = await compositeWithWatermark(getExportCanvasOrThrow());
      await action(canvas);
      setStatus(null);
    } catch (cameraError) {
      const message = cameraError instanceof Error ? cameraError.message : 'Camera screenshot failed.';
      setStatus(message);
    }
  };

  const handleSaveScreenshot = async () => {
    await withOutputCanvas((canvas) => saveCanvasAsPng(canvas, `webcam-screenshot-${Date.now()}`));
  };

  const handleCopyScreenshot = async () => {
    await withOutputCanvas(copyCanvasToClipboard);
  };

  return (
    <>
      <div className='bv-section'>
        <p className='bv-label'>WEBCAM</p>
        <div className='bv-option-group'>
          <button
            type='button'
            className={`bv-option-btn import-btn${mirrored ? ' active' : ''}`}
            onClick={toggleMirrored}
          >
            <FlipHorizontal size={13} strokeWidth={1.5} />
            FLIP CAMERA
          </button>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={handleSaveScreenshot}
            disabled={!frameReady}
            title={!frameReady ? 'Waiting for first rendered frame…' : undefined}
          >
            <Save size={13} strokeWidth={1.5} />
            SAVE SHOT
          </button>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={handleCopyScreenshot}
            disabled={!frameReady}
            title={!frameReady ? 'Waiting for first rendered frame…' : undefined}
          >
            <Copy size={13} strokeWidth={1.5} />
            COPY SHOT
          </button>
        </div>
        {error && <p className='import-export-status'>{error}</p>}
        {!error && status && <p className='import-export-status'>{status}</p>}
      </div>

      <div className='bv-section'>
        <p className='bv-label'>TARGET FPS</p>
        <div className='bv-option-group'>
          {[5, 10, 15, 20, 30].map(fps => (
            <button
              key={fps}
              type='button'
              className={`bv-option-btn${targetFps === fps ? ' active' : ''}`}
              onClick={() => setTargetFps(fps)}
            >
              {fps}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------- */
/* SOURCE SECTION                     */
/* ---------------------------------- */

function SourceSection() {
  const sourceName    = useImageStore(s => s.sourceName);
  const sourceImg     = useImageStore(s => s.sourceImg);
  const sourceKind    = useImageStore(s => s.sourceKind);
  const setSourceName = useImageStore(s => s.setSourceName);
  const history       = useGalleryStore(s => s.history);
  const renameHistoryItem = useGalleryStore(s => s.renameHistoryItem);

  const [editValue, setEditValue] = useState(getExportBaseName(sourceName));
  const isFocused = useRef(false);
  const matchRef = useRef(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      if (!isFocused.current) {
        setEditValue(getExportBaseName(sourceName));
      }
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [sourceName]);

  // Cache the matching history entry when input is focused
  const handleFocus = () => {
    isFocused.current = true;
    matchRef.current = history.find(e => e.src === sourceImg || (e.gifDataUrl && e.name === sourceName)) ?? null;
  };

  const isDefault = sourceKind === 'default';
  const label = isDefault ? `${sourceName} (default)` : null;

  const handleChange = (e) => {
    const val = e.target.value;
    setEditValue(val);
    const trimmed = val.trim();
    if (trimmed) {
      setSourceName(trimmed);
      if (matchRef.current) renameHistoryItem(matchRef.current.id, trimmed);
    }
  };

  const handleBlur = () => {
    isFocused.current = false;
    matchRef.current = null;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditValue(getExportBaseName(sourceName));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') { setEditValue(getExportBaseName(sourceName)); e.target.blur(); }
  };

  return (
    <div className='bv-section'>
      <p className='bv-label'>SOURCE</p>
      {isDefault
        ? <p className='import-current-file'>{label}</p>
        : (
          <input
            type='text'
            className='import-name-input'
            value={editValue}
            onFocus={handleFocus}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
        )
      }
    </div>
  );
}

/* ---------------------------------- */
/* GALLERY THUMB ITEM                 */
/* ---------------------------------- */

function GalleryThumbItem({ item, isActive, onSelect, onDelete, showDelete = true }) {
  const [hovered, setHovered] = useState(false);
  const displaySrc = hovered && item.gifDataUrl ? item.gifDataUrl : item.src;
  const isAnimated = item.kind === 'gif' || Boolean(item.gifDataUrl);

  return (
    <div
      className={`gallery-thumb-wrap${isActive ? ' gallery-thumb-wrap--active' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type='button'
        className={`gallery-thumb${isActive ? ' gallery-thumb--active' : ''}`}
        onClick={onSelect}
        title={item.name}
      >
        <img src={displaySrc} alt={item.name} draggable={false} />
        <span className='gallery-thumb-label'>{item.name}</span>
        {isAnimated && (
          <span className='gallery-thumb-anim-badge' aria-hidden='true'>
            <Film size={16} strokeWidth={2} />
          </span>
        )}
      </button>
      {showDelete && (
        <button
          type='button'
          className='gallery-thumb-delete'
          onClick={onDelete}
          title={`Delete ${item.name}`}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------- */
/* GALLERY SECTION                    */
/* ---------------------------------- */

function GallerySection() {
  const sourceImg      = useImageStore(s => s.sourceImg);
  const sourceName     = useImageStore(s => s.sourceName);
  const setSourceDirect = useImageStore(s => s.setSourceDirect);
  const setSourceFromBlob = useImageStore(s => s.setSourceFromBlob);
  const resetToDefault = useImageStore(s => s.resetToDefault);
  const gifFramesLen = useGifStore(s => s.frames.length);
  const setGifFrames = useGifStore(s => s.setFrames);
  const history        = useGalleryStore(s => s.history);
  const removeHistoryItem = useGalleryStore(s => s.removeHistoryItem);
  const [presetStaticPreviews, setPresetStaticPreviews] = useState({});
  const hasHistory = history.length > 0;
  const presetItems = GALLERY_PRESETS;
  const importedItems = history;

  useEffect(() => {
    let cancelled = false;

    const hydrateAnimatedPresetPreviews = async () => {
      const next = {};
      for (const item of presetItems) {
        if (!isAnimatedSource(item.src)) continue;
        try {
          const response = await fetch(item.src);
          if (!response.ok) continue;
          const blob = await response.blob();
          next[item.id] = await getStaticPreviewFromBlob(blob);
        } catch {
          // Keep using source URL if preview extraction fails.
        }
      }

      if (!cancelled && Object.keys(next).length) {
        setPresetStaticPreviews(next);
      }
    };

    void hydrateAnimatedPresetPreviews();
    return () => {
      cancelled = true;
    };
  }, [presetItems]);

  const handleClear = () => {
    useGalleryStore.getState().clearHistory();
    if (sourceImg && history.some((item) => item.src === sourceImg)) {
      resetToDefault();
    }
  };

  const handleDeleteItem = (event, item) => {
    event.stopPropagation();
    removeHistoryItem(item.id);
    if (sourceImg === item.src) {
      resetToDefault();
    }
  };

  const handleSelectHistoryItem = async (item) => {
    const isGifActive = item.kind === 'gif' && gifFramesLen > 1 && sourceName === item.name;
    const isActive = isGifActive || sourceImg === item.src;
    if (isActive) {
      return;
    }

    if (item.kind === 'gif' && item.gifDataUrl) {
      setDecoding(true);
      try {
        const response = await fetch(item.gifDataUrl);
        if (!response.ok) {
          throw new Error('Failed to load GIF from gallery.');
        }

        const gifBlob = await response.blob();
        const decoded = await decodeGifWithWorker(gifBlob);
        if (!decoded.frames.length) {
          throw new Error('GIF decode returned no frames.');
        }

        setGifFrames(decoded.frames, decoded.loop);
        const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
        await setSourceFromBlob(firstFrameBlob, item.name, { skipHistory: true });
      } catch (error) {
        setDecoding(false);
        alert(error instanceof Error ? error.message : 'FAILED TO LOAD GIF FROM GALLERY.');
      }
      return;
    }

    setSourceDirect(item.src, item.name, 'imported');
  };

  const handleSelectPresetItem = async (item, isAnimatedPreset, staticPreviewSrc) => {
    if (!isAnimatedPreset) {
      if (sourceImg === item.src) return;
      setSourceDirect(item.src, item.name, 'default');
      return;
    }

    if (sourceName === item.name && sourceImg === staticPreviewSrc) {
      return;
    }

    try {
      const response = await fetch(item.src);
      if (!response.ok) {
        throw new Error('Failed to load animated preset.');
      }

      const animatedBlob = await response.blob();
      const staticPreview = staticPreviewSrc === item.src
        ? await getStaticPreviewFromBlob(animatedBlob)
        : staticPreviewSrc;

      if (staticPreviewSrc === item.src) {
        setPresetStaticPreviews((prev) => ({ ...prev, [item.id]: staticPreview }));
      }

      setSourceDirect(staticPreview, item.name, 'default');

      if (getSourceExtension(item.src) === 'gif') {
        setDecoding(true);
        try {
          const decoded = await decodeGifWithWorker(animatedBlob);
          if (decoded.frames.length) {
            setGifFrames(decoded.frames, decoded.loop);
          } else {
            setDecoding(false);
          }
        } catch (error) {
          setDecoding(false);
          throw error;
        }
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'FAILED TO LOAD ANIMATED PRESET.');
    }
  };

  return (
    <>
      {importedItems.length > 0 && <div className='bv-section'>
        <div className='bv-controls-row'>
          <p className='bv-label'>IMPORTED</p>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={handleClear}
            disabled={!hasHistory}
          >
            <Trash2 size={13} strokeWidth={1.5} />
            CLEAR
          </button>
        </div>
        {importedItems.length > 0 && (
          <div className='gallery-grid'>
            {importedItems.map(item => {
              const isGifActive = item.kind === 'gif' && gifFramesLen > 1 && sourceName === item.name;
              const isActive = isGifActive || sourceImg === item.src;
              return (
                <GalleryThumbItem
                  key={item.id}
                  item={item}
                  isActive={isActive}
                  onSelect={() => { void handleSelectHistoryItem(item); }}
                  onDelete={(event) => handleDeleteItem(event, item)}
                  showDelete
                />
              );
            })}
          </div>
        )}
      </div>}

      <div className='bv-section'>
        <p className='bv-label'>PRESET</p>
        <div className='gallery-grid'>
          {presetItems.map(item => {
            const isAnimatedPreset = isAnimatedSource(item.src);
            const staticPreviewSrc = isAnimatedPreset
              ? (presetStaticPreviews[item.id] || item.src)
              : item.src;

            const presetThumbItem = isAnimatedPreset
              ? { ...item, src: staticPreviewSrc, kind: 'gif', gifDataUrl: item.src }
              : { ...item, kind: 'image', gifDataUrl: null };

            const isActive = isAnimatedPreset
              ? (sourceName === item.name && sourceImg === staticPreviewSrc)
              : sourceImg === item.src;

            return (
              <GalleryThumbItem
                key={item.id}
                item={presetThumbItem}
                isActive={isActive}
                onSelect={() => { void handleSelectPresetItem(item, isAnimatedPreset, staticPreviewSrc); }}
                onDelete={() => {}}
                showDelete={false}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------- */
/* PAGE                               */
/* ---------------------------------- */

export default function ImportPage() {
  const inputRef = useRef(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [isRandomLoading, setIsRandomLoading] = useState(false);

  const setSourceFromBlob = useImageStore(s => s.setSourceFromBlob);
  const pushGifHistory = useGalleryStore(s => s.pushGifHistory);
  const setGifFrames = useGifStore(s => s.setFrames);
  const setDecoding = useGifStore(s => s.setDecoding);
  const clearGifFrames = useGifStore(s => s.clearFrames);
  const setSourceDirect = useImageStore(s => s.setSourceDirect);
  const resetToDefault = useImageStore(s => s.resetToDefault);
  const webcamActive = useWebcamStore(s => s.active);
  const webcamStarting = useWebcamStore(s => s.starting);
  const startWebcam = useWebcamStore(s => s.startWebcam);
  const stopWebcam = useWebcamStore(s => s.stopWebcam);
  const showPipeline = useParamsStore((s) => s.pipelineVisible);
  const setShowPipeline = useParamsStore((s) => s.setPipelineVisible);
  const forceCpu = useParamsStore((s) => s.forceCpu);
  const setForceCpu = useParamsStore((s) => s.setForceCpu);

  const doImport = useCallback(async (blob, name) => {
    if (isGifFile({ type: blob?.type, name })) {
      setDecoding(true);
      try {
        const decoded = await decodeGifWithWorker(blob);
        if (!decoded.frames.length) {
          throw new Error('GIF decode returned no frames.');
        }

        setGifFrames(decoded.frames, decoded.loop);

        const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
        await setSourceFromBlob(firstFrameBlob, name, { skipHistory: true });

        const previewSrc = await blobToDataUrl(firstFrameBlob);
        const gifDataUrl = await blobToDataUrl(blob);
        pushGifHistory(previewSrc, name, gifDataUrl);
      } catch (error) {
        setDecoding(false);
        throw error;
      }
      return;
    }

    clearGifFrames();

    if (isWebpFile({ type: blob?.type, name })) {
      const animDataUrl = await blobToDataUrl(blob);
      const previewSrc = await getStaticPreviewFromBlob(blob);
      await setSourceFromBlob(blob, name, { skipHistory: true });
      pushGifHistory(previewSrc, name, animDataUrl);
      return;
    }

    await setSourceFromBlob(blob, name);
  }, [clearGifFrames, pushGifHistory, setGifFrames, setSourceFromBlob]);

  const importWithSizeCheck = useCallback(async (blob, name) => {
    const dims = await getImageDimensions(blob);
    const pixelCount = dims.width * dims.height;

    if (pixelCount > LARGE_IMAGE_THRESHOLD) {
      setPendingImport({
        file: blob,
        name,
        dims,
      });
      return;
    }

    await doImport(blob, name);
  }, [doImport]);

  const confirmImport = useCallback(async (blob, name) => {
    setPendingImport(null);
    await doImport(blob, name);
  }, [doImport]);

  const importFromFile = useCallback(async (file) => {
    try {
      await validateImageFile(file);
      const rawName = typeof file.name === 'string' && file.name ? file.name : buildClipboardFileName(file.type || 'image/png');
      const name = stripExtension(rawName);
      await importWithSizeCheck(file, name);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Image import failed.');
    }
  }, [importWithSizeCheck]);

  const handleFilePickerChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      alert('No file selected. Please choose an image file.');
      return;
    }
    await importFromFile(file);
    event.target.value = '';
  };

  const handlePaste = useCallback(async (event) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const item = Array.from(clipboardData.items || []).find(entry => entry.type.startsWith('image/'));
    if (!item) {
      alert('Clipboard does not contain an image.');
      return;
    }

    event.preventDefault();

    const blob = item.getAsFile();
    if (!blob) {
      alert('Clipboard image data is not readable.');
      return;
    }

    await importFromFile(blob);
  }, [importFromFile]);

  const importFromClipboardButton = async () => {
    if (!navigator.clipboard?.read) {
      alert('Clipboard read API is not available in this browser. Try Ctrl+V instead.');
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      const imageItem = items.find(item => item.types.some(type => type.startsWith('image/')));

      if (!imageItem) {
        alert('No image found in clipboard.');
        return;
      }

      const imageType = imageItem.types.find(type => type.startsWith('image/'));
      if (!imageType) {
        alert('No supported image type found in clipboard.');
        return;
      }

      const blob = await imageItem.getType(imageType);
      await validateImageFile(blob);
      await importWithSizeCheck(blob, buildClipboardFileName(imageType));
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        alert('Clipboard permission denied. Allow clipboard access and try again.');
        return;
      }
      alert('Failed to read image from clipboard.');
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDropActive(false);

    const files = Array.from(event.dataTransfer?.files || []);
    const file = files[0];

    if (!file) {
      alert('No file detected in drop payload.');
      return;
    }

    await importFromFile(file);
  };

  const handleWebcamToggle = async () => {
    if (webcamActive) {
      stopWebcam();
      resetToDefault();
      return;
    }

    await startWebcam();
    const state = useWebcamStore.getState();
    if (!state.active) return;
    clearGifFrames();
    setSourceDirect(WEBCAM_SOURCE, 'WEBCAM', 'webcam');
  };

  const handleRandomImage = async () => {
    if (isRandomLoading) return;
    setIsRandomLoading(true);
    try {
      const w = Math.floor(Math.random() * (1980 - 400 + 1)) + 400;
      const h = Math.floor(Math.random() * (1080 - 300 + 1)) + 300;
      const url = `https://picsum.photos/${w}/${h}?random=${Date.now()}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch image from Lorem Picsum.');
      }
      
      const blob = await response.blob();
      await validateImageFile(blob);
      const name = `lorem-picsum-${w}x${h}`;
      await importWithSizeCheck(blob, name);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Random image import failed.');
    } finally {
      setIsRandomLoading(false);
    }
  };

  useEffect(() => {
    const onPaste = (event) => handlePaste(event);
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handlePaste]);

  return (
    <div>
      <div className='bv-macro-section'>
      <h2>IMPORT</h2>

      <div className='bv-section'>
        <p className='bv-label'>DROP OR PASTE</p>
        <div
          className={`import-dropzone${isDropActive ? ' active' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDropActive(true); }}
          onDragOver={(event) => { event.preventDefault(); setIsDropActive(true); }}
          onDragLeave={(event) => { event.preventDefault(); setIsDropActive(false); }}
          onDrop={handleDrop}
        >
          DROP IMAGE HERE OR PRESS CTRL+V
        </div>
      </div>

      <div className='bv-section'>
        <p className='bv-label'>IMPORT</p>
        <div className='bv-option-group'>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={() => inputRef.current?.click()}
          >
            <FileUp size={13} strokeWidth={1.5} />
            IMPORT FILE
          </button>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={importFromClipboardButton}
          >
            <Clipboard size={13} strokeWidth={1.5} />
            READ CLIPBOARD
          </button>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={handleRandomImage}
            disabled={isRandomLoading}
          >
            <Dices size={13} strokeWidth={1.5} />
            {isRandomLoading ? 'LOADING...' : 'RANDOM IMAGE'}
          </button>
          <button
            type='button'
            className={`bv-option-btn import-btn${webcamActive ? ' danger-btn' : ''}`}
            onClick={handleWebcamToggle}
            disabled={webcamStarting}
          >
            {webcamActive ? <CameraOff size={13} strokeWidth={1.5} /> : <Camera size={13} strokeWidth={1.5} />}
            {webcamStarting ? 'STARTING...' : webcamActive ? 'STOP WEBCAM' : 'START WEBCAM'}
          </button>
        </div>
        <input
          ref={inputRef}
          type='file'
          accept={INPUT_ACCEPT}
          onChange={handleFilePickerChange}
          style={{ display: 'none' }}
        />
      </div>

      {webcamActive && <WebcamSection />}
      </div>

      <div className='bv-macro-section'>
        <h2>GALLERY</h2>
        <SourceSection />
        <GallerySection />
      </div>

      <div className='bv-section'>
        <div className='bv-controls-row'>
          <span className='bv-label'>PIPELINE</span>
          <div className='bv-option-group histogram-toggle-group'>
            <button
              type='button'
              className={`bv-option-btn${showPipeline ? ' active' : ''}`}
              onClick={() => setShowPipeline(true)}
            >
              SHOW
            </button>
            <button
              type='button'
              className={`bv-option-btn${!showPipeline ? ' active' : ''}`}
              onClick={() => setShowPipeline(false)}
            >
              HIDE
            </button>
          </div>
        </div>
      </div>

      <div className='bv-section'>
        <div className='bv-controls-row'>
          <span className='bv-label'>FORCE CPU</span>
          <div className='bv-option-group histogram-toggle-group'>
            <button
              type='button'
              className={`bv-option-btn${forceCpu ? ' active' : ''}`}
              onClick={() => setForceCpu(true)}
            >
              ON
            </button>
            <button
              type='button'
              className={`bv-option-btn${!forceCpu ? ' active' : ''}`}
              onClick={() => setForceCpu(false)}
            >
              OFF
            </button>
          </div>
        </div>
      </div>

      {pendingImport && (
        <LargeImageDialog
          file={pendingImport.file}
          name={pendingImport.name}
          dims={pendingImport.dims}
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}


