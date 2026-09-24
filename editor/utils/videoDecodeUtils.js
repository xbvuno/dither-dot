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

export function snapFps(fps) {
  if (!fps || !Number.isFinite(fps) || fps <= 0) return 24;
  const standard = [10, 12, 15, 20, 24, 25, 30, 48, 50, 60, 120];
  for (const s of standard) {
    if (Math.abs(fps - s) < 0.45) return s;
  }
  if (Math.abs(fps - 23.976) < 0.5) return 24;
  if (Math.abs(fps - 29.97) < 0.5) return 30;
  if (Math.abs(fps - 59.94) < 0.5) return 60;
  return Math.round(fps);
}

function parseMp4Stts(view, sttsOffset, timescale) {
  if (sttsOffset + 16 > view.byteLength) return null;
  const entryCount = view.getUint32(sttsOffset + 12);
  if (entryCount === 0) return null;

  let totalSamples = 0;
  let totalDuration = 0;
  const maxEntries = Math.min(entryCount, 120);
  let pos = sttsOffset + 16;

  for (let i = 0; i < maxEntries; i++) {
    if (pos + 8 > view.byteLength) break;
    const count = view.getUint32(pos);
    const delta = view.getUint32(pos + 4);
    totalSamples += count;
    totalDuration += count * delta;
    pos += 8;
  }

  if (totalSamples > 0 && totalDuration > 0 && timescale > 0) {
    const avgDelta = totalDuration / totalSamples;
    const fps = timescale / avgDelta;
    if (fps >= 1 && fps <= 240) {
      return snapFps(fps);
    }
  }
  return null;
}

function parseMp4Mdia(view, mdiaOffset, mdiaEnd) {
  let isVideo = false;
  let timescale = 0;
  let sttsOffset = null;

  let pos = mdiaOffset;
  while (pos + 8 <= mdiaEnd) {
    const size = view.getUint32(pos);
    if (size < 8) break;
    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7)
    );
    const boxEnd = Math.min(mdiaEnd, pos + size);

    if (type === 'hdlr' && pos + 20 <= boxEnd) {
      const hType = String.fromCharCode(
        view.getUint8(pos + 16),
        view.getUint8(pos + 17),
        view.getUint8(pos + 18),
        view.getUint8(pos + 19)
      );
      if (hType === 'vide') {
        isVideo = true;
      }
    } else if (type === 'mdhd' && pos + 28 <= boxEnd) {
      const version = view.getUint8(pos + 8);
      timescale = version === 0 ? view.getUint32(pos + 20) : view.getUint32(pos + 28);
    } else if (type === 'minf') {
      let mPos = pos + 8;
      while (mPos + 8 <= boxEnd) {
        const mSize = view.getUint32(mPos);
        if (mSize < 8) break;
        const mType = String.fromCharCode(
          view.getUint8(mPos + 4),
          view.getUint8(mPos + 5),
          view.getUint8(mPos + 6),
          view.getUint8(mPos + 7)
        );
        const mEnd = Math.min(boxEnd, mPos + mSize);

        if (mType === 'stbl') {
          let sPos = mPos + 8;
          while (sPos + 8 <= mEnd) {
            const sSize = view.getUint32(sPos);
            if (sSize < 8) break;
            const sType = String.fromCharCode(
              view.getUint8(sPos + 4),
              view.getUint8(sPos + 5),
              view.getUint8(sPos + 6),
              view.getUint8(sPos + 7)
            );
            if (sType === 'stts') {
              sttsOffset = sPos;
              break;
            }
            sPos += sSize;
          }
        }
        mPos += mSize;
      }
    }

    pos += size;
  }

  if (isVideo && timescale > 0 && sttsOffset !== null) {
    return parseMp4Stts(view, sttsOffset, timescale);
  }
  return null;
}

function findAsciiInView(view, str) {
  const len = view.byteLength - str.length;
  const c0 = str.charCodeAt(0);
  for (let i = 0; i <= len; i++) {
    if (view.getUint8(i) === c0) {
      let match = true;
      for (let j = 1; j < str.length; j++) {
        if (view.getUint8(i + j) !== str.charCodeAt(j)) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
  }
  return -1;
}

function parseMp4Buffer(view) {
  let pos = 0;
  const len = view.byteLength;

  while (pos + 8 <= len) {
    let size = view.getUint32(pos);
    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7)
    );
    if (size === 1) {
      if (pos + 16 > len) break;
      const high = view.getUint32(pos + 8);
      const low = view.getUint32(pos + 12);
      size = high * 0x100000000 + low;
    } else if (size === 0) {
      size = len - pos;
    }
    if (size < 8) break;

    if (type === 'moov') {
      const moovEnd = Math.min(len, pos + size);
      let tPos = pos + 8;
      while (tPos + 8 <= moovEnd) {
        const tSize = view.getUint32(tPos);
        if (tSize < 8) break;
        const tType = String.fromCharCode(
          view.getUint8(tPos + 4),
          view.getUint8(tPos + 5),
          view.getUint8(tPos + 6),
          view.getUint8(tPos + 7)
        );
        const trakEnd = Math.min(moovEnd, tPos + tSize);

        if (tType === 'trak') {
          let mPos = tPos + 8;
          while (mPos + 8 <= trakEnd) {
            const mSize = view.getUint32(mPos);
            if (mSize < 8) break;
            const mType = String.fromCharCode(
              view.getUint8(mPos + 4),
              view.getUint8(mPos + 5),
              view.getUint8(mPos + 6),
              view.getUint8(mPos + 7)
            );
            if (mType === 'mdia') {
              const res = parseMp4Mdia(view, mPos + 8, Math.min(trakEnd, mPos + mSize));
              if (res) return res;
            }
            mPos += mSize;
          }
        }
        tPos += tSize;
      }
    }

    pos += size;
  }

  const sttsIdx = findAsciiInView(view, 'stts');
  const mdhdIdx = findAsciiInView(view, 'mdhd');
  if (sttsIdx >= 4 && mdhdIdx >= 4) {
    const mdhdPos = mdhdIdx - 4;
    const version = view.getUint8(mdhdPos + 8);
    const timescale = version === 0 ? view.getUint32(mdhdPos + 20) : view.getUint32(mdhdPos + 28);
    const fps = parseMp4Stts(view, sttsIdx - 4, timescale);
    if (fps) return fps;
  }

  return null;
}

