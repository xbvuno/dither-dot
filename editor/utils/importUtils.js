import useWatermarkStore from '../stores/media/watermarkStore';
import { getOutputCanvas } from './canvasRegistry';
import watermarkImage from '../assets/watermark/watermark.png';
import watermarkMiniImage from '../assets/watermark/watermark-mini.png';

export const SUPPORTED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'avif',
  'svg',
]);

export const INPUT_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,image/avif,image/svg+xml';
export const LARGE_IMAGE_THRESHOLD = 1920 * 1080;

export function getExtension(fileName = '') {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function stripExtension(name = '') {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

export function isLikelyImageFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
  return SUPPORTED_EXTENSIONS.has(getExtension(file.name));
}

export function isGifFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.toLowerCase() === 'image/gif') return true;
  return getExtension(file.name) === 'gif';
}

export function isWebpFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.toLowerCase() === 'image/webp') return true;
  return getExtension(file.name) === 'webp';
}

export function getSourceExtension(src = '') {
  return getExtension(String(src).split(/[?#]/)[0]);
}

export function isAnimatedSource(src = '') {
  const ext = getSourceExtension(src);
  return ext === 'gif' || ext === 'webp';
}

export async function getImageDimensions(blob) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Failed to read image dimensions.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function getReducedDimensions(width, height) {
  const pixelCount = width * height;
  if (pixelCount <= LARGE_IMAGE_THRESHOLD) {
    return { width, height };
  }

  const scale = Math.sqrt(LARGE_IMAGE_THRESHOLD / pixelCount);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function scaleDownBlob(blob, targetWidth, targetHeight) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image for resizing.'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((scaledBlob) => {
        if (!scaledBlob) {
          reject(new Error('Failed to resize image.'));
          return;
        }
        resolve(scaledBlob);
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildClipboardFileName(mimeType = 'image/png') {
  const extension = mimeType.split('/')[1] || 'png';
  return `clipboard-${Date.now()}.${extension}`;
}

export async function validateImageFile(file) {
  if (!file) {
    throw new Error('No file selected.');
  }

  if (!isLikelyImageFile(file)) {
    throw new Error('The selected file is not a supported image format.');
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close?.();
      return;
    } catch {
      // Fallback to HTMLImageElement decode below.
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image could not be decoded.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function getExportBaseName(sourceName = '') {
  return sourceName.replace(/\.[^.]+$/, '').trim() || 'export';
}

export async function saveCanvasAsPng(canvas, sourceName) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${getExportBaseName(sourceName)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

export async function copyCanvasToClipboard(canvas) {
  if (!navigator.clipboard?.write) {
    throw new Error('Clipboard write API is not available in this browser.');
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 'image/png');
  });
}

export function getExportCanvasOrThrow() {
  const canvas = getOutputCanvas();
  if (!canvas) {
    throw new Error('No output to export yet. Process an image first.');
  }
  return canvas;
}

export async function compositeWithWatermark(canvas) {
  if (!useWatermarkStore.getState().enabled) return canvas;

  const useMini = canvas.width < 64 || canvas.height < 64;
  const src = useMini ? watermarkMiniImage : watermarkImage;
  const margin = useMini ? 2 : 4;

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });

  const composite = document.createElement('canvas');
  composite.width = canvas.width;
  composite.height = canvas.height;
  const ctx = composite.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.drawImage(img, canvas.width - margin - img.naturalWidth, canvas.height - margin - img.naturalHeight);
  return composite;
}
