export async function rgbaFrameToPngBlob(frame) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  ctx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to convert GIF frame to PNG.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export async function decodeGifWithWorker(blob) {
  const worker = new Worker(new URL('../workers/gifDecodeWorker.js', import.meta.url), { type: 'module' });
  const gifBuffer = await blob.arrayBuffer();
  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = (event) => {
        const payload = event.data || {};
        if (payload.jobId !== jobId) return;

        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }

        resolve(payload);
      };

      worker.onerror = () => {
        reject(new Error('GIF decoding worker crashed.'));
      };

      worker.postMessage({ jobId, gifBuffer }, [gifBuffer]);
    });

    const frames = Array.isArray(result.frames)
      ? result.frames.map((frame) => ({
          width: frame.width,
          height: frame.height,
          delay: frame.delay,
          pixels: new Uint8ClampedArray(frame.pixels),
        }))
      : [];

    return {
      loop: Number.isFinite(result.loop) ? result.loop : 0,
      frames,
    };
  } finally {
    worker.terminate();
  }
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read GIF data.'));
    reader.readAsDataURL(blob);
  });
}

export async function getStaticPreviewFromBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to extract static preview.'));
    };
    img.src = objectUrl;
  });
}
