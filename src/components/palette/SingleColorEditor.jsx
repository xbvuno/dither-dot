import { useState, useCallback } from 'react';
import PaletteColorSlider from './PaletteColorSlider';
import {
  cleanHex,
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  hsvToHex,
  applyTonalAdjustments,
} from '../../utils/colorConversions';

function initFromHex(hex) {
  const r = hexToRgb(hex);
  return {
    rgb: r,
    hsv: rgbToHsv(r.r, r.g, r.b),
    hexInput: cleanHex(hex),
  };
}

export default function SingleColorEditor({
  color,
  originalColor,
  colorId,
  onChangeColor,
}) {
  // Use colorId as the key signal: when colorId changes, reinitialise.
  const [lastColorId, setLastColorId] = useState(colorId);
  const [rgb, setRgb] = useState(() => hexToRgb(color));
  const [hsv, setHsv] = useState(() => {
    const r = hexToRgb(color);
    return rgbToHsv(r.r, r.g, r.b);
  });
  const [hexInput, setHexInput] = useState(() => cleanHex(color));
  const [gamma, setGamma] = useState(1.0);
  const [contrast, setContrast] = useState(0);

  // When the selected colorId changes, reinitialise all local state from new color.
  if (colorId !== lastColorId) {
    setLastColorId(colorId);
    const init = initFromHex(color);
    setRgb(init.rgb);
    setHsv(init.hsv);
    setHexInput(init.hexInput);
    setGamma(1.0);
    setContrast(0);
  }

  const notify = useCallback((newHex) => {
    if (onChangeColor && colorId !== undefined && colorId !== null) {
      onChangeColor(colorId, newHex);
    }
  }, [onChangeColor, colorId]);

  const handleRgbChange = (channel, value) => {
    const nextRgb = { ...rgb, [channel]: value };
    const nextHex = rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    const nextHsv = rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b);
    setRgb(nextRgb);
    setHsv(nextHsv);
    setHexInput(nextHex);
    notify(nextHex);
  };

  const handleHsvChange = (channel, value) => {
    const nextHsv = { ...hsv, [channel]: value };
    const nextRgb = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
    const nextHex = rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    setHsv(nextHsv);
    setRgb(nextRgb);
    setHexInput(nextHex);
    notify(nextHex);
  };

  const applyTonal = (baseHex, g, c) => {
    const adjustedHex = applyTonalAdjustments(baseHex, { gamma: g, contrast: c });
    const nextRgb = hexToRgb(adjustedHex);
    setRgb(nextRgb);
    setHsv(rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b));
    setHexInput(adjustedHex);
    notify(adjustedHex);
  };

  const handleGammaChange = (val) => {
    setGamma(val);
    applyTonal(originalColor || color, val, contrast);
  };

  const handleContrastChange = (val) => {
    setContrast(val);
    applyTonal(originalColor || color, gamma, val);
  };

  const handleHexInputChange = (e) => {
    const val = e.target.value;
    setHexInput(val);
    const sanitized = val.trim().replace(/^#/, '');
    if (sanitized.length === 6 && /^[0-9a-fA-F]{6}$/.test(sanitized)) {
      const fullHex = `#${sanitized.toUpperCase()}`;
      const nextRgb = hexToRgb(fullHex);
      const nextHsv = rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b);
      setRgb(nextRgb);
      setHsv(nextHsv);
      notify(fullHex);
    }
  };

  const currentHex = cleanHex(hexInput);

  return (
    <div className="pe-body-columns">
      {/* Preview Column */}
      <div className="pe-preview-column">
        <div className="pe-swatches-stacked">
          <div className="pe-swatch-box">
            <span className="pe-swatch-label">CURRENT</span>
            <div
              className="pe-editor-swatch-display"
              style={{ backgroundColor: currentHex }}
              title={`Current: ${currentHex}`}
            />
          </div>
          <div className="pe-swatch-box">
            <span className="pe-swatch-label">ORIGINAL</span>
            <div
              className="pe-editor-swatch-display"
              style={{ backgroundColor: originalColor || color }}
              title={`Original: ${originalColor || color}`}
            />
          </div>
        </div>

        <div className="pe-hex-input-box">
          <span className="pe-hex-prefix">#</span>
          <input
            type="text"
            className="pe-hex-input"
            value={hexInput.replace(/^#/, '')}
            onChange={handleHexInputChange}
            maxLength={6}
            spellCheck={false}
            aria-label="Hex color"
          />
        </div>
      </div>

      {/* Vertical Divider */}
      <div className="pe-vertical-divider" />

      {/* Sliders Column */}
      <div className="pe-controls-column">
        <div className="pe-slider-group">
          <PaletteColorSlider
            label="HUE"
            min={0}
            max={360}
            step={1}
            value={hsv.h}
            unit="°"
            onChange={(val) => handleHsvChange('h', val)}
            gradient="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
          />
          <PaletteColorSlider
            label="SATURATION"
            min={0}
            max={100}
            step={1}
            value={hsv.s}
            unit="%"
            onChange={(val) => handleHsvChange('s', val)}
            gradient={`linear-gradient(to right, ${hsvToHex(hsv.h, 0, 85)}, ${hsvToHex(hsv.h, 100, 100)})`}
          />
          <PaletteColorSlider
            label="VALUE / BRIGHTNESS"
            min={0}
            max={100}
            step={1}
            value={hsv.v}
            unit="%"
            onChange={(val) => handleHsvChange('v', val)}
            gradient={`linear-gradient(to right, #000000, ${hsvToHex(hsv.h, hsv.s, 100)})`}
          />

          <div className="pe-slider-divider" />

          <PaletteColorSlider
            label="RED"
            min={0}
            max={255}
            step={1}
            value={rgb.r}
            onChange={(val) => handleRgbChange('r', val)}
            gradient={`linear-gradient(to right, rgb(0,${rgb.g},${rgb.b}), rgb(255,${rgb.g},${rgb.b}))`}
          />
          <PaletteColorSlider
            label="GREEN"
            min={0}
            max={255}
            step={1}
            value={rgb.g}
            onChange={(val) => handleRgbChange('g', val)}
            gradient={`linear-gradient(to right, rgb(${rgb.r},0,${rgb.b}), rgb(${rgb.r},255,${rgb.b}))`}
          />
          <PaletteColorSlider
            label="BLUE"
            min={0}
            max={255}
            step={1}
            value={rgb.b}
            onChange={(val) => handleRgbChange('b', val)}
            gradient={`linear-gradient(to right, rgb(${rgb.r},${rgb.g},0), rgb(${rgb.r},${rgb.g},255))`}
          />

          <div className="pe-slider-divider" />

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
      </div>
    </div>
  );
}
