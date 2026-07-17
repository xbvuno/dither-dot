import SliderBundle from "../ui/shared/SliderBundle";
import useParamsStore, { BLUR_CONTROLS } from "../../stores/data/paramsStore";

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').toUpperCase();
}

const BLUR_ENTRIES = Object.entries(BLUR_CONTROLS);
function ParamSlider({ controlKey, config }) {
    const value = useParamsStore(s => s[controlKey]);
    const setter = useParamsStore(s => s["set" + capitalize(controlKey)]);

    return (
        <SliderBundle
            label={formatLabel(controlKey)}
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

export default function BlurControls({ showLabel = true }) {

    return (
        <div className="bv-section">
            {showLabel && <p className="bv-label">BLUR</p>}
            {BLUR_ENTRIES.map(([key, cfg]) => {
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

