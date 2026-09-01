import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import usePaletteStore, { EXTRACT_METHOD } from '../stores/data/paletteStore';
import SliderBundle from '../components/ui/shared/SliderBundle';
import PaletteImportModal from '../components/palette/PaletteImportModal';
import PaletteExportModal from '../components/palette/PaletteExportModal';
import PaletteEditorPanel from '../components/palette/PaletteEditorPanel';

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
      onClick={(e) => onSelect(color.id, e)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(color.id, event);
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

function ColorsSection({ selectedIds, onToggleSelect, onSelectAll, onDeselectAll }) {
  const method = usePaletteStore(s => s.method);
  const customPaletteName = usePaletteStore(s => s.customPaletteName);
  const setCustomPaletteName = usePaletteStore(s => s.setCustomPaletteName);
  const colors = usePaletteStore(s => s.colors);
  const removeColor = usePaletteStore(s => s.removeColor);
  const addColor = usePaletteStore(s => s.addColor);
  const moveColorCustom = usePaletteStore(s => s.moveColorCustom);
  const saveCurrentPaletteToLibrary = usePaletteStore(s => s.saveCurrentPaletteToLibrary);
  const sortCustomColors = usePaletteStore(s => s.sortCustomColors);

  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef(null);

  const isCustom = method === EXTRACT_METHOD.CUSTOM;
  const active = colors.filter(c => !c.hidden);
  const hidden = colors.filter(c => c.hidden);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) {
        setIsSortOpen(false);
      }
    };
    if (isSortOpen) {
      window.addEventListener('pointerdown', handleOutsideClick);
    }
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, [isSortOpen]);

  const handleDropColor = (fromId, toId) => {
    if (!fromId || !toId) return;
    moveColorCustom(fromId, toId);
  };

  const handleRemove = (id) => {
    removeColor(id);
  };

  const handleSortOption = (criteria) => {
    sortCustomColors(criteria);
    setIsSortOpen(false);
  };

  const hasSelection = selectedIds.length > 0;

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
          {/* Sort & Select Tools */}
          <div className="palette-sort-row">
            <div ref={sortRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="palette-link-btn"
                onClick={() => setIsSortOpen(prev => !prev)}
              >
                SORT ▾
              </button>
              {isSortOpen && (
                <div className="palette-sort-dropdown">
                  <button type="button" className="palette-sort-item" onClick={() => handleSortOption('hue')}>
                    HUE
                  </button>
                  <button type="button" className="palette-sort-item" onClick={() => handleSortOption('luminance')}>
                    LUMINANCE
                  </button>
                  <button type="button" className="palette-sort-item" onClick={() => handleSortOption('saturation')}>
                    SATURATION
                  </button>
                  <button type="button" className="palette-sort-item" onClick={() => handleSortOption('brightness')}>
                    BRIGHTNESS
                  </button>
                  <div className="pe-slider-divider" style={{ margin: '2px 0' }} />
                  <button type="button" className="palette-sort-item" onClick={() => handleSortOption('reverse')}>
                    REVERSE
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="palette-link-btn"
              onClick={hasSelection ? onDeselectAll : onSelectAll}
            >
              {hasSelection ? 'DESELECT ALL' : 'SELECT ALL'}
            </button>
          </div>

          <div className="palette-color-grid">
            {active.map((c) => (
              <CustomColorSwatch
                key={c.id}
                color={c}
                selected={selectedIds.includes(c.id)}
                onSelect={onToggleSelect}
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
                    selected={selectedIds.includes(c.id)}
                    onSelect={onToggleSelect}
                    onRemoveColor={handleRemove}
                    onDropColor={handleDropColor}
                  />
                ))}
              </div>
            </>
          )}

          <label htmlFor="custom-palette-name-input" className="bv-label" style={{ display: 'block', marginTop: '0.65rem' }}>CUSTOM PALETTE</label>
          <div className="bv-option-group palette-save-row">
            <input
              type="text"
              name="customPaletteName"
              id="custom-palette-name-input"
              className="palette-name-input"
              value={customPaletteName}
              onChange={(event) => setCustomPaletteName(event.target.value)}
              spellCheck={false}
              maxLength={64}
              aria-label="Custom Palette Name"
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

function PaletteLibrarySection({ onOpenImport, onOpenExport }) {
  const method = usePaletteStore(s => s.method);
  const userPalettes = usePaletteStore(s => s.userPalettes);
  const builtinPalettes = usePaletteStore(s => s.builtinPalettes);
  const applyLibraryPaletteById = usePaletteStore(s => s.applyLibraryPaletteById);
  const removeUserPalette = usePaletteStore(s => s.removeUserPalette);

  if (method !== EXTRACT_METHOD.CUSTOM) return null;

  return (
    <div className="bv-section">
      <p className="bv-label">PALETTE LIBRARY</p>
      <div className="bv-option-group">
        <button
          type="button"
          className="bv-option-btn"
          onClick={onOpenImport}
        >
          IMPORT PALETTE
        </button>
        <button
          type="button"
          className="bv-option-btn"
          onClick={onOpenExport}
        >
          EXPORT PALETTE
        </button>
      </div>

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

export default function PalettePage() {
  const method = usePaletteStore(s => s.method);
  const colors = usePaletteStore(s => s.colors);
  const customPaletteName = usePaletteStore(s => s.customPaletteName);
  const setColor = usePaletteStore(s => s.setColor);
  const updateMultipleColors = usePaletteStore(s => s.updateMultipleColors);
  const setLastAppliedPalette = usePaletteStore(s => s.setLastAppliedPalette);
  const applyPaletteByHexes = usePaletteStore(s => s.applyPaletteByHexes);

  const [selectedIds, setSelectedIds] = useState([]);
  // Snapshot of hex at the moment each color was selected (stays frozen).
  const [originalHexSnapshot, setOriginalHexSnapshot] = useState({});
  const [shellHost, setShellHost] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const setRootNode = useCallback((node) => {
    if (!node) return;
    setShellHost(node.closest('.resizable-shell') || null);
  }, []);

  useEffect(() => {
    if (method !== EXTRACT_METHOD.CUSTOM) return;
    const visibleHexes = colors.filter((c) => !c.hidden).map((c) => c.hex);
    setLastAppliedPalette(customPaletteName, visibleHexes);
  }, [method, customPaletteName, colors, setLastAppliedPalette]);

  const handleToggleSelect = useCallback((id, event) => {
    const isMultiModifier = event?.ctrlKey || event?.metaKey || event?.shiftKey;
    const colorEntry = colors.find(c => c.id === id);
    const currentHex = colorEntry?.hex || '#000000';

    if (isMultiModifier) {
      setSelectedIds(prev => {
        if (prev.includes(id)) {
          setOriginalHexSnapshot(snap => {
            const next = { ...snap };
            delete next[id];
            return next;
          });
          return prev.filter(x => x !== id);
        }
        setOriginalHexSnapshot(snap => ({ ...snap, [id]: currentHex }));
        return [...prev, id];
      });
    } else {
      setSelectedIds(prev => {
        if (prev.length === 1 && prev[0] === id) {
          setOriginalHexSnapshot({});
          return [];
        }
        setOriginalHexSnapshot({ [id]: currentHex });
        return [id];
      });
    }
  }, [colors]);

  const handleSelectAll = useCallback(() => {
    const active = colors.filter(c => !c.hidden);
    const snap = {};
    active.forEach(c => { snap[c.id] = c.hex; });
    setOriginalHexSnapshot(snap);
    setSelectedIds(active.map(c => c.id));
  }, [colors]);

  const handleDeselectAll = () => {
    setSelectedIds([]);
    setOriginalHexSnapshot({});
  };

  const handleImportPalette = (importedHexes, importedName) => {
    applyPaletteByHexes(importedHexes, importedName, true);
  };

  // live hex from store + frozen originalHex from snapshot
  const selectedColors = useMemo(() => {
    return colors
      .filter(c => selectedIds.includes(c.id))
      .map(c => ({
        id: c.id,
        hex: c.hex,
        originalHex: originalHexSnapshot[c.id] ?? c.hex,
      }));
  }, [colors, selectedIds, originalHexSnapshot]);

  return (
    <div ref={setRootNode}>
      <div className="bv-macro-section">
        <h2>PALETTE</h2>
        <MethodSection />
        <ColorCountSection />
      </div>

      <div className="bv-macro-section">
        <h2>COLORS</h2>
        <ColorsSection
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
        />
      </div>

      {method === EXTRACT_METHOD.CUSTOM && (
        <div className="bv-macro-section">
          <h2>LIBRARY</h2>
          <PaletteLibrarySection
            onOpenImport={() => setIsImportModalOpen(true)}
            onOpenExport={() => setIsExportModalOpen(true)}
          />
        </div>
      )}

      {method === EXTRACT_METHOD.CUSTOM && selectedColors.length > 0 && (
        <PaletteEditorPanel
          hostElement={shellHost}
          selectedColors={selectedColors}
          onUpdateSingleColor={setColor}
          onUpdateMultipleColors={updateMultipleColors}
          onResetSelection={() => setSelectedIds([])}
          onClose={() => setSelectedIds([])}
        />
      )}

      {isImportModalOpen && (
        <PaletteImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImportPalette}
        />
      )}

      {isExportModalOpen && (
        <PaletteExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          colors={colors.filter((c) => !c.hidden).map((c) => c.hex)}
          defaultName={customPaletteName || 'palette'}
        />
      )}
    </div>
  );
}
