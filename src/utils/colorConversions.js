/**
 * Color conversion utilities for RGB, HSV, and HEX formats,
 * plus perceptual luminance, sorting algorithms, and tonal grading.
 */

export function cleanHex(input) {
  if (!input) return '#000000';
  let h = String(input).trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return '#000000';
  }
  return `#${h.toUpperCase()}`;
}

export function hexToRgb(hex) {
  const cleaned = cleanHex(hex).replace('#', '');
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r, g, b) {
  const clampR = Math.max(0, Math.min(255, Math.round(Number(r) || 0)));
  const clampG = Math.max(0, Math.min(255, Math.round(Number(g) || 0)));
  const clampB = Math.max(0, Math.min(255, Math.round(Number(b) || 0)));
  return `#${((1 << 24) + (clampR << 16) + (clampG << 8) + clampB).toString(16).slice(1).toUpperCase()}`;
}

export function rgbToHsv(r, g, b) {
  const rNorm = (Number(r) || 0) / 255;
  const gNorm = (Number(g) || 0) / 255;
  const bNorm = (Number(b) || 0) / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  const s = max === 0 ? 0 : delta / max;
  const v = max;

  if (delta !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

export function hsvToRgb(h, s, v) {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const vNorm = Math.max(0, Math.min(100, v)) / 100;

  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = vNorm - c;

  let rPrime, gPrime, bPrime;
  if (hNorm < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (hNorm < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (hNorm < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (hNorm < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (hNorm < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

export function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

export function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

export function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

export function sortColors(colors, criteria) {
  const list = [...colors];
  const getHex = (c) => (typeof c === 'string' ? c : c?.hex || '#000000');

  switch (criteria) {
    case 'hue':
      return list.sort((a, b) => hexToHsv(getHex(a)).h - hexToHsv(getHex(b)).h);
    case 'luminance':
      return list.sort((a, b) => getLuminance(getHex(a)) - getLuminance(getHex(b)));
    case 'saturation':
      return list.sort((a, b) => hexToHsv(getHex(a)).s - hexToHsv(getHex(b)).s);
    case 'value':
    case 'brightness':
      return list.sort((a, b) => hexToHsv(getHex(a)).v - hexToHsv(getHex(b)).v);
    case 'reverse':
      return list.reverse();
    default:
      return list;
  }
}

export function applyTonalAdjustments(hex, { gamma = 1, blacks = 0, whites = 0, contrast = 0 }) {
  const { r, g, b } = hexToRgb(hex);
  let rNorm = r / 255;
  let gNorm = g / 255;
  let bNorm = b / 255;

  // 1. Blacks adjustment (-100 to +100): shifts shadow floor
  if (blacks !== 0) {
    const bOffset = (blacks / 100) * 0.3;
    rNorm = Math.max(0, Math.min(1, rNorm + bOffset * (1 - rNorm)));
    gNorm = Math.max(0, Math.min(1, gNorm + bOffset * (1 - gNorm)));
    bNorm = Math.max(0, Math.min(1, bNorm + bOffset * (1 - bNorm)));
  }

  // 2. Whites adjustment (-100 to +100): shifts highlight ceiling
  if (whites !== 0) {
    const wFactor = 1 + (whites / 100) * 0.5;
    rNorm = Math.max(0, Math.min(1, rNorm * wFactor));
    gNorm = Math.max(0, Math.min(1, gNorm * wFactor));
    bNorm = Math.max(0, Math.min(1, bNorm * wFactor));
  }

  // 3. Contrast adjustment (-100 to +100): midpoint pivot curve
  if (contrast !== 0) {
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    rNorm = Math.max(0, Math.min(1, factor * (rNorm - 0.5) + 0.5));
    gNorm = Math.max(0, Math.min(1, factor * (gNorm - 0.5) + 0.5));
    bNorm = Math.max(0, Math.min(1, factor * (bNorm - 0.5) + 0.5));
  }

  // 4. Gamma adjustment (0.2 to 3.0, default 1.0)
  if (gamma !== 1 && gamma > 0) {
    const gExp = 1 / gamma;
    rNorm = Math.pow(Math.max(0, rNorm), gExp);
    gNorm = Math.pow(Math.max(0, gNorm), gExp);
    bNorm = Math.pow(Math.max(0, bNorm), gExp);
  }

  return rgbToHex(rNorm * 255, gNorm * 255, bNorm * 255);
}
