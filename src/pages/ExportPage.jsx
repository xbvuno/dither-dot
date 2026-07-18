import { useEffect, useState } from 'react';
import { Save, Copy, Eye } from 'lucide-react';
import useImageStore from '../stores/media/imageStore';
import useGifStore from '../stores/media/gifStore';
import { getOutputCanvas } from '../utils/canvasRegistry';
import { exportCurrentGif } from '../utils/exportGif';
import SliderBundle from '../components/ui/shared/SliderBundle';

function getExportBaseName(sourceName = '') {
  return sourceName.replace(/\.[^.]+$/, '').trim() || 'export';
}

function getDefaultExportName(sourceName = '') {
  const base = getExportBaseName(sourceName);
  return base.endsWith('_DITHERED') ? base : `${base}_DITHERED`;
}

async function saveCanvasAsPng(canvas, exportName) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${getExportBaseName(exportName)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

function createUpscaledCanvas(sourceCanvas, upscale = 1) {
  const factor = Math.max(1, Math.floor(Number(upscale) || 1));
  if (factor === 1) return sourceCanvas;

  const nextCanvas = document.createElement('canvas');
  nextCanvas.width = Math.max(1, Math.floor(sourceCanvas.width * factor));
  nextCanvas.height = Math.max(1, Math.floor(sourceCanvas.height * factor));

  const ctx = nextCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
  return nextCanvas;
}

async function copyCanvasToClipboard(canvas) {
  if (!navigator.clipboard?.write) {
    throw new Error('Clipboard write API is not available in this browser.');
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 'image/png');
  });
}

function getExportCanvasOrThrow() {
  const canvas = getOutputCanvas();
  if (!canvas) {
    throw new Error('No output to export yet. Process an image first.');
  }
  return canvas;
}

async function canvasToDataUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

