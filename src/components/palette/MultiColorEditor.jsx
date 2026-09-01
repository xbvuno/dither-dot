import { useState } from 'react';
import PaletteColorSlider from './PaletteColorSlider';
import ColorWheel from './ColorWheel';
import CurveEditor from './CurveEditor';
import {
  hexToHsv,
  hsvToHex,
  hexToRgb,
  rgbToHex,
  applyTonalAdjustments,
} from '../../utils/colorConversions';
import { DEFAULT_CURVE_POINTS, applyRgbCurves } from '../../utils/curveUtils';

function MultiHexRow({ id, originalColor, currentColor, onUpdate }) {
  const [typed, setTyped] = useState(null);
  const displayVal = typed !== null ? typed : currentColor.replace(/^#/, '');

  const handleChange = (e) => {
    const val = e.target.value;
    setTyped(val);
    const sanitized = val.trim().replace(/^#/, '');
    if (sanitized.length === 6 && /^[0-9a-fA-F]{6}$/.test(sanitized)) {
      onUpdate(id, `#${sanitized.toUpperCase()}`);
    }
  };

  const handleBlur = () => {
    setTyped(null);
  };

  return (
    <div className="pe-swatches-row">
      <div
        className="pe-editor-swatch-large"
        style={{ backgroundColor: originalColor }}
        title={`Original: ${originalColor}`}
      />
      <div
        className="pe-editor-swatch-large"
        style={{ backgroundColor: currentColor }}
        title={`Current: ${currentColor}`}
      />
      <div className="pe-hex-input-box">
        <span className="pe-hex-prefix">#</span>
        <input
          type="text"
          className="pe-hex-input"
          value={displayVal}
          onChange={handleChange}
          onBlur={handleBlur}
          maxLength={6}
          spellCheck={false}
          aria-label="Hex color"
        />
      </div>
    </div>
  );
}

export default function MultiColorEditor({
  selectedColors = [],
  onUpdateColors,
}) {
  const [baseMap] = useState(() => {
    const map = {};
    selectedColors.forEach((item) => {
      const orig = item.originalHex || item.hex;
      map[item.id] = {
        hex: orig,
        hsv: hexToHsv(orig),
      };
    });
    return map;
  });

  const [deltaH, setDeltaH] = useState(0);
  const [deltaS, setDeltaS] = useState(0);
  const [deltaV, setDeltaV] = useState(0);

  const [gamma, setGamma] = useState(1.0);
  const [contrast, setContrast] = useState(0);

  const [curves, setCurves] = useState({
    r: DEFAULT_CURVE_POINTS,
    g: DEFAULT_CURVE_POINTS,
    b: DEFAULT_CURVE_POINTS,
  });

  const points = selectedColors.map((item) => {
    const hsv = hexToHsv(item.hex);
    return {
      h: hsv.h,
      s: hsv.s,
      v: hsv.v,
      hex: item.hex,
    };
  });

  const sumSin = points.reduce((acc, p) => acc + Math.sin((p.h * Math.PI) / 180), 0);
  const sumCos = points.reduce((acc, p) => acc + Math.cos((p.h * Math.PI) / 180), 0);
  let currentHue = Math.round((Math.atan2(sumSin, sumCos) * 180) / Math.PI);
  if (currentHue < 0) currentHue += 360;

  const desatColor = hsvToHex(currentHue, 0, 85);
  const fullSatColor = hsvToHex(currentHue, 100, 100);

  const recalculateColors = (dH, dS, dV, g, c, cur) => {
    const updates = {};
    selectedColors.forEach((item) => {
      const base = baseMap[item.id] || {
        hex: item.hex,
        hsv: hexToHsv(item.hex),
      };
      const h = ((base.hsv.h + dH) % 360 + 360) % 360;
      const s = Math.max(0, Math.min(100, base.hsv.s + dS));
      const v = Math.max(0, Math.min(100, base.hsv.v + dV));
      const hsvHex = hsvToHex(h, s, v);

      const tonedHex = applyTonalAdjustments(hsvHex, {
        gamma: g,
        contrast: c,
      });

      const rgb = hexToRgb(tonedHex);
      const curvedRgb = applyRgbCurves(rgb.r, rgb.g, rgb.b, cur);
      updates[item.id] = rgbToHex(curvedRgb.r, curvedRgb.g, curvedRgb.b);
    });

    if (onUpdateColors) {
      onUpdateColors(updates);
    }
  };

  const handleSingleHexChange = (id, newHex) => {
    if (onUpdateColors) {
      onUpdateColors({ [id]: newHex });
    }
  };

  const handleHueChange = (val) => {
    setDeltaH(val);
    recalculateColors(val, deltaS, deltaV, gamma, contrast, curves);
  };

  const handleSaturationChange = (val) => {
    setDeltaS(val);
    recalculateColors(deltaH, val, deltaV, gamma, contrast, curves);
  };

  const handleValueChange = (val) => {
    setDeltaV(val);
    recalculateColors(deltaH, deltaS, val, gamma, contrast, curves);
  };

  const handleGammaChange = (val) => {
    setGamma(val);
    recalculateColors(deltaH, deltaS, deltaV, val, contrast, curves);
  };

  const handleContrastChange = (val) => {
    setContrast(val);
    recalculateColors(deltaH, deltaS, deltaV, gamma, val, curves);
  };

  const handleCurveChange = (nextCurves) => {
    setCurves(nextCurves);
    recalculateColors(deltaH, deltaS, deltaV, gamma, contrast, nextCurves);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Visual Multi-Color Wheel */}
      <div className="pe-wheel-section">
        <ColorWheel
          points={points}
          interactive={false}
          size={154}
        />
      </div>

      {/* Hex List */}
      <div className="pe-multi-hex-list">
        {selectedColors.map((item) => (
          <MultiHexRow
            key={item.id}
            id={item.id}
            originalColor={item.originalHex || item.hex}
            currentColor={item.hex || '#000000'}
            onUpdate={handleSingleHexChange}
          />
        ))}
      </div>

      <div className="pe-slider-divider" />

      {/* Relative HSV Sliders */}
      <div className="pe-slider-group">
        <PaletteColorSlider
          label="Δ HUE"
          min={-180}
          max={180}
          step={1}
          value={deltaH}
          unit="°"
          onChange={handleHueChange}
          gradient="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
        />
        <PaletteColorSlider
          label="Δ SATURATION"
          min={-100}
          max={100}
          step={1}
          value={deltaS}
          unit="%"
          onChange={handleSaturationChange}
          gradient={`linear-gradient(to right, ${desatColor}, ${fullSatColor})`}
        />
        <PaletteColorSlider
          label="Δ VALUE / BRIGHTNESS"
          min={-100}
          max={100}
          step={1}
          value={deltaV}
          unit="%"
          onChange={handleValueChange}
          gradient="linear-gradient(to right, #000000, #777777 50%, #ffffff 100%)"
        />
      </div>

      <div className="pe-slider-divider" />

      {/* Tonal Grading */}
      <div className="pe-slider-group">
        <PaletteColorSlider
          label="GAMMA"
          min={0.2}
          max={3.0}
          step={0.01}
          value={gamma}
          onChange={handleGammaChange}
          gradient="linear-gradient(to right, #222 0%, #888 50%, #fff 100%)"
        />
        <PaletteColorSlider
          label="CONTRAST"
          min={-100}
          max={100}
          step={1}
          value={contrast}
          unit="%"
          onChange={handleContrastChange}
          gradient="linear-gradient(to right, #444 0%, #888 50%, #fff 100%)"
        />
      </div>

      <div className="pe-slider-divider" />

      {/* RGB Curves */}
      <CurveEditor
        curves={curves}
        onChangeCurves={handleCurveChange}
      />
    </div>
  );
}
