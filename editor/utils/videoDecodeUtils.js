import { createInstanceId, createOriginId } from '../stores/media/gifStore';

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

  // Film & NTSC / PAL standards with realistic tolerance
  if (Math.abs(fps - 23.976) < 0.25 || Math.abs(fps - 24) < 0.35) return 24;
  if (Math.abs(fps - 25) < 0.45) return 25;
  if (Math.abs(fps - 29.97) < 0.25 || Math.abs(fps - 30) < 0.45) return 30;
  if (Math.abs(fps - 48) < 0.5) return 48;
  if (Math.abs(fps - 50) < 0.5) return 50;
  if (Math.abs(fps - 59.94) < 0.25 || Math.abs(fps - 60) < 0.5) return 60;
  if (Math.abs(fps - 120) < 1.0) return 120;

  // Other common low-framerate video / GIF / screen-recording standards
  const common = [8, 10, 12, 15, 18, 20, 75, 90, 144];
  for (const s of common) {
    if (Math.abs(fps - s) < 0.45) return s;
  }

  return Math.round(fps);
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

function parseWebmBuffer(view) {
  const len = view.byteLength - 7;
  for (let i = 0; i < len; i++) {
    const b0 = view.getUint8(i);
    const b1 = view.getUint8(i + 1);
    const b2 = view.getUint8(i + 2);

    // 1. DefaultDuration: [0x23, 0xE3, 0x83]
    if (b0 === 0x23 && b1 === 0xe3 && b2 === 0x83) {
      let offset = i + 3;
      if (offset >= view.byteLength) break;
      const sizeByte = view.getUint8(offset++);
      const dataSize = (sizeByte & 0x80) ? (sizeByte & 0x7f) : (sizeByte === 0x40 ? 0 : 4);
      let durNs = 0;
      if (dataSize === 4 && offset + 4 <= view.byteLength) {
        durNs = view.getUint32(offset);
      } else if (dataSize === 8 && offset + 8 <= view.byteLength) {
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

    // 2. FrameRate float element: [0x23, 0x83, 0xE3]
    if (b0 === 0x23 && b1 === 0x83 && b2 === 0xe3) {
      let offset = i + 3;
      if (offset >= view.byteLength) break;
      const sizeByte = view.getUint8(offset++);
      const dataSize = (sizeByte & 0x80) ? (sizeByte & 0x7f) : 4;
      let fps = 0;
      if (dataSize === 4 && offset + 4 <= view.byteLength) {
        fps = view.getFloat32(offset);
      } else if (dataSize === 8 && offset + 8 <= view.byteLength) {
        fps = view.getFloat64(offset);
      }
      if (fps >= 1 && fps <= 240) {
        return snapFps(fps);
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
    if (!video) return resolve(null);

    // 1. Try immediate captureStream track setting if available
    try {
      const captureStream = video.captureStream || video.mozCaptureStream;
      if (typeof captureStream === 'function') {
        const stream = captureStream.call(video);
        if (stream) {
          const track = stream.getVideoTracks()?.[0];
          const settings = track?.getSettings?.();
          stream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {
              // ignore
            }
          });
          if (settings && typeof settings.frameRate === 'number' && settings.frameRate > 0) {
            const snapped = snapFps(settings.frameRate);
            if (snapped >= 1 && snapped <= 240) {
              return resolve(snapped);
            }
          }
        }
      }
    } catch {
      // Ignore captureStream failure and proceed to requestVideoFrameCallback
    }

    if (typeof video.requestVideoFrameCallback !== 'function') {
      return resolve(null);
    }

    const samples = [];
    let lastTime = null;
    let callCount = 0;
    let handle = null;

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

    let timer = setTimeout(() => {
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

function seekVideo(video, time, timeoutMs = 3000) {
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

    const waitForFramePresentation = () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        rfcId = video.requestVideoFrameCallback(() => {
          finish();
        });
        rfcFallbackTimer = setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(finish);
          });
        }, 200);
      } else {
        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
      }
    };

    const onSeeked = () => {
      waitForFramePresentation();
    };

    timeoutId = setTimeout(() => {
      finish(); // Safety fallback so process never hangs indefinitely
    }, timeoutMs);

    video.addEventListener('error', onError, { once: true });
    video.addEventListener('seeked', onSeeked, { once: true });

    try {
      const maxDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
      const target = Math.max(0, Math.min(maxDuration - 0.001, time));

      // If already at or extremely close to the target timestamp, seeked will not fire
      if (Math.abs(video.currentTime - target) < 0.005) {
        video.removeEventListener('seeked', onSeeked);
        waitForFramePresentation();
        return;
      }

      video.currentTime = target;
    } catch (err) {
      onError(err);
    }
  });
}

