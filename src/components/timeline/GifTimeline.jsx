import { useEffect, useMemo, useRef } from 'react';
import "./styles/GifTimeline.css";
import { Check, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import useGifStore from '../../stores/media/gifStore';

const THUMB_WIDTH = 50;
const THUMB_HEIGHT = 36;
const FRAME_CELL_WIDTH = 56;
const FRAME_CELL_HEIGHT = 44;
const TIMELINE_HEIGHT_STORAGE_KEY = 'dither-dot:gif-timeline-height';

function toThumbnailDataUrl(frame) {
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = frame.width;
  frameCanvas.height = frame.height;

  const frameCtx = frameCanvas.getContext('2d');
  if (!frameCtx) return '';

  frameCtx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = THUMB_WIDTH;
  thumbCanvas.height = THUMB_HEIGHT;

  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) return '';

  thumbCtx.imageSmoothingEnabled = false;
  thumbCtx.clearRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  const scale = Math.max(THUMB_WIDTH / frame.width, THUMB_HEIGHT / frame.height);
  const drawWidth = Math.max(1, Math.round(frame.width * scale));
  const drawHeight = Math.max(1, Math.round(frame.height * scale));
  const offsetX = Math.floor((THUMB_WIDTH - drawWidth) / 2);
  const offsetY = Math.floor((THUMB_HEIGHT - drawHeight) / 2);

  thumbCtx.drawImage(frameCanvas, offsetX, offsetY, drawWidth, drawHeight);
  return thumbCanvas.toDataURL('image/png');
}

