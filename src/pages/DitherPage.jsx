import { useState, useEffect } from 'react';
import MacroSection from '../components/ui/MacroSection';
import SliderBundle from '../components/ui/shared/SliderBundle';
import useDitherStore, { DITHER_CONTROLS, DITHER_METHOD } from '../stores/engine/ditherStore';
import { getDitherPreview } from '../utils/ditherGradientPreview';
import '../styles/app-dither.css';

const ALL_DITHER_METHODS = [
  {
    id: 'disabled',
    name: 'Disabled (No Dither)',
    category: 'OFF',
  },
  {
    id: DITHER_METHOD.FLOYD_STEINBERG,
    name: 'Floyd-Steinberg',
    category: 'ERROR DIFFUSION',
  },
  {
    id: DITHER_METHOD.ORDERED_BAYER,
    name: 'Ordered Bayer',
    category: 'ORDERED 8x8',
  },
  {
    id: DITHER_METHOD.ATKINSON,
    name: 'Atkinson',
    category: 'ERROR DIFFUSION',
  },
  {
    id: DITHER_METHOD.JJN,
    name: 'Jarvis-Judice-Ninke',
    category: 'ERROR DIFFUSION',
  },
  {
    id: DITHER_METHOD.STUCKI,
    name: 'Stucki',
    category: 'ERROR DIFFUSION',
  },
  {
    id: DITHER_METHOD.BURKES,
    name: 'Burkes',
    category: 'ERROR DIFFUSION',
  },
  {
    id: DITHER_METHOD.SIERRA,
    name: 'Sierra (3-Row)',
    category: 'SIERRA FAMILY',
  },
  {
    id: DITHER_METHOD.TWO_ROW_SIERRA,
    name: 'Two-Row Sierra',
    category: 'SIERRA FAMILY',
  },
  {
    id: DITHER_METHOD.SIERRA_LITE,
    name: 'Sierra Lite',
    category: 'SIERRA FAMILY',
  },
  {
    id: DITHER_METHOD.RANDOM,
    name: 'Random Noise',
    category: 'NOISE',
  },
  {
    id: DITHER_METHOD.ONLY_PALETTE,
    name: 'Only Palette',
    category: 'DIRECT SNAP',
  },
];

function DitherMethodPreview({ methodId }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancel = false;
    const handle = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback(() => {
          if (!cancel) setSrc(getDitherPreview(methodId));
        })
      : setTimeout(() => {
          if (!cancel) setSrc(getDitherPreview(methodId));
        }, 0);

    return () => {
      cancel = true;
      if (typeof requestIdleCallback !== 'undefined' && typeof handle === 'number') {
        cancelIdleCallback?.(handle);
      } else {
        clearTimeout(handle);
      }
    };
  }, [methodId]);

  return (
    <div className="dither-method-preview-wrap">
      {src ? (
        <img
          src={src}
          alt=""
          className="dither-method-preview-img"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="dither-method-preview-placeholder" />
      )}
    </div>
  );
}

