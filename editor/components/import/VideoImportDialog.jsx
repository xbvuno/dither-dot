import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Pause, Film } from 'lucide-react';
import {
  getVideoMetadata,
  extractFramesFromVideo,
  detectFpsFromVideoElement,
} from '../../utils/videoDecodeUtils';
import VideoRangeSlider from './VideoRangeSlider';
import Slider from '../ui/shared/Slider';
import OptionGroup from '../ui/shared/OptionGroup';
import './styles/VideoImportDialog.css';

function getFpsOptions(detectedFps) {
  const safeFps = Math.max(1, Math.min(120, Math.round(detectedFps || 24)));
  const standardPool = safeFps >= 24
    ? [10, 12, 15, 18, 20, 24, 25, 30, 48, 50, 60, 120]
    : [5, 8, 10, 12, 15, 18, 20];

  const candidates = standardPool.filter((f) => f < safeFps);
  candidates.push(safeFps);
  const unique = Array.from(new Set(candidates)).sort((a, b) => a - b);

  if (unique.length <= 5) return unique;

  const step = (unique.length - 1) / 4;
  const picked = [
    unique[0],
    unique[Math.round(step)],
    unique[Math.round(step * 2)],
    unique[Math.round(step * 3)],
    safeFps,
  ];
  return Array.from(new Set(picked)).sort((a, b) => a - b);
}

