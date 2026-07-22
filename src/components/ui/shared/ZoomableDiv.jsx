import { useEffect, useRef } from "react";
import "./styles/ZoomableDiv.css";

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

    const updateScale = () => {
      const contentElem = getContentElem();
      if (!contentElem) return;

      const outerWidth = outer.clientWidth;
      const outerHeight = outer.clientHeight;

      const contentWidth = contentElem.scrollWidth || contentElem.offsetWidth;
      const contentHeight = contentElem.scrollHeight || contentElem.offsetHeight;

      if (!contentWidth || !contentHeight) return;

      const prevScrollLeft = outer.scrollLeft;
      const prevScrollTop = outer.scrollTop;

      state.current.width = contentWidth;
      state.current.height = contentHeight;

      const fitScale = Math.min(outerWidth / contentWidth, outerHeight / contentHeight);
      const { scale } = state.current;
      const renderScale = fitScale * scale;
      const renderedWidth = Math.floor(contentWidth * renderScale);
      const renderedHeight = Math.floor(contentHeight * renderScale);

      inner.style.width = `${renderedWidth}px`;
      inner.style.height = `${renderedHeight}px`;

      const padX = Math.max(0, (outerWidth - renderedWidth) / 2);
      const padY = Math.max(0, (outerHeight - renderedHeight) / 2);
      inner.style.marginLeft = `${Math.floor(padX)}px`;
      inner.style.marginTop = `${Math.floor(padY)}px`;

      contentElem.style.scale = renderScale;

      if (prevScrollLeft > 0 || prevScrollTop > 0) {
        outer.scrollLeft = prevScrollLeft;
        outer.scrollTop = prevScrollTop;
      }

      window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
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

      const prevScale = state.current.scale;
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(prevScale * zoomFactor, ZOOM_MIN), ZOOM_MAX);
      if (newScale === prevScale) return;
      state.current.scale = newScale;

      const rect = outer.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left) / rect.width;
      const offsetY = (e.clientY - rect.top) / rect.height;

      outer.scrollLeft =
        (outer.scrollLeft + offsetX * outer.clientWidth) * (newScale / prevScale) -
        offsetX * outer.clientWidth;

      outer.scrollTop =
        (outer.scrollTop + offsetY * outer.clientHeight) * (newScale / prevScale) -
        offsetY * outer.clientHeight;

      updateScale();
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
      } else if (e.touches.length === 2) {
        state.current.dragging = false;
        initialPinchDist = getTouchDist(e.touches[0], e.touches[1]);
        initialPinchScale = state.current.scale;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 1 && state.current.dragging) {
        const dx = e.touches[0].clientX - state.current.startX;
        const dy = e.touches[0].clientY - state.current.startY;
        outer.scrollLeft = state.current.startScrollLeft - dx;
        outer.scrollTop = state.current.startScrollTop - dy;
        window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
      } else if (e.touches.length === 2 && initialPinchDist) {
        const currentDist = getTouchDist(e.touches[0], e.touches[1]);
        const scaleFactor = currentDist / initialPinchDist;
        const newScale = Math.min(Math.max(initialPinchScale * scaleFactor, ZOOM_MIN), ZOOM_MAX);
        if (newScale !== state.current.scale) {
          state.current.scale = newScale;
          updateScale();
        }
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) {
        state.current.dragging = false;
        initialPinchDist = null;
      } else if (e.touches.length === 1) {
        state.current.dragging = true;
        state.current.startX = e.touches[0].clientX;
        state.current.startY = e.touches[0].clientY;
        state.current.startScrollLeft = outer.scrollLeft;
        state.current.startScrollTop = outer.scrollTop;
        initialPinchDist = null;
      }
    };

    const handleDoubleClick = () => {
      state.current.scale = 1;
      updateScale();
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
    })
    resize_observer.observe(outer)
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