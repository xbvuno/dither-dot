import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileUp,
  Clipboard,
  Camera,
  CameraOff,
  Dices,
  ArrowRight,
  Cat,
  Heart,
  Maximize,
  Minimize,
  Pin,
  ImageUpscale,
  SlidersHorizontal,
  Palette,
  SprayCan,
  Download,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { useRouter } from '../router/router';
import useImageStore from '../stores/media/imageStore';
import useGalleryStore, { GALLERY_PRESETS } from '../stores/data/galleryStore';
import useGifStore from '../stores/media/gifStore';
import useWebcamStore, { WEBCAM_SOURCE } from '../stores/media/webcamStore';
import useProcessingStore from '../stores/engine/processingStore';
import useTemplateStore from '../stores/data/templateStore';
import { TEMPLATES } from '../constants/templates';
import { PAGE } from '../stores/ui/pageStore';
import ZoomableDiv from '../components/ui/shared/ZoomableDiv';
import ImageShader from '../components/canvas/ImageShader';
import WaveGridSpinner from '../components/ui/shared/WaveGridSpinner';
import PopupMessage from '../components/ui/shared/PopupMessage';
import WebcamSection from '../components/import/WebcamSection';
import LargeImageDialog from '../components/import/LargeImageDialog';
import watermarkMini from '../assets/watermark/watermark-mini.png';
import '../styles/ImportRoute.css';

const DISABLED_NAV_ITEMS = [
  { id: PAGE.PINNED, label: 'Pinned', Icon: Pin },
  { id: PAGE.RESIZING, label: 'Resizing', Icon: ImageUpscale },
  { id: PAGE.ADJUSTMENTS, label: 'Adjustments', Icon: SlidersHorizontal },
  { id: PAGE.PALETTE, label: 'Palette', Icon: Palette },
  { id: PAGE.DITHER, label: 'Dither', Icon: SprayCan },
];

