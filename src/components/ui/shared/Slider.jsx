import { useRef, useState, useEffect, useMemo } from "react";
import { triggerHapticPulse } from "../../../utils/haptics";
import "./styles/Slider.css";

/* ---------------- utils ---------------- */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const valueToPercent = (v, min, max) => {
  const range = Math.max(0.00001, max - min);
  return ((v - min) / range) * 100;
};

const percentToValue = (p, min, max, step) => {
  const range = Math.max(0.00001, max - min);
  const raw = min + (p / 100) * range;
  const stepped = Math.round((raw - min) / step) * step + min;

  return clamp(Number(stepped.toFixed(10)), min, max);
};

const snapValue = (v, min, max, step) => {
  const stepped = Math.round((v - min) / step) * step + min;
  return clamp(Number(stepped.toFixed(10)), min, max);
};

/* ---------------- component ---------------- */

export default function Slider({
  min = -10,
  max = 10,
  step = 0.01,
  value: controlledValue,
  defaultValue,
  onChange,
  label,
  'aria-label': ariaLabelProp,
  isSelected: isSelectedProp,
  onSelect,
  onDeselect,
  disabled = false,
}) {
  const ariaLabel = ariaLabelProp || label || 'Slider';
  const trackRef = useRef(null);
  const containerRef = useRef(null);
  const thumbRef = useRef(null);
  const defaultThumbRef = useRef(null);

  const rafRef = useRef(null);
  const selectedRef = useRef(false);

  const [internalSelected, setInternalSelected] = useState(false);
  const isSelected = isSelectedProp !== undefined ? isSelectedProp : internalSelected;
  selectedRef.current = isSelected;

  const isControlled = controlledValue !== undefined;

  const [value, setValue] = useState(() =>
    isControlled
      ? controlledValue
      : snapValue(defaultValue ?? min, min, max, step)
  );
  const displayValue = isControlled ? controlledValue : value;

  const numMin = Number(min);
  const numMax = Number(max);
  const numStep = Number(step);
  const numValue = Number(displayValue);

  const ticks = useMemo(() => {
    const range = numMax - numMin;
    if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(numStep) || numStep <= 0) return [];

    const toPct = (val) => ((val - numMin) / range) * 100;
    const totalSteps = Math.round(range / numStep);

    // If total steps <= 64, show all discrete ticks!
    if (totalSteps <= 64) {
      const result = [];
      for (let i = 1; i < totalSteps; i++) {
        const val = numMin + i * numStep;
        result.push(toPct(val));
      }
      return result;
    }

    const isIntBounds =
      Number.isInteger(numMin) &&
      Number.isInteger(numMax) &&
      Number.isInteger(numStep) &&
      numStep >= 1;

    if (isIntBounds) {
      // Large integer range (> 64 steps): determine round interval
      let interval = 100;
      if (range >= 500) interval = 100;
      else if (range >= 200) interval = 50;
      else if (range >= 100) interval = 25;
      else interval = 10;

      // Range spans negative to positive: anchor ticks on 0
      if (numMin < 0 && numMax > 0) {
        const result = [];
        // Negative ticks radiating left from 0
        for (let v = -interval; v > numMin + 1e-4; v -= interval) {
          result.unshift(toPct(v));
        }
        // Zero tick
        result.push(toPct(0));
        // Positive ticks radiating right from 0
        for (let v = interval; v < numMax - 1e-4; v += interval) {
          result.push(toPct(v));
        }
        return result;
      }

      // Single sign integer range (all positive or all negative)
      const result = [];
      const start = Math.ceil((numMin + 1e-4) / interval) * interval;
      for (let v = start; v < numMax - 1e-4; v += interval) {
        result.push(toPct(v));
      }
      return result;
    }

    // Dense float or continuous range (> 64 steps)
    // Range spans negative to positive (e.g. blacks [-0.5, 0.5], hue [-3.14, 3.14], etc.)
    if (numMin < 0 && numMax > 0) {
      if (Math.abs(numMin + numMax) < 1e-4) {
        // Symmetric around 0: 4 subdivisions each side, 0 in exact center (50%)
        const halfDivisions = 4;
        const result = [];
        for (let i = 1; i < halfDivisions; i++) {
          const val = numMin + (i / halfDivisions) * (-numMin);
          result.push(toPct(val));
        }
        result.push(50);
        for (let i = 1; i < halfDivisions; i++) {
          const val = (i / halfDivisions) * numMax;
          result.push(toPct(val));
        }
        return result;
      } else {
        // Asymmetric spanning 0: anchor on 0
        const result = [];
        const negDivs = 4;
        const posDivs = 4;
        for (let i = 1; i < negDivs; i++) {
          const val = numMin * (1 - i / negDivs);
          result.push(toPct(val));
        }
        result.push(toPct(0));
        for (let i = 1; i < posDivs; i++) {
          const val = numMax * (i / posDivs);
          result.push(toPct(val));
        }
        return result;
      }
    }

    // Single sign float range: 8 subdivisions (7 intermediate ticks)
    const numDivisions = 8;
    const result = [];
    for (let i = 1; i < numDivisions; i++) {
      result.push((i / numDivisions) * 100);
    }
    return result;
  }, [numMin, numMax, numStep]);

  const stateRef = useRef({});
  stateRef.current.value = numValue;
  stateRef.current.min = numMin;
  stateRef.current.max = numMax;
  stateRef.current.step = numStep;
  stateRef.current.isControlled = isControlled;
  stateRef.current.onChange = onChange;
  stateRef.current.disabled = disabled;

  /* ---------- internal setter ---------- */

  const setInternalValue = (next) => {
    if (stateRef.current.disabled) return;
    const s = stateRef.current;
    const currVal = Number(s.value);
    const sMin = Number(s.min);
    const sMax = Number(s.max);
    const sStep = Number(s.step);

    const base = typeof next === "function" ? next(currVal) : Number(next);

    const stepped =
      Math.round((base - sMin) / sStep) * sStep + sMin;

    const clamped = clamp(
      Number(stepped.toFixed(10)),
      sMin,
      sMax
    );

    // update local only if needed
    if (!s.isControlled) {
      setValue((prev) => (prev === clamped ? prev : clamped));
    }

    // notify only if changed
    if (typeof s.onChange === "function" && Math.abs(clamped - currVal) > 1e-7) {
      triggerHapticPulse(5);
      s.value = clamped;
      s.onChange(clamped);
    }
  };

  const stepUp = (t = 1) => {
    const s = stateRef.current;
    const curr = Number(s.value);
    const mx = Number(s.max);
    const stp = Number(s.step);
    if (!Number.isNaN(curr) && !Number.isNaN(mx) && curr >= mx - 1e-5) return;
    setInternalValue(curr + stp * t);
  };

  const stepDown = (t = 1) => {
    const s = stateRef.current;
    const curr = Number(s.value);
    const mn = Number(s.min);
    const stp = Number(s.step);
    if (!Number.isNaN(curr) && !Number.isNaN(mn) && curr <= mn + 1e-5) return;
    setInternalValue(curr - stp * t);
  };

  /* ---------- thumb position ---------- */

  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;

    const { min, max } = stateRef.current;
    const pct = valueToPercent(displayValue, min, max);

    thumb.style.left = `calc(${pct}% - 1px)`;
  }, [displayValue, max, min]);

  /* ---------- default marker ---------- */

  useEffect(() => {
    const dt = defaultThumbRef.current;
    if (!dt) return;

    if (defaultValue === undefined) {
      dt.style.display = "none";
      return;
    }

    dt.style.display = "";

    const snapped = snapValue(
      defaultValue,
      min,
      max,
      step
    );

    const pct = valueToPercent(snapped, min, max);
    dt.style.left = `calc(${pct}% - 1px)`;
  }, [defaultValue, min, max, step]);

  /* ---------- pointer logic (RAF THROTTLED) ---------- */

  useEffect(() => {
    const track = trackRef.current;
    const container = containerRef.current;
    if (!track || !container) return;

    let dragging = false;
    let touchPending = false;
    let startX = 0;
    let startY = 0;
    let activePointerId = null;

    const getPercent = (clientX) => {
      const rect = track.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, rect.width);
      return (x / rect.width) * 100;
    };

    const onPointerDown = (e) => {
      if (stateRef.current.disabled) return;
      triggerHapticPulse(5);
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        dragging = true;
        touchPending = false;
        activePointerId = e.pointerId;
        try {
          track.setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore pointer capture error */
        }

        const s = stateRef.current;
        const pct = getPercent(e.clientX);
        setInternalValue(percentToValue(pct, s.min, s.max, s.step));
      } else {
        // Touch pointer: wait for gesture direction to avoid accidental slider edits during vertical page scroll
        touchPending = true;
        dragging = false;
        startX = e.clientX;
        startY = e.clientY;
        activePointerId = e.pointerId;
      }
    };

    const onPointerMove = (e) => {
      if (touchPending) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);

        if (dy > dx && dy > 5) {
          // Vertical scroll detected: release touch slider drag
          touchPending = false;
          dragging = false;
          return;
        }

        if (dx > dy && dx > 5) {
          // Horizontal slider drag detected!
          touchPending = false;
          dragging = true;
          try {
            track.setPointerCapture?.(e.pointerId);
          } catch {
            /* ignore pointer capture error */
          }
        }
      }

      if (!dragging) return;
      if (rafRef.current) return;

      const clientX = e.clientX;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;

        const s = stateRef.current;
        const pct = getPercent(clientX);

        setInternalValue(
          percentToValue(pct, s.min, s.max, s.step)
        );
      });
    };

    const onPointerUp = (e) => {
      if (touchPending) {
        // Tap action without vertical scrolling
        const s = stateRef.current;
        const pct = getPercent(e.clientX);
        setInternalValue(percentToValue(pct, s.min, s.max, s.step));
      }

      touchPending = false;
      dragging = false;
      if (activePointerId !== null) {
        try {
          track.releasePointerCapture?.(activePointerId);
        } catch {
          /* ignore pointer capture error */
        }
        activePointerId = null;
      }
    };

    const onPointerCancel = () => {
      touchPending = false;
      dragging = false;
      if (activePointerId !== null) {
        try {
          track.releasePointerCapture?.(activePointerId);
        } catch {
          /* ignore pointer capture error */
        }
        activePointerId = null;
      }
    };

    const onWheel = (e) => {
      if (!selectedRef.current) return;

      e.preventDefault();

      setInternalValue((current) => (
        current + (e.deltaY > 0 ? -stateRef.current.step : stateRef.current.step)
      ));
    };

    track.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  /* ---------- keyboard navigation & reset key ---------- */

  useEffect(() => {
    const onKey = (e) => {
      if (!selectedRef.current) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        stepDown();
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        stepUp();
      } else if (e.key.toLowerCase() === "r" && defaultValue !== undefined) {
        e.preventDefault();
        setInternalValue(snapValue(defaultValue, min, max, step));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [defaultValue, max, min, step]);

  /* ---------- UI ---------- */

  const handleReset = () => {
    if (defaultValue === undefined) return;
    setInternalValue(defaultValue);
  };

  const handleSelect = () => {
    if (disabled) return;
    selectedRef.current = true;
    setInternalSelected(true);
    onSelect?.();
    containerRef.current?.focus();
  };

  const handleDeselect = () => {
    selectedRef.current = false;
    setInternalSelected(false);
    onDeselect?.();
  };

  return (
    <div
      ref={containerRef}
      className={`bv slider${isSelected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={numMin}
      aria-valuemax={numMax}
      aria-valuenow={numValue}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onFocus={handleSelect}
      onBlur={handleDeselect}
      onPointerDown={handleSelect}
    >
      <div
        className="track"
        ref={trackRef}
        onDoubleClick={disabled ? undefined : handleReset}
      >
        <div className="slider-ticks" aria-hidden="true">
          {ticks.map((pct, idx) => (
            <div
              key={idx}
              className="slider-tick"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>
        <div className={`thumb${defaultValue !== undefined && numValue !== Number(defaultValue) ? ' modified' : ''}`} ref={thumbRef} />
        {defaultValue !== undefined && (
          <div className="thumb default" ref={defaultThumbRef} />
        )}
      </div>
    </div>
  );
}