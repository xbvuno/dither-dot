import Slider from "./Slider";
import AutoResizingInput from "./AutoResizingInput";


export default function SliderBundle({min = 1, max = 10, step = 1, value: _value, defaultValue, onChange, label = "LABEL", tooltip}) {
    const value = _value ?? (defaultValue !== undefined ? defaultValue : min)

    function handleChange(newValue) {
        if (onChange) onChange(newValue)
    }

    return <div className="bv slider-bundle">
        <label className="flex-h">
            <span className="slider-label-wrap">
                <span className="bv-label slider-bundle-label">{label}</span>
                {tooltip && <span className="slider-tooltip">{tooltip}</span>}
            </span>
            {defaultValue !== undefined && defaultValue !== value && <span role="button" aria-label={`Reset ${label}`} onClick={() => handleChange(defaultValue)}>[R]</span>}
            <AutoResizingInput min={min} max={max} defaultValue={defaultValue} step={step} value={value} onChange={handleChange}/>
        </label>
        <Slider label={label} min={min} max={max} value={value} defaultValue={defaultValue} step={step} onChange={handleChange}/>
    </div>
}
