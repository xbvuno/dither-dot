import useSizeStore from "../stores/media/sizeStore";

export const MAX_PALETTE_SIZE = 64;

export function hexToRgbUnit(hex) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function getRgbLuminance([r, g, b]) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

export function normalizePalette(colors, colorCount) {
  const targetSize = Math.max(2, Math.min(MAX_PALETTE_SIZE, Number(colorCount) || 2));
  const active = colors.filter(color => !color.hidden);
  const picked = active.slice(0, targetSize);
  const fallback = picked[picked.length - 1] ?? active[0] ?? { hex: '#000000' };

  while (picked.length < targetSize) {
    picked.push(fallback);
  }

  return picked;
}

export function getPaletteExtremes(colors, colorCount) {
  const normalized = normalizePalette(colors, colorCount);
  if (normalized.length === 0) {
    return {
      darkColor: [0, 0, 0],
      lightColor: [1, 1, 1],
    };
  }

  let darkest = hexToRgbUnit(normalized[0].hex);
  let lightest = darkest;
  let minLuma = getRgbLuminance(darkest);
  let maxLuma = minLuma;

  for (let i = 1; i < normalized.length; i += 1) {
    const rgb = hexToRgbUnit(normalized[i].hex);
    const luma = getRgbLuminance(rgb);
    if (luma < minLuma) {
      minLuma = luma;
      darkest = rgb;
    }
    if (luma > maxLuma) {
      maxLuma = luma;
      lightest = rgb;
    }
  }

  return {
    darkColor: darkest,
    lightColor: lightest,
  };
}

export function drawWebcamFrameToCanvas(video, canvas, ctx, mirrored) {
  if (!video || !canvas || !ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mirrored) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function getDrawableDimensions(source) {
  if (!source) return null;

  const width = Number(
    source.videoWidth
    ?? source.naturalWidth
    ?? source.width
    ?? 0,
  );
  const height = Number(
    source.videoHeight
    ?? source.naturalHeight
    ?? source.height
    ?? 0,
  );

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export async function loadTexture(sourceImg) {
  if (!sourceImg) return null;

  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image source'));
    image.src = sourceImg;
  });

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Loaded image has invalid dimensions');
  }

  return image;
}

export function countUniqueColorsFromPixels(pixels) {
  const unique = new Set();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    unique.add((pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2]);
  }

  return unique.size;
}

export function captureThumbnailDataUrl(sourceCanvas, targetWidth = 60) {
  if (!sourceCanvas) return '';

  const width = Math.max(1, Math.floor(Number(sourceCanvas.width) || 1));
  const height = Math.max(1, Math.floor(Number(sourceCanvas.height) || 1));
  const scale = targetWidth / width;
  const targetHeight = Math.max(1, Math.round(height * scale));

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = targetWidth;
  thumbCanvas.height = targetHeight;

  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return thumbCanvas.toDataURL('image/png');
}

export async function countUniqueColorsFromImageSource(sourceImg) {
  if (!sourceImg) return 0;

  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load source image for color counting'));
    image.src = sourceImg;
  });

  const width = Math.max(1, Number(image.naturalWidth) || 1);
  const height = Math.max(1, Number(image.naturalHeight) || 1);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 0;

  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return countUniqueColorsFromPixels(imageData.data);
}

export function getTargetDisplaySize() {
  const { size, customSize, crop } = useSizeStore.getState();
  const width = Math.max(1, Math.floor(Number(customSize.customWidth) || Number(size.width) || 1));
  const height = Math.max(1, Math.floor(Number(customSize.customHeight) || Number(size.height) || 1));

  const left = crop?.left || 0;
  const right = crop?.right || 0;
  const top = crop?.top || 0;
  const bottom = crop?.bottom || 0;

  return {
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

export function generateRecoloredWatermark(watermarkImg, darkColor, lightColor) {
  if (!watermarkImg) return null;
  const canvas = document.createElement('canvas');
  canvas.width = watermarkImg.width;
  canvas.height = watermarkImg.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(watermarkImg, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const dr = darkColor[0] * 255;
  const dg = darkColor[1] * 255;
  const db = darkColor[2] * 255;

  const lr = lightColor[0] * 255;
  const lg = lightColor[1] * 255;
  const lb = lightColor[2] * 255;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    const a = data[i+3];
    if (a === 0) continue;

    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;

    data[i] = dr + (lr - dr) * luma;
    data[i+1] = dg + (lg - dg) * luma;
    data[i+2] = db + (lb - db) * luma;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
