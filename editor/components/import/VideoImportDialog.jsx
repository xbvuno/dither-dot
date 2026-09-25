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
import WaveGridSpinner from '../ui/shared/WaveGridSpinner';
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
  const [isVideoReady, setIsVideoReady] = useState(false);

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [scalePercent, setScalePercent] = useState(100);
  const [detectedFps, setDetectedFps] = useState(24);
  const [fps, setFps] = useState(24);
  const [thumbnailsEnabled, setThumbnailsEnabled] = useState(false);
  const [crop, setCrop] = useState(null);
  const [dragCrop, setDragCrop] = useState(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);

  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });

  const videoRef = useRef(null);
  const dragStartRef = useRef(null);

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
        setCrop(null);

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

  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;

  // Video element autoplay, muted, no controls, start position, and background FPS detection
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !meta) return;

    setIsVideoReady(false);
    video.muted = true;
    video.volume = 0;
    video.currentTime = startTimeRef.current;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }

    let cancelled = false;

    if (!meta.hasContainerFps) {
      detectFpsFromVideoElement(video)
        .then((elementFps) => {
          if (!cancelled && elementFps) {
            setDetectedFps(elementFps);
            setFps((prev) => (prev > elementFps ? elementFps : prev));
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) {
            if (videoRef.current) {
              videoRef.current.currentTime = startTimeRef.current;
              videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
            }
            setIsVideoReady(true);
          }
        });
    } else {
      setIsVideoReady(true);
    }

    return () => {
      cancelled = true;
    };
  }, [meta]);

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

  const handleSeek = useCallback((time) => {
    setCurrentPlayTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
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

  const getPixelCoords = useCallback((e) => {
    const video = videoRef.current;
    if (!video || !meta) return null;
    const rect = video.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const naturalW = meta.width;
    const naturalH = meta.height;
    const videoAspect = naturalW / naturalH;
    const rectAspect = rect.width / rect.height;

    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (rectAspect > videoAspect) {
      renderW = rect.height * videoAspect;
      offsetX = (rect.width - renderW) / 2;
    } else {
      renderH = rect.width / videoAspect;
      offsetY = (rect.height - renderH) / 2;
    }

    const vLeft = rect.left + offsetX;
    const vTop = rect.top + offsetY;

    const normX = Math.max(0, Math.min(1, (e.clientX - vLeft) / renderW));
    const normY = Math.max(0, Math.min(1, (e.clientY - vTop) / renderH));

    return {
      pixelX: normX * naturalW,
      pixelY: normY * naturalH,
      clientX: e.clientX,
      clientY: e.clientY,
    };
  }, [meta]);

  const handlePointerDown = (e) => {
    if (!isVideoReady) return;
    if (e.button === 2) {
      // Right click resets crop
      e.preventDefault();
      setCrop(null);
      setDragCrop(null);
      dragStartRef.current = null;
      return;
    }
    if (e.button !== 0) return;

    const coords = getPixelCoords(e);
    if (!coords) return;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = coords;
    setDragCrop(null);
  };

  const handlePointerMove = (e) => {
    if (!dragStartRef.current || !meta) return;
    const curr = getPixelCoords(e);
    if (!curr) return;

    const start = dragStartRef.current;
    const dist = Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY);
    if (dist > 4) {
      const x = Math.max(0, Math.min(start.pixelX, curr.pixelX));
      const y = Math.max(0, Math.min(start.pixelY, curr.pixelY));
      const w = Math.min(meta.width - x, Math.abs(curr.pixelX - start.pixelX));
      const h = Math.min(meta.height - y, Math.abs(curr.pixelY - start.pixelY));
      setDragCrop({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
      });
    }
  };

  const handlePointerUp = (e) => {
    if (!dragStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const start = dragStartRef.current;
    const dist = Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY);

    if (dist > 6 && dragCrop && dragCrop.width >= 10 && dragCrop.height >= 10) {
      setCrop(dragCrop);
    } else if (dist <= 4 && e.button === 0) {
      togglePlayPause();
    }

    setDragCrop(null);
    dragStartRef.current = null;
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setCrop(null);
    setDragCrop(null);
    dragStartRef.current = null;
  };

  // Compute FPS options strictly <= detectedFps
  const fpsOptions = useMemo(() => getFpsOptions(detectedFps), [detectedFps]);

  useEffect(() => {
    if (fps > detectedFps) {
      setFps(detectedFps);
    }
  }, [detectedFps, fps]);

  // Calculations that feed the final import specs
  const duration = Math.max(0.05, endTime - startTime);
  const estimatedFrames = Math.ceil(duration * fps); // NO 300 LIMIT!

  const activeCrop = dragCrop || crop;
  const sourceW = activeCrop ? activeCrop.width : (meta ? meta.width : 0);
  const sourceH = activeCrop ? activeCrop.height : (meta ? meta.height : 0);

  const scale = scalePercent / 100;
  const outW = Math.max(1, Math.round(sourceW * scale));
  const outH = Math.max(1, Math.round(sourceH * scale));
  // Frame RAM is doubled to account for raw source frame + rendered dither cache buffer
  const frameBytes = estimatedFrames * outW * outH * 4 * 2;
  // If thumbnails are enabled: ~50x36 per frame (RGBA canvas + DataURL base64 string)
  const singleThumbnailBytes = estimatedFrames * 50 * 36 * 4 * 2;
  const thumbnailRamMb = Math.max(1, Math.round(singleThumbnailBytes / (1024 * 1024)));
  const thumbnailBytes = thumbnailsEnabled ? singleThumbnailBytes : 0;
  const estimatedRamMb = Math.round((frameBytes + thumbnailBytes) / (1024 * 1024));

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
        crop,
        onProgress: (p) => setProgress(p),
      });

      if (!result.frames || result.frames.length === 0) {
        throw new Error('No frames were extracted from the video.');
      }

      await onConfirm(result.frames, name, { thumbnailsEnabled });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Video frame extraction failed.');
      setIsExtracting(false);
    }
  };

  return createPortal(
    <div className="video-dialog-overlay" onClick={!isExtracting ? onCancel : undefined}>
      <div className="video-dialog-container" onClick={(e) => e.stopPropagation()}>
        {/* Warning banner: detached right above the popup */}
        {estimatedRamMb > 500 && (
          <div className="video-dialog-warning-banner">
            <span className="bv-label video-dialog-warning-text">
              WARNING: HEAVY IMPORTS MAY CAUSE THE TAB TO CRASH (OOM)
            </span>
          </div>
        )}

        <div className="video-dialog">
          {/* Header */}
          <div className="video-dialog-header">
            <div className="video-dialog-header-title">
              <Film size={16} />
              <h2 className="video-dialog-title">IMPORT VIDEO</h2>
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
            <p className="bv-label">READING VIDEO METADATA...</p>
          </div>
        )}

        {metaError && (
          <div className="bv-section">
            <p className="bv-label" style={{ color: 'var(--color-danger, #ff4444)' }}>
              {metaError}
            </p>
            <button type="button" className="bv-option-btn danger-btn" onClick={onCancel}>
              CLOSE
            </button>
          </div>
        )}

        {meta && !metaError && (
          <div className="video-dialog-body">
            {/* Video preview with interactive drag-to-crop */}
            <div
              className="video-dialog-preview-wrap"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={handleContextMenu}
              title={isVideoReady ? 'Drag to crop • Right-click to reset' : undefined}
            >
              {!isVideoReady && (
                <div className="video-dialog-preview-loader" aria-label="Loading video preview">
                  <WaveGridSpinner />
                </div>
              )}

              <div
                className="video-dialog-preview-inner"
                style={{ opacity: isVideoReady ? 1 : 0 }}
              >
                <video
                  ref={videoRef}
                  src={meta.url}
                  muted
                  autoPlay
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  className="video-dialog-preview"
                  draggable={false}
                />
                {activeCrop && meta && (
                  <div className="video-dialog-crop-overlay" aria-hidden="true">
                    {/* Shaded cropped areas in red matching aside */}
                    <div
                      className="video-dialog-crop-shade"
                      style={{ left: 0, right: 0, top: 0, height: `${(activeCrop.y / meta.height) * 100}%` }}
                    />
                    <div
                      className="video-dialog-crop-shade"
                      style={{
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: `${Math.max(0, (meta.height - (activeCrop.y + activeCrop.height)) / meta.height) * 100}%`,
                      }}
                    />
                    <div
                      className="video-dialog-crop-shade"
                      style={{
                        left: 0,
                        top: `${(activeCrop.y / meta.height) * 100}%`,
                        bottom: `${Math.max(0, (meta.height - (activeCrop.y + activeCrop.height)) / meta.height) * 100}%`,
                        width: `${(activeCrop.x / meta.width) * 100}%`,
                      }}
                    />
                    <div
                      className="video-dialog-crop-shade"
                      style={{
                        right: 0,
                        top: `${(activeCrop.y / meta.height) * 100}%`,
                        bottom: `${Math.max(0, (meta.height - (activeCrop.y + activeCrop.height)) / meta.height) * 100}%`,
                        width: `${Math.max(0, (meta.width - (activeCrop.x + activeCrop.width)) / meta.width) * 100}%`,
                      }}
                    />
                    <div
                      className="video-dialog-crop-box"
                      style={{
                        left: `${(activeCrop.x / meta.width) * 100}%`,
                        top: `${(activeCrop.y / meta.height) * 100}%`,
                        width: `${(activeCrop.width / meta.width) * 100}%`,
                        height: `${(activeCrop.height / meta.height) * 100}%`,
                      }}
                    />
                  </div>
                )}
                <div className={`video-dialog-play-overlay${!isPlaying ? ' visible' : ''}`}>
                  {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                </div>
              </div>
            </div>

            {/* Helper label explaining crop / reset */}
            <div className="video-dialog-crop-hint-row">
              <span className="bv-label video-dialog-crop-hint">
                DRAG TO CROP • RIGHT-CLICK TO RESET
              </span>
            </div>

            {/* Crop Section */}
            <div className="bv-section">
              <div className="bv-controls-row">
                <span className="bv-label">CROP</span>
                <span className="bv-label video-dialog-meta-val">
                  {sourceW} x {sourceH}
                </span>
              </div>
            </div>

            {/* Range / Trimming Section */}
            <div className="bv-section">
              <div className="bv-controls-row">
                <span className="bv-label">TRIM</span>
                <span className="bv-label video-dialog-meta-val">
                  {startTime.toFixed(2)}s - {endTime.toFixed(2)}s [{duration.toFixed(2)}s]
                </span>
              </div>
              <VideoRangeSlider
                duration={meta.duration}
                startTime={startTime}
                endTime={endTime}
                currentTime={currentPlayTime}
                onChange={handleRangeChange}
                onSeek={handleSeek}
                disabled={isExtracting}
              />
            </div>

            {/* Scale Section */}
            <div className="bv-section">
              <div className="bv-controls-row">
                <span className="bv-label">SCALE</span>
                <span className="bv-label video-dialog-meta-val">
                  {outW} x {outH} [{scalePercent}%]
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

            {/* Frame Rate Section */}
            <div className="bv-section">
              <div className="bv-controls-row">
                <span className="bv-label">FRAME RATE (FPS)</span>
                <span className="bv-label video-dialog-meta-val">
                  {fps} FPS
                </span>
              </div>
              <OptionGroup
                options={fpsOptions.map((f) => ({
                  value: f,
                  label: f === detectedFps ? `SOURCE [${detectedFps}]` : `${f}`,
                  title: `${f} FPS (~${Math.round(1000 / f)}ms delay)`,
                }))}
                value={fps}
                onChange={(val) => setFps(Number(val))}
                disabled={isExtracting}
              />
            </div>

            {/* Thumbnails Section */}
            <div className="bv-section">
              <div className="bv-controls-row">
                <span className="bv-label">THUMBNAILS</span>
                <span className="bv-label video-dialog-meta-val">
                  {thumbnailsEnabled ? `ENABLED (~${thumbnailRamMb} MB)` : 'DISABLED (SAVING RAM)'}
                </span>
              </div>
              <OptionGroup
                options={[
                  { value: 'disabled', label: 'DISABLED' },
                  { value: 'enabled', label: 'ENABLED' },
                ]}
                value={thumbnailsEnabled ? 'enabled' : 'disabled'}
                onChange={(val) => setThumbnailsEnabled(val === 'enabled')}
                disabled={isExtracting}
              />
            </div>

            {/* Specifications as standard aside rows */}
            <div className="bv-section">
              <div className="bv-controls-row">
                <span className="bv-label">FRAMES TO IMPORT</span>
                <span className="bv-label video-dialog-meta-val">{estimatedFrames} FRAMES</span>
              </div>
              <div className="bv-controls-row" style={{ marginTop: '0.45rem' }}>
                <span className="bv-label">ESTIMATED RAM</span>
                <span className="bv-label video-dialog-meta-val">~{estimatedRamMb} MB</span>
              </div>
            </div>

            {/* Progress Bar during extraction */}
            {isExtracting && (
              <div className="bv-section">
                <div className="bv-controls-row">
                  <span className="bv-label">
                    EXTRACTING FRAMES: {progress.current} / {progress.total}
                  </span>
                  <span className="bv-label video-dialog-meta-val">{progress.percent}%</span>
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
                className="bv-option-btn video-dialog-cancel-btn"
                onClick={onCancel}
                disabled={isExtracting}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="bv-option-btn active video-dialog-confirm-btn"
                onClick={handleConfirm}
                disabled={isExtracting}
              >
                {isExtracting
                  ? `EXTRACTING (${progress.percent}%)...`
                  : `IMPORT (${estimatedFrames} FRAMES)`}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}
