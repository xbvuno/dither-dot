import useGalleryStore from '../data/galleryStore';


export function clearGalleryHistory() {
  useGalleryStore.getState().clearHistory?.();
}
