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

  if (width == null || height == null) return null;

  const ratioLabel = formatRatio(customWidth, customHeight);

  return (
    <>
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
    </>
  );
}