export async function extractFramesFromVideo(
  videoSource,
  {
    startTime = 0,
    endTime = null,
    scale = 1,
    fps = 20,
    maxFrames = Infinity,
    crop = null,
    onProgress = null,
  } = {}
) {
  const isVideoElement = typeof HTMLVideoElement !== 'undefined' && videoSource instanceof HTMLVideoElement;

  let video;
  let videoUrl = null;
  let naturalWidth = 0;
  let naturalHeight = 0;
  let totalDuration = 0;

  if (isVideoElement) {
    video = videoSource;
    if (!video.paused) {
      video.pause();
    }
    naturalWidth = video.videoWidth || 640;
    naturalHeight = video.videoHeight || 480;
    totalDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
  } else {
    const meta = await getVideoMetadata(videoSource);
    videoUrl = meta.url;
    naturalWidth = meta.width;
    naturalHeight = meta.height;
    totalDuration = meta.duration;

    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;
    // Keep in DOM with non-zero dimensions and opacity so Chromium compositor actively decodes frames
    video.style.position = 'fixed';
    video.style.left = '0';
    video.style.top = '0';
    video.style.width = '4px';
    video.style.height = '4px';
    video.style.opacity = '0.01';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-9999';
    document.body.appendChild(video);

    // Wait for canplay / loadeddata
    await new Promise((resolve) => {
      if (video.readyState >= 2) return resolve();
      const handler = () => {
        video.removeEventListener('loadeddata', handler);
        resolve();
      };
      video.addEventListener('loadeddata', handler);
    });
  }

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
    timestamps.push(Number(t.toFixed(4)));
  }
  if (timestamps.length === 0) {
    timestamps.push(Number(startSec.toFixed(4)));
  }

  const clampedScale = Math.max(0.05, Math.min(1, Number(scale) || 1));
  const cropX = crop ? Math.max(0, Math.min(naturalWidth - 1, Math.round(crop.x))) : 0;
  const cropY = crop ? Math.max(0, Math.min(naturalHeight - 1, Math.round(crop.y))) : 0;
  const cropW = crop ? Math.max(1, Math.min(naturalWidth - cropX, Math.round(crop.width))) : naturalWidth;
  const cropH = crop ? Math.max(1, Math.min(naturalHeight - cropY, Math.round(crop.height))) : naturalHeight;

  const targetWidth = Math.max(1, Math.round(cropW * clampedScale));
  const targetHeight = Math.max(1, Math.round(cropH * clampedScale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    throw new Error('Canvas 2D context creation failed.');
  }

  const frameDelay = Math.max(20, Math.round(1000 / effectiveFps));
  const frames = [];

  try {
    for (let i = 0; i < timestamps.length; i += 1) {
      const time = timestamps[i];
      await seekVideo(video, time);

      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetWidth, targetHeight);

      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      frames.push({
        id: createInstanceId(),
        originId: createOriginId(),
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
    if (!isVideoElement) {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // ignore
      }
      video.remove();
    } else {
      try {
        video.currentTime = startSec;
      } catch {
        // ignore
      }
    }
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
