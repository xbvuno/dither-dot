import { useState, useEffect, useRef } from 'react';
import useImageStore from '../../stores/media/imageStore';
import useGalleryStore from '../../stores/data/galleryStore';
import { getExportBaseName } from '../../utils/importUtils';

export default function SourceSection() {
  const sourceName = useImageStore((s) => s.sourceName);
  const sourceImg = useImageStore((s) => s.sourceImg);
  const sourceKind = useImageStore((s) => s.sourceKind);
  const setSourceName = useImageStore((s) => s.setSourceName);
  const history = useGalleryStore((s) => s.history);
  const renameHistoryItem = useGalleryStore((s) => s.renameHistoryItem);

  const [editValue, setEditValue] = useState(getExportBaseName(sourceName));
  const isFocused = useRef(false);
  const matchRef = useRef(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      if (!isFocused.current) {
        setEditValue(getExportBaseName(sourceName));
      }
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [sourceName]);

  const handleFocus = () => {
    isFocused.current = true;
    matchRef.current = history.find((e) => e.src === sourceImg || (e.gifDataUrl && e.name === sourceName)) ?? null;
  };

  const isDefault = sourceKind === 'default';
  const label = isDefault ? `${sourceName} (default)` : null;

  const handleChange = (e) => {
    const val = e.target.value;
    setEditValue(val);
    const trimmed = val.trim();
    if (trimmed) {
      setSourceName(trimmed);
      if (matchRef.current) renameHistoryItem(matchRef.current.id, trimmed);
    }
  };

  const handleBlur = () => {
    isFocused.current = false;
    matchRef.current = null;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditValue(getExportBaseName(sourceName));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') {
      setEditValue(getExportBaseName(sourceName));
      e.target.blur();
    }
  };

  return (
    <div className='bv-section'>
      {isDefault ? (
        <>
          <span className='bv-label' style={{ display: 'block' }}>SOURCE</span>
          <p className='import-current-file'>{label}</p>
        </>
      ) : (
        <>
          <label htmlFor='source-name-input' className='bv-label' style={{ display: 'block' }}>
            SOURCE
          </label>
          <input
            type='text'
            className='import-name-input'
            name='sourceName'
            id='source-name-input'
            value={editValue}
            onFocus={handleFocus}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            aria-label='Source Name'
          />
        </>
      )}
    </div>
  );
}