export default function VideoImportDialog({ file, name, onConfirm, onCancel }) {
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState(null);

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [scalePercent, setScalePercent] = useState(100);
  const [detectedFps, setDetectedFps] = useState(24);
  const [fps, setFps] = useState(24);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);

  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });

  const videoRef = useRef(null);

  // Load video metadata and initial container FPS
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
        setEndTime(Math.min(data.duration, 10)); // Default to first 10s max or full duration

        // Initial default scale: if resolution > 1280px in either dim, default to 50%
        if (data.width > 1280 || data.height > 1280) {
          setScalePercent(50);
        } else {
          setScalePercent(100);
        }

        const sourceFps = data.fps || 24;
        setDetectedFps(sourceFps);
        setFps(sourceFps);
      })
      .catch((err) => {
        if (active) setMetaError(err?.message || 'Failed to load video file.');
      })
      .finally(() => {
        if (active) setLoadingMeta(false);
      });

    return () => {
      active = false;
    };
  }, [file]);

  // Video element autoplay, muted, no controls, start position, and looping between [startTime, endTime]
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !meta) return;

    video.muted = true;
    video.volume = 0;
    video.currentTime = startTime;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }

    // Secondary refinement of FPS via requestVideoFrameCallback if needed
    let cancelled = false;
    detectFpsFromVideoElement(video).then((elementFps) => {
      if (!cancelled && elementFps && elementFps !== detectedFps) {
        setDetectedFps(elementFps);
        setFps((prev) => (prev > elementFps ? elementFps : prev));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [meta, detectedFps, startTime]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentPlayTime(video.currentTime);

    // Loop video within [startTime, endTime]
    if (video.currentTime >= endTime || video.currentTime < startTime - 0.08) {
      video.currentTime = startTime;
      video.play().catch(() => {});
    }
  }, [startTime, endTime]);

  const handleRangeChange = useCallback(({ startTime: newStart, endTime: newEnd }) => {
    setStartTime(newStart);
    setEndTime(newEnd);

    if (videoRef.current) {
      videoRef.current.currentTime = newStart;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, []);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime >= endTime || video.currentTime < startTime) {
        video.currentTime = startTime;
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  // Compute FPS options strictly <= detectedFps
  const fpsOptions = useMemo(() => getFpsOptions(detectedFps), [detectedFps]);

  // Keep fps clamped if detectedFps changes
  useEffect(() => {
    if (fps > detectedFps) {
      setFps(detectedFps);
    }
  }, [detectedFps, fps]);

  // Calculations that feed the final import specs
  const duration = Math.max(0.05, endTime - startTime);
  const estimatedFrames = Math.ceil(duration * fps); // NO 300 LIMIT!

  const scale = scalePercent / 100;
  const outW = meta ? Math.max(1, Math.round(meta.width * scale)) : 0;
  const outH = meta ? Math.max(1, Math.round(meta.height * scale)) : 0;
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
        maxFrames: Infinity, // NO LIMIT
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
    <div className="video-dialog-overlay" onClick={!isExtracting ? onCancel : undefined}>
      <div className="video-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="video-dialog-header">
          <div className="video-dialog-header-title">
            <Film size={16} />
            <h2 className="video-dialog-title">IMPORT VIDEO (FRAME SEQUENCE)</h2>
          </div>
          <button
            type="button"
            className="video-dialog-close-btn"
            onClick={onCancel}
            disabled={isExtracting}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {loadingMeta && (
          <div className="video-dialog-loading">
            <p className="bv-label">READING VIDEO METADATA & FRAMERATE...</p>
          </div>
        )}

        {metaError && (
          <div className="video-dialog-section">
            <p className="bv-label" style={{ color: 'var(--color-danger, #ff4444)' }}>
              {metaError}
            </p>
            <button type="button" className="bv-option-btn danger-btn" onClick={onCancel}>
              CLOSE
            </button>
          </div>
        )}

        {meta && !metaError && (
          <>
            {/* Video preview: Auto-play, hidden controls, muted, click to play/pause */}
            <div
              className="video-dialog-preview-wrap"
              onClick={togglePlayPause}
              title={isPlaying ? 'Click to pause' : 'Click to play'}
            >
              <video
                ref={videoRef}
                src={meta.url}
                muted
                autoPlay
                playsInline
                onTimeUpdate={handleTimeUpdate}
                className="video-dialog-preview"
              />
              <div className={`video-dialog-play-overlay${!isPlaying ? ' visible' : ''}`}>
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </div>
            </div>

            {/* Trimming: Dual-Handle Range Slider */}
            <div className="video-dialog-section">
              <div className="video-dialog-header-row">
                <span className="bv-label">RANGE (TRIM)</span>
                <span className="video-dialog-value-highlight">
                  {duration.toFixed(2)}s SELECTED
                  <span className="video-dialog-muted-text"> [TOTAL: {meta.duration.toFixed(2)}s]</span>
                </span>
              </div>
              <VideoRangeSlider
                duration={meta.duration}
                startTime={startTime}
                endTime={endTime}
                currentTime={currentPlayTime}
                onChange={handleRangeChange}
                disabled={isExtracting}
              />
            </div>

            {/* Scale / Frame Dimensions Slider */}
            <div className="video-dialog-section">
              <div className="video-dialog-header-row">
                <span className="bv-label">FRAME SCALE & RESOLUTION</span>
                <span className="video-dialog-value-highlight">
                  {outW} × {outH} PX ({scalePercent}%)
                  <span className="video-dialog-muted-text"> [ORIGINAL: {meta.width} × {meta.height}]</span>
                </span>
              </div>
              <Slider
                min={10}
                max={100}
                step={5}
                value={scalePercent}
                defaultValue={meta.width > 1280 || meta.height > 1280 ? 50 : 100}
                onChange={(val) => setScalePercent(val)}
                label="Scale"
                disabled={isExtracting}
              />
            </div>

            {/* Frame Rate (FPS) using OptionGroup */}
            <div className="video-dialog-section">
              <div className="video-dialog-header-row">
                <span className="bv-label">FRAME RATE</span>
                <span className="video-dialog-value-highlight">
                  {fps} FPS (~{Math.round(1000 / fps)}ms)
                  <span className="video-dialog-muted-text"> [SOURCE: {detectedFps} FPS]</span>
                </span>
              </div>
              <OptionGroup
                options={fpsOptions.map((f) => ({
                  value: f,
                  label: `${f} FPS`,
                  title: `${f} FPS (~${Math.round(1000 / f)}ms delay)`,
                }))}
                value={fps}
                onChange={(val) => setFps(Number(val))}
                disabled={isExtracting}
              />
            </div>

            {/* Live Specifications & Calculations Summary */}
            <div className="video-dialog-summary">
              <div className="video-dialog-summary-col">
                <span className="video-dialog-summary-label">FRAMES TO IMPORT</span>
                <span className="video-dialog-summary-value highlight">{estimatedFrames} FRAMES</span>
              </div>
              <div className="video-dialog-summary-col">
                <span className="video-dialog-summary-label">OUTPUT RESOLUTION</span>
                <span className="video-dialog-summary-value">{outW} × {outH} PX</span>
              </div>
              <div className="video-dialog-summary-col">
                <span className="video-dialog-summary-label">ESTIMATED RAM</span>
                <span className="video-dialog-summary-value">~{estimatedRamMb} MB</span>
              </div>
            </div>

            {/* Progress Bar during extraction */}
            {isExtracting && (
              <div className="video-dialog-section">
                <div className="video-dialog-header-row">
                  <span className="bv-label">
                    EXTRACTING FRAMES: {progress.current} / {progress.total}
                  </span>
                  <span className="video-dialog-value-highlight">{progress.percent}%</span>
                </div>
                <div className="video-dialog-progress-bar-wrap">
                  <div
                    className="video-dialog-progress-bar-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Dialog Actions */}
            <div className="video-dialog-actions">
              <button
                type="button"
                className="bv-option-btn active"
                onClick={handleConfirm}
                disabled={isExtracting}
              >
                {isExtracting
                  ? `EXTRACTING (${progress.percent}%)...`
                  : `IMPORT (${estimatedFrames} FRAMES)`}
              </button>
              <button
                type="button"
                className="bv-option-btn danger-btn"
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
