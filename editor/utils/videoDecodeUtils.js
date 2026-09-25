import { createInstanceId, createOriginId } from '../stores/media/gifStore';
import { isWebCodecsSupported, extractFramesWithWebCodecs } from './webcodecsExtractUtils';

export { isWebCodecsSupported, extractFramesWithWebCodecs };

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

  // Exact standard broadcast and cinema frame rates (preserve 23.976, 29.97, 59.94)
  if (Math.abs(fps - 23.976) < 0.05 || Math.abs(fps - (24000 / 1001)) < 0.05) return 23.976;
  if (Math.abs(fps - 24) < 0.05) return 24;
  if (Math.abs(fps - 25) < 0.05) return 25;
  if (Math.abs(fps - 29.97) < 0.05 || Math.abs(fps - (30000 / 1001)) < 0.05) return 29.97;
  if (Math.abs(fps - 30) < 0.05) return 30;
  if (Math.abs(fps - 48) < 0.05) return 48;
  if (Math.abs(fps - 50) < 0.05) return 50;
  if (Math.abs(fps - 59.94) < 0.05 || Math.abs(fps - (60000 / 1001)) < 0.05) return 59.94;
  if (Math.abs(fps - 60) < 0.05) return 60;
  if (Math.abs(fps - 119.88) < 0.1 || Math.abs(fps - (120000 / 1001)) < 0.1) return 119.88;
  if (Math.abs(fps - 120) < 0.1) return 120;

  // Other common low-framerate video / GIF / screen-recording integer standards
  const common = [8, 10, 12, 15, 18, 20, 75, 90, 144];
  for (const s of common) {
    if (Math.abs(fps - s) < 0.25) return s;
  }

  // If very close to an integer within measurement jitter (<= 0.03)
  const rounded = Math.round(fps);
  if (Math.abs(fps - rounded) < 0.03) {
    return rounded;
  }

  // Preserve up to 3 decimal places without rounding away fractional frame rates
  return Math.round(fps * 1000) / 1000;
}

function parseMp4Stts(view, sttsOffset, timescale) {
  if (sttsOffset + 16 > view.byteLength) return null;
  const entryCount = view.getUint32(sttsOffset + 12);
  if (entryCount === 0) return null;

  let totalSamples = 0;
  let totalDuration = 0;
  const maxEntries = Math.min(entryCount, 1000);
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
    if (avgDelta > 0) {
      const fps = timescale / avgDelta;
      if (fps >= 1 && fps <= 240) {
        return snapFps(fps);
      }
    }
  }
  return null;
}

function parseMp4Mdia(view, mdiaOffset, mdiaEnd) {
  let isVideo = false;
  let timescale = 0;
  let duration = 0;
  let sttsOffset = null;
  let stszOffset = null;

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
    } else if (type === 'mdhd' && pos + 24 <= boxEnd) {
      const version = view.getUint8(pos + 8);
      if (version === 0 && pos + 28 <= boxEnd) {
        timescale = view.getUint32(pos + 20);
        duration = view.getUint32(pos + 24);
      } else if (version === 1 && pos + 36 <= boxEnd) {
        timescale = view.getUint32(pos + 28);
        const durHigh = view.getUint32(pos + 32);
        const durLow = view.getUint32(pos + 36);
        duration = durHigh * 0x100000000 + durLow;
      }
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
            } else if (sType === 'stsz') {
              stszOffset = sPos;
            }
            sPos += sSize;
          }
        }
        mPos += mSize;
      }
    }

    pos += size;
  }

  if (isVideo && timescale > 0) {
    if (sttsOffset !== null) {
      const fps = parseMp4Stts(view, sttsOffset, timescale);
      if (fps) return fps;
    }

    // Fallback: total samples from stsz divided by duration in seconds
    if (stszOffset !== null && duration > 0 && stszOffset + 20 <= view.byteLength) {
      const sampleCount = view.getUint32(stszOffset + 16);
      if (sampleCount > 0) {
        const durSec = duration / timescale;
        if (durSec > 0) {
          const fps = sampleCount / durSec;
          if (fps >= 1 && fps <= 240) {
            return snapFps(fps);
          }
        }
      }
    }
  }
  return null;
}

