import { useEffect, useRef } from "react";
import { getPaletteReference, subscribePaletteReference } from "../../utils/canvasRegistry";

export default function PostProcessShader() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const hostRef = useRef(null);

  useEffect(() => {
    const drawReference = (ref) => {
      if (!ref || !ref.pixels || !ref.width || !ref.height || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const { width, height, pixels } = ref;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (hostRef.current) {
        hostRef.current.style.width = `${width}px`;
        hostRef.current.style.height = `${height}px`;
      }
      if (containerRef.current) {
        containerRef.current.style.width = `${width}px`;
        containerRef.current.style.height = `${height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        const imgData = new ImageData(new Uint8ClampedArray(pixels), width, height);
        ctx.putImageData(imgData, 0, 0);
      }
    };

    drawReference(getPaletteReference());
    const unsubscribe = subscribePaletteReference(drawReference);

    const onReady = () => drawReference(getPaletteReference());
    window.addEventListener('dither-render-ready', onReady);
    window.addEventListener('split-compare-layout-changed', onReady);

    return () => {
      unsubscribe();
      window.removeEventListener('dither-render-ready', onReady);
      window.removeEventListener('split-compare-layout-changed', onReady);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }} id='render'>
      <div
        ref={hostRef}
        className="render-canvas-layer"
        style={{
          visibility: 'visible',
          opacity: 1,
          position: 'absolute',
          inset: '0',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  );
}
