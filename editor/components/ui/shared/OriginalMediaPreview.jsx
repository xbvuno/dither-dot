import { useEffect, useRef } from 'react';
import useImageStore from '../../../stores/media/imageStore';
import useGifStore from '../../../stores/media/gifStore';
import useWebcamStore from '../../../stores/media/webcamStore';
import { drawWebcamFrameToCanvas } from '../../../utils/shaderHelpers';

export default function OriginalMediaPreview({
  sourceImg: propSourceImg,
  frames: propFrames,
  currentFrameIndex: propCurrentFrameIndex,
  isGif: propIsGif,
  webcamActive: propWebcamActive,
  webcamStream: propWebcamStream,
  webcamMirrored: propWebcamMirrored,
}) {
  const storeSourceImg = useImageStore((s) => s.sourceImg);
  const storeFrames = useGifStore((s) => s.frames);
  const storeCurrentFrameIndex = useGifStore((s) => s.currentFrameIndex);
  const storeWebcamActive = useWebcamStore((s) => s.active);
  const storeWebcamStream = useWebcamStore((s) => s.stream);
  const storeWebcamMirrored = useWebcamStore((s) => s.mirrored);

  const sourceImg = propSourceImg !== undefined ? propSourceImg : storeSourceImg;
  const frames = propFrames !== undefined ? propFrames : storeFrames;
  const currentFrameIndex =
    propCurrentFrameIndex !== undefined ? propCurrentFrameIndex : storeCurrentFrameIndex;
  const isGif = propIsGif !== undefined ? propIsGif : Boolean(frames && frames.length > 1);
  const webcamActive = propWebcamActive !== undefined ? propWebcamActive : storeWebcamActive;
  const webcamStream = propWebcamStream !== undefined ? propWebcamStream : storeWebcamStream;
  const webcamMirrored =
    propWebcamMirrored !== undefined ? propWebcamMirrored : storeWebcamMirrored;

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!webcamActive || !videoRef.current || !webcamStream) return;
    const video = videoRef.current;
    if (video.srcObject !== webcamStream) {
      video.srcObject = webcamStream;
      video.play().catch(() => {});
    }
  }, [webcamActive, webcamStream]);

  useEffect(() => {
    if (!webcamActive || !webcamStream) return undefined;
    let animId = null;

    const renderWebcam = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;

      if (video && canvas && video.readyState >= 2) {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;

        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
          canvas.style.width = `${vw}px`;
          canvas.style.height = `${vh}px`;
          if (container) {
            container.style.width = `${vw}px`;
            container.style.height = `${vh}px`;
          }
          window.dispatchEvent(new CustomEvent('dither-render-ready'));
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawWebcamFrameToCanvas(video, canvas, ctx, webcamMirrored);
        }
      }
      animId = requestAnimationFrame(renderWebcam);
    };

    animId = requestAnimationFrame(renderWebcam);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [webcamActive, webcamStream, webcamMirrored]);

  useEffect(() => {
    if (!isGif || !canvasRef.current || !frames || frames.length <= 1) return;
    const canvas = canvasRef.current;
    const frame = frames[currentFrameIndex] || frames[0];
    if (!frame || !frame.pixels) return;

    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(frame.pixels, frame.width, frame.height);
    ctx.putImageData(imgData, 0, 0);
  }, [isGif, frames, currentFrameIndex]);

  if (webcamActive && webcamStream) {
    return (
      <div ref={containerRef} style={{ position: 'relative' }} id='render'>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ display: 'none' }}
        />
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            imageRendering: 'pixelated',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  if (isGif && frames && frames.length > 1) {
    const first = frames[0];
    return (
      <canvas
        ref={canvasRef}
        width={first?.width || 100}
        height={first?.height || 100}
        style={{
          display: 'block',
          imageRendering: 'pixelated',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    );
  }

  return (
    <img
      src={sourceImg}
      alt='Original Media'
      onLoad={() => {
        window.dispatchEvent(new CustomEvent('dither-render-ready'));
      }}
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    />
  );
}
