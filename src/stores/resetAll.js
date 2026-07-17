import useGalleryStore from './galleryStore';


export function clearGalleryHistory() {
  useGalleryStore.getState().clearHistory?.();
}
