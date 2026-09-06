import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Heart,
  Cat,
  Pin,
  ImageUpscale,
  SlidersHorizontal,
  Palette,
  SprayCan,
  Settings,
  Download,
  Maximize,
  Minimize,
  FolderOpen,
} from 'lucide-react';
import Aside from '../components/layout/Aside';
import watermarkMini from '../assets/watermark/watermark-mini.png';
import ZoomableDiv from '../components/ui/shared/ZoomableDiv';
import ImageShader from '../components/canvas/ImageShader';
import PostProcessShader from '../components/canvas/PostProcessShader';
import OriginalMediaPreview from '../components/ui/shared/OriginalMediaPreview';
import AsideRouter from '../components/layout/AsideRouter';
import GifTimeline from '../components/timeline/GifTimeline';
import CameraControlsBar from '../components/camera/CameraControlsBar';
import Footer from '../components/layout/Footer';
import WaveGridSpinner from '../components/ui/shared/WaveGridSpinner';
import PopupMessage from '../components/ui/shared/PopupMessage';
import ImportStudio from '../components/import/ImportStudio';
import usePageStore, { PAGE } from '../stores/ui/pageStore';
import useImageStore from '../stores/media/imageStore';
import useProcessingStore from '../stores/engine/processingStore';
import useWatermarkStore from '../stores/media/watermarkStore';
import useViewStore from '../stores/ui/viewStore';
import useWebcamStore from '../stores/media/webcamStore';

const ExportPage = lazy(() => import('./ExportPage'));

const MAIN_NAV_ITEMS = [
  { id: PAGE.IMPORT, label: 'Import', Icon: FolderOpen },
  { id: PAGE.PINNED, label: 'Pinned', Icon: Pin },
  { id: PAGE.RESIZING, label: 'Resizing', Icon: ImageUpscale },
  { id: PAGE.ADJUSTMENTS, label: 'Adjustments', Icon: SlidersHorizontal },
  { id: PAGE.PALETTE, label: 'Palette', Icon: Palette },
  { id: PAGE.DITHER, label: 'Dither', Icon: SprayCan },
  { id: PAGE.SETTINGS, label: 'Settings', Icon: Settings },
  { id: PAGE.EXPORT, label: 'Export', Icon: Download, mobileOnly: true },
];

