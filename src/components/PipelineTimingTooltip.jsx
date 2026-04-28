import useDitherStore, { DITHER_METHOD } from '../stores/ditherStore';
import usePaletteStore, { EXTRACT_METHOD } from '../stores/paletteStore';
import './PipelineTimingTooltip.css';

function formatMs(value) {
  if (!Number.isFinite(value) || value <= 0) return '0ms';
  return `${Math.round(value)}ms`;
}

function formatAlgorithmName(value, fallback = 'Default') {
  if (!value) return fallback;
  return value
    .split('_')
    .map((part) => part.toUpperCase())
    .join(' ');
}

function getPaletteAlgorithmLabel(method) {
  switch (method) {
    case EXTRACT_METHOD.MEDIAN_CUT:
      return 'MEDIAN CUT';
    case EXTRACT_METHOD.OCTREE:
      return 'OCTREE';
    case EXTRACT_METHOD.KMEANS:
      return 'K_MEANS';
    case EXTRACT_METHOD.CUSTOM:
      return 'CUSTOM';
    default:
      return formatAlgorithmName(method, 'Palette');
  }
}

function getDitherAlgorithmLabel(method, enabled) {
  if (!enabled) return 'Off';

  switch (method) {
    case DITHER_METHOD.FLOYD_STEINBERG:
      return 'FS';
    case DITHER_METHOD.JJN:
      return 'JJN';
    case DITHER_METHOD.STUCKI:
      return 'STUCKI';
    case DITHER_METHOD.ATKINSON:
      return 'ATKINSON';
    case DITHER_METHOD.BURKES:
      return 'BURKES';
    case DITHER_METHOD.SIERRA:
      return 'SIERRA';
    case DITHER_METHOD.TWO_ROW_SIERRA:
      return '2R SIERRA';
    case DITHER_METHOD.SIERRA_LITE:
      return 'SIERRA LITE';
    case DITHER_METHOD.ORDERED_BAYER:
      return 'ORDERED';
    case DITHER_METHOD.RANDOM:
      return 'RANDOM';
    default:
      return formatAlgorithmName(method, 'Dither');
  }
}

export default function PipelineTimingTooltip({ isVisible, timing, currentPhase, paletteGenerationCached = false, position = {} }) {
  const paletteMethod = usePaletteStore((s) => s.method);
  const ditherMethod = useDitherStore((s) => s.method);
  const ditherEnabled = useDitherStore((s) => s.enabled);

  const phases = [
    {
      key: 'extraction',
      label: 'Readback',
      detail: null,
      value: timing.extraction,
      color: '#ff6b6b',
      alwaysShow: true,
    },
    {
      key: 'palette',
      label: 'Palette Generation',
      detail: getPaletteAlgorithmLabel(paletteMethod),
      value: timing.paletteGeneration,
      cached: paletteGenerationCached,
      color: '#ffd93d',
      alwaysShow: true,
    },
    {
      key: 'dithering',
      label: 'Dithering',
      detail: getDitherAlgorithmLabel(ditherMethod, ditherEnabled),
      value: timing.dithering,
      color: '#4ecdc4',
      alwaysShow: true,
    },
  ];

  const displayPhases = phases;

  const visiblePhases = displayPhases.filter((phase) => phase.alwaysShow || phase.value > 0 || phase.key === currentPhase);
  const maxValue = Math.max(...visiblePhases.map((phase) => phase.value), 1);

  const renderChart = () => (
    <div className="timing-chart">
      <div className="timing-bars">
        {visiblePhases.map((phase) => {
          const isActive = phase.key === currentPhase;

          return (
            <div key={phase.label} className={`timing-bar-row${isActive ? ' timing-bar-row--active' : ''}`}>
              <div className="timing-meta">
                <div className="timing-label">{phase.label}</div>
                {phase.detail ? <div className="timing-detail">({phase.detail})</div> : null}
              </div>
              <div className="timing-bar-container">
                <div
                  className={`timing-bar${isActive ? ' timing-bar--active' : ''}`}
                  style={{
                    width: `${Math.max((phase.value / maxValue) * 100, isActive ? 18 : 0)}%`,
                    backgroundColor: phase.color,
                  }}
                />
              </div>
              <div className="timing-value">
                {phase.key === 'palette' && phase.cached
                  ? 'CACHED'
                  : (isActive && phase.value <= 0 ? '...' : formatMs(phase.value))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pipeline-timing-tooltip" style={position}>
      <p className="bv-label">PIPELINE</p>
      {visiblePhases.length > 0 ? renderChart() : <div className="no-data">No timing data</div>}
    </div>
  );
}

