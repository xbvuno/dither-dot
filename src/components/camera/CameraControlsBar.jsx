import { useState, useEffect, useCallback } from 'react';
import { Aperture, Zap } from 'lucide-react';
import useWebcamStore from '../../stores/media/webcamStore';
import { compositeWithWatermark, getExportCanvasOrThrow } from '../../utils/importUtils';
import { notify } from '../../stores/ui/popupStore';
import { triggerHapticPulse } from '../../utils/haptics';
import snapSound from '../../assets/sounds/snap.mp3';
import './styles/CameraControlsBar.css';

export default function CameraControlsBar() {
  const active = useWebcamStore((s) => s.active);
  const shoots = useWebcamStore((s) => s.shoots) || [];
  const addShoot = useWebcamStore((s) => s.addShoot);
  const torchSupported = useWebcamStore((s) => s.torchSupported);
  const torchOn = useWebcamStore((s) => s.torchOn);
  const toggleTorch = useWebcamStore((s) => s.toggleTorch);
  const [capturing, setCapturing] = useState(false);

  const playSnapSound = () => {
    try {
      const audio = new Audio(snapSound);
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch {
      // Ignore audio policy errors
    }
  };

  const handleTakeShoot = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    triggerHapticPulse(25);
    playSnapSound();

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
      notify('PHOTO CAPTURED', 'success');
    } catch (err) {
      console.error('[CAMERA SHOOT ERROR]', err);
    } finally {
      setCapturing(false);
    }
  }, [capturing, addShoot]);

  useEffect(() => {
    if (!active) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === ' ' || event.code === 'Space') {
        const activeEl = document.activeElement;
        const isInput = activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable
        );

        if (!isInput) {
          event.preventDefault();
          handleTakeShoot();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handleTakeShoot]);

  if (!active) return null;

  return (
    <div className='camera-controls-bar' role='toolbar' aria-label='Camera Actions'>
      <button
        type='button'
        className='bv-option-btn camera-snap-btn'
        onClick={handleTakeShoot}
        disabled={capturing}
        title='Snap photo (Space)'
      >
        <Aperture size={16} strokeWidth={1.5} className={capturing ? 'animate-spin' : ''} />
      </button>

      {torchSupported && (
        <button
          type='button'
          className={`bv-option-btn camera-torch-btn${torchOn ? ' active' : ''}`}
          onClick={toggleTorch}
          title='Toggle camera torch / flashlight'
        >
          <Zap size={15} strokeWidth={1.5} className={torchOn ? 'fill-current' : ''} />
        </button>
      )}

      <span className='bv-label camera-shoots-label'>
        SHOOTS: {shoots?.length || 0}
      </span>
    </div>
  );
}
