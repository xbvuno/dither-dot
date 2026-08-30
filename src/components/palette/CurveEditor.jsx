import { useState, useRef } from 'react';
import { getDefaultCurvePoints, buildCurveLut } from '../../utils/curveUtils';

export default function CurveEditor({
  curves = {
    r: getDefaultCurvePoints(),
    g: getDefaultCurvePoints(),
    b: getDefaultCurvePoints(),
  },
  onChangeCurves,
}) {
  // Active editing channel: 'r' | 'g' | 'b'
  const [activeChannel, setActiveChannel] = useState('r');
  // Channels enabled for modification (checkboxes)
  const [enabledChannels, setEnabledChannels] = useState({
    r: true,
    g: true,
    b: true,
  });

  const [draggingPointIdx, setDraggingPointIdx] = useState(null);
  const svgRef = useRef(null);

  const toggleChannel = (channel) => {
    setEnabledChannels((prev) => {
      const next = { ...prev, [channel]: !prev[channel] };
      if (next[channel]) {
        setActiveChannel(channel);
      } else if (activeChannel === channel) {
        const nextActive = Object.keys(next).find((k) => next[k]);
        if (nextActive) setActiveChannel(nextActive);
      }
      return next;
    });
  };

  const handlePointerDown = (e, ptIdx) => {
    if (e.button !== 0 || !enabledChannels[activeChannel]) return;

    e.stopPropagation();
    setDraggingPointIdx(ptIdx);

    const svg = svgRef.current;
    if (!svg) return;

    const handlePointerMove = (moveEvent) => {
      const rect = svg.getBoundingClientRect();
      const rawX = Math.round(((moveEvent.clientX - rect.left) / rect.width) * 255);
      const rawY = Math.round((1 - (moveEvent.clientY - rect.top) / rect.height) * 255);

      const clampedX = Math.max(0, Math.min(255, rawX));
      const clampedY = Math.max(0, Math.min(255, rawY));

      const currentPoints = [...(curves[activeChannel] || getDefaultCurvePoints())];
      const newX = ptIdx === 0 ? 0 : ptIdx === currentPoints.length - 1 ? 255 : clampedX;

      currentPoints[ptIdx] = { x: newX, y: clampedY };
      currentPoints.sort((a, b) => a.x - b.x);

      const nextCurves = {
        ...curves,
        [activeChannel]: currentPoints,
      };
      if (onChangeCurves) {
        onChangeCurves(nextCurves);
      }
    };

    const handlePointerUp = () => {
      setDraggingPointIdx(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleSvgClick = (e) => {
    if (e.button !== 0 || draggingPointIdx !== null || !enabledChannels[activeChannel]) return;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 255);
    const y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 255);

    const clampedX = Math.max(0, Math.min(255, x));
    const clampedY = Math.max(0, Math.min(255, y));

    const currentPoints = [...(curves[activeChannel] || getDefaultCurvePoints())];
    currentPoints.push({ x: clampedX, y: clampedY });
    currentPoints.sort((a, b) => a.x - b.x);

    const nextCurves = {
      ...curves,
      [activeChannel]: currentPoints,
    };
    if (onChangeCurves) {
      onChangeCurves(nextCurves);
    }
  };

  const handleDeletePoint = (ptIdx) => {
    if (!enabledChannels[activeChannel]) return;
    const currentPoints = [...(curves[activeChannel] || getDefaultCurvePoints())];
    if (ptIdx === 0 || ptIdx === currentPoints.length - 1 || currentPoints.length <= 2) return;

    currentPoints.splice(ptIdx, 1);
    const nextCurves = {
      ...curves,
      [activeChannel]: currentPoints,
    };
    if (onChangeCurves) {
      onChangeCurves(nextCurves);
    }
  };

  const handleResetCurve = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const nextCurves = {
      ...curves,
      [activeChannel]: getDefaultCurvePoints(),
    };
    if (onChangeCurves) {
      onChangeCurves(nextCurves);
    }
  };

  const channelColors = {
    r: '#ff5555',
    g: '#55ff77',
    b: '#5599ff',
  };

  const generatePath = (points) => {
    if (!points || points.length === 0) return '';
    const lut = buildCurveLut(points);
    let path = `M 0 ${255 - lut[0]}`;
    for (let x = 1; x <= 255; x++) {
      path += ` L ${x} ${255 - lut[x]}`;
    }
    return path;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {(['r', 'g', 'b']).map((ch) => {
            const isEnabled = enabledChannels[ch];
            const isActive = activeChannel === ch;
            return (
              <label
                key={ch}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.7rem',
                  color: isEnabled ? channelColors[ch] : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => toggleChannel(ch)}
                  style={{
                    accentColor: channelColors[ch],
                    width: '12px',
                    height: '12px',
                    cursor: 'pointer',
                  }}
                />
                <span
                  style={{
                    textDecoration: isActive && isEnabled ? 'underline' : 'none',
                    fontWeight: isActive && isEnabled ? 700 : 400,
                    textTransform: 'uppercase',
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isEnabled) toggleChannel(ch);
                    setActiveChannel(ch);
                  }}
                >
                  {ch}
                </span>
              </label>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleResetCurve}
          className="palette-link-btn"
          style={{ fontSize: '0.66rem' }}
        >
          RESET
        </button>
      </div>

      {/* 2D Curve Canvas Area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '120px',
          background: 'var(--input-surface, #000)',
          border: '1px solid var(--color-border-subtle)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 255 255"
          preserveAspectRatio="none"
          onClick={handleSvgClick}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: enabledChannels[activeChannel] ? 'crosshair' : 'default',
            touchAction: 'none',
          }}
        >
          {/* Grid lines */}
          <line x1="0" y1="64" x2="255" y2="64" stroke="var(--color-border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
          <line x1="0" y1="128" x2="255" y2="128" stroke="var(--color-border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
          <line x1="0" y1="192" x2="255" y2="192" stroke="var(--color-border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
          <line x1="64" y1="0" x2="64" y2="255" stroke="var(--color-border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
          <line x1="128" y1="0" x2="128" y2="255" stroke="var(--color-border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
          <line x1="192" y1="0" x2="192" y2="255" stroke="var(--color-border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />

          {/* Neutral 45-degree diagonal reference */}
          <line x1="0" y1="255" x2="255" y2="0" stroke="var(--color-text-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />

          {/* Render Curve Paths for all channels */}
          {(['r', 'g', 'b']).map((ch) => {
            const pathData = generatePath(curves[ch] || getDefaultCurvePoints());
            const isEnabled = enabledChannels[ch];
            const isActive = activeChannel === ch && isEnabled;
            return (
              <path
                key={ch}
                d={pathData}
                fill="none"
                stroke={channelColors[ch]}
                strokeWidth={isActive ? '2.5' : isEnabled ? '1.5' : '1'}
                opacity={isActive ? 1 : isEnabled ? 0.7 : 0.25}
              />
            );
          })}

          {/* Control point handles for active channel */}
          {enabledChannels[activeChannel] && (curves[activeChannel] || getDefaultCurvePoints()).map((pt, idx) => (
            <rect
              key={idx}
              x={pt.x - 4}
              y={(255 - pt.y) - 4}
              width="8"
              height="8"
              fill={channelColors[activeChannel]}
              stroke="#000000"
              strokeWidth="1.5"
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => handlePointerDown(e, idx)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeletePoint(idx);
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeletePoint(idx);
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
