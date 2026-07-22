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
      shell.style.setProperty('max-height', '65vh', 'important');
    }
    pendingHeight = null;
  };

  const onMove = (clientY) => {
    if (!isDragging) return;
    const deltaY = startY - clientY; // Dragging UP increases height
    let newHeight = startHeight + deltaY;

    const minH = 120; // 120px min height
    const maxH = window.innerHeight * 0.65; // 65% of viewport max
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
      onMove(e.touches[0].clientY);
    }
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    handleEl.classList.remove('dragging');
    document.body.classList.remove('is-resizing-mobile-aside');

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onPointerUp);
    window.removeEventListener('touchcancel', onPointerUp);

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

  const onPointerDown = (e) => {
    if (window.innerWidth > 768) return;

    const shell = getShell();
    if (!shell) return;

    e.preventDefault();
    isDragging = true;
    startY = e.clientY || e.touches?.[0]?.clientY || 0;
    startHeight = shell.getBoundingClientRect().height;
    handleEl.classList.add('dragging');
    document.body.classList.add('is-resizing-mobile-aside');

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    window.addEventListener('touchcancel', onPointerUp);
  };

  handleEl.addEventListener('pointerdown', onPointerDown);

  // Restore stored height on initialization if available
  try {
    const stored = Number(window.localStorage.getItem(MOBILE_ASIDE_HEIGHT_KEY));
    if (Number.isFinite(stored) && stored > 0 && window.innerWidth <= 768) {
      const shell = getShell();
      if (shell) {
        const minH = 120;
        const maxH = window.innerHeight * 0.65;
        const clamped = Math.max(minH, Math.min(maxH, stored));
        shell.style.setProperty('height', `${clamped}px`, 'important');
      }
    }
  } catch {
    // Ignore storage read errors.
  }

  return () => {
    handleEl.removeEventListener('pointerdown', onPointerDown);
    onPointerUp();
  };
}
