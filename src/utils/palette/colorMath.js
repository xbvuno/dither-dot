export function rgbToHex(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;

  return (
    '#' +
    ((1 << 24) | (r << 16) | (g << 8) | b)
      .toString(16)
      .slice(1)
  );
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function blendHex(a, b) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex((ar + br) * 0.5, (ag + bg) * 0.5, (ab + bb) * 0.5);
}
