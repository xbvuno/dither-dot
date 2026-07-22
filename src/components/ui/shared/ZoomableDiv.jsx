import { useEffect, useRef } from "react";
import "./styles/ZoomableDiv.css";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export default function ZoomableDiv({ content }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);

  const state = useRef({
    scale: 1,
    dragging: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    width: 0,
    height: 0
  });

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 10;
  const SCALE_EPSILON = 0.0001;

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const getContentElem = () => innerRef.current?.firstElementChild;
    const getRenderElem = () => innerRef.current?.querySelector('#render');

    if (!getContentElem()) return;

    const zoomTo = (targetScale, focalX, focalY) => {
      const contentElem = getContentElem();
      if (!contentElem) return;

      const outerWidth = outer.clientWidth;
      const outerHeight = outer.clientHeight;
      const contentWidth = contentElem.scrollWidth || contentElem.offsetWidth;
      const contentHeight = contentElem.scrollHeight || contentElem.offsetHeight;

      if (!contentWidth || !contentHeight || !outerWidth || !outerHeight) return;

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
      const newRenderWidth = contentWidth * newRenderScale;
      const newRenderHeight = contentHeight * newRenderScale;
      const newPadX = Math.max(0, (outerWidth - newRenderWidth) / 2);
      const newPadY = Math.max(0, (outerHeight - newRenderHeight) / 2);

      inner.style.width = `${newRenderWidth}px`;
      inner.style.height = `${newRenderHeight}px`;
      inner.style.marginLeft = `${newPadX}px`;
      inner.style.marginTop = `${newPadY}px`;

      contentElem.style.transformOrigin = 'top left';
      contentElem.style.scale = newRenderScale;

      const targetScrollLeft = newPadX + xF * newRenderScale - focalX;
      const targetScrollTop = newPadY + yF * newRenderScale - focalY;

      outer.scrollLeft = Math.max(0, targetScrollLeft);
      outer.scrollTop = Math.max(0, targetScrollTop);

      window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
    };

    const updateScale = () => {
      const outerWidth = outer.clientWidth;
      const outerHeight = outer.clientHeight;
      zoomTo(state.current.scale, outerWidth / 2, outerHeight / 2);
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
    let prevPinchCenter = null;

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
        initialPinchDist = getTouchDist(e.touches[0], e.touches[1]);
        initialPinchScale = state.current.scale;
        prevPinchCenter = getTouchCenter(e.touches[0], e.touches[1]);
      } else if (e.touches.length === 1) {
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
        const currentDist = getTouchDist(e.touches[0], e.touches[1]);
        const center = getTouchCenter(e.touches[0], e.touches[1]);
        if (currentDist > 0) {
          const factor = currentDist / initialPinchDist;
          const targetScale = initialPinchScale * factor;

          if (prevPinchCenter) {
            const dx = center.x - prevPinchCenter.x;
            const dy = center.y - prevPinchCenter.y;
            outer.scrollLeft -= dx;
            outer.scrollTop -= dy;
          }

          zoomTo(targetScale, center.x, center.y);
          prevPinchCenter = center;
        }
      } else if (e.touches.length === 1 && state.current.dragging) {
        const dx = e.touches[0].clientX - state.current.startX;
        const dy = e.touches[0].clientY - state.current.startY;
        outer.scrollLeft = state.current.startScrollLeft - dx;
        outer.scrollTop = state.current.startScrollTop - dy;
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) {
        initialPinchDist = null;
        prevPinchCenter = null;
      }
      if (e.touches.length === 0) {
        state.current.dragging = false;
      }
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

    const mutationObserver = new MutationObserver(() => {
      updateScale();
    });

    const resizeObserver = new ResizeObserver(() => {
      const atBaseZoom = Math.abs(state.current.scale - ZOOM_MIN) < SCALE_EPSILON;
      if (atBaseZoom) {
        state.current.scale = ZOOM_MIN;
        outer.scrollLeft = 0;
        outer.scrollTop = 0;
      }
      updateScale();
    });

    resizeObserver.observe(outer);
    mutationObserver.observe(inner, {
      childList: true,
      subtree: true,
      attributeFilter: ["height", "width"],
    });

    const renderElem = getRenderElem();
    if (renderElem) {
      resizeObserver.observe(renderElem);
    }

    return () => {
      outer.removeEventListener('wheel', handleWheel);
      outer.removeEventListener('mousedown', handleMouseDown);
      outer.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      outer.removeEventListener('touchstart', handleTouchStart);
      outer.removeEventListener('touchmove', handleTouchMove);
      outer.removeEventListener('touchend', handleTouchEnd);
      outer.removeEventListener('touchcancel', handleTouchEnd);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [content]);

  return (
    <div ref={outerRef} className="zoomable-outer">
      <div ref={innerRef} className="zoomable-inner">
        {content}
      </div>
    </div>
  );
}