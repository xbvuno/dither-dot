import { useState, useRef, useEffect } from 'react';

/**
 * Tactical slider bundle component with optional custom gradient track
 * and precision numerical input box with revert timeout on invalid entries.
 */
export default function PaletteColorSlider({
  label = 'LABEL',
  min = 0,
  max = 100,
  step = 1,
  value = 0,
  onChange,
  gradient = '',
  unit = '',
}) {
  const trackRef = useRef(null);
  const timerRef = useRef(null);

  const [typedText, setTypedText] = useState(null);
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const percent = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  const formatVal = (v) => {
    if (typeof v !== 'number') return String(v);
    if (Number.isInteger(v) || step >= 1) return String(Math.round(v));
    return v.toFixed(2).replace(/\.?0+$/, '');
  };
  const displayedText = typedText !== null ? typedText : formatVal(value);

  const handlePointerDown = (e) => {
    const track = trackRef.current;
    if (!track) return;

    const update = (clientX) => {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + p * (max - min);
      const stepped = Math.round((raw - min) / step) * step + min;
      const clamped = Math.max(min, Math.min(max, stepped));
      if (onChange) onChange(clamped);
    };

    update(e.clientX);

    const handlePointerMove = (moveEvent) => {
      update(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleInputChange = (e) => {
    const nextVal = e.target.value;
    setTypedText(nextVal);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const num = parseFloat(nextVal);
    const valid = !isNaN(num) && num >= min && num <= max && Number.isFinite(num) && !nextVal.includes('e');

    if (valid) {
      setIsInvalid(false);
      if (onChange) onChange(num);
    } else {
      setIsInvalid(true);
      timerRef.current = setTimeout(() => {
        setTypedText(null);
        setIsInvalid(false);
      }, 3000);
    }
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const num = parseFloat(displayedText);
    const valid = !isNaN(num) && num >= min && num <= max && Number.isFinite(num);
    if (valid) {
      setIsInvalid(false);
      setTypedText(null);
      if (onChange) onChange(num);
    } else {
      setTypedText(null);
      setIsInvalid(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setTypedText(null);
      setIsInvalid(false);
      e.target.blur();
    }
  };

  return (
    <div className="pe-slider-bundle">
      <div className="pe-slider-header">
        <span className="pe-slider-label">{label}</span>
        <div className={`pe-slider-num-box ${isInvalid ? 'invalid' : ''}`}>
          <input
            type="text"
            className="pe-slider-input"
            value={displayedText}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            aria-label={label}
          />
          {unit && <span className="pe-slider-unit">{unit}</span>}
        </div>
      </div>

      <div
        ref={trackRef}
        className="pe-slider-track"
        style={gradient ? { background: gradient } : undefined}
        onPointerDown={handlePointerDown}
      >
        <div
          className="pe-slider-thumb"
          style={{ left: `clamp(2px, ${percent}%, calc(100% - 2px))` }}
        />
      </div>
    </div>
  );
}
