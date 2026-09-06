import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileCode } from 'lucide-react';
import { detectAndParsePalette } from '../../utils/paletteFormatUtils';
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

function cleanBaseName(fileName = '') {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Imported Palette';
}

export default function PaletteImportModal({ isOpen, onClose, onImport }) {
  const [rawText, setRawText] = useState('');
  const [paletteName, setPaletteName] = useState('Imported Palette');
  const [detectedFormat, setDetectedFormat] = useState(null);
  const [parsedColors, setParsedColors] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, startTransition] = useTransition();

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

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

  const updateParsedData = (text, fallbackName) => {
    const result = detectAndParsePalette(text, fallbackName || paletteName);
    setDetectedFormat(result.format);
    if (result.colors && result.colors.length > 0) {
      setParsedColors(result.colors);
      if (result.name) {
        setPaletteName(result.name);
      }
      setErrorMsg(result.error || null);
    } else {
      setParsedColors([]);
      setErrorMsg(text.trim() ? (result.error || 'No valid colors recognized.') : null);
    }
  };

  const handleTextChange = (event) => {
    const text = event.target.value;
    setRawText(text);
    startTransition(() => {
      updateParsedData(text, paletteName);
    });
  };

  const handleFileProcess = async (file) => {
    if (!file) return;

    const baseName = cleanBaseName(file.name);
    const isAct = file.name.toLowerCase().endsWith('.act');

    try {
      if (isAct) {
        const buffer = await file.arrayBuffer();
        const result = detectAndParsePalette(buffer, baseName);
        setRawText(`[Binary ACT file: ${file.name}]`);
        setDetectedFormat(result.format);
        setPaletteName(result.name || baseName);
        setParsedColors(result.colors || []);
        setErrorMsg(result.error || null);
      } else {
        const text = await file.text();
        setRawText(text);
        updateParsedData(text, baseName);
      }
    } catch {
      setErrorMsg('Failed to read the selected file.');
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleConfirm = () => {
    if (parsedColors.length < 2) return;
    onImport(parsedColors, paletteName || 'Imported Palette');
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="palette-modal-overlay" onClick={onClose}>
      <div
        className="palette-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="palette-modal-header">
          <div className="palette-modal-badge-group">
            <h3 className="palette-modal-title">IMPORT PALETTE</h3>
            {detectedFormat ? (
              <span className="palette-modal-format-badge detected">
                {detectedFormat}
              </span>
            ) : (
              <span className="palette-modal-format-badge">
                AUTO DETECT
              </span>
            )}
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

        {/* Dropzone & Browse button */}
        <div
          className={`palette-modal-dropzone${isDragging ? ' dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="palette-modal-drop-hint">
            <Upload size={14} />
            <span>Drop .hex, .pal, .gpl, .json, .act or click to open</span>
          </div>
          <button
            type="button"
            className="bv-option-btn"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <FileCode size={12} />
            OPEN FILE
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".hex,.pal,.gpl,.json,.txt,.act,text/plain,application/json"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          aria-label="Upload palette file"
        />

        {/* Text Area for Pasting */}
        <div className="palette-modal-textarea-wrap">
          <textarea
            ref={textareaRef}
            className="palette-modal-textarea"
            placeholder="Paste .hex, .pal (JASC/Paint.NET), .gpl (GIMP), JSON or hex color list here..."
            value={rawText}
            onChange={handleTextChange}
            spellCheck={false}
            autoFocus
          />
          <div className="palette-modal-info-row">
            <span>Supports: .HEX, .PAL (JASC & Paint.NET), .GPL (GIMP), .JSON</span>
            {parsedColors.length > 0 && (
              <span>{parsedColors.length} COLORS DETECTED</span>
            )}
          </div>
        </div>

        {/* Palette Name */}
        <div className="palette-modal-name-row">
          <label htmlFor="palette-import-name-input">PALETTE NAME</label>
          <input
            type="text"
            id="palette-import-name-input"
            className="palette-name-input"
            value={paletteName}
            onChange={(e) => setPaletteName(e.target.value)}
            spellCheck={false}
            maxLength={64}
          />
        </div>

        {/* Error notification if any */}
        {errorMsg && (
          <div className="palette-modal-error">
            {errorMsg}
          </div>
        )}

        {/* Swatches preview */}
        {parsedColors.length > 0 && (
          <div className="palette-modal-preview-section">
            <div className="palette-modal-preview-head">
              <span>PREVIEW SWATCHES</span>
              <span>{parsedColors.length} / 64 max</span>
            </div>
            <div className="palette-modal-swatches-grid">
              {parsedColors.map((hex, idx) => (
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
            disabled={parsedColors.length < 2}
            onClick={handleConfirm}
          >
            IMPORT {parsedColors.length >= 2 ? `(${parsedColors.length})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
