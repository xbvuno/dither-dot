import Slider from "./Slider";
import AutoResizingInput from "./AutoResizingInput";

function formatBound(val) {
    if (val === undefined || val === null) return '';
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    return String(Number(num.toFixed(3)));
}

export default function SliderBundle({min = 1, max = 10, step = 1, value: _value, defaultValue, onChange, label = "LABEL", tooltip, name, id}) {
    const value = _value ?? (defaultValue !== undefined ? defaultValue : min)

    function handleChange(newValue) {
        if (onChange) onChange(newValue)
    }

    return <div className="bv slider-bundle">
        <div className="flex-h">
            <span className="slider-label-wrap">
                <span className="bv-label slider-bundle-label">{label}</span>
                <span className="slider-range-bounds">[{formatBound(min)}, {formatBound(max)}]</span>
                {tooltip && <span className="slider-tooltip">{tooltip}</span>}
            </span>
            {defaultValue !== undefined && defaultValue !== value && (
                <button
                    type="button"
                    className="slider-bundle-reset-btn"
                    aria-label={`Reset ${label}`}
                    onClick={() => handleChange(defaultValue)}
                >
                    [R]
                </button>
            )}
            <AutoResizingInput label={label} name={name} id={id} min={min} max={max} defaultValue={defaultValue} step={step} value={value} onChange={handleChange}/>
        </div>
        <Slider label={label} min={min} max={max} value={value} defaultValue={defaultValue} step={step} onChange={handleChange}/>
    </div>
}
