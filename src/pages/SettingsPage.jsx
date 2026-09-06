import React from 'react';
import { Heart, Cat, Trash2 } from 'lucide-react';
import MacroSection from '../components/ui/MacroSection';
import OptionGroup from '../components/ui/shared/OptionGroup';
import useAccordion from '../hooks/useAccordion';
import useParamsStore from '../stores/data/paramsStore';
import useViewStore from '../stores/ui/viewStore';
import useWatermarkStore from '../stores/media/watermarkStore';

export default function SettingsPage() {
  const [openSections, toggleSection] = useAccordion('dither-dot:open-sections-settings', {
    settings: true,
    splitView: true,
    storage: false,
    about: true,
  });

  const showPipeline = useParamsStore((s) => s.pipelineVisible);
  const setShowPipeline = useParamsStore((s) => s.setPipelineVisible);
  const forceCpu = useParamsStore((s) => s.forceCpu);
  const setForceCpu = useParamsStore((s) => s.setForceCpu);
  const excludeAlpha = useParamsStore((s) => s.excludeAlpha);
  const setExcludeAlpha = useParamsStore((s) => s.setExcludeAlpha);
  const watermarkEnabled = useWatermarkStore((s) => s.enabled);
  const setWatermarkEnabled = useWatermarkStore((s) => s.setEnabled);
  const splitView = useViewStore((s) => s.splitView);
  const setSplitView = useViewStore((s) => s.setSplitView);
  const splitDirection = useViewStore((s) => s.splitDirection || 'vertical');
  const setSplitDirection = useViewStore((s) => s.setSplitDirection);

  const handleClearCache = () => {
    if (window.confirm('Reset all saved settings and reload DITHER-DOT?')) {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore
      }
      window.location.reload();
    }
  };

  return (
    <div>
      {/* 1. CORE SETTINGS (From original Import section) */}
      <MacroSection
        title="SETTINGS"
        collapsible
        isOpen={openSections.settings}
        onToggle={() => toggleSection('settings')}
      >
        <div className='bv-section pipeline-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>PIPELINE</span>
            <OptionGroup
              options={[
                { value: true, label: 'SHOW' },
                { value: false, label: 'HIDE' },
              ]}
              value={showPipeline}
              onChange={setShowPipeline}
              ariaLabel="Pipeline visibility"
            />
          </div>
        </div>

        <div className='bv-section force-cpu-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>FORCE CPU</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={forceCpu}
              onChange={setForceCpu}
              ariaLabel="Force CPU execution"
            />
          </div>
        </div>

        <div className='bv-section exclude-alpha-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>EXCLUDE ALPHA</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={excludeAlpha}
              onChange={setExcludeAlpha}
              ariaLabel="Exclude alpha transparency"
            />
          </div>
        </div>

        <div className='bv-section watermark-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>WATERMARK</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={watermarkEnabled}
              onChange={setWatermarkEnabled}
              ariaLabel="Watermark display"
            />
          </div>
        </div>
      </MacroSection>

      {/* 2. SPLIT VIEW SETTINGS */}
      <MacroSection
        title="SPLIT VIEW"
        collapsible
        isOpen={openSections.splitView}
        onToggle={() => toggleSection('splitView')}
      >
        <div className='bv-section split-view-enabled-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>ENABLED</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={splitView}
              onChange={setSplitView}
              ariaLabel="Split view enabled"
            />
          </div>
        </div>

        <div className='bv-section split-view-direction-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>DIRECTION</span>
            <OptionGroup
              options={[
                { value: 'vertical', label: 'VERT.' },
                { value: 'horizontal', label: 'HORIZ.' },
              ]}
              value={splitDirection}
              onChange={setSplitDirection}
              disabled={!splitView}
              ariaLabel="Split view direction"
            />
          </div>
        </div>
      </MacroSection>

      {/* 3. STORAGE & PREFERENCES */}
      <MacroSection
        title="STORAGE"
        collapsible
        isOpen={openSections.storage}
        onToggle={() => toggleSection('storage')}
      >
        <div className='bv-section'>
          <p className='bv-label' style={{ margin: 0, textTransform: 'uppercase', lineHeight: 1.4 }}>
            CLEAR LOCAL WORKSPACE STORAGE, CUSTOM PALETTES, AND TEMPLATE HISTORY TO RESET TO FACTORY STATE.
          </p>

          <div className='bv-controls-row' style={{ marginTop: '0.4rem' }}>
            <button
              type="button"
              className="bv-option-btn danger-btn"
              onClick={handleClearCache}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Trash2 size={13} />
              RESET PREFERENCES
            </button>
          </div>
        </div>
      </MacroSection>

      {/* 3. ABOUT & SUPPORT */}
      <MacroSection
        title="ABOUT"
        collapsible
        isOpen={openSections.about}
        onToggle={() => toggleSection('about')}
      >
        <div className='bv-section' style={{ gap: '0.75rem' }}>
          <div>
            <span className='bv-label' style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              DITHER-DOT v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.4.3'}
            </span>
            <p className='bv-label' style={{ margin: '0.35rem 0 0 0', lineHeight: 1.4 }}>
              A FAST, OPEN-SOURCE BROWSER DITHERING STUDIO FOR IMAGES AND GIFS — RUNNING ENTIRELY IN YOUR BROWSER WITH CLIENT-SIDE WEBGL SHADERS AND WEBASSEMBLY. 10+ ALGORITHMS, PALETTES &amp; WEBCAM SUPPORT.
            </p>
          </div>

          <div className='bv-option-group'>
            <a
              href="https://ko-fi.com/xbvuno"
              target="_blank"
              rel="noopener noreferrer"
              className="bv-option-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                textDecoration: 'none',
              }}
            >
              <Heart size={13} />
              SUPPORT ON KO-FI
            </a>

            <a
              href="https://github.com/xbvuno/dither-dot"
              target="_blank"
              rel="noopener noreferrer"
              className="bv-option-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                textDecoration: 'none',
              }}
            >
              <Cat size={13} />
              SOURCE CODE (GITHUB)
            </a>
          </div>
        </div>
      </MacroSection>
    </div>
  );
}
