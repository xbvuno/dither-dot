import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import usePaletteStore, { EXTRACT_METHOD } from '../stores/data/paletteStore';
import SliderBundle from '../components/ui/shared/SliderBundle';

/* ---------------------------------- */
/* COLOR COUNT                         */
/* ---------------------------------- */

function ColorCountSection() {
  const colorCount = usePaletteStore(s => s.colorCount);
  const setColorCount = usePaletteStore(s => s.setColorCount);

  return (
    <div className="bv-section">
      <p className="bv-label">PALETTE SIZE</p>
      <SliderBundle
        label="COLORS"
        min={2}
        max={64}
        step={1}
        defaultValue={8}
        value={colorCount}
        onChange={setColorCount}
      />
    </div>
  );
}

/* ---------------------------------- */
/* METHOD SELECTOR                    */
/* ---------------------------------- */

const METHODS = [
  { id: EXTRACT_METHOD.MEDIAN_CUT, label: 'MEDIAN CUT' },
  { id: EXTRACT_METHOD.OCTREE, label: 'OCTREE' },
  { id: EXTRACT_METHOD.KMEANS, label: 'K-MEANS' },
  { id: EXTRACT_METHOD.CUSTOM, label: 'CUSTOM' },
];

function MethodSection() {
  const method = usePaletteStore(s => s.method);
  const setMethod = usePaletteStore(s => s.setMethod);

  return (
    <div className="bv-section">
      <p className="bv-label">METHOD</p>
      <div className="bv-option-group">
        {METHODS.map(m => (
          <button
            key={m.id}
            className={`bv-option-btn${method === m.id ? ' active' : ''}`}
            onClick={() => setMethod(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function parsePaletteText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { name: 'Imported Palette', colors: parsed };
    if (parsed && Array.isArray(parsed.colors)) {
      return { name: parsed.name || 'Imported Palette', colors: parsed.colors };
    }
  } catch {
    // continue with plain text parsing
  }

  const colors = text.match(/#?[0-9a-fA-F]{6}\b|#?[0-9a-fA-F]{3}\b/g) || [];
  return colors.length > 0 ? { name: 'Imported Palette', colors } : null;
}

function getHexTextColor(hex) {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#12120F';

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? '#12120F' : '#EEEEDF';
}

function ColorEntry({ color }) {
  const textColor = getHexTextColor(color.hex);

  return (
    <div
      className={`palette-color-chip${color.hidden ? ' palette-color-chip--hidden' : ''}`}
      style={{ backgroundColor: color.hex, color: textColor }}
      title={color.hidden ? `${color.hex} (hidden)` : color.hex}
    >
      {color.hex.toUpperCase()}
    </div>
  );
}

function CustomColorSwatch({ color, selected, onSelect, onRemoveColor, onDropColor }) {
  const textColor = getHexTextColor(color.hex);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`palette-custom-swatch${selected ? ' palette-custom-swatch--selected' : ''}${color.hidden ? ' palette-custom-swatch--hidden' : ''}`}
      style={{ backgroundColor: color.hex, color: textColor }}
      draggable
      onClick={() => onSelect(color.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(color.id);
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', String(color.id));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const fromId = event.dataTransfer.getData('text/plain');
        onDropColor(Number(fromId), color.id);
      }}
    >
      <span className="palette-custom-swatch-text">{color.hex.toUpperCase()}</span>
      <span className="palette-custom-swatch-hint">DRAG</span>
      <span className="palette-custom-swatch-delete-wrap">
        <button
          type="button"
          className="palette-custom-swatch-delete"
          title={`Delete ${color.hex.toUpperCase()}`}
          aria-label={`Delete ${color.hex.toUpperCase()}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemoveColor(color.id);
          }}
        >
          <X size={10} strokeWidth={2.3} />
        </button>
      </span>
    </div>
  );
}

function ColorsSection({ selectedId, setSelectedId }) {
  const method = usePaletteStore(s => s.method);
  const customPaletteName = usePaletteStore(s => s.customPaletteName);
  const setCustomPaletteName = usePaletteStore(s => s.setCustomPaletteName);
  const colors = usePaletteStore(s => s.colors);
  const removeColor = usePaletteStore(s => s.removeColor);
  const addColor = usePaletteStore(s => s.addColor);
  const moveColorCustom = usePaletteStore(s => s.moveColorCustom);
  const saveCurrentPaletteToLibrary = usePaletteStore(s => s.saveCurrentPaletteToLibrary);

  const isCustom = method === EXTRACT_METHOD.CUSTOM;
  const active = colors.filter(c => !c.hidden);
  const hidden = colors.filter(c => c.hidden);
  const selectedColor = selectedId != null ? colors.find((c) => c.id === selectedId) : null;

  const handleDropColor = (fromId, toId) => {
    if (!fromId || !toId) return;
    moveColorCustom(fromId, toId);
  };

  const handleRemove = (id) => {
    removeColor(id);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="bv-section">
      <div className="palette-row-inline">
        <p className="bv-label">COLORS</p>
        {isCustom && (
          <button type="button" className="bv-option-btn" onClick={addColor}>
            ADD COLOR
          </button>
        )}
      </div>

      {!isCustom && (
        <>
          <div className="palette-color-grid">
            {active.map(c => <ColorEntry key={c.id} color={c} />)}
          </div>
          {hidden.length > 0 && (
            <>
              <div className="color-list-divider">NOT USED</div>
              <div className="palette-color-grid palette-color-grid--hidden">
                {hidden.map(c => <ColorEntry key={c.id} color={c} />)}
              </div>
            </>
          )}
        </>
      )}

      {isCustom && (
        <>
          <div className="palette-color-grid">
            {active.map((c) => (
              <CustomColorSwatch
                key={c.id}
                color={c}
                selected={selectedColor?.id === c.id}
                onSelect={setSelectedId}
                onRemoveColor={handleRemove}
                onDropColor={handleDropColor}
              />
            ))}
          </div>

          {hidden.length > 0 && (
            <>
              <div className="color-list-divider">NOT USED</div>
              <div className="palette-color-grid palette-color-grid--hidden">
                {hidden.map((c) => (
                  <CustomColorSwatch
                    key={c.id}
                    color={c}
                    selected={selectedColor?.id === c.id}
                    onSelect={setSelectedId}
                    onRemoveColor={handleRemove}
                    onDropColor={handleDropColor}
                  />
                ))}
              </div>
            </>
          )}

          <p className="bv-label">CUSTOM PALETTE</p>
          <div className="bv-option-group palette-save-row">
            <input
              type="text"
              className="palette-name-input"
              value={customPaletteName}
              onChange={(event) => setCustomPaletteName(event.target.value)}
              spellCheck={false}
              maxLength={64}
            />
            <button
              type="button"
              className="bv-option-btn"
              onClick={saveCurrentPaletteToLibrary}
            >
              SAVE TO LIBRARY
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PaletteLibrarySection() {
  const method = usePaletteStore(s => s.method);
  const customPaletteName = usePaletteStore(s => s.customPaletteName);
  const fileInputRef = useRef(null);
  const colors = usePaletteStore(s => s.colors);
  const userPalettes = usePaletteStore(s => s.userPalettes);
  const builtinPalettes = usePaletteStore(s => s.builtinPalettes);
  const applyLibraryPaletteById = usePaletteStore(s => s.applyLibraryPaletteById);
  const applyPaletteByHexes = usePaletteStore(s => s.applyPaletteByHexes);
  const removeUserPalette = usePaletteStore(s => s.removeUserPalette);

  const visibleHexes = useMemo(() => colors.filter((c) => !c.hidden).map((c) => c.hex), [colors]);
  if (method !== EXTRACT_METHOD.CUSTOM) return null;

  const exportPalette = () => {
    const payload = {
      version: 1,
      name: customPaletteName || 'Exported Palette',
      colors: visibleHexes,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `palette-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const importPalette = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parsePaletteText(text);
      if (!parsed || !Array.isArray(parsed.colors)) {
        alert('Invalid palette file. Use JSON with { name, colors[] } or a plain list of hex colors.');
        return;
      }
      applyPaletteByHexes(parsed.colors, parsed.name || file.name, true);
    } catch {
      alert('Unable to import the selected palette.');
    }
  };

  return (
    <div className="bv-section">
      <p className="bv-label">PALETTE LIBRARY</p>
      <div className="bv-option-group">
        <button
          type="button"
          className="bv-option-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          IMPORT PALETTE
        </button>
        <button
          type="button"
          className="bv-option-btn"
          onClick={exportPalette}
        >
          EXPORT CURRENT
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json,.txt"
        onChange={importPalette}
        style={{ display: 'none' }}
      />

      <div className="palette-library-list">
        {userPalettes.length > 0 && (
          <div className="palette-library-group">
            <p className="palette-library-group-title">IMPORTED</p>
            {userPalettes.map((entry) => (
              <div key={entry.id} className="palette-library-card">
                <button
                  type="button"
                  className="palette-library-item"
                  onClick={() => applyLibraryPaletteById(entry.id)}
                  title={entry.name}
                >
                  <div className="palette-library-head">
                    <span>{entry.name}</span>
                  </div>
                  <div className="palette-library-swatches-row">
                    <span className="palette-library-count">{entry.colors.length}c</span>
                    <div className="palette-library-swatches">
                      {entry.colors.slice(0, 20).map((hex, index) => (
                        <span key={`${entry.id}-${index}`} style={{ backgroundColor: hex }} />
                      ))}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="palette-library-delete"
                  onClick={() => removeUserPalette(entry.id)}
                  title={`Delete ${entry.name}`}
                  aria-label={`Delete ${entry.name}`}
                >
                  <X size={10} strokeWidth={2.3} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="palette-library-group">
          <p className="palette-library-group-title">PRESET</p>
          {builtinPalettes.map((entry) => (
            <div key={entry.id} className="palette-library-card">
              <button
                type="button"
                className="palette-library-item"
                onClick={() => applyLibraryPaletteById(entry.id)}
                title={entry.name}
              >
                <div className="palette-library-head">
                  <span>{entry.name}</span>
                </div>
                <div className="palette-library-swatches-row">
                  <span className="palette-library-count">{entry.colors.length}c</span>
                  <div className="palette-library-swatches">
                    {entry.colors.slice(0, 20).map((hex, index) => (
                      <span key={`${entry.id}-${index}`} style={{ backgroundColor: hex }} />
                    ))}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatingColorEditor({ hostElement, color, onSetColor }) {
  if (!hostElement || !color) return null;

  return createPortal(
    <div className="palette-floating-editor">
      <p className="bv-label">COLOR EDITOR</p>
      <label className="palette-editor-preview" style={{ backgroundColor: color.hex }}>
        <input
          type="color"
          value={color.hex}
          onChange={(event) => onSetColor(color.id, event.target.value)}
        />
      </label>
      <input
        className="palette-name-input"
        type="text"
        value={color.hex}
        onChange={(event) => onSetColor(color.id, event.target.value)}
        spellCheck={false}
        maxLength={7}
      />
    </div>,
    hostElement,
  );
}

export default function PalettePage() {
  const method = usePaletteStore(s => s.method);
  const colors = usePaletteStore(s => s.colors);
  const customPaletteName = usePaletteStore(s => s.customPaletteName);
  const setColor = usePaletteStore(s => s.setColor);
  const setLastAppliedPalette = usePaletteStore(s => s.setLastAppliedPalette);

  const [selectedId, setSelectedId] = useState(null);
  const [shellHost, setShellHost] = useState(null);

  const selectedColor = selectedId != null ? colors.find((c) => c.id === selectedId) : null;
  const setRootNode = useCallback((node) => {
    if (!node) return;
    setShellHost(node.closest('.resizable-shell') || null);
  }, []);

  useEffect(() => {
    if (method !== EXTRACT_METHOD.CUSTOM) return;
    const visibleHexes = colors.filter((c) => !c.hidden).map((c) => c.hex);
    setLastAppliedPalette(customPaletteName, visibleHexes);
  }, [method, customPaletteName, colors, setLastAppliedPalette]);

  return (
    <div ref={setRootNode}>
      <div className="bv-macro-section">
        <h2>PALETTE</h2>
        <MethodSection />
        <ColorCountSection />
      </div>

      <div className="bv-macro-section">
        <h2>COLORS</h2>
        <ColorsSection selectedId={selectedId} setSelectedId={setSelectedId} />
      </div>

      {method === EXTRACT_METHOD.CUSTOM && (
        <div className="bv-macro-section">
          <h2>LIBRARY</h2>
          <PaletteLibrarySection />
        </div>
      )}

      <FloatingColorEditor
        hostElement={shellHost}
        color={method === EXTRACT_METHOD.CUSTOM ? selectedColor : null}
        onSetColor={setColor}
      />
    </div>
  );
}

