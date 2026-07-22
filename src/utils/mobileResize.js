const MOBILE_ASIDE_HEIGHT_KEY = 'dither-dot:mobile-aside-height';

export function setupMobileResize(handleEl, getShellEl) {
  if (!handleEl) return () => {};

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;
  let hasMoved = false;
  let pendingHeight = null;
  let rafId = null;

  const getShell = () => (typeof getShellEl === 'function' ? getShellEl() : getShellEl) || document.querySelector('.resizable-shell');

  const updateHeight = () => {
    rafId = null;
    if (pendingHeight === null) return;
    const shell = getShell();
    if (shell) {
      shell.style.setProperty('height', `${pendingHeight}px`, 'important');
    }
    pendingHeight = null;
  };

  const onMove = (clientY) => {
    if (!isDragging) return;
    const deltaY = startY - clientY; // Dragging UP increases height
    if (Math.abs(deltaY) > 4) {
      hasMoved = true;
    }
    let newHeight = startHeight + deltaY;

    const minH = 32; // 32px min height (thumb handle 2.0rem only)
    const maxH = Math.floor(window.innerHeight * 0.70); // 70% of viewport max
    newHeight = Math.max(minH, Math.min(maxH, newHeight));

    pendingHeight = newHeight;
    if (rafId === null) {
      rafId = window.requestAnimationFrame(updateHeight);
    }
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    e.stopPropagation?.();
    onMove(e.clientY);
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    e.stopPropagation?.();
    if (e.cancelable) e.preventDefault();
    if (e.touches && e.touches.length > 0) {
      onMove(e.touches[0].clientY);
    }
  };

  const stopDrag = (e) => {
    if (!isDragging) return;
    e?.stopPropagation?.();
    isDragging = false;
    handleEl.classList.remove('dragging');
    document.body.classList.remove('is-resizing-mobile-aside');

    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', stopDrag, true);
    window.removeEventListener('pointercancel', stopDrag, true);
    window.removeEventListener('mousemove', onPointerMove, true);
    window.removeEventListener('mouseup', stopDrag, true);
    window.removeEventListener('touchmove', onTouchMove, true);
    window.removeEventListener('touchend', stopDrag, true);
    window.removeEventListener('touchcancel', stopDrag, true);

    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }

    const shell = getShell();

    // If it was a quick tap on the handle without dragging:
    if (!hasMoved && shell) {
      const currentH = shell.getBoundingClientRect().height;
      const defaultH = Math.floor(window.innerHeight * 0.42);
      // Toggle between collapsed (32px) and expanded
      const targetH = currentH <= 45 ? defaultH : 32;
      shell.style.setProperty('height', `${targetH}px`, 'important');
      try {
        window.localStorage.setItem(MOBILE_ASIDE_HEIGHT_KEY, String(targetH));
      } catch {
        // Ignore
      }
      return;
    }

    if (pendingHeight !== null) {
      updateHeight();
    }

    try {
      if (shell) {
        const finalHeight = shell.getBoundingClientRect().height;
        window.localStorage.setItem(MOBILE_ASIDE_HEIGHT_KEY, String(finalHeight));
      }
    } catch {
      // Ignore storage write errors.
    }
  };

  const startDrag = (e) => {
    if (window.innerWidth > 768) return;

    const shell = getShell();
    if (!shell) return;

    if (e.cancelable) e.preventDefault();
    e.stopPropagation?.();
    isDragging = true;
    hasMoved = false;

    if (e.pointerId !== undefined && handleEl.setPointerCapture) {
      try {
        handleEl.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture fallback
      }
    }

    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startHeight = shell.getBoundingClientRect().height;
    handleEl.classList.add('dragging');
    document.body.classList.add('is-resizing-mobile-aside');

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', stopDrag, true);
    window.addEventListener('pointercancel', stopDrag, true);
    window.addEventListener('mousemove', onPointerMove, true);
    window.addEventListener('mouseup', stopDrag, true);
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    window.addEventListener('touchend', stopDrag, true);
    window.addEventListener('touchcancel', stopDrag, true);
  };

  handleEl.addEventListener('pointerdown', startDrag, { passive: false });
  handleEl.addEventListener('touchstart', startDrag, { passive: false });
  handleEl.addEventListener('mousedown', startDrag, { passive: false });

  // Synchronously compute initial height on setup
  const initShell = () => {
    if (window.innerWidth > 768) return;
    const shell = getShell();
    if (!shell) return;
    try {
      const stored = Number(window.localStorage.getItem(MOBILE_ASIDE_HEIGHT_KEY));
      const minH = 32;
      const maxH = Math.floor(window.innerHeight * 0.70);
      const defaultH = Math.floor(window.innerHeight * 0.42);
      const targetH = (Number.isFinite(stored) && stored >= 32) ? stored : defaultH;
      const clamped = Math.max(minH, Math.min(maxH, targetH));
      shell.style.setProperty('height', `${clamped}px`, 'important');
    } catch {
      // Ignore storage read errors.
    }
  };

  initShell();
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    window.requestAnimationFrame(initShell);
  }

  return () => {
    handleEl.removeEventListener('pointerdown', startDrag);
    handleEl.removeEventListener('touchstart', startDrag);
    handleEl.removeEventListener('mousedown', startDrag);
    stopDrag();
  };
}
