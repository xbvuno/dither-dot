import { useEffect, useState } from 'react';
import { Save, Copy, Eye, Trash2 } from 'lucide-react';
import MacroSection from '../components/ui/MacroSection';
import OptionGroup from '../components/ui/shared/OptionGroup';
import useImageStore from '../stores/media/imageStore';
import useGifStore from '../stores/media/gifStore';
import useWebcamStore from '../stores/media/webcamStore';
import { getOutputCanvas } from '../utils/canvasRegistry';
import { exportCurrentGif } from '../utils/exportGif';
import SliderBundle from '../components/ui/shared/SliderBundle';

const LIVE_PREVIEW_STORAGE_KEY = 'dither-dot:export-live-preview';

function getStoredLivePreview() {
  try {
    const val = localStorage.getItem(LIVE_PREVIEW_STORAGE_KEY);
    return val !== null ? val === 'true' : true;
  } catch {
    return true;
  }
}

function getExportBaseName(sourceName = '') {
  return sourceName.replace(/\.[^.]+$/, '').trim() || 'export';
}

function getDefaultExportName(sourceName = '') {
  const base = getExportBaseName(sourceName);
  return base.endsWith('_DITHERED') ? base : `${base}_DITHERED`;
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
  const lastRenderJobId = useImageStore(s => s.lastRenderJobId);
  const gifFrames = useGifStore(s => s.frames);
  const shoots = useWebcamStore((s) => s.shoots) || [];
  const deleteShoot = useWebcamStore((s) => s.deleteShoot);
  const clearShoots = useWebcamStore((s) => s.clearShoots);

  const [exportName, setExportName] = useState(getDefaultExportName(sourceName));
  const exportUpscale = useImageStore(s => s.exportUpscale);
  const setExportUpscale = useImageStore(s => s.setExportUpscale);
  const upscale = exportUpscale;
  const setUpscale = setExportUpscale;
  const [livePreview, setLivePreview] = useState(getStoredLivePreview);
  const [status, setStatus] = useState(null);
  const [gifExporting, setGifExporting] = useState(false);
  const [previewGenerating, setPreviewGenerating] = useState(false);
  const [previewJobId, setPreviewJobId] = useState(null);
  const [previewUpscale, setPreviewUpscale] = useState(null);

  const isGifSource = gifFrames.length > 1;
  const exportFormat = isGifSource ? 'GIF' : 'PNG';
  const exportBaseName = getExportBaseName(exportName.trim() || getDefaultExportName(sourceName));
  const canvas = getOutputCanvas();
  const baseWidth = canvas?.width || 0;
  const baseHeight = canvas?.height || 0;
  const finalWidth = baseWidth * upscale;
  const finalHeight = baseHeight * upscale;
  
  const isPreviewValid = isGifSource
    ? Boolean(previewUrl && previewJobId === lastRenderJobId && previewUpscale === upscale)
    : Boolean(previewUrl && (previewJobId === lastRenderJobId || livePreview));

  const handleToggleLivePreview = (val) => {
    const isLive = val === 'on' || val === true;
    setLivePreview(isLive);
    if (isLive) {
      setUpscale(1);
    }
    try {
      localStorage.setItem(LIVE_PREVIEW_STORAGE_KEY, String(isLive));
    } catch {
      // ignore
    }
  };

  const handleUpscaleChange = (newUpscale) => {
    const nextVal = Math.max(1, Math.floor(Number(newUpscale) || 1));
    setUpscale(nextVal);
    if (nextVal > 1 && livePreview) {
      setLivePreview(false);
      try {
        localStorage.setItem(LIVE_PREVIEW_STORAGE_KEY, 'false');
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    if (livePreview && upscale > 1) {
      setUpscale(1);
    }
  }, [livePreview, upscale, setUpscale]);

  useEffect(() => {
    setExportName(getDefaultExportName(sourceName));
  }, [sourceName]);

  const handleGeneratePreview = async () => {
    const currentUpscale = upscale;

    if (isGifSource) {
      try {
        setPreviewGenerating(true);
        setStatus('GENERATING: 0%');
        const gifDataUrl = await exportCurrentGif(exportBaseName, {
          upscale,
          returnDataUrl: true,
          onProgress: ({ done, total }) => {
            setStatus(`GENERATING: ${Math.round((done / total) * 100)}%`);
          }
        });
        setExportPreviewUrl(gifDataUrl);
        setPreviewJobId(useImageStore.getState().lastRenderJobId);
        setPreviewUpscale(currentUpscale);
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
        setPreviewJobId(useImageStore.getState().lastRenderJobId);
        setPreviewUpscale(currentUpscale);
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
    if (!livePreview) return;
    if (isGifSource) return;

    let canceled = false;
    let idleHandle = null;

    const generateLazy = async () => {
      if (canceled) return;
      const outputCanvas = getOutputCanvas();
      if (!outputCanvas) return;

      try {
        // Force upscale to 1 for lightweight, non-blocking lazy live preview
        const dataUrl = await canvasToDataUrl(outputCanvas);
        if (!canceled) {
          setExportPreviewUrl(dataUrl);
          setPreviewJobId(useImageStore.getState().lastRenderJobId);
          setPreviewUpscale(1);
        }
      } catch {
        // silent fail on discarded frame
      }
    };

    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(
          () => {
            generateLazy();
          },
          { timeout: 1000 }
        );
      } else {
        generateLazy();
      }
    }, 250);

    return () => {
      canceled = true;
      clearTimeout(timer);
      if (idleHandle && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [livePreview, lastRenderJobId, sourceName, isGifSource, setExportPreviewUrl]);

  const handleCopy = async () => {
    try {
      setPreviewGenerating(true);
      
      const canvasNode = getExportCanvasOrThrow();
      const upscaledCanvas = createUpscaledCanvas(canvasNode, upscale);
      
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
    if (!previewUrl) return;

    try {
      setGifExporting(true);
      setStatus('SAVING...');
      const anchor = document.createElement('a');
      anchor.download = `${exportBaseName}.${isGifSource ? 'gif' : 'png'}`;

      let objectUrl = null;
      if (isGifSource) {
        anchor.href = previewUrl;
      } else {
        const upscaledCanvas = createUpscaledCanvas(getExportCanvasOrThrow(), upscale);
        const blob = await new Promise((resolve, reject) => {
          upscaledCanvas.toBlob((nextBlob) => {
            if (!nextBlob) {
              reject(new Error('Canvas export failed.'));
              return;
            }
            resolve(nextBlob);
          }, 'image/png');
        });
        objectUrl = URL.createObjectURL(blob);
        anchor.href = objectUrl;
      }

      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setStatus(isGifSource ? 'GIF EXPORTED.' : 'PNG EXPORTED.');
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Save failed.';
      setStatus(msg);
      setTimeout(() => setStatus(null), 3500);
    } finally {
      setGifExporting(false);
    }
  };

  const handleSaveShoot = async (shoot) => {
    try {
      if (shoot.canvas) {
        const upCanvas = createUpscaledCanvas(shoot.canvas, upscale);
        const link = document.createElement('a');
        link.download = `${shoot.name}.png`;
        link.href = upCanvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const link = document.createElement('a');
        link.download = `${shoot.name}.png`;
        link.href = shoot.dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setStatus('PHOTO SAVED.');
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save photo failed.');
    }
  };

  const handleCopyShoot = async (shoot) => {
    try {
      if (shoot.canvas) {
        const upCanvas = createUpscaledCanvas(shoot.canvas, upscale);
        await copyCanvasToClipboard(upCanvas);
      } else {
        const response = await fetch(shoot.dataUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
      setStatus('PHOTO COPIED TO CLIPBOARD.');
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Copy photo failed.');
    }
  };

  return (
    <div>
      <MacroSection title="EXPORT">
        <div className='bv-section'>
          <label htmlFor='export-name-input' className='bv-label' style={{ display: 'block' }}>EXPORT NAME</label>
          <div className='export-name-input-row'>
            <input
              type='text'
              className='import-name-input'
              name='exportName'
              id='export-name-input'
              value={exportName}
              onChange={(event) => setExportName(event.target.value)}
              spellCheck={false}
              disabled={gifExporting}
              aria-label='Export Name'
            />
            <span className='export-name-format'>{exportFormat}</span>
          </div>
        </div>

        <div className='bv-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>LIVE PREVIEW</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={livePreview}
              onChange={handleToggleLivePreview}
              ariaLabel="Live preview"
            />
          </div>
        </div>

        <div className='bv-section'>
          <SliderBundle
            label='UPSCALE'
            min={1}
            max={10}
            step={1}
            defaultValue={1}
            value={livePreview ? 1 : upscale}
            onChange={setUpscale}
            disabled={livePreview}
            pinId="export:upscale"
          />
        </div>

        <div className='bv-section'>
          <div className='bv-option-group'>
            <button
              type='button'
              className='bv-option-btn export-btn'
              onClick={handleGeneratePreview}
              disabled={livePreview || gifExporting || previewGenerating}
              title={livePreview ? 'Disabled while Live Preview is active' : 'Generate preview'}
            >
              <Eye size={13} strokeWidth={1.5} />
              {previewGenerating ? 'GENERATING...' : 'GENERATE'}
            </button>
            <button
              type='button'
              className='bv-option-btn export-btn'
              onClick={handleSave}
              disabled={gifExporting || previewGenerating || !isPreviewValid}
            >
              <Save size={13} strokeWidth={1.5} />
              {gifExporting ? 'EXPORTING GIF...' : isGifSource ? 'SAVE GIF' : 'SAVE PNG'}
            </button>
            <button
              type='button'
              className='bv-option-btn export-btn'
              onClick={handleCopy}
              disabled={gifExporting || previewGenerating || !isPreviewValid}
            >
              <Copy size={13} strokeWidth={1.5} />
              COPY
            </button>
          </div>
          {status && <p className='import-export-status'>{status}</p>}
        </div>

        {isGifSource && !isPreviewValid && (
          <div className='bv-section' style={{ marginBottom: '14px' }}>
            <p className='export-gif-warning-text' style={{ color: '#ffffff', fontSize: '12px', letterSpacing: '0.03em', margin: 0 }}>
              YOU MUST RENDER ALL THE FRAMES BEFORE EXPORT
            </p>
          </div>
        )}

        {shoots.length > 0 ? (
          <div className='bv-section camera-shoots-section'>
            <div className='bv-controls-row camera-shoots-header'>
              <span className='bv-label' style={{ margin: 0 }}>CAMERA SHOOTS ({shoots.length})</span>
              <button
                type='button'
                className='bv-option-btn export-btn danger-btn'
                onClick={clearShoots}
              >
                <Trash2 size={13} strokeWidth={1.5} />
                CLEAR ALL
              </button>
            </div>

            <div className='camera-shoots-vertical-list'>
              {shoots.map((shoot, index) => (
                <div key={shoot.id} className='camera-shoot-card'>
                  <div className='camera-shoot-card-top'>
                    <span className='bv-label camera-shoot-label'>
                      SHOT #{shoots.length - index} • {new Date(shoot.timestamp).toLocaleTimeString()}
                    </span>
                    <button
                      type='button'
                      className='bv-option-btn export-btn'
                      onClick={() => deleteShoot(shoot.id)}
                      title='Delete photo'
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>

                  <img
                    src={shoot.dataUrl}
                    className='export-preview-floating camera-shoot-img'
                    alt={`camera shoot ${index + 1}`}
                  />

                  <div className='bv-option-group'>
                    <button
                      type='button'
                      className='bv-option-btn export-btn'
                      onClick={() => handleSaveShoot(shoot)}
                    >
                      <Save size={13} strokeWidth={1.5} />
                      SAVE
                    </button>
                    <button
                      type='button'
                      className='bv-option-btn export-btn'
                      onClick={() => handleCopyShoot(shoot)}
                    >
                      <Copy size={13} strokeWidth={1.5} />
                      COPY
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          previewUrl && (
            <div className='bv-section'>
              <p className='bv-label'>PREVIEW ({finalWidth} x {finalHeight})</p>
              <img
                src={previewUrl}
                className='export-preview-floating'
                alt='preview'
              />
              <p className='export-preview-hint'>DRAG AND DROP IT EVERYWHERE</p>
            </div>
          )
        )}
      </MacroSection>
    </div>
  );
}
