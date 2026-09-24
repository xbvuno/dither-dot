import { useRef, useCallback } from 'react';
import './styles/VideoRangeSlider.css';

const MIN_SPAN = 0.05; // 50ms min span

export default function VideoRangeSlider({
  duration = 1,
  startTime = 0,
  endTime = 1,
  currentTime = 0,
  onChange,
  disabled = false,
}) {
  const trackRef = useRef(null);
  const dragInfoRef = useRef(null);

  const safeDuration = Math.max(0.1, duration);
  const safeStart = Math.max(0, Math.min(safeDuration - MIN_SPAN, Number(startTime) || 0));
  const safeEnd = Math.max(safeStart + MIN_SPAN, Math.min(safeDuration, Number(endTime) || safeDuration));
  const safeCurrent = Math.max(0, Math.min(safeDuration, Number(currentTime) || 0));

  const startPct = (safeStart / safeDuration) * 100;
  const endPct = (safeEnd / safeDuration) * 100;
  const currentPct = (safeCurrent / safeDuration) * 100;

  const getTimeFromPointer = useCallback((clientX) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * safeDuration;
  }, [safeDuration]);

  const handlePointerDown = useCallback((e, type) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    dragInfoRef.current = {
      type,
      startX: e.clientX,
      initialStart: safeStart,
      initialEnd: safeEnd,
      pointerId: e.pointerId,
    };

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const onPointerMove = (moveEvt) => {
      if (!dragInfoRef.current || dragInfoRef.current.pointerId !== moveEvt.pointerId) return;
      const { type: dragType, startX, initialStart, initialEnd } = dragInfoRef.current;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const deltaSec = ((moveEvt.clientX - startX) / rect.width) * safeDuration;

      if (dragType === 'start') {
        const nextStart = Math.max(0, Math.min(safeEnd - MIN_SPAN, initialStart + deltaSec));
        onChange?.({ startTime: Number(nextStart.toFixed(3)), endTime: safeEnd });
      } else if (dragType === 'end') {
        const nextEnd = Math.max(safeStart + MIN_SPAN, Math.min(safeDuration, initialEnd + deltaSec));
        onChange?.({ startTime: safeStart, endTime: Number(nextEnd.toFixed(3)) });
      } else if (dragType === 'range') {
        const span = initialEnd - initialStart;
        let nextStart = initialStart + deltaSec;
        let nextEnd = initialEnd + deltaSec;

        if (nextStart < 0) {
          nextStart = 0;
          nextEnd = Math.min(safeDuration, span);
        } else if (nextEnd > safeDuration) {
          nextEnd = safeDuration;
          nextStart = Math.max(0, safeDuration - span);
        }

        onChange?.({
          startTime: Number(nextStart.toFixed(3)),
          endTime: Number(nextEnd.toFixed(3)),
        });
      }
    };

    const onPointerUp = (upEvt) => {
      if (!dragInfoRef.current || dragInfoRef.current.pointerId !== upEvt.pointerId) return;
      try {
        upEvt.currentTarget?.releasePointerCapture?.(upEvt.pointerId);
      } catch {
        // ignore
      }
      dragInfoRef.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [disabled, safeDuration, safeEnd, safeStart, onChange]);

  const handleTrackPointerDown = (e) => {
    if (disabled || e.button !== 0) return;
    const clickedTime = getTimeFromPointer(e.clientX);
    const distToStart = Math.abs(clickedTime - safeStart);
    const distToEnd = Math.abs(clickedTime - safeEnd);

    if (distToStart < distToEnd) {
      const nextStart = Math.max(0, Math.min(safeEnd - MIN_SPAN, clickedTime));
      onChange?.({ startTime: Number(nextStart.toFixed(3)), endTime: safeEnd });
      handlePointerDown(e, 'start');
    } else {
      const nextEnd = Math.max(safeStart + MIN_SPAN, Math.min(safeDuration, clickedTime));
      onChange?.({ startTime: safeStart, endTime: Number(nextEnd.toFixed(3)) });
      handlePointerDown(e, 'end');
    }
  };

  const handleStartInputChange = (val) => {
    const num = Math.max(0, Math.min(safeEnd - MIN_SPAN, Number(val) || 0));
    onChange?.({ startTime: Number(num.toFixed(2)), endTime: safeEnd });
  };

  const handleEndInputChange = (val) => {
    const num = Math.max(safeStart + MIN_SPAN, Math.min(safeDuration, Number(val) || safeDuration));
    onChange?.({ startTime: safeStart, endTime: Number(num.toFixed(2)) });
  };

  return (
    <div className={`video-range-slider-container${disabled ? ' disabled' : ''}`}>
      <div
        className="video-range-track-wrap"
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
      >
        {/* Track ticks background */}
        <div className="video-range-ticks" aria-hidden="true">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((t) => (
            <div key={t} className="video-range-tick" style={{ left: `${t}%` }} />
          ))}
        </div>

        {/* Selected Active Span */}
        <div
          className="video-range-active-span"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
          }}
          onPointerDown={(e) => handlePointerDown(e, 'range')}
          title="Drag to shift range window"
        />

        {/* Live Playhead */}
        {safeCurrent >= 0 && (
          <div
            className="video-range-playhead"
            style={{ left: `${currentPct}%` }}
            aria-hidden="true"
          />
        )}

        {/* Start Handle */}
        <div
          className="video-range-handle video-range-handle--start"
          style={{ left: `${startPct}%` }}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-label="Start time"
          aria-valuemin={0}
          aria-valuemax={safeEnd - MIN_SPAN}
          aria-valuenow={Number(safeStart.toFixed(2))}
          onPointerDown={(e) => handlePointerDown(e, 'start')}
          onKeyDown={(e) => {
            if (disabled) return;
            const step = e.shiftKey ? 0.5 : 0.1;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              const next = Math.max(0, safeStart - step);
              onChange?.({ startTime: Number(next.toFixed(2)), endTime: safeEnd });
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next = Math.min(safeEnd - MIN_SPAN, safeStart + step);
              onChange?.({ startTime: Number(next.toFixed(2)), endTime: safeEnd });
            }
          }}
        >
          <div className="video-range-handle-grip" />
          <div className="video-range-handle-tag">START</div>
        </div>

        {/* End Handle */}
        <div
          className="video-range-handle video-range-handle--end"
          style={{ left: `${endPct}%` }}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-label="End time"
          aria-valuemin={safeStart + MIN_SPAN}
          aria-valuemax={safeDuration}
          aria-valuenow={Number(safeEnd.toFixed(2))}
          onPointerDown={(e) => handlePointerDown(e, 'end')}
          onKeyDown={(e) => {
            if (disabled) return;
            const step = e.shiftKey ? 0.5 : 0.1;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              const next = Math.max(safeStart + MIN_SPAN, safeEnd - step);
              onChange?.({ startTime: safeStart, endTime: Number(next.toFixed(2)) });
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next = Math.min(safeDuration, safeEnd + step);
              onChange?.({ startTime: safeStart, endTime: Number(next.toFixed(2)) });
            }
          }}
        >
          <div className="video-range-handle-grip" />
          <div className="video-range-handle-tag">END</div>
        </div>
      </div>

      {/* Numerical inputs for precision */}
      <div className="video-range-inputs-row">
        <div className="video-range-input-group">
          <span className="bv-label">START (S)</span>
          <input
            type="number"
            className="video-dialog-input"
            min={0}
            max={Math.max(0, safeEnd - MIN_SPAN)}
            step={0.1}
            value={Number(safeStart.toFixed(2))}
            onChange={(e) => handleStartInputChange(e.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="video-range-summary-badge">
          <span className="bv-label">SELECTED RANGE</span>
          <span className="video-range-time-val">
            {(safeEnd - safeStart).toFixed(2)}s / {safeDuration.toFixed(2)}s
          </span>
        </div>

        <div className="video-range-input-group">
          <span className="bv-label">END (S)</span>
          <input
            type="number"
            className="video-dialog-input"
            min={safeStart + MIN_SPAN}
            max={safeDuration}
            step={0.1}
            value={Number(safeEnd.toFixed(2))}
            onChange={(e) => handleEndInputChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
