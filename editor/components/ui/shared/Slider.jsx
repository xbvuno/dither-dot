import { useRef, useState, useEffect, useMemo } from "react";
import { triggerHapticPulse } from "../../../utils/haptics";
import "./styles/Slider.css";

/* ---------------- utils ---------------- */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const valueToPercent = (v, min, max) => {
  const range = Math.max(0.00001, max - min);
  return ((v - min) / range) * 100;
};

const snapValue = (v, min, max, step) => {
  let stepped;
  if (min < 0 && max > 0) {
    stepped = Math.round(v / step) * step;
  } else {
    stepped = Math.round((v - min) / step) * step + min;
  }
  return clamp(Number(stepped.toFixed(10)), min, max);
};

const percentToValue = (p, min, max, step) => {
  const range = Math.max(0.00001, max - min);
  const raw = min + (p / 100) * range;
  return snapValue(raw, min, max, step);
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
  useEffect(() => {
    selectedRef.current = isSelected;
  }, [isSelected]);

  const isControlled = controlledValue !== undefined;

  const [value, setValue] = useState(() =>
    isControlled
      ? controlledValue
      : snapValue(defaultValue ?? (min <= 0 && max >= 0 ? 0 : min), min, max, step)
  );
  const displayValue = isControlled ? controlledValue : value;

  const numMin = Number(min);
  const numMax = Number(max);
  const numStep = Number(step);
  const numValue = Number(displayValue);

  const ticks = useMemo(() => {
    const range = numMax - numMin;
    if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(numStep) || numStep <= 0) return [];

    const totalSteps = Math.round(range / numStep);

    // If total steps <= 64, show all discrete steps snapped
    if (totalSteps <= 64) {
      const result = [];
      const seen = new Set();
      for (let i = 1; i < totalSteps; i++) {
        const val = numMin + i * numStep;
        const snapped = snapValue(val, numMin, numMax, numStep);
        if (snapped > numMin + 1e-5 && snapped < numMax - 1e-5) {
          const key = snapped.toFixed(8);
          if (!seen.has(key)) {
            seen.add(key);
            result.push(((snapped - numMin) / range) * 100);
          }
        }
      }
      return result;
    }

    const isIntBounds =
      Number.isInteger(numMin) &&
      Number.isInteger(numMax) &&
      Number.isInteger(numStep) &&
      numStep >= 1;

    let rawValues = [];

    if (isIntBounds) {
      // Large integer range (> 64 steps): determine round interval
      let interval = 100;
      if (range >= 500) interval = 100;
      else if (range >= 200) interval = 50;
      else if (range >= 100) interval = 25;
      else interval = 10;

      // Range spans negative to positive: anchor on 0
      if (numMin < 0 && numMax > 0) {
        for (let v = -interval; v > numMin + 1e-4; v -= interval) {
          rawValues.unshift(v);
        }
        rawValues.push(0);
        for (let v = interval; v < numMax - 1e-4; v += interval) {
          rawValues.push(v);
        }
      } else {
        const start = Math.ceil((numMin + 1e-4) / interval) * interval;
        for (let v = start; v < numMax - 1e-4; v += interval) {
          rawValues.push(v);
        }
      }
    } else {
      // Float or continuous range (> 64 steps)
      if (numMin < 0 && numMax > 0) {
        const negDivs = 4;
        const posDivs = 4;
        for (let i = 1; i < negDivs; i++) {
          rawValues.push(numMin * (1 - i / negDivs));
        }
        rawValues.push(0);
        for (let i = 1; i < posDivs; i++) {
          rawValues.push(numMax * (i / posDivs));
        }
      } else {
        const numDivisions = 8;
        for (let i = 1; i < numDivisions; i++) {
          rawValues.push(numMin + (i / numDivisions) * range);
        }
      }
    }

    // Snap every raw tick value to the nearest valid step and convert to percentage
    const seen = new Set();
    const result = [];

    for (const raw of rawValues) {
      const snapped = snapValue(raw, numMin, numMax, numStep);
      // Ensure strictly inside (min, max)
      if (snapped > numMin + 1e-5 && snapped < numMax - 1e-5) {
        const key = snapped.toFixed(8);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(((snapped - numMin) / range) * 100);
        }
      }
    }

    return result;
  }, [numMin, numMax, numStep]);

  const stateRef = useRef({
    value: numValue,
    min: numMin,
    max: numMax,
    step: numStep,
    isControlled,
    onChange,
    disabled,
  });
  useEffect(() => {
    stateRef.current.value = numValue;
    stateRef.current.min = numMin;
    stateRef.current.max = numMax;
    stateRef.current.step = numStep;
    stateRef.current.isControlled = isControlled;
    stateRef.current.onChange = onChange;
    stateRef.current.disabled = disabled;
  });

  /* ---------- internal setter ---------- */

  const setInternalValue = (next) => {
    if (stateRef.current.disabled) return;
    const s = stateRef.current;
    const currVal = Number(s.value);
    const sMin = Number(s.min);
    const sMax = Number(s.max);
    const sStep = Number(s.step);

    const base = typeof next === "function" ? next(currVal) : Number(next);
    const clamped = snapValue(base, sMin, sMax, sStep);

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

  /* ---------- pointer logic (RAF THROTTLED) ---------- */

  useEffect(() => {
    const track = trackRef.current;
    const container = containerRef.current;
    if (!track || !container) return;

    let pointerDown = false;
    let dragging = false;
    let touchPending = false;
    let wasSelectedOnDown = false;
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
      if (e.pointerType === "mouse" && e.button !== 0) return;

      startX = e.clientX;
      startY = e.clientY;
      activePointerId = e.pointerId;
      pointerDown = true;
      wasSelectedOnDown = selectedRef.current;

      if (e.pointerType === "mouse") {
        touchPending = false;
        if (wasSelectedOnDown) {
          // If already selected, clicking directly jumps value and starts drag
          dragging = true;
          try {
            track.setPointerCapture?.(e.pointerId);
          } catch {
            /* ignore pointer capture error */
          }
          const s = stateRef.current;
          const pct = getPercent(e.clientX);
          setInternalValue(percentToValue(pct, s.min, s.max, s.step));
        } else {
          // If not selected, select only on pointerdown (do not jump value)
          dragging = false;
          handleSelect();
        }
      } else {
        // Touch pointer: wait for gesture direction or tap release
        touchPending = true;
        dragging = false;
        if (!wasSelectedOnDown) {
          handleSelect();
        }
      }
    };

    const onPointerMove = (e) => {
      if (!pointerDown || activePointerId !== e.pointerId) return;

      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);

      if (touchPending) {
        if (dy > dx && dy > 5) {
          // Vertical scroll detected: release touch slider drag
          pointerDown = false;
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
      } else if (!dragging) {
        // For mouse pointer when not initially selected: drag starts if moved >= 3px
        if (dx >= 3) {
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
      if (pointerDown) {
        if (dragging) {
          const s = stateRef.current;
          const pct = getPercent(e.clientX);
          setInternalValue(percentToValue(pct, s.min, s.max, s.step));
        } else if (touchPending && wasSelectedOnDown) {
          // Tap on touch when already selected -> jump to tapped value
          const s = stateRef.current;
          const pct = getPercent(e.clientX);
          setInternalValue(percentToValue(pct, s.min, s.max, s.step));
        }
      }

      pointerDown = false;
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
      pointerDown = false;
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
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        const resetTarget = defaultValue !== undefined ? defaultValue : (numMin <= 0 && numMax >= 0 ? 0 : numMin);
        setInternalValue(snapValue(resetTarget, min, max, step));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [defaultValue, max, min, numMax, numMin, step]);

  /* ---------- UI ---------- */

  const handleReset = () => {
    const resetTarget = defaultValue !== undefined ? defaultValue : (numMin <= 0 && numMax >= 0 ? 0 : numMin);
    setInternalValue(resetTarget);
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