function parseMp4Trak(view, trakOffset, trakEnd) {
  let pos = trakOffset;
  while (pos + 8 <= trakEnd) {
    const size = view.getUint32(pos);
    if (size < 8) break;
    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7)
    );
    const end = Math.min(trakEnd, pos + size);

    if (type === 'mdia') {
      const res = parseMp4Mdia(view, pos + 8, end);
      if (res) return res;
    }
    pos += size;
  }
  return null;
}

function parseMp4MoovBuffer(view) {
  let pos = 0;
  const len = view.byteLength;

  while (pos + 8 <= len) {
    const boxSize = view.getUint32(pos);
    if (boxSize < 8) break;
    const boxType = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7)
    );
    const boxEnd = Math.min(len, pos + boxSize);

    if (boxType === 'trak') {
      const fps = parseMp4Trak(view, pos + 8, boxEnd);
      if (fps) return fps;
    }

    pos += boxSize;
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
      const res = parseMp4MoovBuffer(new DataView(view.buffer, view.byteOffset + pos + 8, Math.min(size - 8, len - pos - 8)));
      if (res) return res;
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

function readEbmlVint(view, offset) {
  if (offset >= view.byteLength) return null;
  const firstByte = view.getUint8(offset);
  if (firstByte === 0) return null;

  let mask = 0x80;
  let length = 1;
  while ((firstByte & mask) === 0 && length <= 8) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || offset + length > view.byteLength) return null;

  let value = firstByte & (mask - 1);
  for (let i = 1; i < length; i++) {
    value = (value * 256) + view.getUint8(offset + i);
  }
  return { value, length };
}

function readEbmlUint(view, offset, size) {
  if (offset + size > view.byteLength || size <= 0 || size > 8) return null;
  let val = 0;
  for (let i = 0; i < size; i++) {
    val = (val * 256) + view.getUint8(offset + i);
  }
  return val;
}

function readEbmlFloat(view, offset, size) {
  if (offset + size > view.byteLength) return null;
  if (size === 4) return view.getFloat32(offset);
  if (size === 8) return view.getFloat64(offset);
  return null;
}

function parseWebmBuffer(view) {
  const len = view.byteLength - 7;
  for (let i = 0; i < len; i++) {
    const b0 = view.getUint8(i);
    const b1 = view.getUint8(i + 1);
    const b2 = view.getUint8(i + 2);

    // 1. DefaultDuration: [0x23, 0xE3, 0x83]
    if (b0 === 0x23 && b1 === 0xe3 && b2 === 0x83) {
      const vint = readEbmlVint(view, i + 3);
      if (vint && vint.value > 0 && vint.value <= 8) {
        const dataOffset = i + 3 + vint.length;
        const durNs = readEbmlUint(view, dataOffset, vint.value);
        if (durNs && durNs > 0) {
          const fps = 1e9 / durNs;
          if (fps >= 1 && fps <= 240) {
            return snapFps(fps);
          }
        }
      }
    }

    // 2. FrameRate float element: [0x23, 0x83, 0xE3]
    if (b0 === 0x23 && b1 === 0x83 && b2 === 0xe3) {
      const vint = readEbmlVint(view, i + 3);
      if (vint && (vint.value === 4 || vint.value === 8)) {
        const dataOffset = i + 3 + vint.length;
        const fps = readEbmlFloat(view, dataOffset, vint.value);
        if (fps && fps >= 1 && fps <= 240) {
          return snapFps(fps);
        }
      }
    }
  }
  return null;
}

