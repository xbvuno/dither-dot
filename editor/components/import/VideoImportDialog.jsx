import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getVideoMetadata, extractFramesFromVideo } from '../../utils/videoDecodeUtils';
import './styles/VideoImportDialog.css';

export default function VideoImportDialog({ file, name, onConfirm, onCancel }) {
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState(null);

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [scale, setScale] = useState(1);
  const [fps, setFps] = useState(20);

  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });

  const videoRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoadingMeta(true);
    setMetaError(null);

    getVideoMetadata(file)
      .then((data) => {
        if (!active) {
          URL.revokeObjectURL(data.url);
          return;
        }
        setMeta(data);
        setStartTime(0);
        setEndTime(Math.min(data.duration, 10)); // Default to first 10s max
        // If resolution is high (> 1280px), default to 50% scale
        if (data.width > 1280 || data.height > 1280) {
          setScale(0.5);
        }
      })
      .catch((err) => {
        if (active) setMetaError(err?.message || 'Failed to load video.');
      })
      .finally(() => {
        if (active) setLoadingMeta(false);
      });

    return () => {
      active = false;
    };
  }, [file]);

  const handleStartChange = (val) => {
    const num = Math.max(0, Math.min(endTime - 0.1, Number(val) || 0));
    setStartTime(num);
    if (videoRef.current) {
      videoRef.current.currentTime = num;
    }
  };

  const handleEndChange = (val) => {
    const maxDur = meta?.duration || 1;
    const num = Math.max(startTime + 0.1, Math.min(maxDur, Number(val) || maxDur));
    setEndTime(num);
    if (videoRef.current) {
      videoRef.current.currentTime = num;
    }
  };

  const duration = Math.max(0.1, endTime - startTime);
  const estimatedFrames = Math.min(300, Math.ceil(duration * fps));
  const outW = meta ? Math.round(meta.width * scale) : 0;
  const outH = meta ? Math.round(meta.height * scale) : 0;
  const estimatedRamMb = Math.round((estimatedFrames * outW * outH * 4) / (1024 * 1024));

  const handleConfirm = async () => {
    if (isExtracting || !meta) return;
    setIsExtracting(true);
    try {
      const result = await extractFramesFromVideo(file, {
        startTime,
        endTime,
        scale,
        fps,
        maxFrames: 300,
        onProgress: (p) => setProgress(p),
      });

      if (!result.frames || result.frames.length === 0) {
        throw new Error('No frames were extracted from the video.');
      }

      await onConfirm(result.frames, name);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Video frame extraction failed.');
      setIsExtracting(false);
    }
  };

  return createPortal(
    <div className='video-dialog-overlay' onClick={!isExtracting ? onCancel : undefined}>
      <div className='video-dialog' onClick={(e) => e.stopPropagation()}>
        <h2 className='video-dialog-title'>IMPORT VIDEO (FRAME SEQUENCE)</h2>

        {loadingMeta && <p className='bv-label'>READING VIDEO METADATA...</p>}
        {metaError && (
          <div className='bv-section'>
            <p className='bv-label' style={{ color: 'var(--color-danger, #ff4444)' }}>
              {metaError}
            </p>
            <button type='button' className='bv-option-btn' onClick={onCancel}>
              CLOSE
            </button>
          </div>
        )}

        {meta && !metaError && (
          <>
            <div className='video-dialog-preview-wrap'>
              <video
                ref={videoRef}
                src={meta.url}
                controls
                muted
                playsInline
                className='video-dialog-preview'
              />
            </div>

            {/* Trimming: Start & End */}
            <div className='video-dialog-section'>
              <p className='video-dialog-label'>
                <span>RANGE (TRIM)</span>
                <span>TOTAL DURATION: {meta.duration.toFixed(2)}s</span>
              </p>
              <div className='video-dialog-row'>
                <div className='video-dialog-input-group'>
                  <span className='video-dialog-label'>START (S)</span>
                  <input
                    type='number'
                    className='video-dialog-input'
                    min={0}
                    max={Math.max(0, endTime - 0.1)}
                    step={0.1}
                    value={Number(startTime.toFixed(2))}
                    onChange={(e) => handleStartChange(e.target.value)}
                    disabled={isExtracting}
                  />
                </div>
                <div className='video-dialog-input-group'>
                  <span className='video-dialog-label'>END (S)</span>
                  <input
                    type='number'
                    className='video-dialog-input'
                    min={startTime + 0.1}
                    max={meta.duration}
                    step={0.1}
                    value={Number(endTime.toFixed(2))}
                    onChange={(e) => handleEndChange(e.target.value)}
                    disabled={isExtracting}
                  />
                </div>
              </div>
            </div>

            {/* Scale / Frame Dimensions */}
            <div className='video-dialog-section'>
              <p className='video-dialog-label'>
                <span>SCALE / DIMENSIONS</span>
                <span>TARGET: {outW} x {outH} px</span>
              </p>
              <div className='video-dialog-options'>
                {[
                  { label: '100%', val: 1 },
                  { label: '75%', val: 0.75 },
                  { label: '50%', val: 0.5 },
                  { label: '25%', val: 0.25 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type='button'
                    className={`video-dialog-pill-btn${scale === opt.val ? ' active' : ''}`}
                    onClick={() => setScale(opt.val)}
                    disabled={isExtracting}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Framerate (FPS) */}
            <div className='video-dialog-section'>
              <p className='video-dialog-label'>
                <span>FRAME RATE</span>
                <span>{fps} FPS ({(1000 / fps).toFixed(0)}ms DELAY)</span>
              </p>
              <div className='video-dialog-options'>
                {[10, 15, 20, 24, 30].map((f) => (
                  <button
                    key={f}
                    type='button'
                    className={`video-dialog-pill-btn${fps === f ? ' active' : ''}`}
                    onClick={() => setFps(f)}
                    disabled={isExtracting}
                  >
                    {f} FPS
                  </button>
                ))}
              </div>
            </div>

            {/* Live Summary */}
            <div className='video-dialog-summary'>
              <span>ESTIMATED: ~{estimatedFrames} FRAMES</span>
              <span>~{estimatedRamMb} MB RAM</span>
            </div>

            {isExtracting && (
              <div className='video-dialog-section'>
                <p className='video-dialog-label'>
                  <span>EXTRACTING FRAMES: {progress.current} / {progress.total}</span>
                  <span>{progress.percent}%</span>
                </p>
                <div className='video-dialog-progress-bar-wrap'>
                  <div
                    className='video-dialog-progress-bar-fill'
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            <div className='video-dialog-actions'>
              <button
                type='button'
                className='bv-option-btn'
                onClick={handleConfirm}
                disabled={isExtracting}
              >
                {isExtracting
                  ? `EXTRACTING (${progress.percent}%)...`
                  : `IMPORT (${estimatedFrames} FRAMES)`}
              </button>
              <button
                type='button'
                className='bv-option-btn danger-btn'
                onClick={onCancel}
                disabled={isExtracting}
              >
                CANCEL
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
