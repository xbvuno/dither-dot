import { useEffect, useState, useRef } from "react";
import useSizeStore from "../stores/sizeStore";
import useProcessingStore from "../stores/processingStore";
import useViewStore from "../stores/viewStore";
import usePerformanceStore from "../stores/performanceStore";
import useParamsStore from "../stores/paramsStore";
import useWebcamStore from "../stores/webcamStore";
import { getRenderSnapshot, subscribeRenderSnapshot } from "../utils/canvasRegistry";
import PipelineTimingTooltip from "./PipelineTimingTooltip";

function formatMs(value) {
  if (!Number.isFinite(value) || value <= 0) return '0ms';
  return `${Math.round(value)}ms`;
}

function getPhaseLabel(currentPhase) {
  if (!currentPhase) return null;

  switch (currentPhase) {
    case 'extraction':
      return 'READBACK';
    case 'palette':
      return 'PALETTE GENERATION';
    case 'dithering':
      return 'DITHERING';
    case 'texture':
      return 'TEXTURE UPDATE';
    case 'sync':
      return 'LAYER SYNC';
    default:
      // Surface unknown phases directly so stuck states are visible in the footer.
      return String(currentPhase).replace(/[_-]+/g, ' ').trim().toUpperCase() || 'PROCESSING';
  }
}

