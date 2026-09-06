import { useCallback, useRef } from 'react';

/**
 * OptionGroup
 * Standardized button group for single selection with ARIA and keyboard support.
 *
 * @param {Array<string|{value: any, label: string, disabled?: boolean, title?: string, id?: any}>} options
 * @param {any} value - Currently selected value
 * @param {Function} onChange - Callback with selected value
 * @param {boolean} [disabled=false] - Disable entire group
 * @param {string} [className=''] - Extra classes
 * @param {string} [ariaLabel] - Accessible label for the radiogroup
 */
export default function OptionGroup({
  options = [],
  value,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
}) {
  const buttonsRef = useRef([]);

  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      const val = opt.value !== undefined ? opt.value : opt.id;
      const lbl = opt.label !== undefined ? opt.label : String(val);
      return {
        value: val,
        label: lbl,
        disabled: Boolean(opt.disabled),
        title: opt.title,
      };
    }
    return {
      value: opt,
      label: String(opt).toUpperCase(),
      disabled: false,
      title: undefined,
    };
  });

  const handleKeyDown = useCallback(
    (e, idx) => {
      const enabledIndices = normalizedOptions
        .map((opt, i) => (!disabled && !opt.disabled ? i : null))
        .filter((i) => i !== null);

      if (enabledIndices.length === 0) return;

      const currentPos = enabledIndices.indexOf(idx);
      let nextIndex = null;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextPos = (currentPos + 1) % enabledIndices.length;
        nextIndex = enabledIndices[nextPos];
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevPos = (currentPos - 1 + enabledIndices.length) % enabledIndices.length;
        nextIndex = enabledIndices[prevPos];
      }

      if (nextIndex !== null) {
        const nextOpt = normalizedOptions[nextIndex];
        if (nextOpt && onChange) {
          onChange(nextOpt.value);
          buttonsRef.current[nextIndex]?.focus();
        }
      }
    },
    [normalizedOptions, disabled, onChange]
  );

  return (
    <div
      className={`bv-option-group ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {normalizedOptions.map((opt, idx) => {
        const isActive = value === opt.value;
        const isOptDisabled = disabled || opt.disabled;

        return (
          <button
            key={String(opt.value)}
            ref={(el) => { buttonsRef.current[idx] = el; }}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={isOptDisabled}
            title={opt.title}
            className={`bv-option-btn${isActive ? ' active' : ''}`}
            onClick={() => {
              if (!isOptDisabled && onChange) {
                onChange(opt.value);
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