export default function ImportRoute() {
  const { navigate } = useRouter();
  const inputRef = useRef(null);

  const [isDropActive, setIsDropActive] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [isRandomLoading, setIsRandomLoading] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Store bindings
  const sourceImg = useImageStore((s) => s.sourceImg);
  const sourceName = useImageStore((s) => s.sourceName);
  const sourceKind = useImageStore((s) => s.sourceKind);
  const viewerLoading = useImageStore((s) => s.viewerLoading);
  const renderProcessing = useProcessingStore((s) => s.renderProcessing);
  const setSourceFromBlob = useImageStore((s) => s.setSourceFromBlob);
  const setSourceDirect = useImageStore((s) => s.setSourceDirect);

  const history = useGalleryStore((s) => s.history);
  const pushGifHistory = useGalleryStore((s) => s.pushGifHistory);
  const removeHistoryItem = useGalleryStore((s) => s.removeHistoryItem);
  const clearHistory = useGalleryStore((s) => s.clearHistory);

  const setGifFrames = useGifStore((s) => s.setFrames);
  const setDecoding = useGifStore((s) => s.setDecoding);
  const clearGifFrames = useGifStore((s) => s.clearFrames);

  const webcamActive = useWebcamStore((s) => s.active);
  const webcamStarting = useWebcamStore((s) => s.starting);
  const startWebcam = useWebcamStore((s) => s.startWebcam);
  const stopWebcam = useWebcamStore((s) => s.stopWebcam);

  const selectedTemplateId = useTemplateStore((s) => s.selectedTemplateId);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Import handlers
  const doImport = useCallback(
    async (blob, name) => {
      const isGif = blob?.type === 'image/gif' || name?.toLowerCase().endsWith('.gif');
      if (isGif) {
        setDecoding(true);
        try {
          const { decodeGifWithWorker, rgbaFrameToPngBlob, blobToDataUrl } = await import('../utils/gifDecodeUtils');
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

      const isWebp = blob?.type === 'image/webp' || name?.toLowerCase().endsWith('.webp');
      if (isWebp) {
        const { blobToDataUrl, getStaticPreviewFromBlob } = await import('../utils/gifDecodeUtils');
        const animDataUrl = await blobToDataUrl(blob);
        const previewSrc = await getStaticPreviewFromBlob(blob);
        await setSourceFromBlob(blob, name, { skipHistory: true });
        pushGifHistory(previewSrc, name, animDataUrl);
        return;
      }

      await setSourceFromBlob(blob, name);
    },
    [clearGifFrames, pushGifHistory, setGifFrames, setSourceFromBlob, setDecoding]
  );

  const importWithSizeCheck = useCallback(
    async (blob, name) => {
      const { getImageDimensions, LARGE_IMAGE_THRESHOLD } = await import('../utils/importUtils');
      const dims = await getImageDimensions(blob);
      const pixelCount = dims.width * dims.height;

      if (pixelCount > LARGE_IMAGE_THRESHOLD) {
        setPendingImport({ file: blob, name, dims });
        return;
      }

      await doImport(blob, name);
    },
    [doImport]
  );

  const confirmImport = useCallback(
    async (blob, name) => {
      setPendingImport(null);
      await doImport(blob, name);
    },
    [doImport]
  );

  const importFromFile = useCallback(
    async (file) => {
      try {
        const { validateImageFile, stripExtension, buildClipboardFileName } = await import('../utils/importUtils');
        await validateImageFile(file);
        const rawName =
          typeof file.name === 'string' && file.name ? file.name : buildClipboardFileName(file.type || 'image/png');
        const name = stripExtension(rawName);
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
      const { validateImageFile, buildClipboardFileName } = await import('../utils/importUtils');
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
      const { validateImageFile } = await import('../utils/importUtils');
      await validateImageFile(blob);
      await importWithSizeCheck(blob, `lorem-picsum-${w}x${h}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Random image failed.');
    } finally {
      setIsRandomLoading(false);
    }
  };

  const handleSelectPreset = async (preset) => {
    if (preset.id === 'preset-pizza-cow') {
      try {
        setDecoding(true);
        const res = await fetch(preset.src);
        const blob = await res.blob();
        const { decodeGifWithWorker, rgbaFrameToPngBlob } = await import('../utils/gifDecodeUtils');
        const decoded = await decodeGifWithWorker(blob);
        setGifFrames(decoded.frames, decoded.loop);
        const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
        await setSourceFromBlob(firstFrameBlob, preset.name, { skipHistory: true });
      } catch (err) {
        console.error(err);
        setDecoding(false);
      }
      return;
    }

    setSourceDirect(preset.src, preset.name, 'preset');
  };

  const handleSelectHistory = async (item) => {
    if (item.kind === 'gif' && item.gifDataUrl) {
      try {
        setDecoding(true);
        const res = await fetch(item.gifDataUrl);
        const blob = await res.blob();
        const { decodeGifWithWorker, rgbaFrameToPngBlob } = await import('../utils/gifDecodeUtils');
        const decoded = await decodeGifWithWorker(blob);
        setGifFrames(decoded.frames, decoded.loop);
        const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
        await setSourceFromBlob(firstFrameBlob, item.name, { skipHistory: true });
      } catch (err) {
        console.error(err);
        setDecoding(false);
      }
      return;
    }

    setSourceDirect(item.src, item.name, 'history');
  };

  const handleSelectTemplate = (templateId) => {
    applyTemplate(templateId);
  };

  const handleLaunchEditor = () => {
    applyTemplate(selectedTemplateId);
    navigate('/editor');
  };

  useEffect(() => {
    const onPaste = (event) => handlePaste(event);
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handlePaste]);

  const hasValidMedia = Boolean(sourceImg || webcamActive);
  const activeTemplate = TEMPLATES.find((t) => t.id === selectedTemplateId) || TEMPLATES[0];

  return (
    <>
      <h1 className='sr-only'>DITHER-DOT Import &amp; Template Hub</h1>
      <header className='app-header'>
        <span className='app-header-title' onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src={watermarkMini} alt='DITHER-DOT Logo' className='header-logo-img' />
          <span className='app-header-title-name'>DITHER-DOT</span>
        </span>

        <div className='app-header-links'>
          <button
            type='button'
            className='header-link-btn'
            onClick={() => setModalType('support')}
            aria-label='Support project'
            title='SUPPORT'
          >
            <Heart size={14} strokeWidth={2} aria-hidden='true' />
            <span className='header-link-label'>SUPPORT</span>
          </button>
          <a
            href='https://github.com/xbvuno/dither-dot'
            target='_blank'
            rel='noopener noreferrer'
            className='header-link-btn'
            aria-label='GitHub Repository (opens in new tab)'
            title='GITHUB'
          >
            <Cat size={14} strokeWidth={2} aria-hidden='true' />
            <span className='header-link-label'>GITHUB</span>
          </a>
          <button
            type='button'
            className='header-link-btn header-btn--mobile-only'
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            title={isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}
          >
            {isFullscreen ? (
              <Minimize size={14} strokeWidth={2} aria-hidden='true' />
            ) : (
              <Maximize size={14} strokeWidth={2} aria-hidden='true' />
            )}
            <span className='header-link-label'>FULLSCREEN</span>
          </button>
        </div>
      </header>

      <div className='app-layout'>
        {/* NAV BAR: Exact same structure with disabled buttons */}
        <nav className='app-nav' aria-label='Main Navigation'>
          <div className='nav-top-wrap'>
            <button
              type='button'
              className='nav-icon-btn selected'
              data-tooltip='MEDIA & TEMPLATES [1]'
              aria-label='MEDIA & TEMPLATES [1]'
              aria-current='page'
            >
              <FolderOpen size={24} strokeWidth={2} aria-hidden='true' className='nav-icon-img' />
            </button>
          </div>

          <div className='nav-links-wrap'>
            {DISABLED_NAV_ITEMS.map((item) => {
              const Icon = item.Icon;
              const tooltipText = `${item.label.toUpperCase()} [LOCKED]`;
              return (
                <button
                  key={item.id}
                  type='button'
                  className='nav-icon-btn disabled'
                  disabled
                  data-tooltip={tooltipText}
                  aria-label={tooltipText}
                >
                  <Icon size={24} strokeWidth={2} aria-hidden='true' className='nav-icon-img' />
                </button>
              );
            })}
          </div>

          <div className='nav-export-wrap'>
            <button
              type='button'
              className='nav-icon-btn disabled'
              disabled
              data-tooltip='EXPORT [LOCKED]'
              aria-label='EXPORT [LOCKED]'
            >
              <Download size={24} strokeWidth={2} aria-hidden='true' className='nav-icon-img' />
            </button>
          </div>
        </nav>

        {/* 3-COLUMN MAIN WORKSPACE */}
        <main className='import-3col-layout'>
          {/* COLUMN 1: SELECT MEDIA */}
          <div className='import-col import-col-media'>
            <div className='import-col-header'>
              <h2 className='import-col-title'>MEDIA</h2>
            </div>

            <div className='import-col-content import-col-content--media'>
              {/* Top Controls */}
              <div className='import-media-top-group'>
                {/* Dropzone */}
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
                    e.preventDefault();
                    setIsDropActive(false);
                  }}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
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
                  onChange={handleFilePickerChange}
                  style={{ display: 'none' }}
                />

                {webcamActive && <WebcamSection />}
              </div>

              {/* Active Media Preview Card: clean borderless preview with footer */}
              {sourceImg && !webcamActive && (
                <div className='import-route-media-preview-card'>
                  <div className='import-route-media-canvas-wrap'>
                    <img src={sourceImg} alt='Selected Media' className='import-route-preview-large-img' />
                  </div>
                  <div className='import-route-media-footer'>
                    <span className='import-route-media-name'>{sourceName || 'Current Media'}</span>
                    <span className='import-route-media-type'>SOURCE: {sourceKind?.toUpperCase() || 'LOADED'}</span>
                  </div>
                </div>
              )}

              {/* Bottom Group: Presets and Recent Imports */}
              <div className='import-media-bottom-group'>
                {/* Sample Presets */}
                <p className='bv-label' style={{ marginTop: 0, marginBottom: 0 }}>SAMPLE PRESETS</p>
                <div className='import-route-presets-row'>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <p className='bv-label' style={{ margin: 0 }}>RECENT IMPORTS</p>
                      <button
                        type='button'
                        className='header-link-btn'
                        onClick={clearHistory}
                        style={{ fontSize: 10, height: 20, padding: '0 4px' }}
                      >
                        <Trash2 size={10} /> CLEAR
                      </button>
                    </div>
                    <div className='import-route-presets-row'>
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
          </div>

          {/* COLUMN 2: SELECT TEMPLATE */}
          <div className='import-col import-col-templates'>
            <div className='import-col-header'>
              <h2 className='import-col-title'>TEMPLATE</h2>
            </div>

            <div className='import-col-content'>
              <div className='import-route-templates-list'>
                {TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      className={`import-route-template-card${isSelected ? ' selected' : ''}`}
                      onClick={() => handleSelectTemplate(tpl.id)}
                      role='button'
                      tabIndex={0}
                    >
                      <div className='import-route-template-top'>
                        <span className='import-route-template-name'>{tpl.name}</span>
                        <span className='import-route-template-badge'>{tpl.badge}</span>
                      </div>

                      <p className='import-route-template-desc'>{tpl.description}</p>

                      <div className='import-route-swatches-row'>
                        {tpl.palette.colors.map((hex, idx) => (
                          <span
                            key={idx}
                            className='import-route-swatch'
                            style={{ backgroundColor: hex }}
                            title={hex}
                          />
                        ))}
                      </div>

                      <div className='import-route-template-tags'>
                        <span className='import-route-template-tag'>{tpl.dither.method.toUpperCase()}</span>
                        <span className='import-route-template-tag'>
                          PINNED: {tpl.pinnedIds.length} CONTROLS
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* COLUMN 3: REALTIME PREVIEW & LAUNCH */}
          <div className='import-col import-col-preview'>
            <div className='import-col-header'>
              <h2 className='import-col-title'>PREVIEW</h2>
            </div>

            <div className='import-preview-container'>
              <div className='import-preview-canvas-wrap'>
                <PopupMessage />
                <ZoomableDiv content={<ImageShader sourceImg={sourceImg} />} />
                {(viewerLoading || renderProcessing) && !webcamActive && (
                  <div className='zoomable-loading-overlay' role='status' aria-live='polite' aria-label='Loading preview'>
                    <WaveGridSpinner />
                  </div>
                )}
              </div>

              {/* Bottom Launch Action Bar */}
              <div className='import-preview-launch-bar'>
                <div className='import-preview-launch-summary'>
                  <span>MEDIA: <b>{sourceName || (webcamActive ? 'CAMERA' : 'NONE')}</b></span>
                  <span>•</span>
                  <span>TEMPLATE: <b>{activeTemplate.name}</b></span>
                </div>

                <button
                  type='button'
                  className='import-preview-launch-btn'
                  onClick={handleLaunchEditor}
                  disabled={!hasValidMedia}
                >
                  <span>OPEN IN EDITOR</span>
                  <ArrowRight size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </main>
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

      {modalType === 'support' && (
        <div className='header-modal-backdrop' onClick={() => setModalType(null)}>
          <section
            className='header-modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='import-support-title'
            onClick={(event) => event.stopPropagation()}
          >
            <div className='header-modal-top'>
              <h2 id='import-support-title'>SUPPORT</h2>
              <button type='button' className='header-modal-close' onClick={() => setModalType(null)}>
                CLOSE
              </button>
            </div>
            <div className='header-modal-support-block'>
              <p className='header-modal-setting-label'>SUPPORT DITHER-DOT</p>
              <p>
                Support link: <a href='https://ko-fi.com/xbvuno' target='_blank' rel='noreferrer'>ko-fi.com/xbvuno</a>
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
