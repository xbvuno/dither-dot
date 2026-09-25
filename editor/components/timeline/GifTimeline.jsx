import { useCallback, useEffect, useRef, useState } from 'react';
import "./styles/GifTimeline.css";
import {
  Check,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  ZoomIn,
  ZoomOut,
  Copy,
  Trash2,
  Scissors,
  Image as ImageIcon,
  Download,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import useGifStore from '../../stores/media/gifStore';
import useViewStore from '../../stores/ui/viewStore';

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
  const lastClickedIndexRef = useRef(0);
  const isHoveredRef = useRef(false);
  const zoomInBtnRef = useRef(null);
  const zoomOutBtnRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [dragAnchor, setDragAnchor] = useState(null);
  const dragSelectRef = useRef(null);
  const justFinishedDragRef = useRef(false);
  const autoScrollRafRef = useRef(null);
  const autoScrollSpeedRef = useRef(0);
  const lastClientXRef = useRef(0);

  const frames = useGifStore((s) => s.frames);
  const currentFrameIndex = useGifStore((s) => s.currentFrameIndex);
  const selectedFrameIndices = useGifStore((s) => s.selectedFrameIndices) || [0];
  const zoom = useGifStore((s) => s.zoom) || 1;
  const playing = useGifStore((s) => s.playing);
  const playbackDelay = useGifStore((s) => s.playbackDelay);
  const frameStates = useGifStore((s) => s.frameStates);
  const renderedThumbnails = useGifStore((s) => s.renderedThumbnails);
  const gifThumbnails = useViewStore((s) => s.gifThumbnails);
  const thumbnailsEnabled = useGifStore((s) => s.thumbnailsEnabled) !== false && gifThumbnails !== false;
  const decoding = useGifStore((s) => s.decoding);
  const clipboardFrames = useGifStore((s) => s.clipboardFrames) || [];

  const setCurrentFrameIndex = useGifStore((s) => s.setCurrentFrameIndex);
  const setSelectedFrameIndices = useGifStore((s) => s.setSelectedFrameIndices);
  const setZoom = useGifStore((s) => s.setZoom);
  const setPlaying = useGifStore((s) => s.setPlaying);
  const setPlaybackDelay = useGifStore((s) => s.setPlaybackDelay);
  const duplicateFrames = useGifStore((s) => s.duplicateFrames);
  const deleteFrames = useGifStore((s) => s.deleteFrames);
  const copyFrames = useGifStore((s) => s.copyFrames);
  const cutFrames = useGifStore((s) => s.cutFrames);
  const pasteFrames = useGifStore((s) => s.pasteFrames);

  // Compute delay representation for selected frames:
  // If multiple frames selected and all share the same delay, show it;
  // if they have different delays, show '~'.
  const targetIndices = selectedFrameIndices && selectedFrameIndices.length > 0
    ? selectedFrameIndices
    : [currentFrameIndex];

  const delays = targetIndices
    .map((idx) => frames[idx]?.delay)
    .filter((d) => d !== undefined && d !== null);

  const allDelaysSame = delays.length > 0 && delays.every((d) => d === delays[0]);
  const canonicalDelay = allDelaysSame ? delays[0] : (delays.length === 0 ? playbackDelay : '~');

  const [editingDelay, setEditingDelay] = useState(null);
  const displayDelayValue = editingDelay !== null ? editingDelay : String(canonicalDelay);

  const handleDelayChange = (e) => {
    const val = e.target.value;
    setEditingDelay(val);
    const num = parseInt(val, 10);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      setPlaybackDelay(num);
    }
  };

  const handleDelayBlur = () => {
    const num = parseInt(editingDelay, 10);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      setPlaybackDelay(num);
    }
    setEditingDelay(null);
  };

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
      const currentZoom = useGifStore.getState().zoom || 1;
      const frameWidth = Math.max(14, Math.round(FRAME_CELL_WIDTH * currentZoom));
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
      shell.style.maxHeight = metrics.minHeight + 'px';
      shell.style.height = metrics.minHeight + 'px';
      applyRowsForHeight(metrics.minHeight, metrics);
      return metrics;
    };

    let latestMetrics = syncBounds();
    let afterLayoutFrameId = window.requestAnimationFrame(() => {
      latestMetrics = syncBounds();
    });

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
  }, [frames.length, zoom]);

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
    if (!playing) return;
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
  }, [currentFrameIndex, playing]);

  const [rawThumbnails, setRawThumbnails] = useState({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRawThumbnails({});
    if (!thumbnailsEnabled || frames.length <= 1) return;

    let active = true;
    let index = 0;

    const generateNext = () => {
      if (!active || index >= frames.length) return;

      const frame = frames[index];
      if (frame) {
        const url = toThumbnailDataUrl(frame);
        setRawThumbnails((prev) => ({ ...prev, [index]: url }));
      }

      index += 1;
      setTimeout(generateNext, 0);
    };

    generateNext();

    return () => {
      active = false;
    };
  }, [frames, thumbnailsEnabled]);

  useEffect(() => {
    const onWheel = (e) => {
      const shell = timelineRef.current;
      if (!shell) return;

      const rect = shell.getBoundingClientRect();
      const inBounds = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
      const isOverTimeline = isHoveredRef.current || inBounds || shell.contains(e.target);
      if (!isOverTimeline) return;

      // Zoom only with Shift key
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();

        const rawDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (rawDelta === 0) return;

        if (rawDelta < 0) {
          // Wheel Up: simulate click on zoom in button
          if (zoomInBtnRef.current && !zoomInBtnRef.current.disabled) {
            zoomInBtnRef.current.click();
          } else {
            const currentZoom = useGifStore.getState().zoom ?? 1;
            if (currentZoom < 1.0) {
              useGifStore.getState().setZoom(Math.round((currentZoom + 0.05) * 100) / 100);
            }
          }
        } else {
          // Wheel Down: simulate click on zoom out button
          if (zoomOutBtnRef.current && !zoomOutBtnRef.current.disabled) {
            zoomOutBtnRef.current.click();
          } else {
            const currentZoom = useGifStore.getState().zoom ?? 1;
            if (currentZoom > 0.25) {
              useGifStore.getState().setZoom(Math.round((currentZoom - 0.05) * 100) / 100);
            }
          }
        }
        return;
      }

      // If user scrolls vertically over horizontal strip without modifiers -> scroll horizontally
      const strip = stripRef.current;
      if (strip && (strip.contains(e.target) || e.target === strip)) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
          e.preventDefault();
          strip.scrollLeft += e.deltaY;
        }
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };

    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

      const state = useGifStore.getState();
      const totalFrames = state.frames.length;
      if (totalFrames === 0) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // ArrowLeft: frame indietro
      if (e.key === 'ArrowLeft' && !isCtrlOrCmd && !e.altKey) {
        e.preventDefault();
        const prevIdx = (state.currentFrameIndex - 1 + totalFrames) % totalFrames;
        state.setPlaying(false);
        state.setCurrentFrameIndex(prevIdx);
        state.setSelectedFrameIndices([prevIdx]);
        return;
      }

      // ArrowRight: frame avanti
      if (e.key === 'ArrowRight' && !isCtrlOrCmd && !e.altKey) {
        e.preventDefault();
        const nextIdx = (state.currentFrameIndex + 1) % totalFrames;
        state.setPlaying(false);
        state.setCurrentFrameIndex(nextIdx);
        state.setSelectedFrameIndices([nextIdx]);
        return;
      }

      // Ctrl + A: seleziona tutti i frame
      if (isCtrlOrCmd && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const allIndices = state.frames.map((_, i) => i);
        state.setSelectedFrameIndices(allIndices);
        return;
      }

      // Del / Backspace: cancella i frame selezionati
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.frames.length > 1 && state.selectedFrameIndices?.length > 0) {
          e.preventDefault();
          state.deleteFrames(state.selectedFrameIndices);
        }
        return;
      }

      // Ctrl + C: copia i frame selezionati
      if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C')) {
        const targets = state.selectedFrameIndices?.length > 0 ? state.selectedFrameIndices : [state.currentFrameIndex];
        e.preventDefault();
        state.copyFrames(targets);
        return;
      }

      // Ctrl + V: incolla i frame next
      if (isCtrlOrCmd && (e.key === 'v' || e.key === 'V')) {
        if (state.clipboardFrames && state.clipboardFrames.length > 0) {
          e.preventDefault();
          state.pasteFrames(state.currentFrameIndex, 'after');
        }
        return;
      }

      // Ctrl + D: duplica i frame selezionati
      if (isCtrlOrCmd && (e.key === 'd' || e.key === 'D')) {
        const targets = state.selectedFrameIndices?.length > 0 ? state.selectedFrameIndices : [state.currentFrameIndex];
        e.preventDefault();
        state.duplicateFrames(targets);
        return;
      }

      // Escape: deseleziona tutti i frame
      if (e.key === 'Escape') {
        e.preventDefault();
        state.setSelectedFrameIndices([]);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCopyImage = async (targetIndex) => {
    const frame = frames[targetIndex];
    if (!frame || !frame.pixels) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
        } catch (err) {
          console.error('Failed to copy frame image to clipboard:', err);
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAs = (targetIndices) => {
    const isMultiple = targetIndices.length > 1;
    targetIndices.forEach((idx, i) => {
      const frame = frames[idx];
      if (!frame || !frame.pixels) return;
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
      const filename = isMultiple ? `frame_${i}.png` : `frame_${idx + 1}.png`;
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    autoScrollSpeedRef.current = 0;
  }, []);

  const getFrameIndexFromClientX = useCallback((clientX) => {
    const strip = stripRef.current;
    if (!strip) return null;
    const buttons = strip.querySelectorAll('.gif-frame-btn');
    const count = buttons.length;
    if (count === 0) return null;

    const firstRect = buttons[0].getBoundingClientRect();
    if (clientX <= firstRect.left) return 0;

    const lastRect = buttons[count - 1].getBoundingClientRect();
    if (clientX >= lastRect.right) return count - 1;

    for (let i = 0; i < count; i += 1) {
      const rect = buttons[i].getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        return i;
      }
      if (i < count - 1) {
        const nextRect = buttons[i + 1].getBoundingClientRect();
        if (clientX > rect.right && clientX < nextRect.left) {
          return (clientX - rect.right <= nextRect.left - clientX) ? i : (i + 1);
        }
      }
    }
    return null;
  }, []);

  const updateDragSelection = useCallback((clientX) => {
    if (!dragSelectRef.current || !dragSelectRef.current.active) return;
    const targetIndex = getFrameIndexFromClientX(clientX);
    if (targetIndex !== null) {
      const start = Math.min(dragSelectRef.current.startIndex, targetIndex);
      const end = Math.max(dragSelectRef.current.startIndex, targetIndex);
      const range = [];
      for (let i = start; i <= end; i += 1) {
        range.push(i);
      }
      useGifStore.getState().setSelectedFrameIndices(range);
      lastClickedIndexRef.current = targetIndex;
    }
  }, [getFrameIndexFromClientX]);

  const updateAutoScrollSpeed = useCallback((clientX) => {
    const strip = stripRef.current;
    if (!strip) {
      autoScrollSpeedRef.current = 0;
      return;
    }
    const rect = strip.getBoundingClientRect();
    const edgeThreshold = 36;
    if (clientX > rect.right - edgeThreshold) {
      const factor = Math.min(1, Math.max(0, (clientX - (rect.right - edgeThreshold)) / edgeThreshold));
      autoScrollSpeedRef.current = Math.max(3, Math.round(factor * 16));
    } else if (clientX < rect.left + edgeThreshold) {
      const factor = Math.min(1, Math.max(0, ((rect.left + edgeThreshold) - clientX) / edgeThreshold));
      autoScrollSpeedRef.current = -Math.max(3, Math.round(factor * 16));
    } else {
      autoScrollSpeedRef.current = 0;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    stopAutoScroll();
    const tick = () => {
      if (!dragSelectRef.current || !dragSelectRef.current.active) {
        stopAutoScroll();
        return;
      }
      const strip = stripRef.current;
      if (strip && autoScrollSpeedRef.current !== 0) {
        strip.scrollLeft += autoScrollSpeedRef.current;
        updateDragSelection(lastClientXRef.current);
      }
      autoScrollRafRef.current = window.requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = window.requestAnimationFrame(tick);
  }, [stopAutoScroll, updateDragSelection]);

  const handleFramePointerDown = (event, index) => {
    if (event.button !== 0 || !frames[index]) return;

    dragSelectRef.current = {
      active: false,
      startIndex: index,
      startX: event.clientX,
      startY: event.clientY,
    };
    lastClientXRef.current = event.clientX;
    setDragAnchor(index);
  };

  useEffect(() => {
    if (dragAnchor === null) return;

    const onPointerMove = (e) => {
      if (!dragSelectRef.current) return;
      lastClientXRef.current = e.clientX;

      if (!dragSelectRef.current.active) {
        const dx = e.clientX - dragSelectRef.current.startX;
        const dy = e.clientY - dragSelectRef.current.startY;
        if (Math.hypot(dx, dy) > 4) {
          dragSelectRef.current.active = true;
          useGifStore.getState().setPlaying(false);
          useGifStore.getState().setCurrentFrameIndex(dragSelectRef.current.startIndex);
          startAutoScroll();
        }
      }

      if (dragSelectRef.current.active) {
        e.preventDefault();
        updateAutoScrollSpeed(e.clientX);
        updateDragSelection(e.clientX);
      }
    };

    const onPointerUp = () => {
      if (dragSelectRef.current?.active) {
        justFinishedDragRef.current = true;
        window.setTimeout(() => {
          justFinishedDragRef.current = false;
        }, 80);
      }

      dragSelectRef.current = null;
      stopAutoScroll();
      setDragAnchor(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      stopAutoScroll();
    };
  }, [dragAnchor, startAutoScroll, stopAutoScroll, updateAutoScrollSpeed, updateDragSelection]);

  const handleFrameClick = (event, index) => {
    if (!frames[index]) return;
    event.stopPropagation();
    if (justFinishedDragRef.current) {
      justFinishedDragRef.current = false;
      return;
    }
    setPlaying(false);

    if (event.shiftKey) {
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      const range = [];
      for (let i = start; i <= end; i += 1) {
        range.push(i);
      }
      setSelectedFrameIndices(range);
    } else if (event.ctrlKey || event.metaKey) {
      const currentSelected = new Set(selectedFrameIndices);
      if (currentSelected.has(index)) {
        if (currentSelected.size > 1) {
          currentSelected.delete(index);
          setSelectedFrameIndices(Array.from(currentSelected));
        }
      } else {
        currentSelected.add(index);
        setSelectedFrameIndices(Array.from(currentSelected));
      }
      lastClickedIndexRef.current = index;
    } else {
      setSelectedFrameIndices([index]);
      setCurrentFrameIndex(index);
      lastClickedIndexRef.current = index;
    }
  };

  const handleTimelineBackgroundPointerDown = (e) => {
    if (e.button !== 0) return;

    // Ignore clicks on horizontal scrollbar
    if (stripRef.current && (e.target === stripRef.current || stripRef.current.contains(e.target))) {
      const rect = stripRef.current.getBoundingClientRect();
      if (e.clientY >= rect.top + stripRef.current.clientHeight) {
        return;
      }
    }

    const interactiveTarget = e.target.closest(
      'button, input, select, textarea, label, a, .gif-frame-btn, .gif-context-menu, .gif-timeline-resize-handle'
    );
    if (!interactiveTarget) {
      setSelectedFrameIndices([]);
    }
  };

  const handleFrameContextMenu = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    let targets = selectedFrameIndices;
    if (!targets.includes(index)) {
      targets = [index];
      setSelectedFrameIndices([index]);
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      index,
      indices: targets,
    });
  };

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
    <div
      ref={timelineRef}
      className={`gif-timeline-shell${decoding ? ' gif-timeline-shell--decoding' : ''}`}
      onMouseEnter={() => { isHoveredRef.current = true; }}
      onMouseLeave={() => { isHoveredRef.current = false; }}
      onPointerDown={handleTimelineBackgroundPointerDown}
    >
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

          <span className={`gif-timeline-label gif-frame-counter${decoding ? ' gif-decoding-label' : ''}`}>
            {decoding ? 'DECODING...' : `${currentFrameIndex + 1} / ${totalFrames} | R: ${totalFrames > 0 ? Math.round((frameStates.filter((s) => s === 'done').length / totalFrames) * 100) : 0}%`}
          </span>

          <span className='gif-timeline-divider' aria-hidden='true'>|</span>

          <label htmlFor='gif-playback-delay' className={`gif-delay-wrap${decoding ? ' disabled' : ''}`}>
            <span className='gif-timeline-label gif-delay-label-full'>DELAY (MS)</span>
            <span className='gif-timeline-label gif-delay-label-short gif-mobile-only'>MS</span>
            <input
              className='gif-delay-input'
              type='text'
              inputMode='numeric'
              name='playbackDelay'
              id='gif-playback-delay'
              value={displayDelayValue}
              onFocus={() => setEditingDelay(displayDelayValue === '~' ? '' : displayDelayValue)}
              onChange={handleDelayChange}
              onBlur={handleDelayBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              disabled={decoding}
              aria-label='Playback Delay (MS)'
            />
          </label>

          <div className='gif-zoom-controls'>
            <span className='gif-timeline-label gif-selected-count'>
              {selectedFrameIndices.length} SELECTED
            </span>
            <span className='gif-timeline-divider' aria-hidden='true'>|</span>
            <span className='gif-timeline-label gif-zoom-label'>{Math.round(zoom * 100)}%</span>
            <button
              ref={zoomOutBtnRef}
              type='button'
              className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
              onClick={() => setZoom(zoom - 0.05)}
              aria-label='Zoom out frames'
              title='ZOOM OUT (SHIFT + WHEEL DOWN)'
              disabled={decoding || zoom <= 0.25}
            >
              <ZoomOut size={13} strokeWidth={2} />
            </button>
            <button
              ref={zoomInBtnRef}
              type='button'
              className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
              onClick={() => setZoom(zoom + 0.05)}
              aria-label='Zoom in frames'
              title='ZOOM IN (SHIFT + WHEEL UP)'
              disabled={decoding || zoom >= 1.0}
            >
              <ZoomIn size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        {decoding ? null : (
          <div
            ref={stripRef}
            className='gif-frame-strip'
            style={{
              '--gif-frame-width': `${Math.max(14, Math.round(56 * zoom))}px`,
              '--gif-frame-height': '44px',
            }}
          >
            {frames.map((_, index) => {
              const isLoaded = Boolean(frames[index]);
              const state = frameStates[index] || 'pending';
              const thumb = thumbnailsEnabled ? (renderedThumbnails[index] || rawThumbnails[index] || '') : '';
              const isActive = index === currentFrameIndex;
              const isSelected = selectedFrameIndices.includes(index);
              const stateLabel = state === 'pending' ? 'P' : state === 'done' ? 'DONE' : 'R';
              const frameWidth = Math.max(14, Math.round(56 * zoom));
              const isCompact = frameWidth < 36;

              return (
                <button
                  key={`gif-frame-${index}`}
                  type='button'
                  data-frame-index={index}
                  className={`gif-frame-btn${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}${state === 'pending' ? ' gif-frame-btn--pending' : ''}${!isLoaded ? ' gif-frame-btn--unloaded' : ''}${isCompact ? ' gif-frame-btn--compact' : ''}${!thumbnailsEnabled ? ' gif-frame-btn--no-thumb' : ''}`}
                  disabled={!isLoaded}
                  onPointerDown={(e) => handleFramePointerDown(e, index)}
                  onClick={(e) => handleFrameClick(e, index)}
                  onContextMenu={(e) => handleFrameContextMenu(e, index)}
                  title={`FRAME ${index + 1}`}
                  aria-label={`FRAME ${index + 1}`}
                >
                  {thumb && <img src={thumb} alt='' draggable={false} />}
                  <span className={`gif-frame-index gif-frame-index--${state}`}>{index + 1}</span>
                  <span className={`gif-frame-state gif-frame-state--${state}`} aria-label={stateLabel}>
                    {state === 'done' ? <Check size={9} strokeWidth={3} /> : state === 'pending' ? 'P' : 'R'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {contextMenu && (
          <div
            className='gif-context-menu'
            style={{
              left: `${Math.max(8, Math.min(window.innerWidth - 170, contextMenu.x))}px`,
              top: `${Math.max(10, Math.min(window.innerHeight - 230, contextMenu.y - 110))}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            role='menu'
          >
            <button
              type='button'
              className='gif-context-menu-item'
              disabled={frames.length <= 1}
              onClick={() => {
                cutFrames(contextMenu.indices);
                setContextMenu(null);
              }}
              role='menuitem'
            >
              <Scissors size={13} strokeWidth={1.5} />
              <span>CUT {contextMenu.indices.length > 1 ? `(${contextMenu.indices.length})` : ''}</span>
            </button>
            <button
              type='button'
              className='gif-context-menu-item'
              onClick={() => {
                copyFrames(contextMenu.indices);
                setContextMenu(null);
              }}
              role='menuitem'
            >
              <Copy size={13} strokeWidth={1.5} />
              <span>COPY FRAME {contextMenu.indices.length > 1 ? `(${contextMenu.indices.length})` : ''}</span>
            </button>

            {clipboardFrames.length > 0 && (
              <>
                <button
                  type='button'
                  className='gif-context-menu-item'
                  onClick={() => {
                    pasteFrames(contextMenu.index, 'before');
                    setContextMenu(null);
                  }}
                  role='menuitem'
                >
                  <ArrowUp size={13} strokeWidth={1.5} />
                  <span>PASTE BEFORE ({clipboardFrames.length})</span>
                </button>
                <button
                  type='button'
                  className='gif-context-menu-item'
                  onClick={() => {
                    pasteFrames(contextMenu.index, 'after');
                    setContextMenu(null);
                  }}
                  role='menuitem'
                >
                  <ArrowDown size={13} strokeWidth={1.5} />
                  <span>PASTE AFTER ({clipboardFrames.length})</span>
                </button>
              </>
            )}

            <div className='gif-context-menu-divider' />

            <button
              type='button'
              className='gif-context-menu-item'
              onClick={() => {
                handleCopyImage(contextMenu.index);
                setContextMenu(null);
              }}
              role='menuitem'
            >
              <ImageIcon size={13} strokeWidth={1.5} />
              <span>COPY IMAGE</span>
            </button>
            <button
              type='button'
              className='gif-context-menu-item'
              onClick={() => {
                handleSaveAs(contextMenu.indices);
                setContextMenu(null);
              }}
              role='menuitem'
            >
              <Download size={13} strokeWidth={1.5} />
              <span>SAVE AS... {contextMenu.indices.length > 1 ? `(${contextMenu.indices.length})` : ''}</span>
            </button>

            <div className='gif-context-menu-divider' />

            <button
              type='button'
              className='gif-context-menu-item'
              onClick={() => {
                duplicateFrames(contextMenu.indices);
                setContextMenu(null);
              }}
              role='menuitem'
            >
              <Copy size={13} strokeWidth={1.5} />
              <span>DUPLICATE {contextMenu.indices.length > 1 ? `(${contextMenu.indices.length})` : ''}</span>
            </button>
            <button
              type='button'
              className='gif-context-menu-item gif-context-menu-item--danger'
              disabled={frames.length <= 1}
              onClick={() => {
                deleteFrames(contextMenu.indices);
                setContextMenu(null);
              }}
              role='menuitem'
            >
              <Trash2 size={13} strokeWidth={1.5} />
              <span>DELETE {contextMenu.indices.length > 1 ? `(${contextMenu.indices.length})` : ''}</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
