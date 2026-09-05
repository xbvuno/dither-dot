import SliderBundle from "../ui/shared/SliderBundle";
import OptionGroup from "../ui/shared/OptionGroup";
import useParamsStore, { BLUR_CONTROLS } from "../../stores/data/paramsStore";

const ENABLED_OPTIONS = [
    { value: true, label: "ON" },
    { value: false, label: "OFF" },
];

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').toUpperCase();
}

const BLUR_ENTRIES = Object.entries(BLUR_CONTROLS);
function ParamSlider({ controlKey, config, disabled }) {
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
            disabled={disabled}
        />
    );
}

export default function BlurControls({ showLabel = true }) {
    const blurEnabled = useParamsStore(s => s.blurEnabled);
    const setBlurEnabled = useParamsStore(s => s.setBlurEnabled);

    return (
        <div className="bv-section">
            {showLabel && <p className="bv-label">BLUR</p>}

            <div className="bv-controls-row">
                <span className="bv-label">ENABLED</span>
                <OptionGroup
                    options={ENABLED_OPTIONS}
                    value={blurEnabled}
                    onChange={setBlurEnabled}
                    ariaLabel="Blur enabled"
                />
            </div>

            {BLUR_ENTRIES.map(([key, cfg]) => {
                return (
                    <ParamSlider
                        key={key}
                        controlKey={key}
                        config={cfg}
                        disabled={!blurEnabled}
                    />
                );
            })}
        </div>
    );
}

