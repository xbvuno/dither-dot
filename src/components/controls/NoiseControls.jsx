import SliderBundle from "../ui/shared/SliderBundle";
import OptionGroup from "../ui/shared/OptionGroup";
import useParamsStore, { NOISE_CONTROLS } from "../../stores/data/paramsStore";

const ENABLED_OPTIONS = [
  { value: true, label: "ON" },
  { value: false, label: "OFF" },
];

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatLabel(key) {
  return key.replace(/^noise/, '').replace(/([A-Z])/g, ' $1').trim().toUpperCase();
}

function NoiseSlider({ controlKey, config, disabled }) {
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

export default function NoiseControls({ showLabel = true }) {
  const noiseEnabled = useParamsStore(s => s.noiseEnabled);
  const setNoiseEnabled = useParamsStore(s => s.setNoiseEnabled);

  return (
    <div className="bv-section">
      {showLabel && <p className="bv-label">NOISE</p>}

      <div className="bv-controls-row">
        <span className="bv-label">ENABLED</span>
        <OptionGroup
          options={ENABLED_OPTIONS}
          value={noiseEnabled}
          onChange={setNoiseEnabled}
          ariaLabel="Noise enabled"
        />
      </div>

      {Object.entries(NOISE_CONTROLS).map(([key, cfg]) => (
        <NoiseSlider
          key={key}
          controlKey={key}
          config={cfg}
          disabled={!noiseEnabled}
        />
      ))}
    </div>
  );
}

