import { useState } from "react";
import MacroSection from "../ui/MacroSection";
import SliderBundle from "../ui/shared/SliderBundle";
import useSizeStore from "../../stores/media/sizeStore";
import useWebcamStore from "../../stores/media/webcamStore";

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

  const resetSizeToCurrent = useSizeStore(s => s.resetSizeToCurrent);
  const resetCrop = useSizeStore(s => s.resetCrop);

  // Accordion state loaded from and saved to localStorage
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = localStorage.getItem("dither-dot:open-sections-resizing");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error parsing open resizing sections", e);
    }
    return {
      cropping: true,
      resize: true
    };
  });

  const toggleSection = (section) => {
    setOpenSections((prev) => {
      const next = {
        ...prev,
        [section]: !prev[section]
      };
      localStorage.setItem("dither-dot:open-sections-resizing", JSON.stringify(next));
      return next;
    });
  };

  if (width == null || height == null) return null;

  // Base dimensions after crop
  const croppedWidth = Math.max(1, width - (crop.left || 0) - (crop.right || 0));
  const croppedHeight = Math.max(1, height - (crop.top || 0) - (crop.bottom || 0));

  const currentCroppedW = Math.max(1, (customWidth != null ? customWidth : width) - (crop.left || 0) - (crop.right || 0));
  const currentCroppedH = Math.max(1, (customHeight != null ? customHeight : height) - (crop.top || 0) - (crop.bottom || 0));
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

  // Modified checks for underline and reset buttons
  const isResizeModified = currentCroppedW !== croppedWidth || currentCroppedH !== croppedHeight || !ratioLocked;
  const isCroppingModified = crop.top !== 0 || crop.bottom !== 0 || crop.left !== 0 || crop.right !== 0;

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
        title="CROPPING"
        collapsible
        isOpen={openSections.cropping}
        onToggle={() => toggleSection('cropping')}
        isModified={isCroppingModified}
        onReset={resetCrop}
      >
        <div className="bv-section">
          <div className="crop-preview-container">
            <div className="crop-preview-frame" style={{ width: frameW, height: frameH, position: 'relative', border: '1px solid var(--color-border, #444)', overflow: 'hidden', background: '#0a0a0a' }}>
              {/* Shaded cropped areas */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${pctTop}%`, background: 'rgba(255, 59, 48, 0.15)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pctBottom}%`, background: 'rgba(255, 59, 48, 0.15)' }} />
              <div style={{ position: 'absolute', left: 0, top: `${pctTop}%`, bottom: `${pctBottom}%`, width: `${pctLeft}%`, background: 'rgba(255, 59, 48, 0.15)' }} />
              <div style={{ position: 'absolute', right: 0, top: `${pctTop}%`, bottom: `${pctBottom}%`, width: `${pctRight}%`, background: 'rgba(255, 59, 48, 0.15)' }} />
              
              {/* Red grid lines */}
              {pctLeft > 0 && <div style={{ position: 'absolute', left: `${pctLeft}%`, top: 0, bottom: 0, width: '1px', backgroundColor: '#ff3b30' }} />}
              {pctRight > 0 && <div style={{ position: 'absolute', right: `${pctRight}%`, top: 0, bottom: 0, width: '1px', backgroundColor: '#ff3b30' }} />}
              {pctTop > 0 && <div style={{ position: 'absolute', top: `${pctTop}%`, left: 0, right: 0, height: '1px', backgroundColor: '#ff3b30' }} />}
              {pctBottom > 0 && <div style={{ position: 'absolute', bottom: `${pctBottom}%`, left: 0, right: 0, height: '1px', backgroundColor: '#ff3b30' }} />}
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
          />
          <SliderBundle
            min={0}
            max={Math.max(0, height - crop.top - 1)}
            defaultValue={0}
            step={1}
            label="BOTTOM"
            value={crop.bottom}
            onChange={setCropBottom}
          />
          <SliderBundle
            min={0}
            max={Math.max(0, width - crop.right - 1)}
            defaultValue={0}
            step={1}
            label="LEFT"
            value={crop.left}
            onChange={setCropLeft}
          />
          <SliderBundle
            min={0}
            max={Math.max(0, width - crop.left - 1)}
            defaultValue={0}
            step={1}
            label="RIGHT"
            value={crop.right}
            onChange={setCropRight}
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
            <div className="bv-option-group histogram-toggle-group size-controls-ratio-buttons">
              <button
                type="button"
                className={`bv-option-btn${ratioLocked ? ' active' : ''}`}
                onClick={() => setRatioLocked(true)}
              >
                KEEP
              </button>
              <button
                type="button"
                className={`bv-option-btn${!ratioLocked ? ' active' : ''}`}
                onClick={() => setRatioLocked(false)}
              >
                FREE
              </button>
            </div>
          </div>
        </div>

        <div className="bv-section">
          {ratioLocked ? (
            <>
              <p className="bv-label">SCALE</p>
              <SliderBundle
                min={0}
                max={1.0}
                defaultValue={1.0}
                step={0.01}
                label="SCALE"
                value={currentScale}
                onChange={setScale}
              />
            </>
          ) : (
            <>
              <p className="bv-label">SIZE</p>
              <SliderBundle
                min={1}
                max={maxSliderWidth}
                defaultValue={croppedWidth}
                step={1}
                label="WIDTH"
                value={currentCroppedW}
                onChange={(newW) => setCustomWidth(newW + (crop.left || 0) + (crop.right || 0))}
              />
              <SliderBundle
                min={1}
                max={maxSliderHeight}
                defaultValue={croppedHeight}
                step={1}
                label="HEIGHT"
                value={currentCroppedH}
                onChange={(newH) => setCustomHeight(newH + (crop.top || 0) + (crop.bottom || 0))}
              />
            </>
          )}
        </div>
      </MacroSection>
    </>
  );
}
