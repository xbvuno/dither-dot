import { useState, useEffect, useRef } from 'react'
import { Smartphone, MonitorSmartphone, TriangleAlert, ArrowRight, Info, Heart, ScrollText, Cat, FileUp, ImageUpscale, SlidersHorizontal, Palette, SprayCan, Download, Maximize, Minimize } from 'lucide-react'
import Aside from './components/layout/Aside'

import watermarkMini from './assets/watermark/watermark-mini.png'
import ZoomableDiv from './components/ui/shared/ZoomableDiv'
import ImageShader from './components/canvas/ImageShader'
import AsideRouter from './components/layout/AsideRouter'
import GifTimeline from './components/timeline/GifTimeline'
import CameraControlsBar from './components/camera/CameraControlsBar'
import Footer from './components/layout/Footer'
import WaveGridSpinner from './components/ui/shared/WaveGridSpinner'
import PopupMessage from './components/ui/shared/PopupMessage'
import usePageStore, { PAGE } from './stores/ui/pageStore'
import useImageStore from './stores/media/imageStore'
import useProcessingStore from './stores/engine/processingStore'
import useWatermarkStore from './stores/media/watermarkStore'
import useViewStore from './stores/ui/viewStore'
import useWebcamStore from './stores/media/webcamStore'

const ICONS = [
  { id: PAGE.IMPORT, label: 'Import', Icon: FileUp },
  { id: PAGE.RESIZING, label: 'Resizing', Icon: ImageUpscale },
  { id: PAGE.ADJUSTMENTS, label: 'Adjustments', Icon: SlidersHorizontal },
  { id: PAGE.PALETTE, label: 'Palette', Icon: Palette },
  { id: PAGE.DITHER, label: 'Dither', Icon: SprayCan },
  { id: PAGE.EXPORT, label: 'Export', Icon: Download },
]

const IS_MOBILE = (() => {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return navigator.userAgentData.mobile
  }
  const ua = navigator.userAgent || ''
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /Android|iPhone|iPad|iPod|Windows Phone|Mobi/i.test(ua) || touchMac
})()

