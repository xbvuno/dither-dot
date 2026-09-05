import { useState, useEffect } from 'react';
import MacroSection from '../components/ui/MacroSection';
import SliderBundle from '../components/ui/shared/SliderBundle';
import OptionGroup from '../components/ui/shared/OptionGroup';
import useAccordion from '../hooks/useAccordion';
import useDitherStore, {
  DITHER_CONTROLS,
  DITHER_METHOD,
  selectIsDitherControlsModified,
} from '../stores/engine/ditherStore';
import { getDitherPreview } from '../utils/ditherGradientPreview';
import '../styles/app-dither.css';

const ALL_DITHER_METHODS = [
  {
    id: 'disabled',
    name: 'Disabled (No Dither)',
  },
  {
    id: DITHER_METHOD.ONLY_PALETTE,
    name: 'Only Palette',
  },
  {
    id: DITHER_METHOD.FLOYD_STEINBERG,
    name: 'Floyd-Steinberg',
  },
  {
    id: DITHER_METHOD.ORDERED_BAYER,
    name: 'Ordered Bayer',
  },
  {
    id: DITHER_METHOD.ATKINSON,
    name: 'Atkinson',
  },
  {
    id: DITHER_METHOD.JJN,
    name: 'Jarvis-Judice-Ninke',
  },
  {
    id: DITHER_METHOD.STUCKI,
    name: 'Stucki',
  },
  {
    id: DITHER_METHOD.BURKES,
    name: 'Burkes',
  },
  {
    id: DITHER_METHOD.SIERRA,
    name: 'Sierra',
  },
  {
    id: DITHER_METHOD.RANDOM,
    name: 'Random Noise',
  },
];

const SIERRA_VARIANTS = [
  { value: DITHER_METHOD.SIERRA, label: 'NORMAL' },
  { value: DITHER_METHOD.TWO_ROW_SIERRA, label: '2 ROW' },
  { value: DITHER_METHOD.SIERRA_LITE, label: 'LITE' },
];

const isSierraMethod = (m) =>
  m === DITHER_METHOD.SIERRA ||
  m === DITHER_METHOD.TWO_ROW_SIERRA ||
  m === DITHER_METHOD.SIERRA_LITE;

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
  const resetControls = useDitherStore(s => s.resetControls);

  const isControlsModified = useDitherStore(selectIsDitherControlsModified);

  const [openSections, toggleSection] = useAccordion('dither-dot:open-sections-dither', {
    methods: true,
    controls: true,
  });

  const handleSelectMethod = (selectedId) => {
    if (selectedId === 'disabled') {
      setEnabled(false);
    } else {
      if (!enabled) setEnabled(true);
      if (selectedId === DITHER_METHOD.SIERRA) {
        if (!isSierraMethod(method)) {
          setMethod(DITHER_METHOD.SIERRA);
        }
      } else {
        setMethod(selectedId);
      }
    }
  };

  const getActiveMethodName = () => {
    if (!enabled) return 'Disabled (No Dither)';
    if (method === DITHER_METHOD.SIERRA) return 'Sierra (Normal)';
    if (method === DITHER_METHOD.TWO_ROW_SIERRA) return 'Sierra (2 Row)';
    if (method === DITHER_METHOD.SIERRA_LITE) return 'Sierra Lite';
    const found = ALL_DITHER_METHODS.find(m => m.id === method);
    return found ? found.name : method;
  };

  const showSierraVariants = enabled && isSierraMethod(method);
  const showMatrixScale = enabled && method === DITHER_METHOD.ORDERED_BAYER;
  const showSeed = enabled && method === DITHER_METHOD.RANDOM;
  const showAmount = enabled && method !== DITHER_METHOD.ONLY_PALETTE;
  const showControls = enabled && (showAmount || showMatrixScale || showSeed || showSierraVariants);

  return (
    <div>
      <MacroSection title="DITHER">
        <div className="bv-section">
          <div className="bv-controls-row">
            <span className="bv-label">METHOD</span>
            <span style={{ fontSize: '0.88rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {getActiveMethodName()}
            </span>
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
            {showSierraVariants && (
              <div className="bv-controls-row">
                <span className="bv-label">TYPE</span>
                <OptionGroup
                  options={SIERRA_VARIANTS}
                  value={method}
                  onChange={setMethod}
                  ariaLabel="Sierra algorithm variant"
                />
              </div>
            )}
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

      <MacroSection
        title="METHODS"
        collapsible
        isOpen={openSections.methods}
        onToggle={() => toggleSection('methods')}
      >
        <div className="bv-section">
          <div className="dither-method-list">
            {ALL_DITHER_METHODS.map((item) => {
              const isSelected = item.id === 'disabled'
                ? !enabled
                : enabled && (
                    item.id === DITHER_METHOD.SIERRA
                      ? isSierraMethod(method)
                      : method === item.id
                  );
              const previewMethodId = item.id === DITHER_METHOD.SIERRA && isSierraMethod(method)
                ? method
                : item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`dither-method-card${isSelected ? ' active' : ''}`}
                  onClick={() => handleSelectMethod(item.id)}
                  title={item.name}
                >
                  <DitherMethodPreview methodId={previewMethodId} />
                  <div className="dither-method-head">
                    <span className="dither-method-name">{item.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </MacroSection>
    </div>
  );
}


