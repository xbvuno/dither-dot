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
      const prevRenderWidth = Math.floor(contentWidth * prevRenderScale);
      const prevRenderHeight = Math.floor(contentHeight * prevRenderScale);
      const prevPadX = Math.max(0, (outerWidth - prevRenderWidth) / 2);
      const prevPadY = Math.max(0, (outerHeight - prevRenderHeight) / 2);

      // Content space coordinates under current focal point (focalX, focalY)
      const xF = (focalX - Math.floor(prevPadX) + outer.scrollLeft) / (prevRenderScale || 1);
      const yF = (focalY - Math.floor(prevPadY) + outer.scrollTop) / (prevRenderScale || 1);

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

      contentElem.style.scale = newRenderScale;

      const targetScrollLeft = Math.floor(newPadX) + xF * newRenderScale - focalX;
      const targetScrollTop = Math.floor(newPadY) + yF * newRenderScale - focalY;

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

    let renderResizeObserver = null;

    const observeRenderSize = () => {
      const renderElem = getRenderElem();
      if (!renderElem) return;
      if (renderResizeObserver) return;

      renderResizeObserver = new ResizeObserver(() => {
        const atBaseZoom = Math.abs(state.current.scale - ZOOM_MIN) < SCALE_EPSILON;

        if (atBaseZoom) {
          state.current.scale = ZOOM_MIN;
          outer.scrollLeft = 0;
          outer.scrollTop = 0;
        }

        updateScale();
      });

      renderResizeObserver.observe(renderElem);
    };

    observeRenderSize();

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

    let initialPinchDist = null;
    let initialPinchScale = 1;
    let prevPinchCenter = null;

    const getTouchDist = (t1, t2) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
        state.current.dragging = true;
        state.current.startX = e.touches[0].clientX;
        state.current.startY = e.touches[0].clientY;
        state.current.startScrollLeft = outer.scrollLeft;
        state.current.startScrollTop = outer.scrollTop;
        initialPinchDist = null;
        prevPinchCenter = null;
      } else if (e.touches.length === 2) {
        state.current.dragging = false;
        initialPinchDist = getTouchDist(e.touches[0], e.touches[1]);
        initialPinchScale = state.current.scale;
        prevPinchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 1 && state.current.dragging) {
        const dx = e.touches[0].clientX - state.current.startX;
        const dy = e.touches[0].clientY - state.current.startY;
        outer.scrollLeft = state.current.startScrollLeft - dx;
        outer.scrollTop = state.current.startScrollTop - dy;
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      } else if (e.touches.length === 2 && initialPinchDist && initialPinchDist > 0) {
        const currentDist = getTouchDist(e.touches[0], e.touches[1]);
        if (currentDist <= 0) return;

        const currentCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };

        const rect = outer.getBoundingClientRect();
        const focalX = clamp(currentCenter.x - rect.left, 0, rect.width);
        const focalY = clamp(currentCenter.y - rect.top, 0, rect.height);

        const scaleFactor = currentDist / initialPinchDist;
        const targetScale = initialPinchScale * scaleFactor;

        if (prevPinchCenter) {
          const dx = currentCenter.x - prevPinchCenter.x;
          const dy = currentCenter.y - prevPinchCenter.y;
          outer.scrollLeft -= dx;
          outer.scrollTop -= dy;
        }
        prevPinchCenter = currentCenter;

        zoomTo(targetScale, focalX, focalY);
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) {
        state.current.dragging = false;
        initialPinchDist = null;
        prevPinchCenter = null;
      } else if (e.touches.length === 1) {
        state.current.dragging = true;
        state.current.startX = e.touches[0].clientX;
        state.current.startY = e.touches[0].clientY;
        state.current.startScrollLeft = outer.scrollLeft;
        state.current.startScrollTop = outer.scrollTop;
        initialPinchDist = null;
        prevPinchCenter = null;
      }
    };

    const handleDoubleClick = () => {
      const outerWidth = outer.clientWidth;
      const outerHeight = outer.clientHeight;
      zoomTo(1, outerWidth / 2, outerHeight / 2);
    };

    outer.addEventListener("wheel", handleWheel, { passive: false });
    outer.addEventListener("mousedown", handleMouseDown);
    outer.addEventListener("dblclick", handleDoubleClick);
    outer.addEventListener("touchstart", handleTouchStart, { passive: true });
    outer.addEventListener("touchmove", handleTouchMove, { passive: true });
    outer.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    const mutation_observer = new MutationObserver(() => {
      observeRenderSize();
      updateScale();
    });

    const resize_observer = new ResizeObserver(() => {
      updateScale();
    });
    resize_observer.observe(outer);
    mutation_observer.observe(inner, {
      childList: true,
      subtree: true,
      attributeFilter: ["height", "width"],
    });

    return () => {
      outer.removeEventListener("wheel", handleWheel);
      outer.removeEventListener("mousedown", handleMouseDown);
      outer.removeEventListener("dblclick", handleDoubleClick);
      outer.removeEventListener("touchstart", handleTouchStart);
      outer.removeEventListener("touchmove", handleTouchMove);
      outer.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      mutation_observer.disconnect();
      resize_observer.disconnect();
      renderResizeObserver?.disconnect();
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