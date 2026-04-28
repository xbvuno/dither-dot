import useDitherStore from './ditherStore';
import useGalleryStore from './galleryStore';
import useImageStore from './imageStore';
import usePaletteStore from './paletteStore';
import useParamsStore from './paramsStore';
import useSizeStore from './sizeStore';
import useWebcamStore from './webcamStore';

export function resetAllModifications() {
  useWebcamStore.getState().stopWebcam?.();
  useParamsStore.getState().resetParams?.();
  useDitherStore.getState().resetDither?.();
  usePaletteStore.getState().resetPalette?.();
  useSizeStore.getState().resetSize?.();
  useImageStore.getState().resetToDefault?.();
}

export function resetDefaultSettings() {
  useParamsStore.getState().resetParams?.();
  useDitherStore.getState().resetDither?.();
  usePaletteStore.getState().resetPalette?.();
  useSizeStore.getState().resetSizeToCurrent?.();
}

export function clearGalleryHistory() {
  useGalleryStore.getState().clearHistory?.();
}
