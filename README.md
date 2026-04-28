# 🎨 DITHER-DOT: Your Dithering Studio, in the Browser

<img src="https://dither.xbvuno.dev/wallpaper.jpg" alt="DITHER-DOT preview" width="100%" />

A fast, open-source dithering studio for images and GIFs — running entirely in your browser.

---

## Features

### Input
- Import images via **file upload**, **drag & drop**, **paste from clipboard**, or **URL**
- Live **webcam feed** as input source (with mirror support)
- Supports PNG, JPEG, WebP, GIF, BMP, TIFF, AVIF, SVG
- Animated **GIF** and **WebP** support with per-frame processing

### Dithering
- **10 dithering algorithms**: Floyd-Steinberg, Jarvis Judice & Ninke, Stucki, Atkinson, Burkes, Sierra, Two-Row Sierra, Sierra Lite, Ordered (Bayer Matrix), Random
- Configurable **diffusion amount** and **matrix scale**
- Selectable **color space** for dithering: RGB or LAB
- Random seed control for stochastic methods

### Palette
- **Automatic palette extraction** from the image with multiple algorithms: Median Cut, Octree, K-Means
- **Custom palette** editor: add, remove, and tweak colors manually
- Palette size from 2 up to 64 colors
- Adjustable sampling accuracy

### Adjustments
- **Color controls**: Gamma, Blacks, Whites, Contrast, Saturation, Hue
- **Blur** (Kawase) with edge-preserving strength and pass count
- **Noise** overlay with independent controls
- Live **histogram** overlay
- One-click reset to defaults or full randomize

### Export
- Export processed image as **PNG**
- Export processed GIF with adjustable quality and frame delay
- **Copy to clipboard** with one click
- **Upscale** output before export (pixel-perfect, no smoothing)
- Optional **watermark** toggle

### UX
- Real-time GPU-accelerated preview via **WebGL / PixiJS**
- **Zoomable** canvas with pan support
- In-browser **gallery** with history (IndexedDB)
- **PWA** installable, works fully offline
- No server, no sign-up — everything runs client-side

---

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [PixiJS](https://pixijs.com/) (WebGL rendering)
- [Zustand](https://zustand-demo.pmnd.rs/) (state management)
- Web Workers for palette extraction and GIF decoding
- Cloudflare Workers / Pages for deployment

---

## Getting Started

```bash
npm install
npm run dev
```

## License

[LICENSE](LICENSE)
