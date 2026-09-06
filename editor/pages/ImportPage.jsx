import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, Clipboard, Camera, CameraOff, Dices } from 'lucide-react';
import MacroSection from '../components/ui/MacroSection';
import OptionGroup from '../components/ui/shared/OptionGroup';
import useImageStore from '../stores/media/imageStore';
import useGalleryStore from '../stores/data/galleryStore';
import useGifStore from '../stores/media/gifStore';
import useWebcamStore, { WEBCAM_SOURCE } from '../stores/media/webcamStore';
import useParamsStore from '../stores/data/paramsStore';
import useWatermarkStore from '../stores/media/watermarkStore';
import { notify } from '../stores/ui/popupStore';

import {
  INPUT_ACCEPT,
  LARGE_IMAGE_THRESHOLD,
  stripExtension,
  isGifFile,
  isWebpFile,
  getImageDimensions,
  buildClipboardFileName,
  validateImageFile,
} from '../utils/importUtils';
import {
  decodeGifWithWorker,
  rgbaFrameToPngBlob,
  blobToDataUrl,
  getStaticPreviewFromBlob,
} from '../utils/gifDecodeUtils';

import WebcamSection from '../components/import/WebcamSection';
import SourceSection from '../components/import/SourceSection';
import GallerySection from '../components/import/GallerySection';
import LargeImageDialog from '../components/import/LargeImageDialog';

