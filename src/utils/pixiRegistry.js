let _app = null;
let _sourceImage = null;
let _paletteReference = null;
const _paletteReferenceListeners = new Set();
let _renderSnapshot = { uniqueColors: 0, originalUniqueColors: 0 };
const _renderSnapshotListeners = new Set();

export function registerPixiApp(app) {
  _app = app;
}

export function getPixiApp() {
  return _app;
}

export function registerSourceImage(sourceImage) {
  _sourceImage = sourceImage;
}

export function getSourceImage() {
  return _sourceImage;
}

export function registerPaletteReference(reference) {
  _paletteReference = reference;
  for (const listener of _paletteReferenceListeners) {
    listener(_paletteReference);
  }
}

export function getPaletteReference() {
  return _paletteReference;
}

export function subscribePaletteReference(listener) {
  _paletteReferenceListeners.add(listener);
  return () => _paletteReferenceListeners.delete(listener);
}

export function registerRenderSnapshot(snapshot) {
  _renderSnapshot = snapshot ?? { uniqueColors: 0, originalUniqueColors: 0 };

  for (const listener of _renderSnapshotListeners) {
    listener(_renderSnapshot);
  }
}

export function getRenderSnapshot() {
  return _renderSnapshot;
}

export function subscribeRenderSnapshot(listener) {
  _renderSnapshotListeners.add(listener);
  return () => {
    _renderSnapshotListeners.delete(listener);
  };
}

let _outputCanvas = null;

export function registerOutputCanvas(canvas) {
  _outputCanvas = canvas ?? null;
}

export function getOutputCanvas() {
  return _outputCanvas;
}
