/**
 * Utilities for extracting frame sequences from HTML5 Video and multi-image files.
 */

export function isVideoFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('video/')) return true;
  const name = String(file.name || '').toLowerCase();
  return /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/.test(name);
}

export function getVideoMetadata(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout reading video metadata.'));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };

    const onLoadedMetadata = () => {
      cleanup();
      resolve({
        url,
        duration: Number.isFinite(video.duration) ? video.duration : 1,
        width: video.videoWidth || 640,
        height: video.videoHeight || 480,
      });
    };

    const onError = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video file. Codec may not be supported by this browser.'));
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.src = url;
  });
}

function seekVideo(video, time, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let timeoutId = null;

    const onSeeked = () => {
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };

    const onError = (e) => {
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(e || new Error('Error during video seek'));
    };

    timeoutId = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve(); // Proceed anyway rather than hanging
    }, timeoutMs);

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    try {
      video.currentTime = Math.max(0, Math.min(video.duration || 0, time));
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    }
  });
}

export async function extractFramesFromVideo(
  fileOrBlob,
  {
    startTime = 0,
    endTime = null,
    scale = 1,
    fps = 20,
    maxFrames = 300,
    onProgress = null,
  } = {}
) {
  const meta = await getVideoMetadata(fileOrBlob);
  const totalDuration = meta.duration;

  const startSec = Math.max(0, Math.min(totalDuration, Number(startTime) || 0));
  const endSec = Math.max(startSec + 0.05, Math.min(totalDuration, endTime != null ? Number(endTime) : totalDuration));
  const rangeDuration = endSec - startSec;

  let effectiveFps = Math.max(1, Math.min(60, Number(fps) || 20));
  let estimatedCount = Math.ceil(rangeDuration * effectiveFps);

  if (estimatedCount > maxFrames) {
    effectiveFps = maxFrames / rangeDuration;
    estimatedCount = maxFrames;
  }

  const timestamps = [];
  const step = 1 / effectiveFps;
  for (let t = startSec; t < endSec && timestamps.length < maxFrames; t += step) {
    timestamps.push(t);
  }
  if (timestamps.length === 0) {
    timestamps.push(startSec);
  }

  const clampedScale = Math.max(0.1, Math.min(1, Number(scale) || 1));
  const targetWidth = Math.max(1, Math.round(meta.width * clampedScale));
  const targetHeight = Math.max(1, Math.round(meta.height * clampedScale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    URL.revokeObjectURL(meta.url);
    throw new Error('Canvas 2D context creation failed.');
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = meta.url;

  // Wait for canplay
  await new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    const handler = () => {
      video.removeEventListener('loadeddata', handler);
      resolve();
    };
    video.addEventListener('loadeddata', handler);
  });

  const frameDelay = Math.max(20, Math.round(1000 / effectiveFps));
  const frames = [];

  try {
    for (let i = 0; i < timestamps.length; i += 1) {
      const time = timestamps[i];
      await seekVideo(video, time);

      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      frames.push({
        width: targetWidth,
        height: targetHeight,
        pixels: new Uint8ClampedArray(imgData.data),
        delay: frameDelay,
      });

      onProgress?.({
        current: i + 1,
        total: timestamps.length,
        percent: Math.round(((i + 1) / timestamps.length) * 100),
      });
    }
  } finally {
    URL.revokeObjectURL(meta.url);
    video.src = '';
    video.remove();
  }

  return {
    frames,
    width: targetWidth,
    height: targetHeight,
    duration: rangeDuration,
    fps: effectiveFps,
  };
}

export async function loadImagesAsFrames(files, { defaultDelay = 100, onProgress = null } = {}) {
  const fileArray = Array.from(files || []);
  if (!fileArray.length) {
    throw new Error('No files provided to load as frames.');
  }

  // Sort files naturally by filename (e.g. img1.png, img2.png, img10.png)
  const sorted = fileArray.slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  const frames = [];
  let baseWidth = 0;
  let baseHeight = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const file = sorted[i];
    const bitmap = await createImageBitmap(file);

    if (i === 0) {
      baseWidth = bitmap.width;
      baseHeight = bitmap.height;
    }

    const canvas = document.createElement('canvas');
    canvas.width = baseWidth;
    canvas.height = baseHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Draw image fitted to base dimensions
    ctx.drawImage(bitmap, 0, 0, baseWidth, baseHeight);
    bitmap.close?.();

    const imgData = ctx.getImageData(0, 0, baseWidth, baseHeight);
    frames.push({
      width: baseWidth,
      height: baseHeight,
      pixels: new Uint8ClampedArray(imgData.data),
      delay: Math.max(20, Math.min(5000, Number(defaultDelay) || 100)),
    });

    onProgress?.({
      current: i + 1,
      total: sorted.length,
      percent: Math.round(((i + 1) / sorted.length) * 100),
    });
  }

  return {
    frames,
    width: baseWidth,
    height: baseHeight,
  };
}
