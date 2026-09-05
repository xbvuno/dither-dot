import { useState } from 'react';
import { ArrowRight, Cat, Heart } from 'lucide-react';
import { useRouter } from '../router/router';
import watermarkMini from '../assets/watermark/watermark-mini.png';
import '../styles/LandingPage.css';

export default function LandingPage() {
  const { navigate } = useRouter();
  const [modalType, setModalType] = useState(null);

  return (
    <div className='landing-page-wrap'>
      <header className='landing-header'>
        <div className='app-header-title'>
          <img src={watermarkMini} alt='DITHER-DOT Logo' className='header-logo-img' />
          <span className='app-header-title-name'>DITHER-DOT</span>
        </div>
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
        </div>
      </header>

      <main className='landing-main'>
        <div className='landing-badge'>BROWSER DITHERING STUDIO</div>
        <h1 className='landing-title'>DITHER-DOT</h1>
        <p className='landing-subtitle'>
          A fast, open-source dithering studio for images and GIFs — running entirely in your browser with WebGL &amp; WebAssembly.
        </p>

        <button
          type='button'
          className='landing-cta-btn'
          onClick={() => navigate('/import')}
          aria-label='Open DITHER-DOT WebApp'
        >
          <span>OPEN WEBAPP</span>
          <ArrowRight size={16} strokeWidth={2} />
        </button>

        <div className='landing-features'>
          <span className='landing-feature-chip'>10+ DITHER ALGORITHMS</span>
          <span className='landing-feature-chip'>REALTIME SHADERS</span>
          <span className='landing-feature-chip'>GIF &amp; WEBCAM SUPPORT</span>
          <span className='landing-feature-chip'>COLOR PALETTES</span>
          <span className='landing-feature-chip'>100% CLIENT-SIDE</span>
        </div>
      </main>

      <footer className='landing-footer'>
        <span>DITHER-DOT • OPEN SOURCE</span>
        <a href='https://github.com/xbvuno/dither-dot' target='_blank' rel='noopener noreferrer'>
          GITHUB
        </a>
      </footer>

      {modalType === 'support' && (
        <div className='header-modal-backdrop' onClick={() => setModalType(null)}>
          <section
            className='header-modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='landing-support-title'
            onClick={(event) => event.stopPropagation()}
          >
            <div className='header-modal-top'>
              <h2 id='landing-support-title'>SUPPORT</h2>
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
                DITHER-DOT is open-source and runs entirely in your browser. If you enjoy using it, consider supporting via Ko-fi.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
