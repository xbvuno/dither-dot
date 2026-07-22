import { useEffect, useState } from 'react';
import { Save, Copy, FlipHorizontal, SwitchCamera } from 'lucide-react';
import useWebcamStore from '../../stores/media/webcamStore';
import {
  compositeWithWatermark,
  getExportCanvasOrThrow,
  saveCanvasAsPng,
  copyCanvasToClipboard,
} from '../../utils/importUtils';

export default function WebcamSection() {
  const active = useWebcamStore((s) => s.active);
  const starting = useWebcamStore((s) => s.starting);
  const frameReady = useWebcamStore((s) => s.frameReady);
  const error = useWebcamStore((s) => s.error);
  const mirrored = useWebcamStore((s) => s.mirrored);
  const facingMode = useWebcamStore((s) => s.facingMode);
  const targetFps = useWebcamStore((s) => s.targetFps);
  const toggleMirrored = useWebcamStore((s) => s.toggleMirrored);
  const toggleFacingMode = useWebcamStore((s) => s.toggleFacingMode);
  const setTargetFps = useWebcamStore((s) => s.setTargetFps);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!status) return undefined;

    const timeoutId = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const withOutputCanvas = async (action) => {
    try {
      const canvas = await compositeWithWatermark(getExportCanvasOrThrow());
      await action(canvas);
      setStatus(null);
    } catch (cameraError) {
      const message = cameraError instanceof Error ? cameraError.message : 'Camera screenshot failed.';
      setStatus(message);
    }
  };

  const handleSaveScreenshot = async () => {
    await withOutputCanvas((canvas) => saveCanvasAsPng(canvas, `webcam-screenshot-${Date.now()}`));
  };

  const handleCopyScreenshot = async () => {
    await withOutputCanvas(copyCanvasToClipboard);
  };

  return (
    <>
      <div className='bv-section'>
        <p className='bv-label'>CAMERA CONTROLS</p>
        <div className='bv-option-group'>
          <button
            type='button'
            className={`bv-option-btn import-btn${facingMode === 'environment' ? ' active' : ''}`}
            onClick={toggleFacingMode}
            disabled={starting}
            title='Switch between front and back camera'
          >
            <SwitchCamera size={13} strokeWidth={1.5} />
            {facingMode === 'user' ? 'CAM: FRONT' : 'CAM: REAR'}
          </button>
          <button
            type='button'
            className={`bv-option-btn import-btn${mirrored ? ' active' : ''}`}
            onClick={toggleMirrored}
            title='Mirror video horizontally'
          >
            <FlipHorizontal size={13} strokeWidth={1.5} />
            FLIP
          </button>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={handleSaveScreenshot}
            disabled={!frameReady}
            title={!frameReady ? 'Waiting for first rendered frame…' : undefined}
          >
            <Save size={13} strokeWidth={1.5} />
            SAVE SHOT
          </button>
          <button
            type='button'
            className='bv-option-btn import-btn'
            onClick={handleCopyScreenshot}
            disabled={!frameReady}
            title={!frameReady ? 'Waiting for first rendered frame…' : undefined}
          >
            <Copy size={13} strokeWidth={1.5} />
            COPY SHOT
          </button>
        </div>
        {error && <p className='import-export-status'>{error}</p>}
        {!error && status && <p className='import-export-status'>{status}</p>}
      </div>

      <div className='bv-section'>
        <p className='bv-label'>TARGET FPS</p>
        <div className='bv-option-group'>
          {[5, 10, 15, 20, 30].map((fps) => (
            <button
              key={fps}
              type='button'
              className={`bv-option-btn${targetFps === fps ? ' active' : ''}`}
              onClick={() => setTargetFps(fps)}
            >
              {fps}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
