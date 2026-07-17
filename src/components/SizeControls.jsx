import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import SliderBundle from "./SliderBundle";
import useSizeStore from "../stores/sizeStore";

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
      resizing: true,
      cropping: true
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

  const ratioLabel = formatRatio(customWidth, customHeight);

  // Percentages for preview box
  const pctLeft = customWidth ? (crop.left / customWidth) * 100 : 0;
  const pctRight = customWidth ? (crop.right / customWidth) * 100 : 0;
  const pctTop = customHeight ? (crop.top / customHeight) * 100 : 0;
  const pctBottom = customHeight ? (crop.bottom / customHeight) * 100 : 0;

  // Fit contain aspect ratio calculation for preview box
  const aspect = (customWidth && customHeight) ? customWidth / customHeight : 1;
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
  const isResizingModified = customWidth !== width || customHeight !== height || !ratioLocked;
  const isCroppingModified = crop.top !== 0 || crop.bottom !== 0 || crop.left !== 0 || crop.right !== 0;

  return (
    <>
      <div className="bv-macro-section">
        <div 
          className={`bv-macro-section-header ${isResizingModified ? 'modified' : ''}`} 
          onClick={() => toggleSection('resizing')}
        >
          <div className="bv-macro-section-title">
            <ChevronDown size={16} className={`bv-macro-section-chevron ${openSections.resizing ? '' : 'collapsed'}`} />
            <h2>RESIZING</h2>
          </div>
          <div className="bv-macro-section-actions">
            {isResizingModified && (
              <button
                type="button"
                className="bv-macro-section-btn"
                title="Reset resizing"
                onClick={(e) => {
                  e.stopPropagation();
                  resetSizeToCurrent();
                }}
              >
                <RotateCcw size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        <div className={`bv-macro-section-content ${openSections.resizing ? '' : 'collapsed'}`}>
          <div className="bv-section">
            <p className="bv-label">SIZE</p>
            <SliderBundle
              min={1}
              max={width}
              defaultValue={width}
              step={1}
              label="WIDTH"
              value={customWidth}
              onChange={setCustomWidth}
            />
            <SliderBundle
              min={1}
              max={height}
              defaultValue={height}
              step={1}
              label="HEIGHT"
              value={customHeight}
              onChange={setCustomHeight}
            />
          </div>

          <div className="bv-section">
            <div className="bv-controls-row">
              <span className="bv-label">RATIO{ratioLabel ? ` [${ratioLabel}]` : ''}</span>
              <div className="bv-option-group histogram-toggle-group size-controls-ratio-buttons">
                <button
                  className={`bv-option-btn${ratioLocked ? ' active' : ''}`}
                  onClick={() => setRatioLocked(true)}
                >
                  KEEP
                </button>
                <button
                  className={`bv-option-btn${!ratioLocked ? ' active' : ''}`}
                  onClick={() => setRatioLocked(false)}
                >
                  FREE
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bv-macro-section">
        <div 
          className={`bv-macro-section-header ${isCroppingModified ? 'modified' : ''}`} 
          onClick={() => toggleSection('cropping')}
        >
          <div className="bv-macro-section-title">
            <ChevronDown size={16} className={`bv-macro-section-chevron ${openSections.cropping ? '' : 'collapsed'}`} />
            <h2>CROPPING</h2>
          </div>
          <div className="bv-macro-section-actions">
            {isCroppingModified && (
              <button
                type="button"
                className="bv-macro-section-btn"
                title="Reset cropping"
                onClick={(e) => {
                  e.stopPropagation();
                  resetCrop();
                }}
              >
                <RotateCcw size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        <div className={`bv-macro-section-content ${openSections.cropping ? '' : 'collapsed'}`}>
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
              max={customHeight - crop.bottom - 1}
              defaultValue={0}
              step={1}
              label="TOP"
              value={crop.top}
              onChange={setCropTop}
            />
            <SliderBundle
              min={0}
              max={customHeight - crop.top - 1}
              defaultValue={0}
              step={1}
              label="BOTTOM"
              value={crop.bottom}
              onChange={setCropBottom}
            />
            <SliderBundle
              min={0}
              max={customWidth - crop.right - 1}
              defaultValue={0}
              step={1}
              label="LEFT"
              value={crop.left}
              onChange={setCropLeft}
            />
            <SliderBundle
              min={0}
              max={customWidth - crop.left - 1}
              defaultValue={0}
              step={1}
              label="RIGHT"
              value={crop.right}
              onChange={setCropRight}
            />
          </div>
        </div>
      </div>
    </>
  );
}