export default function ExportPage() {
  const sourceName = useImageStore(s => s.sourceName);
  const previewUrl = useImageStore(s => s.exportPreviewUrl);
  const setExportPreviewUrl = useImageStore(s => s.setExportPreviewUrl);
  const gifFrames = useGifStore(s => s.frames);
  const frameStates = useGifStore(s => s.frameStates);
  const [exportName, setExportName] = useState(getDefaultExportName(sourceName));
  const [upscale, setUpscale] = useState(1);
  const [status, setStatus] = useState(null);
  const [gifExporting, setGifExporting] = useState(false);
  const [previewGenerating, setPreviewGenerating] = useState(false);

  const isGifSource = gifFrames.length > 1;
  const exportFormat = isGifSource ? 'GIF' : 'PNG';
  const exportBaseName = getExportBaseName(exportName.trim() || getDefaultExportName(sourceName));
  const canvas = getOutputCanvas();
  const baseWidth = canvas?.width || 0;
  const baseHeight = canvas?.height || 0;
  const finalWidth = baseWidth * upscale;
  const finalHeight = baseHeight * upscale;
  
  // Check if all GIF frames are rendered
  const allFramesRendered = frameStates.length > 0 && frameStates.every(state => state === 'done');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportName(getDefaultExportName(sourceName));
  }, [sourceName]);

  const withCanvas = async (fn) => {
    try {
      await fn(getExportCanvasOrThrow());
      setStatus(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Export failed.';
      setStatus(msg);
      setTimeout(() => setStatus(null), 3500);
    }
  };

  const handleGeneratePreview = async () => {
    if (isGifSource) {
      if (!allFramesRendered) {
        setStatus('CANNOT GENERATE GIF PREVIEW: NOT ALL FRAMES DITHERED YET');
        setTimeout(() => setStatus(null), 3500);
        return;
      }
      
      try {
        setPreviewGenerating(true);
        const gifDataUrl = await exportCurrentGif(exportBaseName, { upscale, returnDataUrl: true });
        setExportPreviewUrl(gifDataUrl);
        setStatus(null);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'GIF preview generation failed';
        setStatus(msg);
        setTimeout(() => setStatus(null), 3500);
      } finally {
        setPreviewGenerating(false);
      }
    } else {
      try {
        setPreviewGenerating(true);
        const upscaledCanvas = createUpscaledCanvas(getExportCanvasOrThrow(), upscale);
        const dataUrl = await canvasToDataUrl(upscaledCanvas);
        setExportPreviewUrl(dataUrl);
        setStatus(null);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Preview generation failed';
        setStatus(msg);
        setTimeout(() => setStatus(null), 3500);
      } finally {
        setPreviewGenerating(false);
      }
    }
  };

  useEffect(() => {
    const canvasExists = !!getOutputCanvas();
    const canGenerate = canvasExists && (!isGifSource || allFramesRendered);
    if (canGenerate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleGeneratePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFramesRendered, isGifSource, sourceName, upscale]);

  const handleCopy = async () => {
    try {
      setPreviewGenerating(true);
      setStatus('GENERATING PREVIEW...');
      
      const canvasNode = getExportCanvasOrThrow();
      const upscaledCanvas = createUpscaledCanvas(canvasNode, upscale);
      
      // Generate preview first
      if (isGifSource) {
        if (!allFramesRendered) {
          setStatus('CANNOT GENERATE GIF PREVIEW: NOT ALL FRAMES DITHERED YET');
          setTimeout(() => setStatus(null), 3500);
          return;
        }
        const gifDataUrl = await exportCurrentGif(exportBaseName, { upscale, returnDataUrl: true });
        setExportPreviewUrl(gifDataUrl);
      } else {
        const dataUrl = await canvasToDataUrl(upscaledCanvas);
        setExportPreviewUrl(dataUrl);
      }
      
      setStatus('COPYING TO CLIPBOARD...');
      // Copy to clipboard
      await copyCanvasToClipboard(upscaledCanvas);
      setStatus('COPIED TO CLIPBOARD!');
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Copy failed.';
      setStatus(msg);
      setTimeout(() => setStatus(null), 3500);
    } finally {
      setPreviewGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!isGifSource) {
      await withCanvas((canvasNode) => saveCanvasAsPng(createUpscaledCanvas(canvasNode, upscale), exportBaseName));
      return;
    }

    try {
      setGifExporting(true);
      setStatus('');
      await exportCurrentGif(exportBaseName, { upscale });
      setStatus('GIF EXPORTED.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'GIF EXPORT FAILED.';
      setStatus(msg);
      setTimeout(() => setStatus(null), 3500);
    } finally {
      setGifExporting(false);
    }
  };

  return (
    <div>
      <div className='bv-macro-section'>
        <h2>EXPORT</h2>
        <div className='bv-section'>
          <p className='bv-label'>EXPORT NAME</p>
          <div className='export-name-input-row'>
            <input
              type='text'
              className='import-name-input'
              value={exportName}
              onChange={(event) => setExportName(event.target.value)}
              spellCheck={false}
              disabled={gifExporting}
            />
            <span className='export-name-format'>{exportFormat}</span>
          </div>
        </div>

        <div className='bv-section'>
          <SliderBundle
            label='UPSCALE'
            min={1}
            max={10}
            step={1}
            defaultValue={1}
            value={upscale}
            onChange={setUpscale}
          />
        </div>

        <div className='bv-section'>
          <div className='bv-option-group'>
            <button
              type='button'
              className='bv-option-btn export-btn'
              onClick={handleGeneratePreview}
              disabled={gifExporting || previewGenerating || (isGifSource && !allFramesRendered)}
            >
              <Eye size={13} strokeWidth={1.5} />
              {previewGenerating ? 'GENERATING...' : previewUrl ? 'REFRESH PREVIEW' : 'GENERATE PREVIEW'}
            </button>
            <button
              type='button'
              className='bv-option-btn export-btn'
              onClick={handleSave}
              disabled={gifExporting}
            >
              <Save size={13} strokeWidth={1.5} />
              {gifExporting ? 'EXPORTING GIF...' : isGifSource ? 'SAVE GIF' : 'SAVE PNG'}
            </button>
            <button
              type='button'
              className='bv-option-btn export-btn'
              onClick={handleCopy}
              disabled={gifExporting || previewGenerating || (isGifSource && !allFramesRendered)}
            >
              <Copy size={13} strokeWidth={1.5} />
              COPY
            </button>
          </div>
          {status && <p className='import-export-status'>{status}</p>}
        </div>

        {previewUrl && (
          <div className='bv-section'>
            <p className='bv-label'>PREVIEW ({finalWidth} x {finalHeight})</p>
            <img
              src={previewUrl}
              className='export-preview-floating'
              alt='preview'
            />
            <p className='export-preview-hint'>DRAG AND DROP IT EVERYWHERE</p>
          </div>
        )}
      </div>
    </div>
  );
}

