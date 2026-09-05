import { useState, useRef, useCallback, useEffect } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { triggerHapticPulse } from "../../../utils/haptics";
import Slider from "./Slider";
import AutoResizingInput from "./AutoResizingInput";

function formatBound(val) {
    if (val === undefined || val === null) return '';
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    return String(Number(num.toFixed(3)));
}

export default function SliderBundle({
    min = 1,
    max = 10,
    step = 1,
    value: _value,
    defaultValue,
    onChange,
    label = "LABEL",
    tooltip,
    name,
    id,
    disabled = false,
}) {
    const value = _value ?? (defaultValue !== undefined ? defaultValue : min);
    const [isSelected, setIsSelected] = useState(false);

    const numMin = Number(min);
    const numMax = Number(max);
    const numStep = Number(step);
    const numValue = Number(value);

    const isAtMin = !Number.isNaN(numValue) && !Number.isNaN(numMin) && numValue <= numMin + 1e-5;
    const isAtMax = !Number.isNaN(numValue) && !Number.isNaN(numMax) && numValue >= numMax - 1e-5;

    const stateRef = useRef({});
    stateRef.current = { value: numValue, min: numMin, max: numMax, step: numStep, onChange };

    const setInternalValue = (next) => {
        const s = stateRef.current;
        const currVal = Number(s.value);
        const sMin = Number(s.min);
        const sMax = Number(s.max);
        const sStep = Number(s.step);

        const base = typeof next === "function" ? next(currVal) : Number(next);
        const stepped = Math.round((base - sMin) / sStep) * sStep + sMin;
        const clamped = Math.min(sMax, Math.max(sMin, Number(stepped.toFixed(10))));

        if (typeof s.onChange === "function" && Math.abs(clamped - currVal) > 1e-7) {
            triggerHapticPulse(5);
            s.value = clamped;
            s.onChange(clamped);
        }
    };

    const stepUp = useCallback((t = 1) => {
        const s = stateRef.current;
        const curr = Number(s.value);
        const mx = Number(s.max);
        const stp = Number(s.step);
        if (!Number.isNaN(curr) && !Number.isNaN(mx) && curr >= mx - 1e-5) return;
        setInternalValue(curr + stp * t);
    }, []);

    const stepDown = useCallback((t = 1) => {
        const s = stateRef.current;
        const curr = Number(s.value);
        const mn = Number(s.min);
        const stp = Number(s.step);
        if (!Number.isNaN(curr) && !Number.isNaN(mn) && curr <= mn + 1e-5) return;
        setInternalValue(curr - stp * t);
    }, []);

    const repeatTimerRef = useRef(null);

    const clearRepeat = useCallback(() => {
        if (repeatTimerRef.current) {
            clearInterval(repeatTimerRef.current);
            clearTimeout(repeatTimerRef.current);
            repeatTimerRef.current = null;
        }
    }, []);

    const handleStepPointerDown = (e, direction) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        clearRepeat();

        if (direction === 'dec') {
            if (isAtMin) return;
            stepDown();
        } else {
            if (isAtMax) return;
            stepUp();
        }

        repeatTimerRef.current = setTimeout(() => {
            repeatTimerRef.current = setInterval(() => {
                const s = stateRef.current;
                const val = Number(s.value);
                const mn = Number(s.min);
                const mx = Number(s.max);

                if (direction === 'dec') {
                    if (val <= mn + 1e-5) {
                        clearRepeat();
                    } else {
                        stepDown();
                    }
                } else {
                    if (val >= mx - 1e-5) {
                        clearRepeat();
                    } else {
                        stepUp();
                    }
                }
            }, 70);
        }, 300);
    };

    const handleStepPointerUp = (e) => {
        e?.stopPropagation?.();
        clearRepeat();
    };

    useEffect(() => {
        const handleGlobalPointerUp = () => {
            clearRepeat();
        };
        window.addEventListener("pointerup", handleGlobalPointerUp);
        window.addEventListener("pointercancel", handleGlobalPointerUp);
        return () => {
            clearRepeat();
            window.removeEventListener("pointerup", handleGlobalPointerUp);
            window.removeEventListener("pointercancel", handleGlobalPointerUp);
        };
    }, [clearRepeat]);


    const handleFocus = () => {
        if (disabled) return;
        setIsSelected(true);
    };

    const handleBlur = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsSelected(false);
        }
    };

    const isModified = defaultValue !== undefined && !Number.isNaN(numValue) && Math.abs(numValue - Number(defaultValue)) > 1e-5;

    return (
        <div
            className={`bv slider-bundle${disabled ? ' disabled' : ''}`}
            onFocus={handleFocus}
            onBlur={handleBlur}
        >
            <div className="flex-h">
                <span className="slider-label-wrap" title={tooltip || undefined}>
                    <span className={`bv-label slider-bundle-label${isModified ? ' modified' : ''}`}>{label}</span>
                    {isSelected && !disabled && (
                        <span className="slider-range-bounds">[{formatBound(min)}, {formatBound(max)}]</span>
                    )}
                </span>

                <div className="slider-bundle-controls">
                    {(isSelected || isModified) && !disabled && (
                        <div className="slider-bundle-actions">
                            {isSelected && (
                                <>
                                    <button
                                        type="button"
                                        className="slider-step-btn slider-step-btn--dec"
                                        aria-label={`Decrease ${label}`}
                                        disabled={isAtMin}
                                        tabIndex={isAtMin ? -1 : 0}
                                        onPointerDown={(e) => handleStepPointerDown(e, "dec")}
                                        onPointerUp={handleStepPointerUp}
                                        onPointerCancel={handleStepPointerUp}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Minus size={12} strokeWidth={2.5} />
                                    </button>
                                    <button
                                        type="button"
                                        className="slider-step-btn slider-step-btn--inc"
                                        aria-label={`Increase ${label}`}
                                        disabled={isAtMax}
                                        tabIndex={isAtMax ? -1 : 0}
                                        onPointerDown={(e) => handleStepPointerDown(e, "inc")}
                                        onPointerUp={handleStepPointerUp}
                                        onPointerCancel={handleStepPointerUp}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Plus size={12} strokeWidth={2.5} />
                                    </button>
                                </>
                            )}
                            {isModified && (
                                <button
                                    type="button"
                                    className="slider-step-btn slider-reset-btn"
                                    aria-label={`Reset ${label}`}
                                    title={`Reset ${label}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setInternalValue(defaultValue);
                                    }}
                                >
                                    <RotateCcw size={12} strokeWidth={1.5} />
                                </button>
                            )}
                        </div>
                    )}
                    <AutoResizingInput
                        label={label}
                        name={name}
                        id={id}
                        min={min}
                        max={max}
                        defaultValue={defaultValue}
                        step={step}
                        value={value}
                        onChange={onChange}
                        disabled={disabled}
                    />
                </div>
            </div>
            <Slider
                label={label}
                min={min}
                max={max}
                value={value}
                defaultValue={defaultValue}
                step={step}
                onChange={onChange}
                isSelected={isSelected && !disabled}
                onSelect={() => !disabled && setIsSelected(true)}
                onDeselect={() => setIsSelected(false)}
                disabled={disabled}
            />
        </div>
    );
}