export default function EditorPage() {
  const [modalType, setModalType] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentPage = usePageStore((s) => s.currentPage);
  const setPage = usePageStore((s) => s.setPage);
  const exportOpen = usePageStore((s) => s.exportOpen);
  const toggleExportOpen = usePageStore((s) => s.toggleExportOpen);

  const sourceImg = useImageStore((s) => s.sourceImg);
  const viewerLoading = useImageStore((s) => s.viewerLoading);
  const renderProcessing = useProcessingStore((s) => s.renderProcessing);
  const webcamActive = useWebcamStore((s) => s.active);
  const watermarkEnabled = useWatermarkStore((s) => s.enabled);
  const setWatermarkEnabled = useWatermarkStore((s) => s.setEnabled);
  const splitView = useViewStore((s) => s.splitView);
  const splitDirection = useViewStore((s) => s.splitDirection || 'vertical');
  const splitFirstView = useViewStore((s) => s.splitFirstView || 'post_process');

  const navRef = useRef(null);
  const lastScrollTimeRef = useRef(0);
  const currentPageRef = useRef(currentPage);

  // Guard: Switch to import page if no media is loaded and webcam is not active
  useEffect(() => {
    if (!sourceImg && !webcamActive && currentPage !== PAGE.IMPORT) {
      setPage(PAGE.IMPORT);
    }
  }, [sourceImg, webcamActive, currentPage, setPage]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      const tagName = target?.tagName?.toUpperCase();
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      const desktopNavItems = MAIN_NAV_ITEMS.filter((item) => !item.mobileOnly);
      const keyNum = parseInt(e.key, 10);
      if (!isNaN(keyNum)) {
        if (keyNum >= 1 && keyNum <= desktopNavItems.length) {
          e.preventDefault();
          setPage(desktopNavItems[keyNum - 1].id);
          return;
        }
      }

      if (e.key === 'e' || e.key === 'E') {
        if (!e.repeat) {
          e.preventDefault();
          toggleExportOpen();
          return;
        }
      }

      if (e.key === 'c' || e.key === 'C') {
        if (!e.repeat) {
          useViewStore.getState().setPreviewingOriginal(true);
        }
      }
    };

    const handleKeyUp = (e) => {
      const target = e.target;
      const tagName = target?.tagName?.toUpperCase();
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        useViewStore.getState().setPreviewingOriginal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setPage, toggleExportOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;

    const handleWheel = (event) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastScrollTimeRef.current < 250) return;

      const delta = event.deltaY;
      if (delta === 0) return;

      const editorPages = MAIN_NAV_ITEMS.filter((item) => !item.mobileOnly).map((item) => item.id);
      const currentIndex = editorPages.indexOf(currentPageRef.current);
      if (currentIndex === -1) return;

      let nextIndex;
      if (delta > 0) {
        nextIndex = (currentIndex + 1) % editorPages.length;
      } else {
        nextIndex = (currentIndex - 1 + editorPages.length) % editorPages.length;
      }

      setPage(editorPages[nextIndex]);
      lastScrollTimeRef.current = now;
    };

    navEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      navEl.removeEventListener('wheel', handleWheel);
    };
  }, [setPage]);

  const handleNavDragOver = (event, pageId) => {
    event.preventDefault();
    if (currentPage !== pageId) {
      setPage(pageId);
    }
  };

  return (
    <>
      <h1 className='sr-only'>DITHER-DOT Studio Editor</h1>
      <header className='app-header'>
        <span className='app-header-title' onClick={() => setPage(PAGE.IMPORT)} style={{ cursor: 'pointer' }}>
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
        <nav ref={navRef} className='app-nav' aria-label='Main Navigation'>
          <div className='nav-links-wrap'>
            {MAIN_NAV_ITEMS.map((item, index) => {
              const Icon = item.Icon;
              const isSelected = currentPage === item.id;
              const tooltipText = `${item.label.toUpperCase()} [${index + 1}]`;
              return (
                <button
                  key={item.id}
                  type='button'
                  className={`nav-icon-btn${isSelected ? ' selected' : ''}${item.mobileOnly ? ' nav-icon-btn--mobile-only' : ''}`}
                  onClick={() => setPage(item.id)}
                  onDragEnter={(event) => handleNavDragOver(event, item.id)}
                  onDragOver={(event) => handleNavDragOver(event, item.id)}
                  data-tooltip={tooltipText}
                  aria-label={tooltipText}
                  aria-current={isSelected ? 'page' : undefined}
                >
                  <Icon size={24} strokeWidth={2} aria-hidden='true' className='nav-icon-img' />
                </button>
              );
            })}
          </div>

          <div className='nav-export-wrap'>
            <button
              type='button'
              className={`nav-icon-btn${exportOpen ? ' selected' : ''}`}
              onClick={toggleExportOpen}
              data-tooltip='EXPORT [E]'
              aria-label='EXPORT [E]'
              aria-pressed={exportOpen}
            >
              <Download size={24} strokeWidth={2} aria-hidden='true' className='nav-icon-img' />
            </button>
          </div>
        </nav>

        <main className={currentPage === PAGE.IMPORT ? 'import-3col-layout' : ''}>
          {currentPage === PAGE.IMPORT ? (
            <ImportStudio />
          ) : (
            <>
              <Aside side='left'>
                <AsideRouter />
              </Aside>
              <div className='flex-v'>
                <div className='zoomable-wrap'>
                  <PopupMessage />
                  {splitView ? (
                    <div className={`split-view-container split-view-container--${splitDirection}`}>
                      <div className='split-view-pane'>
                        <span className='split-view-badge'>
                          {splitFirstView === 'original' ? 'ORIGINAL' : 'POST-PROCESSING'}
                        </span>
                        <ZoomableDiv
                          content={
                            splitFirstView === 'original' ? (
                              <OriginalMediaPreview />
                            ) : (
                              <PostProcessShader />
                            )
                          }
                        />
                      </div>
                      <div className='split-view-divider' />
                      <div className='split-view-pane'>
                        <span className='split-view-badge'>DITHERED</span>
                        <ZoomableDiv content={<ImageShader sourceImg={sourceImg} />} />
                      </div>
                    </div>
                  ) : (
                    <ZoomableDiv content={<ImageShader sourceImg={sourceImg} />} />
                  )}
                  {(viewerLoading || renderProcessing) && !webcamActive && (
                    <div className='zoomable-loading-overlay' role='status' aria-live='polite' aria-label='Loading media'>
                      <WaveGridSpinner />
                    </div>
                  )}
                  {!sourceImg && !webcamActive && (
                    <div className='editor-no-media-overlay' role='alert'>
                      <div className='editor-no-media-card'>
                        <p className='editor-no-media-title'>NO MEDIA LOADED</p>
                        <p className='editor-no-media-desc'>
                          No active media or configuration was found. Import an image or choose a template to begin editing.
                        </p>
                        <button
                          type='button'
                          className='bv-option-btn editor-no-media-btn'
                          onClick={() => setPage(PAGE.IMPORT)}
                        >
                          <FolderOpen size={14} strokeWidth={2} />
                          <span>GO TO IMPORT</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <GifTimeline />
                <CameraControlsBar />
                <Footer />
              </div>
              {exportOpen && (
                <Aside side='right'>
                  <Suspense fallback={null}>
                    <ExportPage />
                  </Suspense>
                </Aside>
              )}
            </>
          )}
        </main>
      </div>

      {modalType === 'support' && (
        <div className='header-modal-backdrop' onClick={() => setModalType(null)}>
          <section
            className='header-modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='header-modal-title'
            onClick={(event) => event.stopPropagation()}
          >
            <div className='header-modal-top'>
              <h2 id='header-modal-title'>SUPPORT</h2>
              <button type='button' className='header-modal-close' onClick={() => setModalType(null)}>
                CLOSE
              </button>
            </div>
            <div className='header-modal-support-block'>
              <p className='header-modal-setting-label'>SUPPORT DITHER-DOT</p>
              <p>
                Support link: <a href='https://ko-fi.com/xbvuno' target='_blank' rel='noreferrer'>ko-fi.com/xbvuno</a>
              </p>
              <p>
                The watermark can be disabled for free. If you want, you can also support directly via Ko-fi.
              </p>
            </div>

            <div className='header-modal-setting'>
              <span className='header-modal-setting-label'>WATERMARK</span>
              <div className='header-modal-toggle-group'>
                <button
                  type='button'
                  className='header-modal-toggle'
                  aria-pressed={watermarkEnabled}
                  onClick={() => setWatermarkEnabled(true)}
                >
                  ON
                </button>
                <button
                  type='button'
                  className='header-modal-toggle'
                  aria-pressed={!watermarkEnabled}
                  onClick={() => setWatermarkEnabled(false)}
                >
                  OFF
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
