import { useRef, useEffect, useCallback } from 'react';

/**
 * 2D Color Wheel (Hue x Saturation).
 * Draws a smooth HSV chromatic disk on an HTML5 canvas.
 * Can be interactive (single-color) or purely visual (multi-color).
 */
export default function ColorWheel({
  hue = 0,
  saturation = 100,
  value = 100,
  points = null,
  interactive = true,
  onChange,
  size = 160,
}) {
  const canvasRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = size;
    const height = size;
    const radius = width / 2;
    const centerX = radius;
    const centerY = radius;

    canvas.width = width;
    canvas.height = height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const vNorm = (Number(value) || 100) / 100;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pixelIndex = (y * width + x) * 4;

        if (dist <= radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;

          const sat = Math.min(1, dist / radius);

          // Convert HSV to RGB
          const c = vNorm * sat;
          const hPrime = angle / 60;
          const xVal = c * (1 - Math.abs((hPrime % 2) - 1));
          const m = vNorm - c;

          let r, g, b;
          if (hPrime >= 0 && hPrime < 1) { r = c; g = xVal; b = 0; }
          else if (hPrime >= 1 && hPrime < 2) { r = xVal; g = c; b = 0; }
          else if (hPrime >= 2 && hPrime < 3) { r = 0; g = c; b = xVal; }
          else if (hPrime >= 3 && hPrime < 4) { r = 0; g = xVal; b = c; }
          else if (hPrime >= 4 && hPrime < 5) { r = xVal; g = 0; b = c; }
          else { r = c; g = 0; b = xVal; }

          const edgeDistance = radius - dist;
          const alpha = edgeDistance < 1 ? Math.max(0, edgeDistance) : 1;

          data[pixelIndex] = Math.round((r + m) * 255);
          data[pixelIndex + 1] = Math.round((g + m) * 255);
          data[pixelIndex + 2] = Math.round((b + m) * 255);
          data[pixelIndex + 3] = Math.round(alpha * 255);
        } else {
          data[pixelIndex + 3] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [size, value]);

  const updateFromCoords = useCallback((clientX, clientY) => {
    if (!interactive || !onChange) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const radius = size / 2;
    const dx = x - radius;
    const dy = y - radius;

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const sat = Math.min(100, Math.max(0, Math.round((dist / radius) * 100)));

    onChange({
      h: Math.round(angle),
      s: sat,
    });
  }, [size, onChange, interactive]);

  const handlePointerDown = (e) => {
    if (!interactive) return;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromCoords(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (!interactive || !isDraggingRef.current) return;
    updateFromCoords(e.clientX, e.clientY);
  };

  const handlePointerUp = (e) => {
    if (!interactive) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const radius = size / 2;
  const pointList = points && points.length > 0
    ? points
    : [{ h: hue, s: saturation }];

  return (
    <div
      className="pe-wheel-container"
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        cursor: interactive ? 'crosshair' : 'default',
        touchAction: interactive ? 'none' : 'auto',
        userSelect: 'none',
      }}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onPointerCancel={interactive ? handlePointerUp : undefined}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: `${size}px`,
          height: `${size}px`,
          border: 'none',
          outline: 'none',
        }}
      />

      {/* Crosshair indicator(s) */}
      {pointList.map((pt, idx) => {
        const angleRad = (pt.h * Math.PI) / 180;
        const distFromCenter = ((pt.s ?? 100) / 100) * radius;
        const indicatorX = radius + distFromCenter * Math.cos(angleRad);
        const indicatorY = radius + distFromCenter * Math.sin(angleRad);

        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${indicatorX}px`,
              top: `${indicatorY}px`,
              width: '10px',
              height: '10px',
              transform: 'translate(-50%, -50%)',
              border: '2px solid #ffffff',
              boxShadow: '0 0 0 1px #000000',
              backgroundColor: pt.hex || 'transparent',
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        );
      })}
    </div>
  );
}
