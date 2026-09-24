import { useEffect, useRef } from "react";
import { ditherEngine } from "../../engine/DitherEngine";

export default function ShaderImage({ sourceImg }) {
  const canvasHostRef = useRef(null);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!sourceImg || !host) return;

    ditherEngine.log("Pipeline", "ShaderImage React wrapper initializing with source:", sourceImg);
    ditherEngine.init(host, sourceImg);

    return () => {
      ditherEngine.log("Pipeline", "ShaderImage React wrapper detaching canvas host");
      ditherEngine.detach(host);
    };
  }, [sourceImg]);

  return (
    <div style={{ position: 'relative' }} id='render'>
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