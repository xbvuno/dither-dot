import { useEffect, useRef } from "react";
import "./ZoomableDiv.css";

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

      state.current.width = contentWidth
      state.current.height = contentHeight

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
      window.dispatchEvent(new CustomEvent('split-compare-layout-changed'));
    };

    updateScale();

    let renderResizeObserver = null;

    const observeRenderSize = () => {
      renderResizeObserver?.disconnect();
      renderResizeObserver = null;

      const renderElem = getRenderElem();
      if (!renderElem) return;

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

    const handleDoubleClick = () => {
      state.current.scale = 1;
      updateScale();
    };

    outer.addEventListener("wheel", handleWheel, { passive: false });
    outer.addEventListener("mousedown", handleMouseDown);
    outer.addEventListener("dblclick", handleDoubleClick);
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
    });

    return () => {
      outer.removeEventListener("wheel", handleWheel);
      outer.removeEventListener("mousedown", handleMouseDown);
      outer.removeEventListener("dblclick", handleDoubleClick);
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