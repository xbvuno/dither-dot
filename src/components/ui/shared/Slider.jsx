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
  defaultValue = 0,
  onChange,
  label,
  'aria-label': ariaLabelProp,
}) {
  const ariaLabel = ariaLabelProp || label || 'Slider';
  const trackRef = useRef(null);
  const containerRef = useRef(null);
  const thumbRef = useRef(null);
  const defaultThumbRef = useRef(null);
  const decRef = useRef(null);
  const incRef = useRef(null);

  const rafRef = useRef(null);
  const selectedRef = useRef(false);

  const [isSelected, setIsSelected] = useState(false);

  const isControlled = controlledValue !== undefined;

  const [value, setValue] = useState(() =>
    isControlled
      ? controlledValue
      : snapValue(defaultValue ?? min, min, max, step)
  );
  const displayValue = isControlled ? controlledValue : value;

  const stateRef = useRef({});

  /* ---------- sync ref state ---------- */

  useEffect(() => {
    stateRef.current = {
      value: displayValue,
      min,
      max,
      step,
      isControlled,
      onChange,
    };
  }, [displayValue, isControlled, max, min, onChange, step]);

  /* ---------- internal setter ---------- */

  const setInternalValue = (next) => {
    const s = stateRef.current;

    const base = typeof next === "function" ? next(s.value) : next;

    const stepped =
      Math.round((base - s.min) / s.step) * s.step + s.min;

    const clamped = clamp(
      Number(stepped.toFixed(10)),
      s.min,
      s.max
    );

    // update local only if needed
    if (!s.isControlled) {
      setValue((prev) => (prev === clamped ? prev : clamped));
    }

    // notify only if changed
    if (typeof s.onChange === "function" && clamped !== s.value) {
      triggerHapticPulse(15);
      s.onChange(clamped);
    }
  };

  const stepUp = (t = 1) =>
    setInternalValue((v) => v + stateRef.current.step * t);

  const stepDown = (t = 1) =>
    setInternalValue((v) => v - stateRef.current.step * t);

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
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        dragging = true;
        touchPending = false;
        activePointerId = e.pointerId;
        try {
          track.setPointerCapture?.(e.pointerId);
        } catch (_) {}

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
          } catch (_) {}
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
        } catch (_) {}
        activePointerId = null;
      }
    };

    const onPointerCancel = () => {
      touchPending = false;
      dragging = false;
      if (activePointerId !== null) {
        try {
          track.releasePointerCapture?.(activePointerId);
        } catch (_) {}
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

  /* ---------- reset key ---------- */

  useEffect(() => {
    const onKey = (e) => {
      if (defaultValue === undefined) return;

      if (e.key.toLowerCase() === "r") {
        setInternalValue(
          snapValue(defaultValue, min, max, step)
        );
        e.preventDefault();
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
    setIsSelected(true);
    containerRef.current?.focus();
  };

  const handleDeselect = () => {
    selectedRef.current = false;
    setIsSelected(false);
  };

  return (
    <div
      ref={containerRef}
      className={`bv slider${isSelected ? ' selected' : ''}`}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={displayValue}
      tabIndex={0}
      onFocus={handleSelect}
      onBlur={handleDeselect}
      onPointerDown={handleSelect}
    >
      <span ref={decRef} onPointerDown={() => stepDown()} role="button" aria-label={`Decrease ${ariaLabel}`} disabled={value === min}>
        [-]
      </span>

      <sub className="min">{min.toString().slice(0,5)}</sub>

      <div
        className="track"
        ref={trackRef}
        onDoubleClick={handleReset}
      >
        <div className={`thumb${defaultValue !== undefined && displayValue !== defaultValue ? ' modified' : ''}`} ref={thumbRef} />
        {defaultValue !== undefined && (
          <div className="thumb default" ref={defaultThumbRef} />
        )}
      </div>

      <sub className="max">{max.toString().slice(0,5)}</sub>

      <span ref={incRef} onPointerDown={() => stepUp()} role="button" aria-label={`Increase ${ariaLabel}`} disabled={value === max}>
        [+]
      </span>
    </div>
  );
}