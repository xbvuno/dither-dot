import SliderBundle from '../components/ui/shared/SliderBundle';
import useDitherStore, { DITHER_CONTROLS, DITHER_METHOD } from '../stores/engine/ditherStore';

const METHODS = [
  { id: DITHER_METHOD.ONLY_PALETTE, label: 'ONLY PALETTE' },
  { id: DITHER_METHOD.FLOYD_STEINBERG, label: 'FS' },
  { id: DITHER_METHOD.ORDERED_BAYER, label: 'BAYER' },
  { id: DITHER_METHOD.JJN, label: 'JJN' },
  { id: DITHER_METHOD.STUCKI, label: 'STUCKI' },
  { id: DITHER_METHOD.ATKINSON, label: 'ATKINSON' },
  { id: DITHER_METHOD.BURKES, label: 'BURKES' },
  { id: DITHER_METHOD.SIERRA, label: 'SIERRA' },
  { id: DITHER_METHOD.RANDOM, label: 'RANDOM' },
];

const SIERRA_VARIANTS = [
  { id: DITHER_METHOD.SIERRA, label: 'NORMAL' },
  { id: DITHER_METHOD.TWO_ROW_SIERRA, label: '2 ROW' },
  { id: DITHER_METHOD.SIERRA_LITE, label: 'LITE' },
];

const isSierraMethod = (m) =>
  m === DITHER_METHOD.SIERRA ||
  m === DITHER_METHOD.TWO_ROW_SIERRA ||
  m === DITHER_METHOD.SIERRA_LITE;

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

  const selectMethod = (nextMethod) => {
    if (!enabled) {
      setEnabled(true);
    }

    if (nextMethod === DITHER_METHOD.SIERRA) {
      if (!isSierraMethod(method)) {
        setMethod(DITHER_METHOD.SIERRA);
      }
      return;
    }

    setMethod(nextMethod);
  };

  const showSierraVariants = isSierraMethod(method);
  const showMatrixScale = method === DITHER_METHOD.ORDERED_BAYER;
  const showSeed = method === DITHER_METHOD.RANDOM;
  const showAmount = method !== DITHER_METHOD.ONLY_PALETTE;
  const showControls = enabled && (showAmount || showMatrixScale || showSeed || showSierraVariants);

  return (
    <div>
      <div className='bv-macro-section'>
        <h2>DITHER</h2>
        <div className='bv-section'>
          <p className='bv-label'>METHOD</p>
          <div className='bv-option-group'>
            <button
              type='button'
              className={`bv-option-btn dither-toggle-btn${!enabled ? ' active' : ''}`}
              data-dither-state='disabled'
              data-dither-enabled='false'
              data-selected={!enabled ? 'true' : 'false'}
              onClick={() => setEnabled(false)}
            >
              DISABLED
            </button>
            {METHODS.map(item => {
              const isSelected = enabled && (
                item.id === DITHER_METHOD.SIERRA
                  ? isSierraMethod(method)
                  : method === item.id
              );
              return (
                <button
                  key={item.id}
                  type='button'
                  className={`bv-option-btn${isSelected ? ' active' : ''}`}
                  data-dither-state={item.id}
                  data-dither-enabled='true'
                  data-selected={isSelected ? 'true' : 'false'}
                  onClick={() => selectMethod(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showControls && (
        <div className='bv-macro-section'>
          <h2>CONTROLS</h2>
          <div className='bv-section'>
            {showSierraVariants && (
              <div className='bv-section' style={{ marginBottom: '0.6rem' }}>
                <p className='bv-label'>SIERRA TYPE</p>
                <div className='bv-option-group'>
                  {SIERRA_VARIANTS.map(variant => (
                    <button
                      key={variant.id}
                      type='button'
                      className={`bv-option-btn${method === variant.id ? ' active' : ''}`}
                      data-selected={method === variant.id ? 'true' : 'false'}
                      onClick={() => setMethod(variant.id)}
                    >
                      {variant.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showAmount && (
              <SliderBundle
                label='AMOUNT'
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
                label='MATRIX SCALE'
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
                label='SEED'
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
        </div>
      )}
    </div>
  );
}

