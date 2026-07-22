const MOBILE_ASIDE_HEIGHT_KEY = 'dither-dot:mobile-aside-height';

export function setupMobileResize(handleEl, getShellEl) {
  if (!handleEl) return () => {};

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;
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
    let newHeight = startHeight + deltaY;

    const minH = 100; // 100px min height
    const maxH = Math.floor(window.innerHeight * 0.70); // 70% of viewport max
    newHeight = Math.max(minH, Math.min(maxH, newHeight));

    pendingHeight = newHeight;
    if (rafId === null) {
      rafId = window.requestAnimationFrame(updateHeight);
    }
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    onMove(e.clientY);
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    if (e.touches && e.touches.length > 0) {
      if (e.cancelable) e.preventDefault();
      onMove(e.touches[0].clientY);
    }
  };

  const stopDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    handleEl.classList.remove('dragging');
    document.body.classList.remove('is-resizing-mobile-aside');

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', stopDrag);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', stopDrag);
    window.removeEventListener('touchcancel', stopDrag);

    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (pendingHeight !== null) {
      updateHeight();
    }

    try {
      const shell = getShell();
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
    isDragging = true;

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

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);
  };

  handleEl.addEventListener('pointerdown', startDrag);
  handleEl.addEventListener('touchstart', startDrag, { passive: false });
  handleEl.addEventListener('mousedown', startDrag);

  // Restore stored height on initialization if available
  try {
    const stored = Number(window.localStorage.getItem(MOBILE_ASIDE_HEIGHT_KEY));
    if (Number.isFinite(stored) && stored > 0 && window.innerWidth <= 768) {
      const shell = getShell();
      if (shell) {
        const minH = 100;
        const maxH = Math.floor(window.innerHeight * 0.70);
        const clamped = Math.max(minH, Math.min(maxH, stored));
        shell.style.setProperty('height', `${clamped}px`, 'important');
      }
    }
  } catch {
    // Ignore storage read errors.
  }

  return () => {
    handleEl.removeEventListener('pointerdown', startDrag);
    handleEl.removeEventListener('touchstart', startDrag);
    handleEl.removeEventListener('mousedown', startDrag);
    stopDrag();
  };
}
