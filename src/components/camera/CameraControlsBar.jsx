import { useState } from 'react';
import { Camera, Aperture } from 'lucide-react';
import useWebcamStore from '../../stores/media/webcamStore';
import { compositeWithWatermark, getExportCanvasOrThrow } from '../../utils/importUtils';
import './styles/CameraControlsBar.css';

export default function CameraControlsBar() {
  const active = useWebcamStore((s) => s.active);
  const frameReady = useWebcamStore((s) => s.frameReady);
  const shoots = useWebcamStore((s) => s.shoots);
  const addShoot = useWebcamStore((s) => s.addShoot);
  const [capturing, setCapturing] = useState(false);

  if (!active) return null;

  const handleTakeShoot = async () => {
    if (capturing || !frameReady) return;
    setCapturing(true);

    try {
      const baseExportCanvas = getExportCanvasOrThrow();
      const canvas = await compositeWithWatermark(baseExportCanvas);
      const dataUrl = canvas.toDataURL('image/png');

      const shootId = `shoot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = Date.now();
      const name = `camera-shoot-${timestamp}`;

      addShoot({
        id: shootId,
        dataUrl,
        canvas,
        timestamp,
        name,
      });
    } catch (err) {
      console.error('[CAMERA SHOOT ERROR]', err);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className='camera-controls-bar' role='toolbar' aria-label='Camera Actions'>
      <button
        type='button'
        className='bv-option-btn camera-snap-btn'
        onClick={handleTakeShoot}
        disabled={!frameReady || capturing}
        title={!frameReady ? 'Waiting for camera frame...' : 'Take Photo'}
      >
        <Aperture size={13} strokeWidth={1.5} className={capturing ? 'animate-spin' : ''} />
        {capturing ? 'CAPTURING...' : 'SNAP PHOTO'}
      </button>

      <div className='camera-shoots-counter'>
        SHOOTS: <span className='camera-shoots-count-num'>{shoots.length}</span>
      </div>
    </div>
  );
}
