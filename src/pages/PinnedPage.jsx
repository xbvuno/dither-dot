import MacroSection from '../components/ui/MacroSection';
import SliderBundle from '../components/ui/shared/SliderBundle';
import usePinnedStore from '../stores/ui/pinnedStore';
import useParamsStore, {
  COLOR_CONTROLS,
  NOISE_CONTROLS,
  BLUR_CONTROLS,
} from '../stores/data/paramsStore';
import useDitherStore, {
  DITHER_CONTROLS,
  DITHER_METHOD,
} from '../stores/engine/ditherStore';
import usePaletteStore, { EXTRACT_METHOD } from '../stores/data/paletteStore';
import useSizeStore, { getAspectCroppedAxis } from '../stores/media/sizeStore';
import useImageStore from '../stores/media/imageStore';
import { PIN_ID } from '../constants/pinnedRegistry';

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatParamLabel(key) {
  return key.replace(/^noise/, '').replace(/([A-Z])/g, ' $1').trim().toUpperCase();
}

export default function PinnedPage() {
  const pinnedIds = usePinnedStore((s) => s.pinnedIds);

  // Params store (Colors, Noise, Blur)
  const paramsState = useParamsStore();
  const noiseEnabled = paramsState.noiseEnabled;
  const blurEnabled = paramsState.blurEnabled;

  // Dither store
  const ditherEnabled = useDitherStore((s) => s.enabled);
  const ditherMethod = useDitherStore((s) => s.method);
  const ditherAmount = useDitherStore((s) => s.amount);
  const ditherMatrixScale = useDitherStore((s) => s.matrixScale);
  const ditherSeed = useDitherStore((s) => s.seed);
  const setDitherAmount = useDitherStore((s) => s.setAmount);
  const setDitherMatrixScale = useDitherStore((s) => s.setMatrixScale);
  const setDitherSeed = useDitherStore((s) => s.setSeed);

  // Palette store
  const paletteMethod = usePaletteStore((s) => s.method);
  const paletteColorCount = usePaletteStore((s) => s.colorCount);
  const setPaletteColorCount = usePaletteStore((s) => s.setColorCount);

  // Size store
  const width = useSizeStore((s) => s.size.width);
  const height = useSizeStore((s) => s.size.height);
  const customWidth = useSizeStore((s) => s.customSize.customWidth);
  const customHeight = useSizeStore((s) => s.customSize.customHeight);
  const ratioLocked = useSizeStore((s) => s.ratioLocked);
  const crop = useSizeStore((s) => s.crop) || { top: 0, bottom: 0, left: 0, right: 0 };
  const aspectPreset = useSizeStore((s) => s.aspectPreset) || 'free';
  const aspectOrientation = useSizeStore((s) => s.aspectOrientation) || 'landscape';
  const aspectOffset = useSizeStore((s) => s.aspectOffset) ?? 0.5;

  const setCustomWidth = useSizeStore((s) => s.setCustomWidth);
  const setCustomHeight = useSizeStore((s) => s.setCustomHeight);
  const setScale = useSizeStore((s) => s.setScale);
  const setCropTop = useSizeStore((s) => s.setCropTop);
  const setCropBottom = useSizeStore((s) => s.setCropBottom);
  const setCropLeft = useSizeStore((s) => s.setCropLeft);
  const setCropRight = useSizeStore((s) => s.setCropRight);
  const setAspectOffset = useSizeStore((s) => s.setAspectOffset);

  // Image store (Export)
  const exportUpscale = useImageStore((s) => s.exportUpscale);
  const setExportUpscale = useImageStore((s) => s.setExportUpscale);

  // Derived size & cropping values
  const isFreeAspect = aspectPreset === 'free';
  const safeW = width || 1;
  const safeH = height || 1;
  const croppedAxis = !isFreeAspect ? getAspectCroppedAxis(safeW, safeH, aspectPreset, aspectOrientation) : null;
  const isTopBottomDisabled = croppedAxis === 'y';
  const isLeftRightDisabled = croppedAxis === 'x';

  const croppedWidth = Math.max(1, (width || 0) - (crop.left || 0) - (crop.right || 0));
  const croppedHeight = Math.max(1, (height || 0) - (crop.top || 0) - (crop.bottom || 0));
  const currentCroppedW = customWidth != null ? customWidth : croppedWidth;
  const currentCroppedH = customHeight != null ? customHeight : croppedHeight;
  const currentScale = Number(Math.min(1.0, Math.max(0, currentCroppedW / croppedWidth)).toFixed(3));
  const maxSliderWidth = Math.max(1280, croppedWidth * 2);
  const maxSliderHeight = Math.max(720, croppedHeight * 2);

  // Check section memberships
  const pinnedColors = Object.entries(COLOR_CONTROLS).filter(([key]) =>
    pinnedIds.includes(`adjustments:colors:${key}`)
  );
  const pinnedNoise = Object.entries(NOISE_CONTROLS).filter(([key]) =>
    pinnedIds.includes(`adjustments:noise:${key}`)
  );
  const pinnedBlur = Object.entries(BLUR_CONTROLS).filter(([key]) =>
    pinnedIds.includes(`adjustments:blur:${key}`)
  );

  const hasAspectOffset = pinnedIds.includes(PIN_ID.ASPECT_OFFSET);

  const hasCropTop = pinnedIds.includes(PIN_ID.CROP_TOP);
  const hasCropBottom = pinnedIds.includes(PIN_ID.CROP_BOTTOM);
  const hasCropLeft = pinnedIds.includes(PIN_ID.CROP_LEFT);
  const hasCropRight = pinnedIds.includes(PIN_ID.CROP_RIGHT);
  const hasCropping = hasCropTop || hasCropBottom || hasCropLeft || hasCropRight;

  const hasResizeScale = pinnedIds.includes(PIN_ID.RESIZE_SCALE);
  const hasResizeWidth = pinnedIds.includes(PIN_ID.RESIZE_WIDTH);
  const hasResizeHeight = pinnedIds.includes(PIN_ID.RESIZE_HEIGHT);
  const hasResize = hasResizeScale || hasResizeWidth || hasResizeHeight;

  const hasPaletteColorCount = pinnedIds.includes(PIN_ID.PALETTE_COLOR_COUNT);

  const hasDitherAmount = pinnedIds.includes(PIN_ID.DITHER_AMOUNT);
  const hasDitherMatrixScale = pinnedIds.includes(PIN_ID.DITHER_MATRIX_SCALE);
  const hasDitherSeed = pinnedIds.includes(PIN_ID.DITHER_SEED);
  const hasDither = hasDitherAmount || hasDitherMatrixScale || hasDitherSeed;

  const hasExportUpscale = pinnedIds.includes(PIN_ID.EXPORT_UPSCALE);

  return (
    <div>
      <MacroSection title="PINNED">
        <div className="bv-section">
          {pinnedIds.length === 0 ? (
            <>
              <p className="bv-label" style={{ textAlign: 'center', opacity: 0.6, margin: '1.5rem 0 0.5rem' }}>
                NO PINNED SLIDERS
              </p>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  margin: '0 auto 1.5rem',
                  maxWidth: '220px',
                  lineHeight: 1.4,
                }}
              >
                Select any slider and click the pin button to add it here.
              </p>
            </>
          ) : (
            <div className="bv-controls-row">
              <span className="bv-label">ACTIVE CONTROLS</span>
              <span style={{ fontSize: '0.88rem', letterSpacing: '0.04em' }}>
                {pinnedIds.length} {pinnedIds.length === 1 ? 'SLIDER' : 'SLIDERS'}
              </span>
            </div>
          )}
        </div>
      </MacroSection>

      {/* COLORS */}
      {pinnedColors.length > 0 && (
        <MacroSection title="COLORS">
          <div className="bv-section">
            {pinnedColors.map(([key, cfg]) => {
              const val = paramsState[key];
              const setter = paramsState['set' + capitalize(key)];
              return (
                <SliderBundle
                  key={key}
                  label={key.toUpperCase()}
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  defaultValue={cfg.default}
                  value={val}
                  onChange={setter}
                  tooltip={cfg.description}
                  pinId={`adjustments:colors:${key}`}
                  isPinnedPage
                />
              );
            })}
          </div>
        </MacroSection>
      )}

      {/* NOISE */}
      {pinnedNoise.length > 0 && (
        <MacroSection title="NOISE">
          <div className="bv-section">
            {pinnedNoise.map(([key, cfg]) => {
              const val = paramsState[key];
              const setter = paramsState['set' + capitalize(key)];
              return (
                <SliderBundle
                  key={key}
                  label={formatParamLabel(key)}
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  defaultValue={cfg.default}
                  value={val}
                  onChange={setter}
                  tooltip={cfg.description}
                  disabled={!noiseEnabled}
                  pinId={`adjustments:noise:${key}`}
                  isPinnedPage
                />
              );
            })}
          </div>
        </MacroSection>
      )}

      {/* BLUR */}
      {pinnedBlur.length > 0 && (
        <MacroSection title="BLUR">
          <div className="bv-section">
            {pinnedBlur.map(([key, cfg]) => {
              const val = paramsState[key];
              const setter = paramsState['set' + capitalize(key)];
              return (
                <SliderBundle
                  key={key}
                  label={formatParamLabel(key)}
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  defaultValue={cfg.default}
                  value={val}
                  onChange={setter}
                  tooltip={cfg.description}
                  disabled={!blurEnabled}
                  pinId={`adjustments:blur:${key}`}
                  isPinnedPage
                />
              );
            })}
          </div>
        </MacroSection>
      )}

      {/* ASPECT RATIO */}
      {hasAspectOffset && (
        <MacroSection title="ASPECT RATIO">
          <div className="bv-section">
            <SliderBundle
              label="POSITION"
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.5}
              value={aspectOffset}
              onChange={setAspectOffset}
              disabled={isFreeAspect}
              pinId={PIN_ID.ASPECT_OFFSET}
              isPinnedPage
            />
          </div>
        </MacroSection>
      )}

      {/* CROPPING */}
      {hasCropping && (
        <MacroSection title="CROPPING">
          <div className="bv-section">
            {hasCropTop && (
              <SliderBundle
                min={0}
                max={Math.max(0, safeH - crop.bottom - 1)}
                defaultValue={0}
                step={1}
                label="TOP"
                value={crop.top}
                onChange={setCropTop}
                disabled={isTopBottomDisabled}
                pinId={PIN_ID.CROP_TOP}
                isPinnedPage
              />
            )}
            {hasCropBottom && (
              <SliderBundle
                min={0}
                max={Math.max(0, safeH - crop.top - 1)}
                defaultValue={0}
                step={1}
                label="BOTTOM"
                value={crop.bottom}
                onChange={setCropBottom}
                disabled={isTopBottomDisabled}
                pinId={PIN_ID.CROP_BOTTOM}
                isPinnedPage
              />
            )}
            {hasCropLeft && (
              <SliderBundle
                min={0}
                max={Math.max(0, safeW - crop.right - 1)}
                defaultValue={0}
                step={1}
                label="LEFT"
                value={crop.left}
                onChange={setCropLeft}
                disabled={isLeftRightDisabled}
                pinId={PIN_ID.CROP_LEFT}
                isPinnedPage
              />
            )}
            {hasCropRight && (
              <SliderBundle
                min={0}
                max={Math.max(0, safeW - crop.left - 1)}
                defaultValue={0}
                step={1}
                label="RIGHT"
                value={crop.right}
                onChange={setCropRight}
                disabled={isLeftRightDisabled}
                pinId={PIN_ID.CROP_RIGHT}
                isPinnedPage
              />
            )}
          </div>
        </MacroSection>
      )}

      {/* RESIZE */}
      {hasResize && (
        <MacroSection title="RESIZE">
          <div className="bv-section">
            {hasResizeScale && (
              <SliderBundle
                min={0}
                max={1.0}
                defaultValue={1.0}
                step={0.01}
                label="SCALE"
                value={currentScale}
                onChange={setScale}
                disabled={!ratioLocked}
                pinId={PIN_ID.RESIZE_SCALE}
                isPinnedPage
              />
            )}
            {hasResizeWidth && (
              <SliderBundle
                min={1}
                max={maxSliderWidth}
                defaultValue={croppedWidth}
                step={1}
                label="WIDTH"
                value={currentCroppedW}
                onChange={setCustomWidth}
                disabled={ratioLocked}
                pinId={PIN_ID.RESIZE_WIDTH}
                isPinnedPage
              />
            )}
            {hasResizeHeight && (
              <SliderBundle
                min={1}
                max={maxSliderHeight}
                defaultValue={croppedHeight}
                step={1}
                label="HEIGHT"
                value={currentCroppedH}
                onChange={setCustomHeight}
                disabled={ratioLocked}
                pinId={PIN_ID.RESIZE_HEIGHT}
                isPinnedPage
              />
            )}
          </div>
        </MacroSection>
      )}

      {/* PALETTE */}
      {hasPaletteColorCount && (
        <MacroSection title="PALETTE">
          <div className="bv-section">
            <SliderBundle
              label="COLORS"
              min={2}
              max={64}
              step={1}
              defaultValue={8}
              value={paletteColorCount}
              onChange={setPaletteColorCount}
              disabled={paletteMethod === EXTRACT_METHOD.CUSTOM}
              pinId={PIN_ID.PALETTE_COLOR_COUNT}
              isPinnedPage
            />
          </div>
        </MacroSection>
      )}

      {/* DITHER */}
      {hasDither && (
        <MacroSection title="DITHER">
          <div className="bv-section">
            {hasDitherAmount && (
              <SliderBundle
                label="DITHER AMOUNT"
                min={DITHER_CONTROLS.amount.min}
                max={DITHER_CONTROLS.amount.max}
                step={DITHER_CONTROLS.amount.step}
                defaultValue={DITHER_CONTROLS.amount.default}
                value={ditherAmount}
                onChange={setDitherAmount}
                tooltip={DITHER_CONTROLS.amount.description}
                disabled={!ditherEnabled || ditherMethod === DITHER_METHOD.ONLY_PALETTE}
                pinId={PIN_ID.DITHER_AMOUNT}
                isPinnedPage
              />
            )}
            {hasDitherMatrixScale && (
              <SliderBundle
                label="MATRIX SCALE"
                min={DITHER_CONTROLS.matrixScale.min}
                max={DITHER_CONTROLS.matrixScale.max}
                step={DITHER_CONTROLS.matrixScale.step}
                defaultValue={DITHER_CONTROLS.matrixScale.default}
                value={ditherMatrixScale}
                onChange={setDitherMatrixScale}
                tooltip={DITHER_CONTROLS.matrixScale.description}
                disabled={!ditherEnabled || ditherMethod !== DITHER_METHOD.ORDERED_BAYER}
                pinId={PIN_ID.DITHER_MATRIX_SCALE}
                isPinnedPage
              />
            )}
            {hasDitherSeed && (
              <SliderBundle
                label="SEED"
                min={DITHER_CONTROLS.seed.min}
                max={DITHER_CONTROLS.seed.max}
                step={DITHER_CONTROLS.seed.step}
                defaultValue={DITHER_CONTROLS.seed.default}
                value={ditherSeed}
                onChange={setDitherSeed}
                tooltip={DITHER_CONTROLS.seed.description}
                disabled={!ditherEnabled || ditherMethod !== DITHER_METHOD.RANDOM}
                pinId={PIN_ID.DITHER_SEED}
                isPinnedPage
              />
            )}
          </div>
        </MacroSection>
      )}

      {/* EXPORT */}
      {hasExportUpscale && (
        <MacroSection title="EXPORT">
          <div className="bv-section">
            <SliderBundle
              label="UPSCALE"
              min={1}
              max={10}
              step={1}
              defaultValue={1}
              value={exportUpscale}
              onChange={setExportUpscale}
              pinId={PIN_ID.EXPORT_UPSCALE}
              isPinnedPage
            />
          </div>
        </MacroSection>
      )}
    </div>
  );
}
