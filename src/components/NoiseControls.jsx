import SliderBundle from "./SliderBundle";
import useParamsStore, { NOISE_CONTROLS } from "../stores/paramsStore";

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatLabel(key) {
  return key.replace(/^noise/, '').replace(/([A-Z])/g, ' $1').trim().toUpperCase();
}

function NoiseSlider({ controlKey, config }) {
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

export default function NoiseControls({ showLabel = true }) {
  return (
    <div className="bv-section">
      {showLabel && <p className="bv-label">NOISE</p>}
      {Object.entries(NOISE_CONTROLS).map(([key, cfg]) => (
        <NoiseSlider
          key={key}
          controlKey={key}
          config={cfg}
        />
      ))}
    </div>
  );
}

