import SliderBundle from '../components/SliderBundle';
import useDitherStore, { DITHER_COLOR_SPACE, DITHER_CONTROLS, DITHER_METHOD } from '../stores/ditherStore';

const METHODS = [
  { id: DITHER_METHOD.FLOYD_STEINBERG, label: 'FLOYD-STEINBERG' },
  { id: DITHER_METHOD.JJN, label: 'JARVIS, JUDICE AND NINKE' },
  { id: DITHER_METHOD.STUCKI, label: 'STUCKI' },
  { id: DITHER_METHOD.ATKINSON, label: 'ATKINSON' },
  { id: DITHER_METHOD.BURKES, label: 'BURKES' },
  { id: DITHER_METHOD.SIERRA, label: 'SIERRA' },
  { id: DITHER_METHOD.TWO_ROW_SIERRA, label: 'TWO-ROW SIERRA' },
  { id: DITHER_METHOD.SIERRA_LITE, label: 'SIERRA LITE' },
  { id: DITHER_METHOD.ORDERED_BAYER, label: 'ORDERED (BAYER MATRIX)' },
  { id: DITHER_METHOD.RANDOM, label: 'RANDOM DITHERING' },
];

export default function DitherPage() {
  const enabled = useDitherStore(s => s.enabled);
  const method = useDitherStore(s => s.method);
  const amount = useDitherStore(s => s.amount);
  const diffusion = useDitherStore(s => s.diffusion);
  const matrixScale = useDitherStore(s => s.matrixScale);
  const seed = useDitherStore(s => s.seed);
  const colorSpace = useDitherStore(s => s.colorSpace);

  const setEnabled = useDitherStore(s => s.setEnabled);
  const setMethod = useDitherStore(s => s.setMethod);
  const setAmount = useDitherStore(s => s.setAmount);
  const setDiffusion = useDitherStore(s => s.setDiffusion);
  const setMatrixScale = useDitherStore(s => s.setMatrixScale);
  const setSeed = useDitherStore(s => s.setSeed);
  const setColorSpace = useDitherStore(s => s.setColorSpace);

  const selectMethod = (nextMethod) => {
    if (!enabled) {
      setEnabled(true);
    }

    setMethod(nextMethod);
  };

  const showDiffusion = method !== DITHER_METHOD.ORDERED_BAYER && method !== DITHER_METHOD.RANDOM;
  const showMatrixScale = method === DITHER_METHOD.ORDERED_BAYER;
  const showSeed = method === DITHER_METHOD.RANDOM;
  const showControls = enabled;

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
            {METHODS.map(item => (
              <button
                key={item.id}
                type='button'
                className={`bv-option-btn${enabled && method === item.id ? ' active' : ''}`}
                data-dither-state={item.id}
                data-dither-enabled='true'
                data-selected={enabled && method === item.id ? 'true' : 'false'}
                onClick={() => selectMethod(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showControls && (
        <div className='bv-macro-section'>
          <h2>CONTROLS</h2>
          <div className='bv-section'>
            <p className='bv-label'>COLOR SPACE</p>
            <div className='bv-option-group'>
              <button
                type='button'
                className={`bv-option-btn${colorSpace === DITHER_COLOR_SPACE.RGB ? ' active' : ''}`}
                onClick={() => setColorSpace(DITHER_COLOR_SPACE.RGB)}
              >
                RGB
              </button>
              <button
                type='button'
                className={`bv-option-btn${colorSpace === DITHER_COLOR_SPACE.LAB ? ' active' : ''}`}
                onClick={() => setColorSpace(DITHER_COLOR_SPACE.LAB)}
              >
                LAB
              </button>
            </div>

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

            {showDiffusion && (
              <SliderBundle
                label='DIFFUSION'
                min={DITHER_CONTROLS.diffusion.min}
                max={DITHER_CONTROLS.diffusion.max}
                step={DITHER_CONTROLS.diffusion.step}
                defaultValue={DITHER_CONTROLS.diffusion.default}
                value={diffusion}
                onChange={setDiffusion}
                tooltip={DITHER_CONTROLS.diffusion.description}
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