export default function ImportPage() {
  const inputRef = useRef(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [isRandomLoading, setIsRandomLoading] = useState(false);

  const setSourceFromBlob = useImageStore((s) => s.setSourceFromBlob);
  const setSourceDirect = useImageStore((s) => s.setSourceDirect);
  const resetToDefault = useImageStore((s) => s.resetToDefault);

  const pushGifHistory = useGalleryStore((s) => s.pushGifHistory);

  const setGifFrames = useGifStore((s) => s.setFrames);
  const setDecoding = useGifStore((s) => s.setDecoding);
  const clearGifFrames = useGifStore((s) => s.clearFrames);

  const webcamActive = useWebcamStore((s) => s.active);
  const webcamStarting = useWebcamStore((s) => s.starting);
  const webcamError = useWebcamStore((s) => s.error);
  const startWebcam = useWebcamStore((s) => s.startWebcam);
  const stopWebcam = useWebcamStore((s) => s.stopWebcam);

  const showPipeline = useParamsStore((s) => s.pipelineVisible);
  const setShowPipeline = useParamsStore((s) => s.setPipelineVisible);
  const forceCpu = useParamsStore((s) => s.forceCpu);
  const setForceCpu = useParamsStore((s) => s.setForceCpu);
  const excludeAlpha = useParamsStore((s) => s.excludeAlpha);
  const setExcludeAlpha = useParamsStore((s) => s.setExcludeAlpha);
  const watermarkEnabled = useWatermarkStore((s) => s.enabled);
  const setWatermarkEnabled = useWatermarkStore((s) => s.setEnabled);

  const doImport = useCallback(
    async (blob, name) => {
      if (isGifFile({ type: blob?.type, name })) {
        setDecoding(true);
        try {
          const decoded = await decodeGifWithWorker(blob);
          if (!decoded.frames.length) {
            throw new Error('GIF decode returned no frames.');
          }

          setGifFrames(decoded.frames, decoded.loop);

          const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
          await setSourceFromBlob(firstFrameBlob, name, { skipHistory: true });

          const previewSrc = await blobToDataUrl(firstFrameBlob);
          const gifDataUrl = await blobToDataUrl(blob);
          pushGifHistory(previewSrc, name, gifDataUrl);
        } catch (error) {
          setDecoding(false);
          throw error;
        }
        return;
      }

      clearGifFrames();

      if (isWebpFile({ type: blob?.type, name })) {
        const animDataUrl = await blobToDataUrl(blob);
        const previewSrc = await getStaticPreviewFromBlob(blob);
        await setSourceFromBlob(blob, name, { skipHistory: true });
        pushGifHistory(previewSrc, name, animDataUrl);
        return;
      }

      await setSourceFromBlob(blob, name);
    },
    [clearGifFrames, pushGifHistory, setGifFrames, setSourceFromBlob, setDecoding],
  );

  const importWithSizeCheck = useCallback(
    async (blob, name) => {
      const dims = await getImageDimensions(blob);
      const pixelCount = dims.width * dims.height;

      if (pixelCount > LARGE_IMAGE_THRESHOLD) {
        setPendingImport({ file: blob, name, dims });
        return;
      }

      await doImport(blob, name);
    },
    [doImport],
  );

  const confirmImport = useCallback(
    async (blob, name) => {
      setPendingImport(null);
      await doImport(blob, name);
    },
    [doImport],
  );

  const importFromFile = useCallback(
    async (file) => {
      try {
        await validateImageFile(file);
        const rawName =
          typeof file.name === 'string' && file.name ? file.name : buildClipboardFileName(file.type || 'image/png');
        const name = stripExtension(rawName);
        await importWithSizeCheck(file, name);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Image import failed.');
      }
    },
    [importWithSizeCheck],
  );

  const handleFilePickerChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      alert('No file selected. Please choose an image file.');
      return;
    }
    await importFromFile(file);
    event.target.value = '';
  };

  const handlePaste = useCallback(
    async (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const item = Array.from(clipboardData.items || []).find((entry) => entry.type.startsWith('image/'));
      if (!item) {
        alert('Clipboard does not contain an image.');
        return;
      }

      event.preventDefault();

      const blob = item.getAsFile();
      if (!blob) {
        alert('Clipboard image data is not readable.');
        return;
      }

      await importFromFile(blob);
    },
    [importFromFile],
  );

  const importFromClipboardButton = async () => {
    if (!navigator.clipboard?.read) {
      alert('Clipboard read API is not available in this browser. Try Ctrl+V instead.');
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      const imageItem = items.find((item) => item.types.some((type) => type.startsWith('image/')));

      if (!imageItem) {
        alert('No image found in clipboard.');
        return;
      }

      const imageType = imageItem.types.find((type) => type.startsWith('image/'));
      if (!imageType) {
        alert('No supported image type found in clipboard.');
        return;
      }

      const blob = await imageItem.getType(imageType);
      await validateImageFile(blob);
      await importWithSizeCheck(blob, buildClipboardFileName(imageType));
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        alert('Clipboard permission denied. Allow clipboard access and try again.');
        return;
      }
      alert('Failed to read image from clipboard.');
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDropActive(false);

    const files = Array.from(event.dataTransfer?.files || []);
    const file = files[0];

    if (!file) {
      alert('No file detected in drop payload.');
      return;
    }

    await importFromFile(file);
  };

  const handleWebcamToggle = async () => {
    if (webcamActive) {
      stopWebcam();
      resetToDefault();
      return;
    }

    await startWebcam();
    const state = useWebcamStore.getState();
    if (!state.active) return;
    clearGifFrames();
    setSourceDirect(WEBCAM_SOURCE, 'CAMERA', 'webcam');
    notify('CAPTURED PHOTOS WILL BE SAVED IN THE EXPORT TAB', 'info');
  };

  const handleRandomImage = async () => {
    if (isRandomLoading) return;
    setIsRandomLoading(true);
    try {
      const w = Math.floor(Math.random() * (1980 - 400 + 1)) + 400;
      const h = Math.floor(Math.random() * (1080 - 300 + 1)) + 300;
      const url = `https://picsum.photos/${w}/${h}?random=${Date.now()}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch image from Lorem Picsum.');
      }

      const blob = await response.blob();
      await validateImageFile(blob);
      const name = `lorem-picsum-${w}x${h}`;
      await importWithSizeCheck(blob, name);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Random image import failed.');
    } finally {
      setIsRandomLoading(false);
    }
  };

  useEffect(() => {
    const onPaste = (event) => handlePaste(event);
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handlePaste]);

  return (
    <div>
      <MacroSection title="IMPORT">
        <div className='bv-section import-dropzone-section'>
          <p className='bv-label'>DROP OR PASTE</p>
          <div
            className={`import-dropzone${isDropActive ? ' active' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDropActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDropActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDropActive(false);
            }}
            onDrop={handleDrop}
          >
            DROP HERE OR PRESS CTRL+V
          </div>
        </div>

        <div className='bv-section'>
          <p className='bv-label'>IMPORT</p>
          <div className='bv-option-group'>
            <button
              type='button'
              className='bv-option-btn import-btn'
              onClick={() => inputRef.current?.click()}
            >
              <FileUp size={13} strokeWidth={1.5} />
              IMPORT FILE
            </button>
            <button
              type='button'
              className='bv-option-btn import-btn'
              onClick={importFromClipboardButton}
            >
              <Clipboard size={13} strokeWidth={1.5} />
              READ CLIPBOARD
            </button>
            <button
              type='button'
              className='bv-option-btn import-btn'
              onClick={handleRandomImage}
              disabled={isRandomLoading}
            >
              <Dices size={13} strokeWidth={1.5} />
              {isRandomLoading ? 'LOADING...' : 'RANDOM IMAGE'}
            </button>
            <button
              type='button'
              className={`bv-option-btn import-btn${webcamActive ? ' danger-btn' : ''}`}
              onClick={handleWebcamToggle}
              disabled={webcamStarting}
            >
              {webcamActive ? <CameraOff size={13} strokeWidth={1.5} /> : <Camera size={13} strokeWidth={1.5} />}
              {webcamStarting ? 'STARTING...' : webcamActive ? 'STOP CAMERA' : 'START CAMERA'}
            </button>
          </div>
          {webcamError && (
            <p className='import-export-status'>{webcamError}</p>
          )}
          <input
            ref={inputRef}
            type='file'
            name='imageFileInput'
            id='image-file-input'
            accept={INPUT_ACCEPT}
            onChange={handleFilePickerChange}
            style={{ display: 'none' }}
            aria-label='Select image file'
          />
        </div>

        {webcamActive && <WebcamSection />}
      </MacroSection>

      <MacroSection title="GALLERY">
        <SourceSection />
        <GallerySection />
      </MacroSection>

      <MacroSection title="SETTINGS">
        <div className='bv-section pipeline-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>PIPELINE</span>
            <OptionGroup
              options={[
                { value: true, label: 'SHOW' },
                { value: false, label: 'HIDE' },
              ]}
              value={showPipeline}
              onChange={setShowPipeline}
              ariaLabel="Pipeline visibility"
            />
          </div>
        </div>

        <div className='bv-section force-cpu-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>FORCE CPU</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={forceCpu}
              onChange={setForceCpu}
              ariaLabel="Force CPU execution"
            />
          </div>
        </div>

        <div className='bv-section exclude-alpha-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>EXCLUDE ALPHA</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={excludeAlpha}
              onChange={setExcludeAlpha}
              ariaLabel="Exclude alpha transparency"
            />
          </div>
        </div>

        <div className='bv-section watermark-section'>
          <div className='bv-controls-row'>
            <span className='bv-label'>WATERMARK</span>
            <OptionGroup
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              value={watermarkEnabled}
              onChange={setWatermarkEnabled}
              ariaLabel="Watermark display"
            />
          </div>
        </div>
      </MacroSection>

      {pendingImport && (
        <LargeImageDialog
          file={pendingImport.file}
          name={pendingImport.name}
          dims={pendingImport.dims}
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
