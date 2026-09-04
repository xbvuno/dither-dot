import { useRef, useState, useEffect } from "react";
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

  const stateRef = useRef({});
  stateRef.current.value = numValue;
  stateRef.current.min = numMin;
  stateRef.current.max = numMax;
  stateRef.current.step = numStep;
  stateRef.current.isControlled = isControlled;
  stateRef.current.onChange = onChange;

  /* ---------- internal setter ---------- */

  const setInternalValue = (next) => {
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
      className={`bv slider${isSelected ? ' selected' : ''}`}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={numMin}
      aria-valuemax={numMax}
      aria-valuenow={numValue}
      tabIndex={0}
      onFocus={handleSelect}
      onBlur={handleDeselect}
      onPointerDown={handleSelect}
    >
      <div
        className="track"
        ref={trackRef}
        onDoubleClick={handleReset}
      >
        <div className={`thumb${defaultValue !== undefined && numValue !== Number(defaultValue) ? ' modified' : ''}`} ref={thumbRef} />
        {defaultValue !== undefined && (
          <div className="thumb default" ref={defaultThumbRef} />
        )}
      </div>
    </div>
  );
}