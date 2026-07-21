import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import useImageStore from '../../stores/media/imageStore';
import useGalleryStore, { GALLERY_PRESETS } from '../../stores/data/galleryStore';
import useGifStore from '../../stores/media/gifStore';
import { isAnimatedSource, getSourceExtension } from '../../utils/importUtils';
import { decodeGifWithWorker, rgbaFrameToPngBlob, getStaticPreviewFromBlob } from '../../utils/gifDecodeUtils';
import GalleryThumbItem from './GalleryThumbItem';

export default function GallerySection() {
  const sourceImg = useImageStore((s) => s.sourceImg);
  const sourceName = useImageStore((s) => s.sourceName);
  const setSourceDirect = useImageStore((s) => s.setSourceDirect);
  const setSourceFromBlob = useImageStore((s) => s.setSourceFromBlob);
  const resetToDefault = useImageStore((s) => s.resetToDefault);
  const gifFramesLen = useGifStore((s) => s.frames.length);
  const setGifFrames = useGifStore((s) => s.setFrames);
  const setDecoding = useGifStore((s) => s.setDecoding);
  const history = useGalleryStore((s) => s.history);
  const removeHistoryItem = useGalleryStore((s) => s.removeHistoryItem);
  const [presetStaticPreviews, setPresetStaticPreviews] = useState({});
  const hasHistory = history.length > 0;
  const presetItems = GALLERY_PRESETS;
  const importedItems = history;

  useEffect(() => {
    let cancelled = false;

    const hydrateAnimatedPresetPreviews = async () => {
      const next = {};
      for (const item of presetItems) {
        if (!isAnimatedSource(item.src)) continue;
        try {
          const response = await fetch(item.src);
          if (!response.ok) continue;
          const blob = await response.blob();
          next[item.id] = await getStaticPreviewFromBlob(blob);
        } catch {
          // Keep using source URL if preview extraction fails.
        }
      }

      if (!cancelled && Object.keys(next).length) {
        setPresetStaticPreviews(next);
      }
    };

    void hydrateAnimatedPresetPreviews();
    return () => {
      cancelled = true;
    };
  }, [presetItems]);

  const handleClear = () => {
    useGalleryStore.getState().clearHistory();
    if (sourceImg && history.some((item) => item.src === sourceImg)) {
      resetToDefault();
    }
  };

  const handleDeleteItem = (event, item) => {
    event.stopPropagation();
    removeHistoryItem(item.id);
    if (sourceImg === item.src) {
      resetToDefault();
    }
  };

  const handleSelectHistoryItem = async (item) => {
    const isGifActive = item.kind === 'gif' && gifFramesLen > 1 && sourceName === item.name;
    const isActive = isGifActive || sourceImg === item.src;
    if (isActive) {
      return;
    }

    if (item.kind === 'gif' && item.gifDataUrl) {
      setDecoding(true);
      try {
        const response = await fetch(item.gifDataUrl);
        if (!response.ok) {
          throw new Error('Failed to load GIF from gallery.');
        }

        const gifBlob = await response.blob();
        const decoded = await decodeGifWithWorker(gifBlob);
        if (!decoded.frames.length) {
          throw new Error('GIF decode returned no frames.');
        }

        setGifFrames(decoded.frames, decoded.loop);
        const firstFrameBlob = await rgbaFrameToPngBlob(decoded.frames[0]);
        await setSourceFromBlob(firstFrameBlob, item.name, { skipHistory: true });
      } catch (error) {
        setDecoding(false);
        alert(error instanceof Error ? error.message : 'FAILED TO LOAD GIF FROM GALLERY.');
      }
      return;
    }

    setSourceDirect(item.src, item.name, 'imported');
  };

  const handleSelectPresetItem = async (item, isAnimatedPreset, staticPreviewSrc) => {
    if (!isAnimatedPreset) {
      if (sourceImg === item.src) return;
      setSourceDirect(item.src, item.name, 'default');
      return;
    }

    if (sourceName === item.name && sourceImg === staticPreviewSrc) {
      return;
    }

    try {
      const response = await fetch(item.src);
      if (!response.ok) {
        throw new Error('Failed to load animated preset.');
      }

      const animatedBlob = await response.blob();
      const staticPreview =
        staticPreviewSrc === item.src ? await getStaticPreviewFromBlob(animatedBlob) : staticPreviewSrc;

      if (staticPreviewSrc === item.src) {
        setPresetStaticPreviews((prev) => ({ ...prev, [item.id]: staticPreview }));
      }

      setSourceDirect(staticPreview, item.name, 'default');

      if (getSourceExtension(item.src) === 'gif') {
        setDecoding(true);
        try {
          const decoded = await decodeGifWithWorker(animatedBlob);
          if (decoded.frames.length) {
            setGifFrames(decoded.frames, decoded.loop);
          } else {
            setDecoding(false);
          }
        } catch (error) {
          setDecoding(false);
          throw error;
        }
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'FAILED TO LOAD ANIMATED PRESET.');
    }
  };

  return (
    <>
      {importedItems.length > 0 && (
        <div className='bv-section'>
          <div className='bv-controls-row'>
            <p className='bv-label'>IMPORTED</p>
            <button
              type='button'
              className='bv-option-btn import-btn'
              onClick={handleClear}
              disabled={!hasHistory}
            >
              <Trash2 size={13} strokeWidth={1.5} />
              CLEAR
            </button>
          </div>
          {importedItems.length > 0 && (
            <div className='gallery-grid'>
              {importedItems.map((item) => {
                const isGifActive = item.kind === 'gif' && gifFramesLen > 1 && sourceName === item.name;
                const isActive = isGifActive || sourceImg === item.src;
                return (
                  <GalleryThumbItem
                    key={item.id}
                    item={item}
                    isActive={isActive}
                    onSelect={() => {
                      void handleSelectHistoryItem(item);
                    }}
                    onDelete={(event) => handleDeleteItem(event, item)}
                    showDelete
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className='bv-section'>
        <p className='bv-label'>PRESET</p>
        <div className='gallery-grid'>
          {presetItems.map((item) => {
            const isAnimatedPreset = isAnimatedSource(item.src);
            const staticPreviewSrc = isAnimatedPreset ? presetStaticPreviews[item.id] || item.src : item.src;

            const presetThumbItem = isAnimatedPreset
              ? { ...item, src: staticPreviewSrc, kind: 'gif', gifDataUrl: item.src }
              : { ...item, kind: 'image', gifDataUrl: null };

            const isActive = isAnimatedPreset
              ? sourceName === item.name && sourceImg === staticPreviewSrc
              : sourceImg === item.src;

            return (
              <GalleryThumbItem
                key={item.id}
                item={item}
                isActive={isActive}
                onSelect={() => {
                  void handleSelectPresetItem(item, isAnimatedPreset, staticPreviewSrc);
                }}
                onDelete={() => {}}
                showDelete={false}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