export default function GifTimeline() {
  const timelineRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const timelineContentRef = useRef(null);
  const controlsRef = useRef(null);
  const stripRef = useRef(null);
  const frames = useGifStore((s) => s.frames);
  const currentFrameIndex = useGifStore((s) => s.currentFrameIndex);
  const playing = useGifStore((s) => s.playing);
  const playbackDelay = useGifStore((s) => s.playbackDelay);
  const frameStates = useGifStore((s) => s.frameStates);
  const renderedThumbnails = useGifStore((s) => s.renderedThumbnails);
  const decoding = useGifStore((s) => s.decoding);

  const setCurrentFrameIndex = useGifStore((s) => s.setCurrentFrameIndex);
  const setPlaying = useGifStore((s) => s.setPlaying);
  const setPlaybackDelay = useGifStore((s) => s.setPlaybackDelay);

  useEffect(() => {
    const shell = timelineRef.current;
    const handle = resizeHandleRef.current;
    const timeline = timelineContentRef.current;
    const controls = controlsRef.current;
    const strip = stripRef.current;
    const root = document.getElementById('root');
    if (!shell || !handle || !timeline || !controls || !strip) return;

    const toPx = (value, fallback = 0) => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const getMetrics = () => {
      const frameWidth = FRAME_CELL_WIDTH;
      const frameHeight = FRAME_CELL_HEIGHT;

      const stripStyle = window.getComputedStyle(strip);
      const stripGap = toPx(stripStyle.getPropertyValue('gap'), 6);
      const stripPaddingTop = toPx(stripStyle.getPropertyValue('padding-top'));
      const stripPaddingBottom = toPx(stripStyle.getPropertyValue('padding-bottom'));
      const timelineWidth = Math.max(1, Math.floor(timeline.getBoundingClientRect().width || timeline.clientWidth || 1));
      const stripWidth = Math.max(
        1,
        Math.floor(strip.getBoundingClientRect().width || strip.clientWidth || (timelineWidth - 12))
      );
      const columnsPerRow = Math.max(1, Math.floor((stripWidth + stripGap) / (frameWidth + stripGap)));
      const rowsToFit = Math.max(1, Math.ceil(frames.length / columnsPerRow));
      const horizontalScrollbar = Math.max(0, strip.offsetHeight - strip.clientHeight);
      const scrollbarReserve = Math.max(8, horizontalScrollbar);

      const timelineStyle = window.getComputedStyle(timeline);
      const controlsHeight = Math.ceil(controls.getBoundingClientRect().height);
      const contentGap = toPx(timelineStyle.getPropertyValue('gap'), 7);
      const paddingTop = toPx(timelineStyle.getPropertyValue('padding-top'));
      const paddingBottom = toPx(timelineStyle.getPropertyValue('padding-bottom'));
      const borderTop = toPx(timelineStyle.getPropertyValue('border-top-width'));
      const borderBottom = toPx(timelineStyle.getPropertyValue('border-bottom-width'));

      const staticHeight = controlsHeight + contentGap + paddingTop + paddingBottom + borderTop + borderBottom;
      const stripBaseHeight = stripPaddingTop + stripPaddingBottom + scrollbarReserve;
      const minHeight = Math.ceil(staticHeight + stripBaseHeight + frameHeight);
      const maxHeight = Math.ceil(
        staticHeight +
        stripBaseHeight +
        (rowsToFit * frameHeight) +
        ((rowsToFit - 1) * stripGap)
      );

      return {
        minHeight,
        maxHeight,
        columnsPerRow,
        rowsToFit,
        stripGap,
        frameHeight,
        staticHeight,
      };
    };



    const applyRowsForHeight = (height, metrics) => {
      const available = Math.max(0, height - metrics.staticHeight);
      const rawRows = Math.floor((available + metrics.stripGap) / (metrics.frameHeight + metrics.stripGap));
      const rows = Math.max(1, Math.min(metrics.rowsToFit, rawRows));
      const minVisibleColumns = Math.max(1, Math.min(metrics.columnsPerRow, frames.length));
      const columns = Math.max(minVisibleColumns, Math.ceil(frames.length / rows));
      strip.style.setProperty('--gif-frame-rows', String(rows));
      strip.style.setProperty('--gif-frame-columns', String(columns));
    };

    const clampHeight = (value, metrics) => Math.min(metrics.maxHeight, Math.max(metrics.minHeight, value));

    const syncBounds = () => {
      const metrics = getMetrics();
      shell.style.minHeight = metrics.minHeight + 'px';
      shell.style.maxHeight = metrics.maxHeight + 'px';

      const currentHeight = shell.getBoundingClientRect().height;
      const clampedHeight = clampHeight(currentHeight, metrics);
      shell.style.height = clampedHeight + 'px';
      applyRowsForHeight(clampedHeight, metrics);
      return metrics;
    };

    let latestMetrics = syncBounds();
    let afterLayoutFrameId = window.requestAnimationFrame(() => {
      latestMetrics = syncBounds();
    });

    try {
      const storedHeight = Number(window.localStorage.getItem(TIMELINE_HEIGHT_STORAGE_KEY));
      if (Number.isFinite(storedHeight) && storedHeight > 0) {
        const clampedHeight = clampHeight(storedHeight, latestMetrics);
        shell.style.height = clampedHeight + 'px';
        applyRowsForHeight(clampedHeight, latestMetrics);
      }
    } catch {
      // localStorage can be unavailable in hardened browser contexts.
    }

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    let pendingHeight = null;
    let frameId = null;

    const flushHeight = () => {
      frameId = null;
      if (pendingHeight == null) return;
      shell.style.height = pendingHeight + 'px';
      applyRowsForHeight(pendingHeight, latestMetrics);
      pendingHeight = null;
    };

    const startResize = (e) => {
      e.preventDefault();
      isResizing = true;
      startY = e.clientY;
      startHeight = shell.getBoundingClientRect().height;
      handle.classList.add('dragging');
      root?.classList.add('is-resizing-timeline');
    };

    const stopResize = () => {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove('dragging');
      root?.classList.remove('is-resizing-timeline');

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }

      if (pendingHeight != null) {
        shell.style.height = pendingHeight + 'px';
        pendingHeight = null;
      }

      try {
        const currentHeight = shell.getBoundingClientRect().height;
        window.localStorage.setItem(TIMELINE_HEIGHT_STORAGE_KEY, String(clampHeight(currentHeight, latestMetrics)));
      } catch {
        // Ignore storage write failures.
      }
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const deltaY = startY - e.clientY;
      let newHeight = startHeight + deltaY;
      latestMetrics = getMetrics();
      newHeight = clampHeight(newHeight, latestMetrics);
      pendingHeight = newHeight;

      if (frameId === null) {
        frameId = window.requestAnimationFrame(flushHeight);
      }
    };

    handle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);

    const onWindowResize = () => {
      latestMetrics = syncBounds();
    };

    window.addEventListener('resize', onWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      latestMetrics = syncBounds();
    });

    resizeObserver.observe(shell);
    resizeObserver.observe(strip);

    return () => {
      handle.removeEventListener('mousedown', startResize);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stopResize);
      window.removeEventListener('resize', onWindowResize);
      resizeObserver.disconnect();
      if (afterLayoutFrameId !== null) {
        window.cancelAnimationFrame(afterLayoutFrameId);
        afterLayoutFrameId = null;
      }
      stopResize();
      root?.classList.remove('is-resizing-timeline');
    };
  }, [frames.length]);

  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    if (frameStates[currentFrameIndex] !== 'done') return;

    const nextIndex = (currentFrameIndex + 1) % frames.length;
    if (!frames[nextIndex]) {
      // Pause playing if the next frame hasn't loaded yet
      setPlaying(false);
      return;
    }

    const activeFrameDelay = frames[currentFrameIndex]?.delay;
    const delay = Math.max(20, Number(activeFrameDelay) || 100);
    const timer = window.setTimeout(() => {
      setCurrentFrameIndex(nextIndex);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentFrameIndex, frameStates, frames, playing, setCurrentFrameIndex, setPlaying]);

  useEffect(() => {
    const activeFrameDelay = frames[currentFrameIndex]?.delay;
    if (!activeFrameDelay) return;
    const normalized = Math.max(20, Number(activeFrameDelay) || 100);
    if (Number(playbackDelay) === normalized) return;
    setPlaybackDelay(normalized);
  }, [currentFrameIndex, frames, playbackDelay, setPlaybackDelay]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const activeFrame = strip.querySelector('.gif-frame-btn.active');
    if (!activeFrame) return;

    const frameId = window.requestAnimationFrame(() => {
      const frameCenter = activeFrame.offsetLeft + (activeFrame.offsetWidth / 2);
      const targetLeft = frameCenter - (strip.clientWidth / 2);
      const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft));

      if (Math.abs(strip.scrollLeft - nextScrollLeft) < 1) return;
      strip.scrollTo({ left: nextScrollLeft, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentFrameIndex, playing, frames.length, frameStates]);

  const rawThumbnails = useMemo(() => {
    if (frames.length <= 1) return [];
    return frames.map((frame) => frame ? toThumbnailDataUrl(frame) : '');
  }, [frames]);

  if (frames.length <= 1 && !decoding) return null;

  const totalFrames = frames.length;
  const stopDisabled = !playing && currentFrameIndex === 0;

  const goToPreviousFrame = () => {
    const previousIndex = (currentFrameIndex - 1 + totalFrames) % totalFrames;
    setPlaying(false);
    setCurrentFrameIndex(previousIndex);
  };

  const goToNextFrame = () => {
    const nextIndex = (currentFrameIndex + 1) % totalFrames;
    setPlaying(false);
    setCurrentFrameIndex(nextIndex);
  };

  const stopAndReset = () => {
    if (stopDisabled) return;
    setPlaying(false);
    setCurrentFrameIndex(0);
  };

  return (
    <div ref={timelineRef} className='gif-timeline-shell'>
      <section ref={timelineContentRef} className='gif-timeline' aria-label='GIF TIMELINE'>
        <div
          ref={resizeHandleRef}
          className='gif-timeline-resize-handle'
          role='separator'
          aria-label='Resize GIF timeline'
        />
        <div ref={controlsRef} className='gif-timeline-controls'>
          <button
            type='button'
            className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
            onClick={goToPreviousFrame}
            aria-label='Previous frame'
            title='PREVIOUS FRAME'
            disabled={decoding}
          >
            <SkipBack size={14} strokeWidth={2} />
          </button>

          <button
            type='button'
            className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
            onClick={stopAndReset}
            aria-label='Stop and go to first frame'
            title='STOP AND RESET'
            disabled={decoding || stopDisabled}
          >
            <Square size={12} strokeWidth={2.4} />
          </button>

          <button
            type='button'
            className={`bv-option-btn gif-timeline-btn gif-timeline-icon-btn${playing ? ' active' : ''}`}
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause GIF playback' : 'Play GIF playback'}
            title={playing ? 'PAUSE' : 'PLAY'}
            disabled={decoding}
          >
            {playing ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
          </button>

          <button
            type='button'
            className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
            onClick={goToNextFrame}
            aria-label='Next frame'
            title='NEXT FRAME'
            disabled={decoding}
          >
            <SkipForward size={14} strokeWidth={2} />
          </button>

          <span className='gif-timeline-label gif-frame-counter'>
            {decoding ? 'DECODING...' : `${currentFrameIndex + 1} / ${totalFrames} | R: ${totalFrames > 0 ? Math.round((frameStates.filter((s) => s === 'done').length / totalFrames) * 100) : 0}%`}
          </span>

          <label className={`gif-delay-wrap gif-delay-wrap--right${decoding ? ' disabled' : ''}`}>
            <span className='gif-timeline-label'>DELAY (MS)</span>
            <input
              className='gif-delay-input'
              type='number'
              min='20'
              max='5000'
              step='10'
              value={playbackDelay}
              onChange={(event) => setPlaybackDelay(event.target.value)}
              disabled={decoding}
            />
          </label>
        </div>

        {decoding ? (
          <div className="gif-decoding-placeholder">
            <span className="gif-decoding-label">DECODING GIF...</span>
          </div>
        ) : (
          <div ref={stripRef} className='gif-frame-strip'>
            {frames.map((_, index) => {
              const isLoaded = Boolean(frames[index]);
              const state = frameStates[index] || 'pending';
              const thumb = renderedThumbnails[index] || rawThumbnails[index] || '';
              const isActive = index === currentFrameIndex;
              const stateLabel = state === 'pending' ? 'P' : state === 'done' ? 'DONE' : 'R';

              return (
                <button
                  key={`gif-frame-${index}`}
                  type='button'
                  className={`gif-frame-btn${isActive ? ' active' : ''}${state === 'pending' ? ' gif-frame-btn--pending' : ''}${!isLoaded ? ' gif-frame-btn--unloaded' : ''}`}
                  disabled={!isLoaded}
                  onClick={() => {
                    if (!isLoaded) return;
                    setPlaying(false);
                    setCurrentFrameIndex(index);
                  }}
                  title={`FRAME ${index + 1}`}
                  aria-label={`FRAME ${index + 1}`}
                >
                  {thumb && <img src={thumb} alt='' draggable={false} />}
                  <span className='gif-frame-index'>{index + 1}</span>
                  <span className={`gif-frame-state gif-frame-state--${state}`} aria-label={stateLabel}>
                    {state === 'done' ? <Check size={9} strokeWidth={3} /> : state === 'pending' ? 'P' : 'R'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
