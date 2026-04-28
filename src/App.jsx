import { useState } from 'react'
import { Smartphone, MonitorSmartphone, TriangleAlert, ArrowRight, Info, Heart, ScrollText, Cat, FileUp, SlidersHorizontal, Palette, SprayCan, Download } from 'lucide-react'
import Aside from './Aside'

import statue from './assets/statue.jpg'
import watermarkMini from './assets/water-mark-mini.png'
import ZoomableDiv from './components/ZoomableDiv'
import ImageShader from './components/ImageShader'
import AsideRouter from './components/AsideRouter'
import GifTimeline from './components/GifTimeline'
import Footer from './components/Footer'
import usePageStore, { PAGE } from './stores/pageStore'
import useImageStore from './stores/imageStore'
import useProcessingStore from './stores/processingStore'
import useWatermarkStore from './stores/watermarkStore'

const ICONS = [
  { id: PAGE.IMPORT, label: 'Input', Icon: FileUp },
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

const WEBGL2_SUPPORTED = (() => {
  const canvas = document.createElement('canvas')
  return !!canvas.getContext('webgl2')
})()

function App() {
  const [modalType, setModalType] = useState(null)
  const [continueOnMobile, setContinueOnMobile] = useState(false)
  const currentPage = usePageStore(s => s.currentPage)
  const setPage = usePageStore(s => s.setPage)
  const sourceImg = useImageStore(s => s.sourceImg)
  const viewerLoading = useImageStore(s => s.viewerLoading)
  const renderProcessing = useProcessingStore(s => s.renderProcessing)
  const watermarkEnabled = useWatermarkStore(s => s.enabled)
  const setWatermarkEnabled = useWatermarkStore(s => s.setEnabled)

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

  if (IS_MOBILE && !continueOnMobile) {
    return (
      <div className='webgl2-blocker'>
        <div>
          <h1>MOBILE NOT SUPPORTED YET</h1>
          <p>
            DITHER-DOT is currently optimized for desktop workflows.
          </p>
          <p>
            Open the app from a desktop browser for the full editing experience.
          </p>
          <br/>
          <button
            type='button'
            className='webgl2-blocker-continue-btn'
            onClick={() => setContinueOnMobile(true)}
          >
            <ArrowRight size={14} strokeWidth={1.8} />
            CONTINUE ANYWAY
          </button>
        </div>
      </div>
    )
  }

  if (!WEBGL2_SUPPORTED) {
    return (
      <div className='webgl2-blocker'>
        <div>
          <div aria-hidden='true'>
            <TriangleAlert size={34} strokeWidth={1.75} />
          </div>
          <h1>WEBGL2 REQUIRED</h1>
          <p>
            This app needs WebGL2 to run. Your browser or GPU does not expose a WebGL2 context.
          </p>
          <p>
            Try enabling hardware acceleration, updating graphics drivers, or using a modern Chromium or Firefox build.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className='app-header'>
        <span className='app-header-title'>
          <img src={watermarkMini} alt='' aria-hidden='true' className='app-header-mark' />
          <span className='app-header-title-name'>DITHER-DOT</span>
        </span>
        <div className='app-header-links'>
          <button type='button' className='header-link-btn' onClick={() => setModalType('about')}>
            <Info size={13} strokeWidth={2} />
            ABOUT
          </button>
          <button type='button' className='header-link-btn' onClick={() => setModalType('changelog')}>
            <ScrollText size={13} strokeWidth={2} />
            CHANGELOG
          </button>
          <button type='button' className='header-link-btn' onClick={() => setModalType('support')}>
            <Heart size={13} strokeWidth={2} />
            SUPPORT
          </button>
          <a
            href='https://github.com/xbvuno/dither-dot'
            target='_blank'
            rel='noopener noreferrer'
            className='header-link-btn'
          >
            <Cat size={13} strokeWidth={2} />
            GITHUB
          </a>
        </div>
      </header>
      <main>
        <nav>
          {ICONS.map((item) => {
            const Icon = item.Icon
            return (
              <button
                key={item.id}
                type='button'
                className={`nav-icon-btn${currentPage === item.id ? ' selected' : ''}`}
                onClick={() => setPage(item.id)}
                onDragEnter={(event) => handleNavDragOver(event, item.id)}
                onDragOver={(event) => handleNavDragOver(event, item.id)}
                data-tooltip={item.label}
                aria-label={item.label}
              >
                <Icon size={24} strokeWidth={2} aria-hidden='true' className='nav-icon-img' />
              </button>
            )
          })}
        </nav>
        <Aside>
          <AsideRouter />
        </Aside>
        <div className='flex-v'>
          <div className='zoomable-wrap'>
            <ZoomableDiv content={<ImageShader sourceImg={sourceImg || statue} />} />
            {(viewerLoading || renderProcessing) && (
              <div className='zoomable-loading-overlay' role='status' aria-live='polite' aria-label='Loading media'>
                <span className='zoomable-loading-label'>LOADING</span>
              </div>
            )}
          </div>
          <GifTimeline />
          <Footer />
        </div>
      </main>
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

