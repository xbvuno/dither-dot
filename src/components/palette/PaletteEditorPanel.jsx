import { createPortal } from 'react-dom';
import { X, RotateCcw } from 'lucide-react';
import SingleColorEditor from './SingleColorEditor';
import MultiColorEditor from './MultiColorEditor';
import './styles/PaletteEditor.css';

export default function PaletteEditorPanel({
  hostElement,
  selectedColors = [],
  onUpdateSingleColor,
  onUpdateMultipleColors,
  onResetSelection,
  onClose,
}) {
  if (!hostElement || selectedColors.length === 0) return null;

  const isSingle = selectedColors.length === 1;
  const singleColor = isSingle ? selectedColors[0] : null;

  return createPortal(
    <div className="palette-editor-panel">
      {/* Header */}
      <div className="palette-editor-header">
        <div className="palette-editor-header-actions">
          <span className="palette-editor-title">
            {isSingle ? 'COLOR EDITOR' : 'MULTI COLOR'}
          </span>
          <span className="palette-editor-count-tag">
            {isSingle ? (singleColor.hex || '').toUpperCase() : `${selectedColors.length} COLORS SELECTED`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
          {onResetSelection && (
            <button
              type="button"
              className="palette-editor-close-btn"
              onClick={onResetSelection}
              title="Reset selection"
              aria-label="Reset selection"
            >
              <RotateCcw size={13} />
            </button>
          )}
          <button
            type="button"
            className="palette-editor-close-btn"
            onClick={onClose}
            title="Close editor"
            aria-label="Close editor"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable Content (All tools visible directly) */}
      <div className="palette-editor-content">
        {isSingle && singleColor && (
          <SingleColorEditor
            key={`${singleColor.id}-${singleColor.originalHex || singleColor.hex}`}
            color={singleColor.hex}
            originalColor={singleColor.originalHex || singleColor.hex}
            colorId={singleColor.id}
            onChangeColor={onUpdateSingleColor}
          />
        )}

        {!isSingle && (
          <MultiColorEditor
            key={selectedColors.map((c) => c.id).join(',')}
            selectedColors={selectedColors}
            onUpdateColors={onUpdateMultipleColors}
          />
        )}
      </div>
    </div>,
    hostElement,
  );
}
