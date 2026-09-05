import { useEffect, useRef } from 'react';
import "./styles/Histogram.css";
import { getPaletteReference, subscribePaletteReference } from '../../utils/canvasRegistry';

const CHANNELS = [
  { index: 0, color: '#e05555' },
  { index: 1, color: '#55b855' },
  { index: 2, color: '#5588e0' },
];
const BINS = 256;

function computeHistogram(pixels) {
  const counts = [
    new Uint32Array(BINS),
    new Uint32Array(BINS),
    new Uint32Array(BINS),
  ];

  for (let i = 0; i < pixels.length; i += 4) {
    counts[0][pixels[i]]++;
    counts[1][pixels[i + 1]]++;
    counts[2][pixels[i + 2]]++;
  }

  return counts;
}

function drawHistogram(canvas, counts) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const globalMax = Math.max(
    ...CHANNELS.map(({ index }) => Math.max(...counts[index]))
  );

  if (globalMax === 0) return;

  const binW = w / BINS;

  for (const { index, color } of CHANNELS) {
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let b = 0; b < BINS; b++) {
      const x = b * binW;
      const barH = (counts[index][b] / globalMax) * h;
      ctx.lineTo(x, h - barH);
    }

    ctx.lineTo(w, h);
    ctx.closePath();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

export default function Histogram() {
  const canvasRef = useRef(null);

  const refresh = (reference) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!reference) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const counts = reference.histogram || (reference.pixels?.length ? computeHistogram(reference.pixels) : null);
    if (!counts) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    drawHistogram(canvas, counts);
  };

  useEffect(() => {
    refresh(getPaletteReference());
    return subscribePaletteReference(refresh);
  }, []);

  return (
    <div className="histogram-container">
      <canvas
        ref={canvasRef}
        className="histogram-canvas"
        width={256}
        height={64}
        aria-label="RGB histogram of the processed image before dithering"
      />
    </div>
  );
}