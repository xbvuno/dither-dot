import React from 'react';
import './styles/WaveGridSpinner.css';

export default function WaveGridSpinner() {
  return (
    <svg className="spinner" viewBox="0 0 36 36">
      {/* Row 1 */}
      <rect x="2"  y="2"  width="8" height="8" style={{ animationDelay: '0ms' }} />
      <rect x="14" y="2"  width="8" height="8" style={{ animationDelay: '120ms' }} />
      <rect x="26" y="2"  width="8" height="8" style={{ animationDelay: '240ms' }} />

      {/* Row 2 */}
      <rect x="2"  y="14" width="8" height="8" style={{ animationDelay: '120ms' }} />
      <rect x="14" y="14" width="8" height="8" style={{ animationDelay: '240ms' }} />
      <rect x="26" y="14" width="8" height="8" style={{ animationDelay: '360ms' }} />

      {/* Row 3 */}
      <rect x="2"  y="26" width="8" height="8" style={{ animationDelay: '240ms' }} />
      <rect x="14" y="26" width="8" height="8" style={{ animationDelay: '360ms' }} />
      <rect x="26" y="26" width="8" height="8" style={{ animationDelay: '480ms' }} />
    </svg>
  );
}