export default function DitherPage() {
  const enabled = useDitherStore(s => s.enabled);
  const method = useDitherStore(s => s.method);
  const amount = useDitherStore(s => s.amount);
  const matrixScale = useDitherStore(s => s.matrixScale);
  const seed = useDitherStore(s => s.seed);

  const setEnabled = useDitherStore(s => s.setEnabled);
  const setMethod = useDitherStore(s => s.setMethod);
  const setAmount = useDitherStore(s => s.setAmount);
  const setMatrixScale = useDitherStore(s => s.setMatrixScale);
  const setSeed = useDitherStore(s => s.setSeed);

  // Accordion state
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = localStorage.getItem('dither-dot:open-sections-dither');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error parsing open dither sections', e);
    }
    return {
      methods: true,
      controls: true,
    };
  });

  const toggleSection = (section) => {
    setOpenSections((prev) => {
      const next = {
        ...prev,
        [section]: !prev[section],
      };
      localStorage.setItem('dither-dot:open-sections-dither', JSON.stringify(next));
      return next;
    });
  };

  const handleSelectMethod = (selectedId) => {
    if (selectedId === 'disabled') {
      setEnabled(false);
    } else {
      if (!enabled) setEnabled(true);
      setMethod(selectedId);
    }
  };

  const currentMethodInfo = ALL_DITHER_METHODS.find(
    m => enabled ? m.id === method : m.id === 'disabled'
  );

  const showMatrixScale = enabled && method === DITHER_METHOD.ORDERED_BAYER;
  const showSeed = enabled && method === DITHER_METHOD.RANDOM;
  const showAmount = enabled && method !== DITHER_METHOD.ONLY_PALETTE;
  const showControls = enabled && (showAmount || showMatrixScale || showSeed);

  const isControlsModified =
    (showAmount && amount !== DITHER_CONTROLS.amount.default) ||
    (showMatrixScale && matrixScale !== DITHER_CONTROLS.matrixScale.default) ||
    (showSeed && seed !== DITHER_CONTROLS.seed.default);

  const resetControls = () => {
    if (showAmount) setAmount(DITHER_CONTROLS.amount.default);
    if (showMatrixScale) setMatrixScale(DITHER_CONTROLS.matrixScale.default);
    if (showSeed) setSeed(DITHER_CONTROLS.seed.default);
  };

  return (
    <div>
      <MacroSection title="DITHER">
        <div className="bv-section">
          <div className="bv-controls-row">
            <span className="bv-label">METHOD</span>
            <span style={{ fontSize: '0.88rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {currentMethodInfo ? currentMethodInfo.name : method}
            </span>
          </div>
        </div>
      </MacroSection>

      <MacroSection
        title="METHODS"
        collapsible
        isOpen={openSections.methods}
        onToggle={() => toggleSection('methods')}
      >
        <div className="bv-section">
          <div className="dither-method-list">
            {ALL_DITHER_METHODS.map((item) => {
              const isSelected = item.id === 'disabled' ? !enabled : (enabled && method === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`dither-method-card${isSelected ? ' active' : ''}`}
                  onClick={() => handleSelectMethod(item.id)}
                  title={item.name}
                >
                  <DitherMethodPreview methodId={item.id} />
                  <div className="dither-method-head">
                    <span className="dither-method-name">{item.name}</span>
                    <span className="dither-method-category">{item.category}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </MacroSection>

      {showControls && (
        <MacroSection
          title="CONTROLS"
          collapsible
          isOpen={openSections.controls}
          onToggle={() => toggleSection('controls')}
          isModified={isControlsModified}
          onReset={resetControls}
        >
          <div className="bv-section">
            {showAmount && (
              <SliderBundle
                label="AMOUNT"
                min={DITHER_CONTROLS.amount.min}
                max={DITHER_CONTROLS.amount.max}
                step={DITHER_CONTROLS.amount.step}
                defaultValue={DITHER_CONTROLS.amount.default}
                value={amount}
                onChange={setAmount}
                tooltip={DITHER_CONTROLS.amount.description}
              />
            )}
            {showMatrixScale && (
              <SliderBundle
                label="MATRIX SCALE"
                min={DITHER_CONTROLS.matrixScale.min}
                max={DITHER_CONTROLS.matrixScale.max}
                step={DITHER_CONTROLS.matrixScale.step}
                defaultValue={DITHER_CONTROLS.matrixScale.default}
                value={matrixScale}
                onChange={setMatrixScale}
                tooltip={DITHER_CONTROLS.matrixScale.description}
              />
            )}
            {showSeed && (
              <SliderBundle
                label="SEED"
                min={DITHER_CONTROLS.seed.min}
                max={DITHER_CONTROLS.seed.max}
                step={DITHER_CONTROLS.seed.step}
                defaultValue={DITHER_CONTROLS.seed.default}
                value={seed}
                onChange={setSeed}
                tooltip={DITHER_CONTROLS.seed.description}
              />
            )}
          </div>
        </MacroSection>
      )}
    </div>
  );
}