async function readBoxHeader(fileOrBlob, offset) {
  if (offset + 8 > fileOrBlob.size) return null;
  const chunk = await fileOrBlob.slice(offset, offset + 16).arrayBuffer();
  if (chunk.byteLength < 8) return null;
  const view = new DataView(chunk);
  let size = view.getUint32(0);
  const type = String.fromCharCode(
    view.getUint8(4),
    view.getUint8(5),
    view.getUint8(6),
    view.getUint8(7)
  );

  let headerSize = 8;
  if (size === 1) {
    if (chunk.byteLength < 16) return null;
    const high = view.getUint32(8);
    const low = view.getUint32(12);
    size = high * 0x100000000 + low;
    headerSize = 16;
  } else if (size === 0) {
    size = fileOrBlob.size - offset;
  }

  if (size < headerSize) return null;
  return { type, size, headerSize, offset };
}

async function findMoovBox(fileOrBlob) {
  let offset = 0;
  const maxIterations = 50;
  let iterations = 0;

  while (offset + 8 <= fileOrBlob.size && iterations++ < maxIterations) {
    const box = await readBoxHeader(fileOrBlob, offset);
    if (!box) break;
    if (box.type === 'moov') {
      return box;
    }
    offset += box.size;
  }
  return null;
}

export async function parseVideoContainerFps(fileOrBlob) {
  if (!fileOrBlob || !fileOrBlob.size) return null;
  try {
    // 1. Walk top-level boxes to locate 'moov' (efficiently handles MP4/MOV of any size, front or end)
    const moovBox = await findMoovBox(fileOrBlob);
    if (moovBox) {
      const readLen = Math.min(moovBox.size, 16 * 1024 * 1024);
      const moovBuf = await fileOrBlob.slice(moovBox.offset + moovBox.headerSize, moovBox.offset + readLen).arrayBuffer();
      const moovView = new DataView(moovBuf);
      const fps = parseMp4MoovBuffer(moovView);
      if (fps) return fps;
    }

    // 2. WebM / Matroska: scan up to 4MB from start of file
    const webmScanSize = Math.min(fileOrBlob.size, 4 * 1024 * 1024);
    const webmBuf = await fileOrBlob.slice(0, webmScanSize).arrayBuffer();
    const webmView = new DataView(webmBuf);
    const webmFps = parseWebmBuffer(webmView);
    if (webmFps) return webmFps;

    // 3. Fallback: Quick scan of the initial 1MB for MP4/MOV if box walk didn't hit standard moov
    const headSize = Math.min(fileOrBlob.size, 1024 * 1024);
    const headBuf = await fileOrBlob.slice(0, headSize).arrayBuffer();
    const headView = new DataView(headBuf);
    const headFps = parseMp4Buffer(headView);
    if (headFps) return headFps;
  } catch {
    // Ignore container parse errors
  }
  return null;
}

export function detectFpsFromVideoElement(video, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!video || typeof video.requestVideoFrameCallback !== 'function') {
      return resolve(null);
    }

    const samples = [];
    let lastTime = null;
    let callCount = 0;
    let handle = null;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (handle && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(handle);
      }
    };

    const finish = () => {
      if (samples.length >= 4) {
        // Sort deltas to calculate median and eliminate dropped-frame / seek outliers
        const sorted = [...samples].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;

        if (median > 0) {
          // Keep samples within [0.65x, 1.45x] of the median (eliminates 2x dropped frames)
          const inliers = sorted.filter((d) => d <= median * 1.45 && d >= median * 0.65);
          const avg = inliers.length > 0
            ? inliers.reduce((a, b) => a + b, 0) / inliers.length
            : median;

          if (avg > 0) {
            const rawFps = 1 / avg;
            if (rawFps >= 1 && rawFps <= 240) {
              return resolve(snapFps(rawFps));
            }
          }
        }
      }
      resolve(null);
    };

    timer = setTimeout(() => {
      cleanup();
      finish();
    }, timeoutMs);

    const onFrame = (now, metadata) => {
      callCount++;
      // Skip the first 2 callbacks to avoid seek/warm-up latency
      if (callCount > 2 && lastTime !== null && metadata.mediaTime > lastTime) {
        const dt = metadata.mediaTime - lastTime;
        if (dt >= 0.004 && dt <= 0.5) {
          samples.push(dt);
        }
      }
      lastTime = metadata.mediaTime;

      // Stop once we have 18 clean delta samples (~0.6s of playback)
      if (samples.length >= 18) {
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
    hasContainerFps: Boolean(containerFps),
  };
}

