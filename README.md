# 🎨 DITHER-DOT: High-Performance Browser Dithering Studio

<img src="https://dither.xbvuno.dev/wallpaper.png" alt="DITHER-DOT preview" width="100%" />

A state-of-the-art, open-source image and animated GIF dithering studio running 100% client-side in your browser.

> ⚡ **Powered by [`ddot`](https://github.com/xbvuno/ddot)**: Core image processing and dithering algorithms are driven by `ddot` (`ddot-wasm`), a high-performance Rust + WebAssembly engine created by [@xbvuno](https://github.com/xbvuno).

---

## ⚡ Highlights & Key Features

### 🚀 High-Performance WASM Backend
- Driven by **[`ddot`](https://github.com/xbvuno/ddot)** — a SIMD-accelerated Rust + WebAssembly engine.
- Offloaded to dedicated multithreaded **Web Workers** (`ditherWorker`, `paletteWorker`, `gifDecodeWorker`) to ensure 60 FPS UI responsiveness with zero main-thread blocking.

### 🎞️ Complete GIF & Video Timeline Studio
- Per-frame GIF animation decoding, playback, and rendering.
- Real-time frame caching with instant invalidation upon parameter changes.
- Live palette extraction and recalculation during playback.

### 📷 Multimodal Input Sources
- **Files**: PNG, JPEG, WebP, GIF, BMP, TIFF, AVIF, SVG.
- **Drag & Drop**, Clipboard Paste, and Direct Image URL loading.
- **Live Webcam Feed**: Real-time camera feed dithering with mirror mode and instant palette freeze.
- **Built-in Presets**: Curated sample library for quick testing.

### 🎨 Advanced Dithering & Palette Engine
- **Dithering Algorithms**: Floyd-Steinberg, Jarvis-Judice-Ninke, Stucki, Atkinson, Burkes, Sierra, Two-Row Sierra, Sierra Lite, Ordered (Bayer Matrix), and Random.
- **Color Spaces**: RGB and LAB color space quantization.
- **Automatic Palette Extraction**: Octree, Median Cut, and K-Means.
- **Custom Palette Editor**: Add, remove, lock, hide, and tweak individual colors with custom size limits (2 to 64 colors).

### 🎛️ Non-Destructive Adjustments & Export
- Fine-grained controls: Contrast, Saturation, Gamma, Blacks, Whites, Hue.
- Edge-preserving Kawase Blur & Noise overlay.
- High-resolution pixel-perfect upscale (no anti-aliasing smoothing).
- Export formats: PNG, animated GIF (using `modern-gif`), clipboard copy, optional custom watermark.

---

## 🛠️ Technology Stack

- **Core WASM Backend**: [`ddot`](https://github.com/xbvuno/ddot) (Rust / WebAssembly)
- **Frontend**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **State Management**: [Zustand 5](https://github.com/pmndrs/zustand) (Modularized store modules)
- **Concurrency**: Web Workers & SharedArrayBuffers
- **Icons & UI**: Lucide React + Custom Vanilla CSS Design System

---

## 📦 Getting Started

### Prerequisites
- Node.js >= 18
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/xbvuno/dither-dot.git
cd dither-dot

# Install dependencies
npm install

# Start local development server
npm run dev
```

### Production Build

```bash
# Compile bundle and WASM assets
npm run build

# Preview production build
npm run preview
```

---

## 📄 License

Distributed under the **PolyForm Noncommercial License 1.0.0** (with Output Exception for unrestricted commercial use of generated media). See [`LICENSE`](LICENSE) for details.

Developed with ❤️ by [@xbvuno](https://github.com/xbvuno).