function App() {
  const [modalType, setModalType] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const currentPage = usePageStore(s => s.currentPage)
  const setPage = usePageStore(s => s.setPage)
  const sourceImg = useImageStore(s => s.sourceImg)
  const viewerLoading = useImageStore(s => s.viewerLoading)
  const renderProcessing = useProcessingStore(s => s.renderProcessing)
  const webcamActive = useWebcamStore(s => s.active)
  const watermarkEnabled = useWatermarkStore(s => s.enabled)
  const setWatermarkEnabled = useWatermarkStore(s => s.setEnabled)

  const navRef = useRef(null)
  const lastScrollTimeRef = useRef(0)
  const currentPageRef = useRef(currentPage)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target
      const tagName = target?.tagName?.toUpperCase()
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }

      const keyNum = parseInt(e.key, 10)
      if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= ICONS.length) {
        e.preventDefault()
        setPage(ICONS[keyNum - 1].id)
        return
      }

      if (e.key === 'c' || e.key === 'C') {
        if (!e.repeat) {
          useViewStore.getState().setPreviewingOriginal(true)
        }
      }
    }

    const handleKeyUp = (e) => {
      const target = e.target
      const tagName = target?.tagName?.toUpperCase()
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }

      if (e.key === 'c' || e.key === 'C') {
        useViewStore.getState().setPreviewingOriginal(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [setPage])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    const navEl = navRef.current
    if (!navEl) return

    const handleWheel = (event) => {
      event.preventDefault()
      const now = Date.now()
      if (now - lastScrollTimeRef.current < 250) {
        return
      }

      const delta = event.deltaY
      if (delta === 0) return

      const pageIds = ICONS.map(item => item.id)
      const currentIndex = pageIds.indexOf(currentPageRef.current)
      if (currentIndex === -1) return

      let nextIndex
      if (delta > 0) {
        nextIndex = (currentIndex + 1) % pageIds.length
      } else {
        nextIndex = (currentIndex - 1 + pageIds.length) % pageIds.length
      }

      setPage(pageIds[nextIndex])
      lastScrollTimeRef.current = now
    }

    navEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      navEl.removeEventListener('wheel', handleWheel)
    }
  }, [setPage])

  const handleNavDragOver = (event, pageId) => {
    event.preventDefault()
    if (currentPage !== pageId) {
      setPage(pageId)
    }
  }

  const modalConfig = {
    about: {
      title: 'ABOUT',
      body: [],
    },
    support: {
      title: 'SUPPORT',
      body: [],
    },
    changelog: {
      title: 'CHANGELOG',
      body: [],
    },
  }

  const activeModal = modalType ? modalConfig[modalType] : null



  return (
    <>
      <h1 className='sr-only'>DITHER-DOT - Browser Image &amp; GIF Dithering Studio</h1>
      <header className='app-header'>
        <span className='app-header-title'>
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
            {ICONS.map((item, index) => {
              const Icon = item.Icon
              const isSelected = currentPage === item.id
              const tooltipText = `${item.label.toUpperCase()} [${index + 1}]`
              return (
                <button
                  key={item.id}
                  type='button'
                  className={`nav-icon-btn${isSelected ? ' selected' : ''}`}
                  onClick={() => setPage(item.id)}
                  onDragEnter={(event) => handleNavDragOver(event, item.id)}
                  onDragOver={(event) => handleNavDragOver(event, item.id)}
                  data-tooltip={tooltipText}
                  aria-label={tooltipText}
                  aria-current={isSelected ? 'page' : undefined}
                >
                  <Icon size={24} strokeWidth={2} aria-hidden='true' className='nav-icon-img' />
                </button>
              )
            })}
          </div>
        </nav>
        <main>
          <Aside>
            <AsideRouter />
          </Aside>
          <div className='flex-v'>
            <div className='zoomable-wrap'>
              <PopupMessage />
              <ZoomableDiv content={<ImageShader sourceImg={sourceImg} />} />
              {(viewerLoading || renderProcessing) && !webcamActive && (
                <div className='zoomable-loading-overlay' role='status' aria-live='polite' aria-label='Loading media'>
                  <WaveGridSpinner />
                </div>
              )}
            </div>
            <GifTimeline />
            <CameraControlsBar />
            <Footer />
          </div>
        </main>
      </div>
      {activeModal && (
        <div className='header-modal-backdrop' onClick={() => setModalType(null)}>
          <section
            className='header-modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='header-modal-title'
            onClick={(event) => event.stopPropagation()}
          >
            <div className='header-modal-top'>
              <h2 id='header-modal-title'>{activeModal.title}</h2>
              <button type='button' className='header-modal-close' onClick={() => setModalType(null)}>
                CLOSE
              </button>
            </div>
            {modalType === 'support' && (
              <>
                <div className='header-modal-support-block'>
                  <p className='header-modal-setting-label'>SUPPORT</p>
                  <p>
                    Support link: <a href='https://ko-fi.com/xbvuno' target='_blank' rel='noreferrer'>ko-fi.com/xbvuno</a>
                  </p>
                  <p>
                    The watermark can be disabled for free for the community. Sharing images with the watermark
                    is already a great way to support the project; if you want, you can also support directly via Ko-fi.
                  </p>
                </div>

                <div className='header-modal-support-block'>
                  <p className='header-modal-setting-label'>BUGS & FEATURES</p>
                  <p>
                    Found a bug or have an idea for a feature? Write to me on Telegram:
                    {' '}
                    <a href='https://t.me/xbvuno' target='_blank' rel='noreferrer'>t.me/xbvuno</a>
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
              </>
            )}
            {modalType === 'about' && (
              <>
                <div className='header-modal-support-block'>
                  <p className='header-modal-setting-label'>WHAT IS DITHER-DOT</p>
                  <p>
                    A fast, open-source dithering studio for images and GIFs - running entirely in your browser.
                  </p>
                </div>

                <div className='header-modal-support-block'>
                  <p className='header-modal-setting-label'>ACKNOWLEDGEMENTS</p>
                  <p>
                    Special thanks to <b>Daniil Sukhovskoy</b>, creator of
                    {' '}
                    <a href='https://tooooools.app/' target='_blank' rel='noreferrer'>tooooools.app</a>
                    {' '}
                    for the inspiration behind this project.
                  </p>
                </div>
              </>
            )}
            {modalType === 'changelog' && (
              <>
                <div className='header-modal-support-block'>
                  <p className='header-modal-setting-label'>1.0.0-beta [21/04/2026]</p>
                  <ul className='header-modal-list'>
                    <li>ADDED GIF SUPPORT</li>
                    <li>ADDED WEBCAM SUPPORT</li>
                    <li>REORGANIZED PAGES</li>
                    <li>IMPROVED EXPORT PAGE</li>
                    <li>ADDED VISUAL PIPELINE</li>
                    <li>UI IMPROVEMENTS</li>
                    <li>PERFORMANCE IMPROVEMENTS</li>
                  </ul>
                </div>
              </>
            )}
            {modalType !== 'support' && activeModal.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        </div>
      )}
    </>
  )
}

export default App

