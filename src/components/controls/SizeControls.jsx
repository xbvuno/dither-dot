import MacroSection from "../ui/MacroSection";
import SliderBundle from "../ui/shared/SliderBundle";
import OptionGroup from "../ui/shared/OptionGroup";
import useSizeStore, {
  getAspectCroppedAxis,
  selectIsAspectModified,
  selectIsCropModified,
  selectIsResizeModified,
} from "../../stores/media/sizeStore";
import useAccordion from "../../hooks/useAccordion";

const ASPECT_PRESET_OPTIONS = ['free', '1:1', '4:3', '16:9'];
const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: 'LANDSCAPE' },
  { value: 'portrait', label: 'PORTRAIT' },
];
const RESIZE_RATIO_OPTIONS = [
  { value: true, label: 'KEEP' },
  { value: false, label: 'FREE' },
];

function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

function formatRatio(w, h) {
  if (!w || !h) return null;
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

export default function SizeControls() {
  const width        = useSizeStore(s => s.size.width);
  const height       = useSizeStore(s => s.size.height);
  const customWidth  = useSizeStore(s => s.customSize.customWidth);
  const customHeight = useSizeStore(s => s.customSize.customHeight);
  const ratioLocked  = useSizeStore(s => s.ratioLocked);
  const setCustomWidth  = useSizeStore(s => s.setCustomWidth);
  const setCustomHeight = useSizeStore(s => s.setCustomHeight);
  const setScale        = useSizeStore(s => s.setScale);
  const setRatioLocked  = useSizeStore(s => s.setRatioLocked);

  const crop = useSizeStore(s => s.crop) || { top: 0, bottom: 0, left: 0, right: 0 };
  const setCropTop = useSizeStore(s => s.setCropTop);
  const setCropBottom = useSizeStore(s => s.setCropBottom);
  const setCropLeft = useSizeStore(s => s.setCropLeft);
  const setCropRight = useSizeStore(s => s.setCropRight);

  const aspectPreset = useSizeStore(s => s.aspectPreset) || 'free';
  const aspectOrientation = useSizeStore(s => s.aspectOrientation) || 'landscape';
  const aspectOffset = useSizeStore(s => s.aspectOffset) ?? 0.5;
  const setAspectPreset = useSizeStore(s => s.setAspectPreset);
  const setAspectOrientation = useSizeStore(s => s.setAspectOrientation);
  const setAspectOffset = useSizeStore(s => s.setAspectOffset);

  const resetSizeToCurrent = useSizeStore(s => s.resetSizeToCurrent);
  const resetCrop = useSizeStore(s => s.resetCrop);
  const resetAspectRatio = useSizeStore(s => s.resetAspectRatio);

  const isAspectModified = useSizeStore(selectIsAspectModified);
  const isCroppingModified = useSizeStore(selectIsCropModified);
  const isResizeModified = useSizeStore(selectIsResizeModified);

  const isFree = aspectPreset === 'free';
  const croppedAxis = !isFree ? getAspectCroppedAxis(width, height, aspectPreset, aspectOrientation) : null;
  const isTopBottomDisabled = croppedAxis === 'y';
  const isLeftRightDisabled = croppedAxis === 'x';

  const [openSections, toggleSection] = useAccordion('dither-dot:open-sections-resizing', {
    aspectRatio: true,
    cropping: true,
    resize: true,
  });

  if (width == null || height == null) return null;

  // Base dimensions after crop
  const croppedWidth = Math.max(1, width - (crop.left || 0) - (crop.right || 0));
  const croppedHeight = Math.max(1, height - (crop.top || 0) - (crop.bottom || 0));

  const currentCroppedW = customWidth != null ? customWidth : croppedWidth;
  const currentCroppedH = customHeight != null ? customHeight : croppedHeight;
  const currentScale = Number(Math.min(1.0, Math.max(0, currentCroppedW / croppedWidth)).toFixed(3));

  const maxSliderWidth = Math.max(1280, croppedWidth * 2);
  const maxSliderHeight = Math.max(720, croppedHeight * 2);

  const currentRatioLabel = formatRatio(currentCroppedW, currentCroppedH);

  // Percent calculations for preview box based on original image
  const pctLeft = width ? (crop.left / width) * 100 : 0;
  const pctRight = width ? (crop.right / width) * 100 : 0;
  const pctTop = height ? (crop.top / height) * 100 : 0;
  const pctBottom = height ? (crop.bottom / height) * 100 : 0;

  // Fit contain aspect ratio calculation for preview box
  const aspect = (width && height) ? width / height : 1;
  const maxW = 280;
  const maxH = 140;
  let frameW = maxW;
  let frameH = maxH;
  if (aspect > maxW / maxH) {
    frameH = maxW / aspect;
  } else {
    frameW = maxH * aspect;
  }

  return (
    <>
      <MacroSection title="RESIZING">
        <div className="bv-section">
          <div className="bv-controls-row">
            <span className="bv-label">RATIO</span>
            <span style={{ fontSize: '0.88rem', letterSpacing: '0.04em' }}>
              {currentRatioLabel || '-'}
            </span>
          </div>
          <div className="bv-controls-row" style={{ marginTop: '0.45rem' }}>
            <span className="bv-label">WIDTH</span>
            <span style={{ fontSize: '0.88rem', letterSpacing: '0.04em' }}>
              {currentCroppedW}px
            </span>
          </div>
          <div className="bv-controls-row" style={{ marginTop: '0.45rem' }}>
            <span className="bv-label">HEIGHT</span>
            <span style={{ fontSize: '0.88rem', letterSpacing: '0.04em' }}>
              {currentCroppedH}px
            </span>
          </div>
        </div>
      </MacroSection>

      <MacroSection
        title="ASPECT RATIO"
        collapsible
        isOpen={openSections.aspectRatio}
        onToggle={() => toggleSection('aspectRatio')}
        isModified={isAspectModified}
        onReset={resetAspectRatio}
      >
        <div className="bv-section">
          <div className="bv-controls-row">
            <span className="bv-label">RATIO</span>
            <OptionGroup
              options={ASPECT_PRESET_OPTIONS}
              value={aspectPreset}
              onChange={setAspectPreset}
              ariaLabel="Aspect ratio preset"
            />
          </div>
        </div>

        <div className="bv-section">
          <div className="bv-controls-row">
            <span className="bv-label">ORIENTATION</span>
            <OptionGroup
              options={ORIENTATION_OPTIONS}
              value={aspectOrientation}
              onChange={setAspectOrientation}
              disabled={isFree}
              ariaLabel="Aspect ratio orientation"
            />
          </div>
        </div>

        <div className="bv-section">
          <SliderBundle
            label="POSITION"
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.5}
            value={aspectOffset}
            onChange={setAspectOffset}
            disabled={isFree}
            pinId="resizing:aspectOffset"
          />
        </div>
      </MacroSection>

      <MacroSection
        title="CROPPING"
        collapsible
        isOpen={openSections.cropping}
        onToggle={() => toggleSection('cropping')}
        isModified={isCroppingModified}
        onReset={resetCrop}
      >
        <div className="bv-section">
          <div className="crop-preview-container">
            <div className="crop-preview-frame" style={{ width: frameW, height: frameH, position: 'relative', border: '1px solid var(--color-border)', overflow: 'hidden', background: 'var(--color-surface)' }}>
              {/* Shaded cropped areas */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${pctTop}%`, background: 'var(--color-danger-bg-hover)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pctBottom}%`, background: 'var(--color-danger-bg-hover)' }} />
              <div style={{ position: 'absolute', left: 0, top: `${pctTop}%`, bottom: `${pctBottom}%`, width: `${pctLeft}%`, background: 'var(--color-danger-bg-hover)' }} />
              <div style={{ position: 'absolute', right: 0, top: `${pctTop}%`, bottom: `${pctBottom}%`, width: `${pctRight}%`, background: 'var(--color-danger-bg-hover)' }} />
              
              {/* Red grid lines */}
              {pctLeft > 0 && <div style={{ position: 'absolute', left: `${pctLeft}%`, top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--color-danger-hover)' }} />}
              {pctRight > 0 && <div style={{ position: 'absolute', right: `${pctRight}%`, top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--color-danger-hover)' }} />}
              {pctTop > 0 && <div style={{ position: 'absolute', top: `${pctTop}%`, left: 0, right: 0, height: '1px', backgroundColor: 'var(--color-danger-hover)' }} />}
              {pctBottom > 0 && <div style={{ position: 'absolute', bottom: `${pctBottom}%`, left: 0, right: 0, height: '1px', backgroundColor: 'var(--color-danger-hover)' }} />}
            </div>
          </div>

          <SliderBundle
            min={0}
            max={Math.max(0, height - crop.bottom - 1)}
            defaultValue={0}
            step={1}
            label="TOP"
            value={crop.top}
            onChange={setCropTop}
            disabled={isTopBottomDisabled}
            pinId="resizing:cropTop"
          />
          <SliderBundle
            min={0}
            max={Math.max(0, height - crop.top - 1)}
            defaultValue={0}
            step={1}
            label="BOTTOM"
            value={crop.bottom}
            onChange={setCropBottom}
            disabled={isTopBottomDisabled}
            pinId="resizing:cropBottom"
          />
          <SliderBundle
            min={0}
            max={Math.max(0, width - crop.right - 1)}
            defaultValue={0}
            step={1}
            label="LEFT"
            value={crop.left}
            onChange={setCropLeft}
            disabled={isLeftRightDisabled}
            pinId="resizing:cropLeft"
          />
          <SliderBundle
            min={0}
            max={Math.max(0, width - crop.left - 1)}
            defaultValue={0}
            step={1}
            label="RIGHT"
            value={crop.right}
            onChange={setCropRight}
            disabled={isLeftRightDisabled}
            pinId="resizing:cropRight"
          />
        </div>
      </MacroSection>

      <MacroSection
        title="RESIZE"
        collapsible
        isOpen={openSections.resize}
        onToggle={() => toggleSection('resize')}
        isModified={isResizeModified}
        onReset={resetSizeToCurrent}
      >
        <div className="bv-section">
          <div className="bv-controls-row">
            <span className="bv-label">RATIO</span>
            <OptionGroup
              options={RESIZE_RATIO_OPTIONS}
              value={ratioLocked}
              onChange={setRatioLocked}
              ariaLabel="Resize ratio lock mode"
            />
          </div>
        </div>

        <div className="bv-section">
          <p className="bv-label">SIZE</p>
          {ratioLocked ? (
            <SliderBundle
              min={0}
              max={1.0}
              defaultValue={1.0}
              step={0.01}
              label="SCALE"
              value={currentScale}
              onChange={setScale}
              pinId="resizing:scale"
            />
          ) : (
            <>
              <SliderBundle
                min={1}
                max={maxSliderWidth}
                defaultValue={croppedWidth}
                step={1}
                label="WIDTH"
                value={currentCroppedW}
                onChange={setCustomWidth}
                pinId="resizing:width"
              />
              <SliderBundle
                min={1}
                max={maxSliderHeight}
                defaultValue={croppedHeight}
                step={1}
                label="HEIGHT"
                value={currentCroppedH}
                onChange={setCustomHeight}
                pinId="resizing:height"
              />
            </>
          )}
        </div>
      </MacroSection>
    </>
  );
}
