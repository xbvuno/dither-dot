import { useState } from 'react';
import { createPortal } from 'react-dom';
import { isGifFile, getReducedDimensions, scaleDownBlob, getExportBaseName } from '../../utils/importUtils';
import './styles/importPage.css';

export default function LargeImageDialog({ file, name, dims, onConfirm, onCancel }) {
  const gif = isGifFile(file);
  const reduced = getReducedDimensions(dims.width, dims.height);
  const [isReducing, setIsReducing] = useState(false);

  const handleReduce = async () => {
    if (gif || isReducing) return;
    setIsReducing(true);
    try {
      const scaledBlob = await scaleDownBlob(file, reduced.width, reduced.height);
      const reducedName = `${getExportBaseName(name)}-${reduced.width}x${reduced.height}.png`;
      await onConfirm(scaledBlob, reducedName);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'IMAGE REDUCTION FAILED.');
    } finally {
      setIsReducing(false);
    }
  };

  const handleContinue = async () => {
    await onConfirm(file, name);
  };

  return createPortal(
    <div className='large-file-overlay' onClick={onCancel}>
      <div className='large-file-dialog' onClick={(event) => event.stopPropagation()}>
        <p className='large-file-dialog-title'>LARGE IMAGE DETECTED</p>
        <p className='large-file-dialog-dims'>CURRENT SIZE: {dims.width} x {dims.height}</p>
        <p className='large-file-dialog-body'>
          LARGE IMAGE. PROCESSING MAY BE SLOW.
          {gif && <><br />GIFS WITH MANY FRAMES MAY BECOME SIGNIFICANTLY SLOWER.</>}
        </p>
        <div className='large-file-dialog-actions'>
          {!gif && (
            <button
              type='button'
              className='bv-option-btn large-file-btn-reduce'
              onClick={handleReduce}
              disabled={isReducing}
            >
              {isReducing ? 'REDUCING...' : `REDUCE TO ${reduced.width}x${reduced.height}`}
            </button>
          )}
          <button
            type='button'
            className='bv-option-btn'
            onClick={handleContinue}
            disabled={isReducing}
          >
            CONTINUE {dims.width}x{dims.height}
          </button>
          <button
            type='button'
            className='bv-option-btn danger-btn'
            onClick={onCancel}
            disabled={isReducing}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