function parseWebmBuffer(view) {
  const len = view.byteLength - 7;
  for (let i = 0; i < len; i++) {
    if (view.getUint8(i) === 0x23 && view.getUint8(i + 1) === 0xe3 && view.getUint8(i + 2) === 0x83) {
      let offset = i + 3;
      const sizeByte = view.getUint8(offset++);
      let durNs = 0;
      if (sizeByte === 0x84 && offset + 4 <= view.byteLength) {
        durNs = view.getUint32(offset);
      } else if (sizeByte === 0x88 && offset + 8 <= view.byteLength) {
        const high = view.getUint32(offset);
        const low = view.getUint32(offset + 4);
        durNs = high * 0x100000000 + low;
      }
      if (durNs > 0) {
        const fps = 1e9 / durNs;
        if (fps >= 1 && fps <= 240) {
          return snapFps(fps);
        }
      }
    }
  }
  return null;
}

export async function parseVideoContainerFps(fileOrBlob) {
  if (!fileOrBlob || !fileOrBlob.size) return null;
  try {
    const headSize = Math.min(fileOrBlob.size, 1024 * 1024);
    const headBuf = await fileOrBlob.slice(0, headSize).arrayBuffer();
    const headView = new DataView(headBuf);

    let fps = parseMp4Buffer(headView) || parseWebmBuffer(headView);
    if (fps) return fps;

    if (fileOrBlob.size > headSize) {
      const tailStart = Math.max(0, fileOrBlob.size - 1024 * 1024);
      const tailBuf = await fileOrBlob.slice(tailStart, fileOrBlob.size).arrayBuffer();
      const tailView = new DataView(tailBuf);
      fps = parseMp4Buffer(tailView);
      if (fps) return fps;
    }
  } catch {
    // Ignore container parse errors
  }
  return null;
}

export function detectFpsFromVideoElement(video, timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!video || typeof video.requestVideoFrameCallback !== 'function') {
      return resolve(null);
    }
    const samples = [];
    let lastTime = null;
    let timer = setTimeout(() => {
      cleanup();
      finish();
    }, timeoutMs);

    let handle = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (handle && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(handle);
      }
    };

    const finish = () => {
      if (samples.length >= 3) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        if (avg > 0) {
          const rawFps = 1 / avg;
          if (rawFps >= 1 && rawFps <= 240) {
            return resolve(snapFps(rawFps));
          }
        }
      }
      resolve(null);
    };

    const onFrame = (now, metadata) => {
      if (lastTime !== null && metadata.mediaTime > lastTime) {
        const dt = metadata.mediaTime - lastTime;
        if (dt >= 0.004 && dt <= 0.5) {
          samples.push(dt);
        }
      }
      lastTime = metadata.mediaTime;
      if (samples.length >= 8) {
        cleanup();
        finish();
        return;
      }
      handle = video.requestVideoFrameCallback(onFrame);
    };

    handle = video.requestVideoFrameCallback(onFrame);
  });
}

export async function getVideoMetadata(fileOrBlob) {
  const containerFpsPromise = parseVideoContainerFps(fileOrBlob);

  const videoMetaPromise = new Promise((resolve, reject) => {
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

  const [meta, containerFps] = await Promise.all([videoMetaPromise, containerFpsPromise]);
  return {
    ...meta,
    fps: containerFps || null,
  };
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
    maxFrames = Infinity,
    onProgress = null,
  } = {}
) {
  const meta = await getVideoMetadata(fileOrBlob);
  const totalDuration = meta.duration;

  const startSec = Math.max(0, Math.min(totalDuration, Number(startTime) || 0));
  const endSec = Math.max(startSec + 0.05, Math.min(totalDuration, endTime != null ? Number(endTime) : totalDuration));
  const rangeDuration = endSec - startSec;

  let effectiveFps = Math.max(1, Math.min(120, Number(fps) || 20));
  let estimatedCount = Math.ceil(rangeDuration * effectiveFps);

  if (Number.isFinite(maxFrames) && estimatedCount > maxFrames) {
    effectiveFps = maxFrames / rangeDuration;
    estimatedCount = maxFrames;
  }

  const timestamps = [];
  const step = 1 / effectiveFps;
  for (let t = startSec; t < endSec && (Number.isFinite(maxFrames) ? timestamps.length < maxFrames : true); t += step) {
    timestamps.push(t);
  }
  if (timestamps.length === 0) {
    timestamps.push(startSec);
  }

  const clampedScale = Math.max(0.05, Math.min(1, Number(scale) || 1));
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
