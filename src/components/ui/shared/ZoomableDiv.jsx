import { useEffect, useRef, useId } from "react";
import "./styles/ZoomableDiv.css";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export default function ZoomableDiv({ content }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const instanceId = useId();
  const isSyncing = useRef(false);

  const state = useRef({
    scale: 1,
    dragging: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    width: 0,
    height: 0,
    isUpdatingProgrammatically: false
  });

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 10;
  const SCALE_EPSILON = 0.0001;

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const getContentElem = () => {
      return innerRef.current?.querySelector('#render') || innerRef.current?.firstElementChild;
    };

    const dispatchSync = () => {
      if (isSyncing.current) return;
      window.dispatchEvent(
        new CustomEvent('zoomable-sync-view', {
          detail: {
            id: instanceId,
            scale: state.current.scale,
            scrollLeft: outer.scrollLeft,
            scrollTop: outer.scrollTop,
          },
        })
      );
    };

    const applyScaleOnly = (targetScale) => {
      const contentElem = getContentElem();
      if (!contentElem) return;

      const outerWidth = outer.clientWidth;
      const outerHeight = outer.clientHeight;
      if (!outerWidth || !outerHeight) return;

      const contentWidth =
        contentElem.videoWidth ||
        contentElem.naturalWidth ||
        contentElem.scrollWidth ||
        contentElem.offsetWidth ||
        (contentElem.style.width ? parseFloat(contentElem.style.width) : 0);
      const contentHeight =
        contentElem.videoHeight ||
        contentElem.naturalHeight ||
        contentElem.scrollHeight ||
        contentElem.offsetHeight ||
        (contentElem.style.height ? parseFloat(contentElem.style.height) : 0);

      if (!contentWidth || !contentHeight) return;

      const fitScale = Math.min(outerWidth / contentWidth, outerHeight / contentHeight);
      const clampedScale = clamp(targetScale, ZOOM_MIN, ZOOM_MAX);

      state.current.scale = clampedScale;
      state.current.width = contentWidth;
      state.current.height = contentHeight;

      const newRenderScale = fitScale * clampedScale;
      const newRenderWidth = Math.floor(contentWidth * newRenderScale);
      const newRenderHeight = Math.floor(contentHeight * newRenderScale);
      const newPadX = Math.max(0, (outerWidth - newRenderWidth) / 2);
      const newPadY = Math.max(0, (outerHeight - newRenderHeight) / 2);

      inner.style.width = `${newRenderWidth}px`;
      inner.style.height = `${newRenderHeight}px`;
      inner.style.marginLeft = `${Math.floor(newPadX)}px`;
      inner.style.marginTop = `${Math.floor(newPadY)}px`;
      inner.style.paddingLeft = '0px';
      inner.style.paddingTop = '0px';
      inner.style.boxSizing = 'content-box';

      contentElem.style.transformOrigin = 'top left';
      contentElem.style.scale = newRenderScale;

      if (window.innerWidth <= 768) {
        const isZoomed = clampedScale > (ZOOM_MIN + SCALE_EPSILON);
        outer.style.overflow = isZoomed ? 'auto' : 'hidden';
      }
    };

    const zoomTo = (targetScale, focalX, focalY, fromSync = false) => {
      const contentElem = getContentElem();
      if (!contentElem) return;

      state.current.isUpdatingProgrammatically = true;

      const outerWidth = outer.clientWidth;
      const outerHeight = outer.clientHeight;
      if (!outerWidth || !outerHeight) {
        state.current.isUpdatingProgrammatically = false;
        return;
      }

      const contentWidth =
        contentElem.videoWidth ||
        contentElem.naturalWidth ||
        contentElem.scrollWidth ||
        contentElem.offsetWidth ||
        (contentElem.style.width ? parseFloat(contentElem.style.width) : 0);
      const contentHeight =
        contentElem.videoHeight ||
        contentElem.naturalHeight ||
        contentElem.scrollHeight ||
        contentElem.offsetHeight ||
        (contentElem.style.height ? parseFloat(contentElem.style.height) : 0);

      if (!contentWidth || !contentHeight) {
        state.current.isUpdatingProgrammatically = false;
        return;
      }

      const fitScale = Math.min(outerWidth / contentWidth, outerHeight / contentHeight);
      const prevScale = state.current.scale;
      const clampedScale = clamp(targetScale, ZOOM_MIN, ZOOM_MAX);

      const prevRenderScale = fitScale * prevScale;
      const prevRenderWidth = contentWidth * prevRenderScale;
      const prevRenderHeight = contentHeight * prevRenderScale;
      const prevPadX = Math.max(0, (outerWidth - prevRenderWidth) / 2);
      const prevPadY = Math.max(0, (outerHeight - prevRenderHeight) / 2);

      // Content space coordinates under current focal point (focalX, focalY)
      const xF = (focalX - prevPadX + outer.scrollLeft) / (prevRenderScale || 1);
      const yF = (focalY - prevPadY + outer.scrollTop) / (prevRenderScale || 1);

      state.current.scale = clampedScale;
      state.current.width = contentWidth;
      state.current.height = contentHeight;

      const newRenderScale = fitScale * clampedScale;
      const newRenderWidth = Math.floor(contentWidth * newRenderScale);
      const newRenderHeight = Math.floor(contentHeight * newRenderScale);
      const newPadX = Math.max(0, (outerWidth - newRenderWidth) / 2);
      const newPadY = Math.max(0, (outerHeight - newRenderHeight) / 2);

      inner.style.width = `${newRenderWidth}px`;
      inner.style.height = `${newRenderHeight}px`;
      inner.style.marginLeft = `${Math.floor(newPadX)}px`;
      inner.style.marginTop = `${Math.floor(newPadY)}px`;
      inner.style.paddingLeft = '0px';
      inner.style.paddingTop = '0px';
      inner.style.boxSizing = 'content-box';

      contentElem.style.transformOrigin = 'top left';
      contentElem.style.scale = newRenderScale;

      if (window.innerWidth <= 768) {
        const isZoomed = clampedScale > (ZOOM_MIN + SCALE_EPSILON);
        outer.style.overflow = isZoomed ? 'auto' : 'hidden';
      }

      const targetScrollLeft = newPadX + xF * newRenderScale - focalX;
      const targetScrollTop = newPadY + yF * newRenderScale - focalY;

      outer.scrollLeft = Math.max(0, targetScrollLeft);
      outer.scrollTop = Math.max(0, targetScrollTop);

      setTimeout(() => {
        state.current.isUpdatingProgrammatically = false;
      }, 0);

      window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      if (!fromSync) {
        dispatchSync();
      }
    };

    let updateScaleRafId = null;
    const lastLayout = {
      outerW: 0,
      outerH: 0,
      contentW: 0,
      contentH: 0,
      scale: 0,
    };

    const updateScale = () => {
      if (updateScaleRafId) cancelAnimationFrame(updateScaleRafId);
      updateScaleRafId = requestAnimationFrame(() => {
        const contentElem = getContentElem();
        if (!contentElem) return;

        const outerWidth = outer.clientWidth;
        const outerHeight = outer.clientHeight;
        if (!outerWidth || !outerHeight) return;

        const contentWidth =
          contentElem.videoWidth ||
          contentElem.naturalWidth ||
          contentElem.scrollWidth ||
          contentElem.offsetWidth ||
          (contentElem.style.width ? parseFloat(contentElem.style.width) : 0);
        const contentHeight =
          contentElem.videoHeight ||
          contentElem.naturalHeight ||
          contentElem.scrollHeight ||
          contentElem.offsetHeight ||
          (contentElem.style.height ? parseFloat(contentElem.style.height) : 0);

        if (!contentWidth || !contentHeight) {
          updateScaleRafId = requestAnimationFrame(() => {
            const retryElem = getContentElem();
            if (!retryElem) return;
            const retryW =
              retryElem.videoWidth ||
              retryElem.naturalWidth ||
              retryElem.scrollWidth ||
              retryElem.offsetWidth ||
              (retryElem.style.width ? parseFloat(retryElem.style.width) : 0);
            const retryH =
              retryElem.videoHeight ||
              retryElem.naturalHeight ||
              retryElem.scrollHeight ||
              retryElem.offsetHeight ||
              (retryElem.style.height ? parseFloat(retryElem.style.height) : 0);
            if (retryW > 0 && retryH > 0 && outer.clientWidth > 0 && outer.clientHeight > 0) {
              zoomTo(state.current.scale, outer.clientWidth / 2, outer.clientHeight / 2);
            }
          });
          return;
        }

        const atBaseZoom = Math.abs(state.current.scale - ZOOM_MIN) < SCALE_EPSILON;
        if (atBaseZoom) {
          state.current.scale = ZOOM_MIN;
          outer.scrollLeft = 0;
          outer.scrollTop = 0;
        }

        // Check if layout is already identical to avoid unnecessary DOM writes
        if (
          Math.abs(lastLayout.outerW - outerWidth) < 0.5 &&
          Math.abs(lastLayout.outerH - outerHeight) < 0.5 &&
          Math.abs(lastLayout.contentW - contentWidth) < 0.5 &&
          Math.abs(lastLayout.contentH - contentHeight) < 0.5 &&
          Math.abs(lastLayout.scale - state.current.scale) < SCALE_EPSILON
        ) {
          return;
        }

        lastLayout.outerW = outerWidth;
        lastLayout.outerH = outerHeight;
        lastLayout.contentW = contentWidth;
        lastLayout.contentH = contentHeight;
        lastLayout.scale = state.current.scale;

        zoomTo(state.current.scale, outerWidth / 2, outerHeight / 2);
      });
    };

    updateScale();

    const handleWheel = (e) => {
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = outer.getBoundingClientRect();
      const focalX = e.clientX - rect.left;
      const focalY = e.clientY - rect.top;

      zoomTo(state.current.scale * zoomFactor, focalX, focalY);
    };

    const handleMouseDown = (e) => {
      if (e.button !== 0) return;
      state.current.dragging = true;
      state.current.startX = e.clientX;
      state.current.startY = e.clientY;
      state.current.startScrollLeft = outer.scrollLeft;
      state.current.startScrollTop = outer.scrollTop;
    };

    const handleMouseMove = (e) => {
      if (!state.current.dragging) return;
      const dx = e.clientX - state.current.startX;
      const dy = e.clientY - state.current.startY;
      outer.scrollLeft = state.current.startScrollLeft - dx;
      outer.scrollTop = state.current.startScrollTop - dy;

      window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      dispatchSync();
    };

    const handleMouseUp = (e) => {
      if (e.button === 0) {
        state.current.dragging = false;
      }
    };

    const handleDoubleClick = () => {
      const outerWidth = outer.clientWidth;
      const outerHeight = outer.clientHeight;
      zoomTo(1, outerWidth / 2, outerHeight / 2);
    };

    let initialPinchDist = null;
    let initialPinchScale = 1;

    const getTouchDist = (t1, t2) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.hypot(dx, dy);
    };

    const getTouchCenter = (t1, t2) => {
      const rect = outer.getBoundingClientRect();
      return {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        state.current.dragging = false;
        initialPinchDist = getTouchDist(e.touches[0], e.touches[1]);
        initialPinchScale = state.current.scale;
      } else if (e.touches.length === 1) {
        initialPinchDist = null;
        state.current.dragging = true;
        state.current.startX = e.touches[0].clientX;
        state.current.startY = e.touches[0].clientY;
        state.current.startScrollLeft = outer.scrollLeft;
        state.current.startScrollTop = outer.scrollTop;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && initialPinchDist) {
        e.preventDefault();
        state.current.dragging = false;
        const currentDist = getTouchDist(e.touches[0], e.touches[1]);
        const center = getTouchCenter(e.touches[0], e.touches[1]);

        if (currentDist > 0) {
          const factor = currentDist / initialPinchDist;
          const targetScale = initialPinchScale * factor;
          zoomTo(targetScale, center.x, center.y);
        }
      } else if (e.touches.length === 1) {
        if (!state.current.dragging || initialPinchDist !== null) {
          initialPinchDist = null;
          state.current.dragging = true;
          state.current.startX = e.touches[0].clientX;
          state.current.startY = e.touches[0].clientY;
          state.current.startScrollLeft = outer.scrollLeft;
          state.current.startScrollTop = outer.scrollTop;
          return;
        }

        const dx = e.touches[0].clientX - state.current.startX;
        const dy = e.touches[0].clientY - state.current.startY;
        outer.scrollLeft = state.current.startScrollLeft - dx;
        outer.scrollTop = state.current.startScrollTop - dy;
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
        dispatchSync();
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length === 1) {
        initialPinchDist = null;
        state.current.dragging = true;
        state.current.startX = e.touches[0].clientX;
        state.current.startY = e.touches[0].clientY;
        state.current.startScrollLeft = outer.scrollLeft;
        state.current.startScrollTop = outer.scrollTop;
      } else if (e.touches.length === 0) {
        initialPinchDist = null;
        state.current.dragging = false;
      }
    };

    const handleSyncView = (e) => {
      if (!e.detail || e.detail.id === instanceId) return;
      isSyncing.current = true;
      const { scale: targetScale, scrollLeft, scrollTop } = e.detail;

      applyScaleOnly(targetScale);
      outer.scrollLeft = scrollLeft;
      outer.scrollTop = scrollTop;

      setTimeout(() => {
        isSyncing.current = false;
      }, 0);
    };

    outer.addEventListener('wheel', handleWheel, { passive: false });
    outer.addEventListener('mousedown', handleMouseDown);
    outer.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    outer.addEventListener('touchstart', handleTouchStart, { passive: false });
    outer.addEventListener('touchmove', handleTouchMove, { passive: false });
    outer.addEventListener('touchend', handleTouchEnd);
    outer.addEventListener('touchcancel', handleTouchEnd);
    window.addEventListener('zoomable-sync-view', handleSyncView);

    const handleRenderReady = () => {
      if (state.current.isUpdatingProgrammatically) return;
      updateScale();
    };

    window.addEventListener('dither-render-ready', handleRenderReady);
    window.addEventListener('split-compare-layout-changed', handleRenderReady);

    const resizeObserver = new ResizeObserver(() => {
      if (state.current.isUpdatingProgrammatically) return;
      updateScale();
    });

    resizeObserver.observe(outer);

    const bindContentLoad = () => {
      const img = innerRef.current?.querySelector('img');
      if (img && !img.complete) {
        img.addEventListener('load', () => updateScale(), { once: true });
      }
      const video = innerRef.current?.querySelector('video');
      if (video && video.readyState < 1) {
        video.addEventListener('loadedmetadata', () => updateScale(), { once: true });
      }
    };

    bindContentLoad();

    const mutationObserver = new MutationObserver(() => {
      if (state.current.isUpdatingProgrammatically) return;
      bindContentLoad();
      updateScale();
    });

    mutationObserver.observe(inner, {
      childList: true,
      subtree: true,
      attributes: false,
    });

    return () => {
      if (updateScaleRafId) cancelAnimationFrame(updateScaleRafId);
      outer.removeEventListener('wheel', handleWheel);
      outer.removeEventListener('mousedown', handleMouseDown);
      outer.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      outer.removeEventListener('touchstart', handleTouchStart);
      outer.removeEventListener('touchmove', handleTouchMove);
      outer.removeEventListener('touchend', handleTouchEnd);
      outer.removeEventListener('touchcancel', handleTouchEnd);
      window.removeEventListener('zoomable-sync-view', handleSyncView);
      window.removeEventListener('dither-render-ready', handleRenderReady);
      window.removeEventListener('split-compare-layout-changed', handleRenderReady);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={outerRef} className="zoomable-outer">
      <div ref={innerRef} className="zoomable-inner">
        {content}
      </div>
    </div>
  );
}