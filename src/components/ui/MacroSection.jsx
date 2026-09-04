import React from 'react';
import { ChevronDown, RotateCcw, Dices } from 'lucide-react';
import './styles/MacroSection.css';

export default function MacroSection({
  title,
  collapsible = false,
  isOpen = true,
  onToggle,
  isModified = false,
  onReset,
  resetTitle,
  onRandomize,
  randomizeTitle,
  actions,
  children,
  className = '',
}) {
  if (!collapsible) {
    return (
      <section className={`bv-macro-section ${className}`.trim()}>
        <h2>{title}</h2>
        <div className="bv-macro-section-body">
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className={`bv-macro-section ${className}`.trim()}>
      <div
        className={`bv-macro-section-header ${isModified ? 'modified' : ''}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle?.();
          }
        }}
        aria-expanded={isOpen}
      >
        <div className="bv-macro-section-title">
          <ChevronDown
            size={16}
            className={`bv-macro-section-chevron ${isOpen ? '' : 'collapsed'}`}
          />
          <h2>{title}</h2>
        </div>

        <div className="bv-macro-section-actions">
          {actions}
          {isModified && onReset && (
            <button
              type="button"
              className="bv-macro-section-btn"
              title={resetTitle || `Reset ${title.toLowerCase()}`}
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
            >
              <RotateCcw size={16} strokeWidth={1.5} />
            </button>
          )}
          {isOpen && onRandomize && (
            <button
              type="button"
              className="bv-macro-section-btn"
              title={randomizeTitle || `Randomize ${title.toLowerCase()}`}
              onClick={(e) => {
                e.stopPropagation();
                onRandomize();
              }}
            >
              <Dices size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      <div className={`bv-macro-section-content ${isOpen ? '' : 'collapsed'}`}>
        <div className="bv-macro-section-body">
          {children}
        </div>
      </div>
    </section>
  );
}