export default function Footer() {
  const width = useSizeStore(s => s.size.width);
  const height = useSizeStore(s => s.size.height);
  const customWidth = useSizeStore(s => s.customSize.customWidth);
  const customHeight = useSizeStore(s => s.customSize.customHeight);
  const crop = useSizeStore(s => s.crop) || { top: 0, bottom: 0, left: 0, right: 0 };

  const scaleX = customWidth ? (width / customWidth) : 1;
  const scaleY = customHeight ? (height / customHeight) : 1;
  const nativeLeft = Math.round((crop.left || 0) * scaleX);
  const nativeRight = Math.round((crop.right || 0) * scaleX);
  const nativeTop = Math.round((crop.top || 0) * scaleY);
  const nativeBottom = Math.round((crop.bottom || 0) * scaleY);

  const displayOriginalWidth = Math.max(1, (width || 0) - nativeLeft - nativeRight);
  const displayOriginalHeight = Math.max(1, (height || 0) - nativeTop - nativeBottom);

  const displayWidth = Math.max(1, (customWidth || 0) - (crop.left || 0) - (crop.right || 0));
  const displayHeight = Math.max(1, (customHeight || 0) - (crop.top || 0) - (crop.bottom || 0));
  const isProcessing = useProcessingStore(s => s.isProcessing);
  const processingLabel = useProcessingStore(s => s.processingLabel);
  const previewingOriginal = useViewStore(s => s.previewingOriginal);
  const setPreviewingOriginal = useViewStore(s => s.setPreviewingOriginal);
  const timing = usePerformanceStore(s => s.timing);
  const currentPhase = usePerformanceStore(s => s.currentPhase);
  const paletteGenerationCached = usePerformanceStore(s => s.paletteGenerationCached);
  const pipelineVisible = useParamsStore(s => s.pipelineVisible);
  const webcamActive = useWebcamStore(s => s.active);
  const webcamFps = useWebcamStore(s => s.fps);

  const [uniqueColors, setUniqueColors] = useState(() => getRenderSnapshot().uniqueColors ?? 0);
  const [originalUniqueColors, setOriginalUniqueColors] = useState(() => getRenderSnapshot().originalUniqueColors ?? 0);
  const [showTimingTooltip, setShowTimingTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({});
  const timingRef = useRef(null);
  const activePhaseLabel = getPhaseLabel(currentPhase);
  const showBusyState = isProcessing || Boolean(activePhaseLabel);

  useEffect(() => {
    return subscribeRenderSnapshot((snapshot) => {
      setUniqueColors(snapshot?.uniqueColors ?? 0);
      setOriginalUniqueColors(snapshot?.originalUniqueColors ?? 0);
    });
  }, []);

  const updateTooltipPosition = () => {
    const aside = document.querySelector('aside');
    const timelineShell = document.querySelector('.gif-timeline-shell');
    const footerNode = timingRef.current?.closest('footer');

    const asideRect = aside?.getBoundingClientRect();
    const timelineRect = timelineShell?.getBoundingClientRect();
    const footerRect = footerNode?.getBoundingClientRect();

    const fallbackRect = timingRef.current?.getBoundingClientRect();
    const left = asideRect ? (asideRect.right + 8) : (fallbackRect?.left ?? 8);

    const anchorTop = timelineRect?.top ?? footerRect?.top ?? fallbackRect?.top ?? window.innerHeight;

    setTooltipPosition({
      left: `${Math.max(8, left)}px`,
      bottom: `${Math.max(8, window.innerHeight - anchorTop + 8)}px`,
    });
  };

  const handleTimingHover = () => {
    if (timing.pipelineTotal <= 0 && !currentPhase) return;
    updateTooltipPosition();
    setShowTimingTooltip(true);
  };

  const handleTimingLeave = () => {
    if (!pipelineVisible) {
      setShowTimingTooltip(false);
    }
  };

  useEffect(() => {
    if (!(pipelineVisible || showTimingTooltip) || (timing.pipelineTotal <= 0 && !currentPhase)) return;

    const rafId = window.requestAnimationFrame(() => {
      updateTooltipPosition();
    });

    const handleWindowChange = () => updateTooltipPosition();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    const aside = document.querySelector('aside');
    const timelineShell = document.querySelector('.gif-timeline-shell');
    const footerNode = timingRef.current?.closest('footer');
    const resizableShell = document.querySelector('.resizable-shell');

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateTooltipPosition();
      });

      if (aside) resizeObserver.observe(aside);
      if (timelineShell) resizeObserver.observe(timelineShell);
      if (footerNode) resizeObserver.observe(footerNode);
      if (resizableShell) resizeObserver.observe(resizableShell);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      resizeObserver?.disconnect();
    };
  }, [pipelineVisible, showTimingTooltip, timing.pipelineTotal, currentPhase]);

  useEffect(() => {
    if (pipelineVisible && (timing.pipelineTotal > 0 || currentPhase)) {
      window.requestAnimationFrame(() => {
        updateTooltipPosition();
      });
      const timerId = window.setTimeout(() => {
        setShowTimingTooltip(true);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
      };
    }

    if (!pipelineVisible) {
      const timerId = window.setTimeout(() => {
        setShowTimingTooltip(false);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
      };
    }
  }, [pipelineVisible, timing.pipelineTotal, currentPhase]);

  return (
    <footer className="app-footer">
      <div className="app-footer-left">
        <button
          className={`footer-preview-btn${previewingOriginal ? ' footer-preview-btn--active' : ''}`}
          onMouseDown={() => setPreviewingOriginal(true)}
          onMouseUp={() => setPreviewingOriginal(false)}
          onMouseLeave={() => setPreviewingOriginal(false)}
        >
          COMPARE
        </button>

        <div
          ref={timingRef}
          className={`pipeline-timing${showBusyState ? ' pipeline-timing--busy' : ''}${activePhaseLabel ? ' pipeline-timing--active' : ''}`}
          onMouseEnter={handleTimingHover}
          onMouseLeave={handleTimingLeave}
        >
          {showBusyState ? (
            <span>
              {activePhaseLabel ? `${activePhaseLabel}...` : (processingLabel || 'PROCESSING...')}
            </span>
          ) : (
            <span title="Hover for pipeline breakdown">
              {timing.pipelineTotal > 0 ? formatMs(timing.pipelineTotal) : '—'}
            </span>
          )}
        </div>
      </div>

      <span className="app-footer-status">
        {previewingOriginal
          ? `${displayOriginalWidth} x ${displayOriginalHeight} | COLORS: ${originalUniqueColors}`
          : `${displayWidth} x ${displayHeight} | COLORS: ${uniqueColors}${webcamActive ? ` | FPS: ${webcamFps}` : ''}`}
      </span>

      <PipelineTimingTooltip
        isVisible={showTimingTooltip || pipelineVisible}
        currentPhase={currentPhase}
        timing={timing}
        paletteGenerationCached={paletteGenerationCached}
        position={tooltipPosition}
      />
    </footer>
  );
}
