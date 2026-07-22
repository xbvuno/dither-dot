import { useEffect, useRef } from 'react';
import "./styles/GifTimeline.css";
import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import useGifStore from '../../stores/media/gifStore';

export default function GifTimeline() {
  const controlsRef = useRef(null);
  const frames = useGifStore((s) => s.frames);
  const currentFrameIndex = useGifStore((s) => s.currentFrameIndex);
  const playing = useGifStore((s) => s.playing);
  const playbackDelay = useGifStore((s) => s.playbackDelay);
  const frameStates = useGifStore((s) => s.frameStates);
  const decoding = useGifStore((s) => s.decoding);

  const setCurrentFrameIndex = useGifStore((s) => s.setCurrentFrameIndex);
  const setPlaying = useGifStore((s) => s.setPlaying);
  const setPlaybackDelay = useGifStore((s) => s.setPlaybackDelay);

  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    if (frameStates[currentFrameIndex] !== 'done') return;

    const nextIndex = (currentFrameIndex + 1) % frames.length;
    if (!frames[nextIndex]) {
      setPlaying(false);
      return;
    }

    const activeFrameDelay = frames[currentFrameIndex]?.delay;
    const delay = Math.max(20, Number(activeFrameDelay) || 100);
    const timer = window.setTimeout(() => {
      setCurrentFrameIndex(nextIndex);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentFrameIndex, frameStates, frames, playing, setCurrentFrameIndex, setPlaying]);

  useEffect(() => {
    const activeFrameDelay = frames[currentFrameIndex]?.delay;
    if (!activeFrameDelay) return;
    const normalized = Math.max(20, Number(activeFrameDelay) || 100);
    if (Number(playbackDelay) === normalized) return;
    setPlaybackDelay(normalized);
  }, [currentFrameIndex, frames, playbackDelay, setPlaybackDelay]);

  if (frames.length <= 1 && !decoding) return null;

  const totalFrames = frames.length;
  const stopDisabled = !playing && currentFrameIndex === 0;

  const goToPreviousFrame = () => {
    const previousIndex = (currentFrameIndex - 1 + totalFrames) % totalFrames;
    setPlaying(false);
    setCurrentFrameIndex(previousIndex);
  };

  const goToNextFrame = () => {
    const nextIndex = (currentFrameIndex + 1) % totalFrames;
    setPlaying(false);
    setCurrentFrameIndex(nextIndex);
  };

  const stopAndReset = () => {
    if (stopDisabled) return;
    setPlaying(false);
    setCurrentFrameIndex(0);
  };

  return (
    <div className={`gif-timeline-shell${decoding ? ' gif-timeline-shell--decoding' : ''}`}>
      <section className='gif-timeline' aria-label='GIF TIMELINE'>
        <div ref={controlsRef} className='gif-timeline-controls'>
          <button
            type='button'
            className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
            onClick={goToPreviousFrame}
            aria-label='Previous frame'
            title='PREVIOUS FRAME'
            disabled={decoding}
          >
            <SkipBack size={14} strokeWidth={2} />
          </button>

          <button
            type='button'
            className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
            onClick={stopAndReset}
            aria-label='Stop and go to first frame'
            title='STOP AND RESET'
            disabled={decoding || stopDisabled}
          >
            <Square size={12} strokeWidth={2.4} />
          </button>

          <button
            type='button'
            className={`bv-option-btn gif-timeline-btn gif-timeline-icon-btn${playing ? ' active' : ''}`}
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause GIF playback' : 'Play GIF playback'}
            title={playing ? 'PAUSE' : 'PLAY'}
            disabled={decoding}
          >
            {playing ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
          </button>

          <button
            type='button'
            className='bv-option-btn gif-timeline-btn gif-timeline-icon-btn'
            onClick={goToNextFrame}
            aria-label='Next frame'
            title='NEXT FRAME'
            disabled={decoding}
          >
            <SkipForward size={14} strokeWidth={2} />
          </button>

          <span className={`gif-timeline-label gif-frame-counter${decoding ? ' gif-decoding-label' : ''}`}>
            {decoding ? 'DECODING...' : `${currentFrameIndex + 1} / ${totalFrames} | R: ${totalFrames > 0 ? Math.round((frameStates.filter((s) => s === 'done').length / totalFrames) * 100) : 0}%`}
          </span>

          <label htmlFor='gif-playback-delay' className={`gif-delay-wrap gif-delay-wrap--right${decoding ? ' disabled' : ''}`}>
            <span className='gif-timeline-label'>DELAY (MS)</span>
            <input
              className='gif-delay-input'
              type='number'
              name='playbackDelay'
              id='gif-playback-delay'
              min='20'
              max='5000'
              step='10'
              value={playbackDelay}
              onChange={(event) => setPlaybackDelay(event.target.value)}
              disabled={decoding}
              aria-label='Playback Delay (MS)'
            />
          </label>
        </div>
      </section>
    </div>
  );
}
