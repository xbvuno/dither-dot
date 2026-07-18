import { useEffect, useRef } from "react";
import { ditherEngine } from "../../engine/DitherEngine";

export default function ShaderImage({ sourceImg }) {
  const canvasHostRef = useRef(null);

  useEffect(() => {
    if (!sourceImg || !canvasHostRef.current) return;

    ditherEngine.log("Pipeline", "ShaderImage React wrapper initializing with source:", sourceImg);
    ditherEngine.init(canvasHostRef.current, sourceImg);

    return () => {
      ditherEngine.log("Pipeline", "ShaderImage React wrapper destroying");
      ditherEngine.destroy();
    };
  }, [sourceImg]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} id='render'>
      <div
        ref={canvasHostRef}
        className="render-canvas-layer"
        style={{
          visibility: 'visible',
          opacity: 1,
          position: 'absolute',
          inset: '0',
        }}
      />
    </div>
  );
}