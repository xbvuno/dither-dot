import SliderBundle from "../ui/shared/SliderBundle";
import useParamsStore, { COLOR_CONTROLS } from "../../stores/data/paramsStore";

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

const COLOR_ENTRIES = Object.entries(COLOR_CONTROLS);

function ParamSlider({ controlKey, config }) {
    const value = useParamsStore(s => s[controlKey]);
    const setter = useParamsStore(s => s["set" + capitalize(controlKey)]);

    return (
        <SliderBundle
            label={controlKey.toUpperCase()}
            min={config.min}
            max={config.max}
            step={config.step}
            defaultValue={config.default}
            value={value}
            onChange={setter}
            tooltip={config.description}
        />
    );
}

export default function ColorControls({ showLabel = true }) {

    return (
        <div className="bv-section">
            {showLabel && <p className="bv-label">COLORS</p>}
            {COLOR_ENTRIES.map(([key, cfg]) => {
                return (
                    <ParamSlider
                        key={key}
                        controlKey={key}
                        config={cfg}
                    />
                );
            })}
        </div>
    );
}
