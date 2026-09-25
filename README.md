# 🎨 DITHER-DOT

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg?style=flat-square)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-dither.xbvuno.dev-white?style=flat-square)](https://dither.xbvuno.dev)
[![Engine: ddot](https://img.shields.io/badge/Engine-ddot%20(Rust%2FWASM)-white?style=flat-square&logo=rust)](https://github.com/xbvuno/ddot)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-white.svg?style=flat-square)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-white.svg?style=flat-square&logo=nodedotjs)](https://nodejs.org)

<img src="https://dither.xbvuno.dev/wallpaper.png" alt="DITHER-DOT Preview" width="100%" />

A fast, open-source image and animated GIF dithering studio running 100% client-side in your browser.

> **Try it live at [dither.xbvuno.dev](https://dither.xbvuno.dev)**

---

## ⚡ Key Features

- **🚀 SIMD-Accelerated WASM Engine**: Core processing powered by [`ddot`](https://github.com/xbvuno/ddot) (`ddot-wasm`), offloaded to dedicated Web Workers (`ditherWorker`, `paletteWorker`, `gifDecodeWorker`) for smooth 60 FPS UI performance without main-thread blocking.
- **🎞️ Animated GIF & Timeline Studio**: Decode animated GIFs frame by frame, scrub the interactive playback timeline, tweak FPS, loop, and export lossless dithered GIFs.
- **📷 Real-Time 60 FPS Webcam Feed**: Live camera feed dithering with horizontal mirroring, instant palette lock, and 1-click snapshots.
- **🎨 10+ Dithering Algorithms**: Floyd-Steinberg, Bayer Matrix (Ordered 2×2, 4×4, 8×8), Atkinson, Jarvis-Judice-Ninke, Stucki, Burkes, Sierra, Two-Row Sierra, Sierra Lite, and Random noise.
- **🧪 Advanced Palette Quantization**: Intelligent color reduction using Octree, Median-Cut, and K-Means in both RGB and LAB color spaces, plus curated retro presets (Game Boy, Macintosh, 1-Bit Noir, CGA, CRT).
- **🎛️ Non-Destructive Adjustments & Export**: Real-time gamma, contrast, saturation, Kawase blur, noise injection, and pixel-perfect high-resolution upscaling to PNG or animated GIF.
- **🔒 Privacy-First**: 100% client-side processing with zero server uploads - your images and camera feed never leave your machine.

---

## 🛠️ Technology Stack

| Component | Stack |
|---|---|
| **Core Dithering Engine** | [`ddot`](https://github.com/xbvuno/ddot) (Rust / WebAssembly) |
| **Frontend Framework** | [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/) |
| **State Management** | [Zustand 5](https://github.com/pmndrs/zustand) |
| **Concurrency** | Dedicated multithreaded Web Workers |
| **Icons & Design** | [Lucide React](https://lucide.dev/) + Custom Brutalist/Flat CSS |
| **Deployment** | [Cloudflare Pages](https://pages.cloudflare.com/) |

---

## 📦 Quick Start

### Prerequisites
- **Node.js** `>= 18.0.0`
- **npm** or **pnpm**

### Installation & Local Run

```bash
# 1. Clone repository
git clone https://github.com/xbvuno/dither-dot.git
cd dither-dot

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Visit `http://localhost:5173/` for the landing page or `http://localhost:5173/editor/` for the dithering studio.

### Production Build

```bash
# Compile bundle and WASM assets
npm run build

# Preview production build locally
npm run preview
```

---

## 🤝 Contributing

Contributions, bug reports, feature suggestions, and new palette presets are warmly welcome! Please read our [**Contributing Guide**](CONTRIBUTING.md) to get started with our GitHub Flow and Conventional Commits standards.

---

## 📄 License

This project is licensed under the **[MIT License](LICENSE)**.

Developed by [**Bruno Cerra**](https://xbvuno.dev) ([@xbvuno](https://github.com/xbvuno)).
