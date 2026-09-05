import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileUp,
  Clipboard,
  Camera,
  CameraOff,
  Dices,
  Trash2,
} from 'lucide-react';
import useImageStore from '../../stores/media/imageStore';
import useGalleryStore, { GALLERY_PRESETS } from '../../stores/data/galleryStore';
import useGifStore from '../../stores/media/gifStore';
import useWebcamStore, { WEBCAM_SOURCE } from '../../stores/media/webcamStore';
import useTemplateStore from '../../stores/data/templateStore';
import usePageStore, { PAGE } from '../../stores/ui/pageStore';
import { TEMPLATES } from '../../constants/templates';
import { generateTemplatePreview } from '../../utils/templatePreviewGenerator';
import ZoomableDiv from '../ui/shared/ZoomableDiv';
import ImageShader from '../canvas/ImageShader';
import WaveGridSpinner from '../ui/shared/WaveGridSpinner';
import PopupMessage from '../ui/shared/PopupMessage';
import WebcamSection from './WebcamSection';
import LargeImageDialog from './LargeImageDialog';
import statuePreviewUrl from '../../assets/STATUE_PREVIEW.png';
import '../../styles/ImportRoute.css';

function TemplateCard({ tpl, isSelected, onSelect }) {
  const [previewSrc, setPreviewSrc] = useState('');

  useEffect(() => {
    let canceled = false;
    generateTemplatePreview(tpl)
      .then((url) => {
        if (!canceled && url) {
          setPreviewSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [tpl]);

  return (
    <div
      className={`import-route-template-card${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(tpl.id)}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          console.log(`[TEMPLATE CONFIG: ${tpl.name}]`, tpl);
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          console.log(`[TEMPLATE CONFIG: ${tpl.name}]`, tpl);
        }
      }}
      role='button'
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(tpl.id);
        }
      }}
    >
      <div className='import-route-template-preview-wrap'>
        <img
          src={previewSrc || statuePreviewUrl}
          alt={tpl.name}
          className={`import-route-template-preview-img${!previewSrc ? ' placeholder' : ''}`}
          loading='lazy'
        />
      </div>

      <div className='import-route-template-bottom'>
        <span className='import-route-template-name'>{tpl.name}</span>
        {tpl.author && <span className='import-route-template-author'>by {tpl.author}</span>}
      </div>
    </div>
  );
}

function OriginalMediaPreview({
  sourceImg,
  frames,
  currentFrameIndex,
  isGif,
  webcamActive,
  webcamStream,
  webcamMirrored,
}) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!webcamActive || !videoRef.current || !webcamStream) return;
    const video = videoRef.current;
    if (video.srcObject !== webcamStream) {
      video.srcObject = webcamStream;
      video.play().catch(() => {});
    }
  }, [webcamActive, webcamStream]);

  useEffect(() => {
    if (!isGif || !canvasRef.current || !frames || frames.length <= 1) return;
    const canvas = canvasRef.current;
    const frame = frames[currentFrameIndex] || frames[0];
    if (!frame || !frame.pixels) return;

    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(frame.pixels, frame.width, frame.height);
    ctx.putImageData(imgData, 0, 0);
  }, [isGif, frames, currentFrameIndex]);

  if (webcamActive && webcamStream) {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className='import-preview-source-img'
        style={{
          display: 'block',
          transform: webcamMirrored ? 'scaleX(-1)' : 'none',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    );
  }

  if (isGif && frames && frames.length > 1) {
    const first = frames[0];
    return (
      <canvas
        ref={canvasRef}
        width={first?.width || 100}
        height={first?.height || 100}
        className='import-preview-source-img'
        style={{
          display: 'block',
          imageRendering: 'pixelated',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    );
  }

  return (
    <img
      className='import-preview-source-img'
      src={sourceImg}
      alt='Original Media'
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    />
  );
}

export default function ImportStudio() {
  const inputRef = useRef(null);

  const [isDropActive, setIsDropActive] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [isRandomLoading, setIsRandomLoading] = useState(false);

  // Store bindings
  const sourceImg = useImageStore((s) => s.sourceImg);
  const sourceName = useImageStore((s) => s.sourceName);
  const viewerLoading = useImageStore((s) => s.viewerLoading);
  const setSourceFromBlob = useImageStore((s) => s.setSourceFromBlob);
  const setSourceDirect = useImageStore((s) => s.setSourceDirect);

  const history = useGalleryStore((s) => s.history);
  const pushGifHistory = useGalleryStore((s) => s.pushGifHistory);
  const removeHistoryItem = useGalleryStore((s) => s.removeHistoryItem);
  const clearHistory = useGalleryStore((s) => s.clearHistory);

  const frames = useGifStore((s) => s.frames);
  const currentFrameIndex = useGifStore((s) => s.currentFrameIndex);
  const playing = useGifStore((s) => s.playing);
  const frameStates = useGifStore((s) => s.frameStates);
  const setCurrentFrameIndex = useGifStore((s) => s.setCurrentFrameIndex);
  const setPlaying = useGifStore((s) => s.setPlaying);
  const setGifFrames = useGifStore((s) => s.setFrames);
  const setDecoding = useGifStore((s) => s.setDecoding);
  const clearGifFrames = useGifStore((s) => s.clearFrames);

  const [gifSourceUrl, setGifSourceUrl] = useState(() => {
    const gifState = useGifStore.getState();
    if (gifState.frames?.length > 1) {
      const currentName = useImageStore.getState().sourceName;
      if (currentName === 'PIZZA COW' || currentName === 'PIZZA_COW') {
        const pizzaPreset = GALLERY_PRESETS.find((p) => p.id === 'preset-pizza-cow');
        return pizzaPreset?.src || null;
      }
      const historyItem = useGalleryStore.getState().history.find((h) => h.name === currentName && h.kind === 'gif');
      return historyItem?.gifDataUrl || null;
    }
    return null;
  });

  const webcamActive = useWebcamStore((s) => s.active);
  const webcamStarting = useWebcamStore((s) => s.starting);
  const webcamStream = useWebcamStore((s) => s.stream);
  const webcamMirrored = useWebcamStore((s) => s.mirrored);
  const startWebcam = useWebcamStore((s) => s.startWebcam);
  const stopWebcam = useWebcamStore((s) => s.stopWebcam);

  const selectedTemplateId = useTemplateStore((s) => s.selectedTemplateId);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setPage = usePageStore((s) => s.setPage);

  const mediaColRef = useRef(null);
  const resizeHandleRef = useRef(null);

  // Ensure loaded GIFs are set to playing on mount
  useEffect(() => {
    if (frames.length > 1 && !playing) {
      setPlaying(true);
    }
  }, [frames.length, playing, setPlaying]);

  // GIF playback animation loop in Import view
  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    if (frameStates[currentFrameIndex] !== 'done') return;

    const isAllDone =
      frameStates.length === frames.length &&
      frameStates.every((s) => s === 'done');

    const nextIndex = (currentFrameIndex + 1) % frames.length;
    if (!frames[nextIndex]) {
      setPlaying(false);
      return;
    }

    const activeFrameDelay = frames[currentFrameIndex]?.delay;
    const naturalDelay = Math.max(20, Number(activeFrameDelay) || 100);
    const delay = isAllDone ? naturalDelay : 0;

    const timer = window.setTimeout(() => {
      setCurrentFrameIndex(nextIndex);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentFrameIndex, frameStates, frames, playing, setCurrentFrameIndex, setPlaying]);

  // Resize column 1 handler
  useEffect(() => {
    const col = mediaColRef.current;
    const handle = resizeHandleRef.current;
    if (!col || !handle) return;

    const root = document.documentElement;
    const minW = 320;
    const maxW = 768;

    try {
      const savedWidth = window.localStorage.getItem('dither-dot:import-media-width');
      if (savedWidth) {
        const parsed = parseFloat(savedWidth);
        if (!isNaN(parsed) && parsed >= minW && parsed <= maxW) {
          col.style.width = `${parsed}px`;
        }
      }
    } catch {}

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let pendingWidth = null;
    let frameId = null;

    const clampWidth = (val) => Math.max(minW, Math.min(maxW, val));

    const flushWidth = () => {
      frameId = null;
      if (pendingWidth == null) return;
      col.style.width = pendingWidth + 'px';
      pendingWidth = null;
    };

    const startResize = (e) => {
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidth = col.getBoundingClientRect().width;
      handle.classList.add('dragging');
      root?.classList.add('is-resizing-aside');
    };

    const stopResize = () => {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove('dragging');
      root?.classList.remove('is-resizing-aside');

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }

      if (pendingWidth != null) {
        col.style.width = pendingWidth + 'px';
        pendingWidth = null;
      }

      try {
        const currentWidth = col.getBoundingClientRect().width;
        window.localStorage.setItem('dither-dot:import-media-width', String(clampWidth(currentWidth)));
      } catch {}
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const deltaX = e.clientX - startX;
      let newWidth = clampWidth(startWidth + deltaX);
      pendingWidth = newWidth;

      if (frameId === null) {
        frameId = window.requestAnimationFrame(flushWidth);
      }
    };

    handle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);

    return () => {
      handle.removeEventListener('mousedown', startResize);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stopResize);
      stopResize();
      root?.classList.remove('is-resizing-aside');
    };
  }, []);

  // Import handlers
  const doImport = useCallback(
    async (blob, name) => {
      const isGif = blob?.type === 'image/gif' || name?.toLowerCase().endsWith('.gif');
      if (isGif) {
        setDecoding(true);
        try {
          const { decodeGifWithWorker, rgbaFrameToPngBlob, blobToDataUrl } = await import('../../utils/gifDecodeUtils');
          const decoded = await decodeGifWithWorker(blob);
          if (!decoded.frames.length) {
            throw new Error('GIF decode returned no frames.');
          }

          setGifFrames(decoded.frames, decoded.loop);
          setPlaying(true);

          const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
          await setSourceFromBlob(firstFrameBlob, name, { skipHistory: true });

          const previewSrc = await blobToDataUrl(firstFrameBlob);
          const gifDataUrl = await blobToDataUrl(blob);
          setGifSourceUrl(gifDataUrl);
          pushGifHistory(previewSrc, name, gifDataUrl);
        } catch (error) {
          setDecoding(false);
          throw error;
        }
        return;
      }

      setGifSourceUrl(null);
      clearGifFrames();

      const isWebp = blob?.type === 'image/webp' || name?.toLowerCase().endsWith('.webp');
      if (isWebp) {
        const { blobToDataUrl, getStaticPreviewFromBlob } = await import('../../utils/gifDecodeUtils');
        const animDataUrl = await blobToDataUrl(blob);
        const previewSrc = await getStaticPreviewFromBlob(blob);
        await setSourceFromBlob(blob, name, { skipHistory: true });
        pushGifHistory(previewSrc, name, animDataUrl);
        return;
      }

      await setSourceFromBlob(blob, name);
    },
    [clearGifFrames, pushGifHistory, setDecoding, setGifFrames, setPlaying, setSourceFromBlob]
  );

  const importWithSizeCheck = useCallback(
    async (blob, name) => {
      const { getImageDimensions, LARGE_IMAGE_THRESHOLD } = await import('../../utils/importUtils');
      const dimensions = await getImageDimensions(blob);
      const isOversized =
        dimensions.width > LARGE_IMAGE_THRESHOLD || dimensions.height > LARGE_IMAGE_THRESHOLD;

      if (isOversized) {
        setPendingImport({ blob, name, dimensions });
        return;
      }

      await doImport(blob, name);
    },
    [doImport]
  );

  const importFromFile = useCallback(
    async (file) => {
      const { validateImageFile, stripExtension } = await import('../../utils/importUtils');
      try {
        await validateImageFile(file);
        const name = stripExtension(file.name).toUpperCase();
        await importWithSizeCheck(file, name);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Image import failed.');
      }
    },
    [importWithSizeCheck]
  );

  const handleFilePickerChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importFromFile(file);
    event.target.value = '';
  };

  const handlePaste = useCallback(
    async (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const item = Array.from(clipboardData.items || []).find((entry) => entry.type.startsWith('image/'));
      if (!item) return;

      event.preventDefault();
      const blob = item.getAsFile();
      if (!blob) return;

      await importFromFile(blob);
    },
    [importFromFile]
  );

  const importFromClipboardButton = async () => {
    if (!navigator.clipboard?.read) {
      alert('Clipboard read API is not available in this browser. Try Ctrl+V instead.');
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      const imageItem = items.find((item) => item.types.some((type) => type.startsWith('image/')));

      if (!imageItem) {
        alert('No image found in clipboard.');
        return;
      }

      const imageType = imageItem.types.find((type) => type.startsWith('image/'));
      if (!imageType) return;

      const blob = await imageItem.getType(imageType);
      const { validateImageFile, buildClipboardFileName } = await import('../../utils/importUtils');
      await validateImageFile(blob);
      await importWithSizeCheck(blob, buildClipboardFileName(imageType));
    } catch {
      alert('Failed to read image from clipboard.');
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDropActive(false);

    const files = Array.from(event.dataTransfer?.files || []);
    const file = files[0];
    if (!file) return;

    await importFromFile(file);
  };

  const handleWebcamToggle = async () => {
    if (webcamActive) {
      stopWebcam();
      useImageStore.getState().resetToDefault();
      return;
    }

    await startWebcam();
    const state = useWebcamStore.getState();
    if (!state.active) return;
    clearGifFrames();
    setSourceDirect(WEBCAM_SOURCE, 'CAMERA', 'webcam');
  };

  const handleRandomImage = async () => {
    if (isRandomLoading) return;
    setIsRandomLoading(true);
    try {
      const w = 800;
      const h = 600;
      const url = `https://picsum.photos/${w}/${h}?random=${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Random image fetch failed.');
      const blob = await response.blob();
      const { validateImageFile } = await import('../../utils/importUtils');
      await validateImageFile(blob);
      await importWithSizeCheck(blob, `lorem-picsum-${w}x${h}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Random image failed.');
    } finally {
      setIsRandomLoading(false);
    }
  };

  const handleSelectPreset = async (preset) => {
    const isGifPreset = Boolean(preset.isGif || preset.src?.endsWith?.('.gif') || preset.name?.toLowerCase().includes('cow'));
    if (isGifPreset) {
      setDecoding(true);
      try {
        const response = await fetch(preset.src);
        if (!response.ok) throw new Error('Failed to load preset GIF');
        const blob = await response.blob();
        const { decodeGifWithWorker, rgbaFrameToPngBlob, blobToDataUrl } = await import('../../utils/gifDecodeUtils');
        const decoded = await decodeGifWithWorker(blob);
        if (!decoded.frames.length) throw new Error('No frames in preset GIF');

        setGifFrames(decoded.frames, decoded.loop);
        setPlaying(true);

        const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
        await setSourceFromBlob(firstFrameBlob, preset.name, { skipHistory: true });

        const previewSrc = await blobToDataUrl(firstFrameBlob);
        const gifDataUrl = await blobToDataUrl(blob);
        setGifSourceUrl(gifDataUrl);
        pushGifHistory(previewSrc, preset.name, gifDataUrl);
      } catch (err) {
        console.error('Failed to load preset GIF:', err);
      } finally {
        setDecoding(false);
      }
      return;
    }

    setGifSourceUrl(null);
    clearGifFrames();
    setSourceDirect(preset.src, preset.name, 'preset');
  };

  const handleSelectHistory = async (item) => {
    if (item.kind === 'gif') {
      if (item.gifDataUrl) {
        setDecoding(true);
        try {
          const response = await fetch(item.gifDataUrl);
          const blob = await response.blob();
          const { decodeGifWithWorker, rgbaFrameToPngBlob } = await import('../../utils/gifDecodeUtils');
          const decoded = await decodeGifWithWorker(blob);
          if (decoded.frames.length) {
            setGifFrames(decoded.frames, decoded.loop);
            setPlaying(true);
            setGifSourceUrl(item.gifDataUrl);
            const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
            await setSourceFromBlob(firstFrameBlob, item.name, { skipHistory: true });
          }
        } catch (err) {
          console.error('Failed to re-decode history GIF:', err);
        } finally {
          setDecoding(false);
        }
        return;
      }
      setSourceDirect(item.src, item.name, 'imported');
      return;
    }

    setGifSourceUrl(null);
    clearGifFrames();
    setSourceDirect(item.src, item.name, 'imported');
  };

  const handleSelectTemplate = (tplId) => {
    applyTemplate(tplId);
  };

  const hasValidMedia = Boolean(sourceImg || webcamActive);

  return (
    <>
      <div className='import-3col-layout'>
        {/* COLUMN 1: SELECT MEDIA (Resizable) */}
        <div
          ref={mediaColRef}
          className='import-col import-col-media'
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDropActive(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setIsDropActive(false);
            }
          }}
          onDrop={handleDrop}
        >
          <div className='import-col-content'>
            {/* Drop Zone Box */}
            <div
              className={`import-route-dropzone${isDropActive ? ' active' : ''}`}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDropActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDropActive(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setIsDropActive(false);
                }
              }}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role='button'
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
            >
              DROP IMAGE / GIF OR CTRL+V (CLICK TO BROWSE)
            </div>

            {/* Action Buttons */}
            <div className='import-route-actions-grid'>
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
                CLIPBOARD
              </button>
              <button
                type='button'
                className='bv-option-btn import-btn'
                onClick={handleRandomImage}
                disabled={isRandomLoading}
              >
                <Dices size={13} strokeWidth={1.5} />
                {isRandomLoading ? 'LOADING...' : 'RANDOM'}
              </button>
              <button
                type='button'
                className={`bv-option-btn import-btn${webcamActive ? ' danger-btn' : ''}`}
                onClick={handleWebcamToggle}
                disabled={webcamStarting}
              >
                {webcamActive ? <CameraOff size={13} strokeWidth={1.5} /> : <Camera size={13} strokeWidth={1.5} />}
                {webcamStarting ? 'STARTING...' : webcamActive ? 'STOP CAM' : 'CAMERA MODE'}
              </button>
            </div>

            <input
              ref={inputRef}
              type='file'
              accept='image/*,.gif,.webp'
              style={{ display: 'none' }}
              onChange={handleFilePickerChange}
            />

            {/* Camera Controls when active */}
            {webcamActive && (
              <div style={{ marginTop: 8 }}>
                <WebcamSection />
              </div>
            )}

            {/* Presets Library */}
            <div className='bv-section' style={{ marginTop: 8 }}>
              <p className='bv-label'>PRESETS LIBRARY</p>
              <div className='import-route-presets-grid'>
                {GALLERY_PRESETS.map((p) => {
                  const isSelected = sourceName === p.name && !webcamActive;
                  return (
                    <button
                      key={p.id}
                      type='button'
                      className={`import-route-preset-item${isSelected ? ' selected' : ''}`}
                      onClick={() => handleSelectPreset(p)}
                    >
                      <img src={p.src} alt={p.name} className='import-route-preset-thumb' />
                      <span className='import-route-preset-label'>{p.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Recent History */}
              {history.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: 4 }}>
                    <p className='bv-label' style={{ margin: 0 }}>RECENT IMPORTS</p>
                    <button
                      type='button'
                      className='import-recent-clear-btn'
                      onClick={() => {
                        clearHistory();
                        if (history.some((h) => h.kind === 'gif' && h.name === sourceName)) {
                          setGifSourceUrl(null);
                        }
                      }}
                    >
                      (<span>CLEAR</span>)
                    </button>
                  </div>
                  <div className='import-route-presets-grid'>
                    {history.map((h) => {
                      const isSelected = sourceName === h.name && !webcamActive;
                      return (
                        <div
                          key={h.id}
                          className={`import-route-preset-item import-route-history-item${isSelected ? ' selected' : ''}`}
                        >
                          <button
                            type='button'
                            className='import-route-history-btn'
                            onClick={() => handleSelectHistory(h)}
                          >
                            <img src={h.src} alt={h.name} className='import-route-preset-thumb' />
                            <span className='import-route-preset-label'>
                              {h.kind === 'gif' ? '🎬 ' : ''}{h.name}
                            </span>
                          </button>
                          <button
                            type='button'
                            className='import-history-delete-btn'
                            onClick={(e) => {
                              e.stopPropagation();
                              removeHistoryItem(h.id);
                              if (h.name === sourceName) {
                                setGifSourceUrl(null);
                              }
                            }}
                            title={`Remove ${h.name}`}
                            aria-label={`Remove ${h.name}`}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <div
            ref={resizeHandleRef}
            className='resize-handle resize-handle--right'
            role='separator'
            aria-label='Resize media column'
          />
        </div>

        {/* COLUMN 2: SELECT TEMPLATE (Fixed 16rem Column to the left of Preview) */}
        <div className='import-col import-col-templates'>
          <div className='import-col-content'>
            <div className='import-route-templates-list'>
              {TEMPLATES.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  isSelected={selectedTemplateId === tpl.id}
                  onSelect={handleSelectTemplate}
                />
              ))}
            </div>
          </div>
        </div>

        {/* COLUMN 3: REALTIME PREVIEW & EDIT */}
        <div className='import-col import-col-preview'>
          <div className='import-preview-container'>
            {/* Top: Source / Original Media Preview */}
            {(sourceImg || webcamActive) && (
              <div className='import-preview-source-wrap'>
                <div className='import-preview-section-header'>
                  <span className='import-preview-section-title'>ORIGINAL</span>
                </div>
                <div className='import-preview-source-canvas'>
                  <ZoomableDiv
                    content={
                      <OriginalMediaPreview
                        sourceImg={sourceImg}
                        frames={frames}
                        currentFrameIndex={currentFrameIndex}
                        isGif={frames.length > 1}
                        webcamActive={webcamActive}
                        webcamStream={webcamStream}
                        webcamMirrored={webcamMirrored}
                      />
                    }
                  />
                </div>
              </div>
            )}

            {/* Bottom: Realtime Processed / Dithered Preview */}
            <div className='import-preview-canvas-wrap'>
              {(sourceImg || webcamActive) && (
                <div className='import-preview-section-header'>
                  <span className='import-preview-section-title'>DITHERED</span>
                </div>
              )}
              <div className='import-preview-dither-canvas'>
                <PopupMessage />
                <ZoomableDiv content={<ImageShader sourceImg={sourceImg} />} />
                {viewerLoading && !webcamActive && (
                  <div className='zoomable-loading-overlay' role='status' aria-live='polite' aria-label='Loading preview'>
                    <WaveGridSpinner />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className='import-preview-launch-bar'>
              <button
                type='button'
                className='import-preview-launch-btn'
                onClick={() => setPage(PAGE.PINNED)}
                disabled={!hasValidMedia}
              >
                <span>EDIT</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {pendingImport && (
        <LargeImageDialog
          pendingImport={pendingImport}
          onConfirm={async (blob, name) => {
            setPendingImport(null);
            await doImport(blob, name);
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </>
  );
}