export function seekAndCaptureFrame(
  video,
  targetTime,
  ctx,
  crop,
  targetWidth,
  targetHeight,
  timeoutMs = 4000
) {
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let rfcId = null;
    let rfcFallbackTimer = null;
    let settled = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (rfcFallbackTimer) clearTimeout(rfcFallbackTimer);
      video.removeEventListener('error', onError);
      video.removeEventListener('seeked', onSeeked);
      if (rfcId && typeof video.cancelVideoFrameCallback === 'function') {
        try {
          video.cancelVideoFrameCallback(rfcId);
        } catch {
          // ignore
        }
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();

      try {
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(
          video,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          targetWidth,
          targetHeight
        );
        const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        resolve(new Uint8ClampedArray(imgData.data));
      } catch (err) {
        reject(err);
      }
    };

    const onError = (e) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e || new Error('Error during video seek'));
    };

    const onSeeked = () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        rfcId = video.requestVideoFrameCallback(() => {
          finish();
        });
        // Generous fallback if rfc doesn't fire after seeked (e.g. background tab or paused video)
        rfcFallbackTimer = setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(finish);
          });
        }, 800);
      } else {
        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
      }
    };

    timeoutId = setTimeout(() => {
      console.warn(`[VideoExtract] Seek timed out at targetTime=${targetTime}, capturing current frame buffer.`);
      finish();
    }, timeoutMs);

    video.addEventListener('error', onError, { once: true });
    video.addEventListener('seeked', onSeeked, { once: true });

    try {
      const maxDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
      const target = Math.max(0, Math.min(maxDuration - 0.001, targetTime));

      if (Math.abs(video.currentTime - target) < 0.002) {
        video.removeEventListener('seeked', onSeeked);
        onSeeked();
        return;
      }

      video.currentTime = target;
    } catch (err) {
      onError(err);
    }
  });
}

export function seekVideo(video, time, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let rfcId = null;
    let rfcFallbackTimer = null;
    let settled = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (rfcFallbackTimer) clearTimeout(rfcFallbackTimer);
      video.removeEventListener('error', onError);
      video.removeEventListener('seeked', onSeeked);
      if (rfcId && typeof video.cancelVideoFrameCallback === 'function') {
        try {
          video.cancelVideoFrameCallback(rfcId);
        } catch {
          // ignore
        }
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = (e) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e || new Error('Error during video seek'));
    };

    const onSeeked = () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        rfcId = video.requestVideoFrameCallback(() => {
          finish();
        });
        rfcFallbackTimer = setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(finish);
          });
        }, 800);
      } else {
        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
      }
    };

    timeoutId = setTimeout(() => {
      finish();
    }, timeoutMs);

    video.addEventListener('error', onError, { once: true });
    video.addEventListener('seeked', onSeeked, { once: true });

    try {
      const maxDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
      const target = Math.max(0, Math.min(maxDuration - 0.001, time));

      if (Math.abs(video.currentTime - target) < 0.002) {
        video.removeEventListener('seeked', onSeeked);
        onSeeked();
        return;
      }

      video.currentTime = target;
    } catch (err) {
      onError(err);
    }
  });
}

export async function extractFramesFromVideo(videoSource, options = {}) {
  if (!isWebCodecsSupported()) {
    throw new Error('Your browser does not support VideoDecoder');
  }

  const fileOrBlob =
    videoSource instanceof Blob || (typeof File !== 'undefined' && videoSource instanceof File)
      ? videoSource
      : options?.file;

  if (!fileOrBlob) {
    throw new Error('VideoDecoder requires the original File or Blob object to decode video frames.');
  }

  return extractFramesWithWebCodecs(fileOrBlob, options);
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
      id: createInstanceId(),
      originId: createOriginId(),
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
