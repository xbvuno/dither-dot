import { useEffect, useRef, lazy, Suspense } from "react";
import { setupMobileResize } from "../../utils/mobileResize";
import usePageStore, { PAGE } from "../../stores/ui/pageStore";
import "./styles/Aside.css";

const SettingsPage = lazy(() => import("../../pages/SettingsPage"));

const ASIDE_WIDTH_STORAGE_KEY_LEFT = 'dither-dot:aside-width';
const ASIDE_WIDTH_STORAGE_KEY_RIGHT = 'dither-dot:export-aside-width';

export default function Aside({ children, side = "left", storageKey, className = "" }) {
  const currentPage = usePageStore((s) => s.currentPage);
  const shellRef = useRef(null);
  const asideRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const mobileHandleRef = useRef(null);

  const key = storageKey || (side === "right" ? ASIDE_WIDTH_STORAGE_KEY_RIGHT : ASIDE_WIDTH_STORAGE_KEY_LEFT);

  useEffect(() => {
    const shell = shellRef.current;
    const aside = asideRef.current;
    const handle = resizeHandleRef.current;
    const root = document.getElementById('root');
    if (!shell || !aside || !handle) return;

    const computed = window.getComputedStyle(shell);
    const minW = parseFloat(computed.getPropertyValue('min-width'));
    const maxW = parseFloat(computed.getPropertyValue('max-width'));

    const clampWidth = (value) => Math.min(maxW, Math.max(minW, value));

    try {
      const storedWidth = Number(window.localStorage.getItem(key));
      if (Number.isFinite(storedWidth) && storedWidth > 0) {
        shell.style.width = clampWidth(storedWidth) + 'px';
      }
    } catch {
      // localStorage can be unavailable in hardened browser contexts.
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let pendingWidth = null;
    let frameId = null;

    const flushWidth = () => {
      frameId = null;
      if (pendingWidth == null) return;
      shell.style.width = pendingWidth + 'px';
      pendingWidth = null;
    };

    const startResize = (e) => {
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidth = shell.getBoundingClientRect().width;
      handle.classList.add('dragging');
      root?.classList.add('is-resizing-aside');
    };

    const stopResize = () => {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove('dragging');
      root?.classList.remove('is-resizing-aside');

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }

      if (pendingWidth != null) {
        shell.style.width = pendingWidth + 'px';
        pendingWidth = null;
      }

      try {
        const currentWidth = shell.getBoundingClientRect().width;
        window.localStorage.setItem(key, String(clampWidth(currentWidth)));
      } catch {
        // Ignore storage write failures.
      }
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const deltaX = side === "right" ? (startX - e.clientX) : (e.clientX - startX);
      let newWidth = startWidth + deltaX;
      newWidth = clampWidth(newWidth);
      pendingWidth = newWidth;

      if (frameId === null) {
        frameId = window.requestAnimationFrame(flushWidth);
      }
    };

    handle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);

    return () => {
      handle.removeEventListener('mousedown', startResize);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stopResize);
      stopResize();
      root?.classList.remove('is-resizing-aside');
    };
  }, [key, side]);

  useEffect(() => {
    if (!mobileHandleRef.current) return;
    const cleanup = setupMobileResize(mobileHandleRef.current, () => shellRef.current);
    return () => cleanup();
  }, []);

  return (
    <div ref={shellRef} className={`resizable-shell resizable-shell--${side} ${className}`.trim()}>
      <div
        ref={mobileHandleRef}
        className="mobile-resize-handle"
        role="separator"
        aria-label="Resize control panel height"
      >
        <span className="mobile-resize-pill" />
      </div>
      <aside ref={asideRef}>
        {children}
        {side === "left" && currentPage !== PAGE.SETTINGS && (
          <div className="aside-mobile-settings">
            <Suspense fallback={null}>
              <SettingsPage />
            </Suspense>
          </div>
        )}
      </aside>
      <div
        ref={resizeHandleRef}
        className={`resize-handle resize-handle--${side === "right" ? "left" : "right"}`}
        role="separator"
      />
    </div>
  );
}