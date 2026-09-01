import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Download } from 'lucide-react';
import { exportToHex } from '../../utils/paletteFormatUtils';
import './styles/PaletteImportModal.css';

function getHexTextColor(hex) {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#12120F';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? '#12120F' : '#EEEEDF';
}

export default function PaletteExportModal({
  isOpen,
  onClose,
  colors = [],
  defaultName = 'palette',
}) {
  const [prevDefaultName, setPrevDefaultName] = useState(defaultName);
  const [paletteName, setPaletteName] = useState(defaultName || 'palette');
  const [withHash, setWithHash] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  if (defaultName !== prevDefaultName) {
    setPrevDefaultName(defaultName);
    setPaletteName(defaultName || 'palette');
  }

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hexLines = withHash
    ? colors.map((c) => (c.startsWith('#') ? c.toUpperCase() : `#${c.toUpperCase()}`)).join('\n')
    : exportToHex(colors);

  const cleanFileName = (paletteName || 'palette')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/^_+|_+$/g, '') || 'palette';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hexLines);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = hexLines;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([hexLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${cleanFileName}.hex`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div className="palette-modal-overlay" onClick={onClose}>
      <div
        className="palette-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-modal-header">
          <div className="palette-modal-badge-group">
            <h3 className="palette-modal-title">EXPORT PALETTE</h3>
            <span className="palette-modal-format-badge detected">
              .HEX
            </span>
          </div>
          <button
            type="button"
            className="palette-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Swatches preview */}
        {colors.length > 0 && (
          <div className="palette-modal-preview-section" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className="palette-modal-preview-head">
              <span>PALETTE SWATCHES</span>
              <span>{colors.length} COLORS</span>
            </div>
            <div className="palette-modal-swatches-grid">
              {colors.map((hex, idx) => (
                <div
                  key={`${hex}-${idx}`}
                  className="palette-modal-swatch"
                  style={{ backgroundColor: hex, color: getHexTextColor(hex) }}
                  title={hex.toUpperCase()}
                >
                  {hex.toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Text Area with formatted hex data */}
        <div className="palette-modal-textarea-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-subtle)', letterSpacing: '0.05em' }}>
              HEX DATA
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: 'var(--color-text-subtle)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={withHash}
                onChange={(e) => setWithHash(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Include '#' prefix
            </label>
          </div>
          <textarea
            className="palette-modal-textarea"
            value={hexLines}
            readOnly
            spellCheck={false}
            style={{ height: '7rem', fontFamily: 'monospace' }}
            onClick={(e) => e.target.select()}
          />
        </div>

        {/* File Name */}
        <div className="palette-modal-name-row">
          <label htmlFor="palette-export-name-input">FILE NAME</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="text"
              id="palette-export-name-input"
              className="palette-name-input"
              value={paletteName}
              onChange={(e) => setPaletteName(e.target.value)}
              spellCheck={false}
              maxLength={64}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
              .hex
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="palette-modal-actions">
          <button
            type="button"
            className="bv-option-btn"
            onClick={onClose}
          >
            CANCEL
          </button>
          <button
            type="button"
            className="bv-option-btn"
            onClick={handleCopy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            {isCopied ? <Check size={12} /> : <Copy size={12} />}
            {isCopied ? 'COPIED!' : 'COPY'}
          </button>
          <button
            type="button"
            className="bv-option-btn"
            onClick={handleDownload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Download size={12} />
            SAVE .HEX
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
