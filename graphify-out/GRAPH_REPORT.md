# Graph Report - dither-dot  (2026-07-17)

## Corpus Check
- 56 files · ~322,091 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 415 nodes · 739 edges · 29 communities (28 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7435917f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- GIF & Image Timeline
- K-Means Palette Algorithms
- Input & Blur Controls
- Package Dependencies
- Histogram & Thumbnail Rendering
- Dithering Worker Thread
- Application Layout Components
- Aside Navigation Router
- Export Operations Page
- Pipeline Timing Tooltips
- Color Palette Editor Page
- Web App Web Manifest
- App Entry & Deployment
- GIF Frame Decoder Worker
- Color Palette Extraction Worker
- Graphify Rule Workflows
- Root DOM Entrypoint

## God Nodes (most connected - your core abstractions)
1. `ShaderImage()` - 16 edges
2. `ImportPage()` - 16 edges
3. `useParamsStore` - 16 edges
4. `Footer()` - 12 edges
5. `ExportPage()` - 12 edges
6. `useGifStore` - 11 edges
7. `GallerySection()` - 10 edges
8. `usePaletteStore` - 10 edges
9. `useImageStore` - 10 edges
10. `exportCurrentGif()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Main JavaScript Entry Script Reference` --references--> `DITHER-DOT`  [INFERRED]
  index.html → README.md
- `Cloudflare Pages Deployment Workflow` --references--> `Cloudflare Pages`  [INFERRED]
  .github/workflows/deploy.yml → README.md
- `App()` --calls--> `useProcessingStore`  [EXTRACTED]
  src/App.jsx → src/stores/engine/processingStore.js
- `App()` --calls--> `useImageStore`  [EXTRACTED]
  src/App.jsx → src/stores/media/imageStore.js
- `PipelineTimingTooltip()` --calls--> `useParamsStore`  [EXTRACTED]
  src/components/analytics/PipelineTimingTooltip.jsx → src/stores/data/paramsStore.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **DITHER-DOT Frontend Tech Stack** — readme_react, readme_pixijs, readme_zustand [EXTRACTED 1.00]

## Communities (29 total, 1 thin omitted)

### Community 0 - "GIF & Image Timeline"
Cohesion: 0.09
Nodes (40): blobToDataUrl(), buildClipboardFileName(), compositeWithWatermark(), copyCanvasToClipboard(), decodeGifWithWorker(), GallerySection(), getExportBaseName(), getExportCanvasOrThrow() (+32 more)

### Community 1 - "K-Means Palette Algorithms"
Cohesion: 0.11
Nodes (30): CHANNELS, computeHistogram(), drawHistogram(), Histogram(), AUTOFIT_METHOD, BUILTIN_PALETTES, DEFAULT_PALETTE, DEFAULT_PALETTE_SETTINGS (+22 more)

### Community 2 - "Input & Blur Controls"
Cohesion: 0.11
Nodes (28): BLUR_ENTRIES, BlurControls(), capitalize(), formatLabel(), ParamSlider(), capitalize(), COLOR_ENTRIES, ColorControls() (+20 more)

### Community 3 - "Package Dependencies"
Cohesion: 0.04
Nodes (46): @babel/core, babel-plugin-react-compiler, @babel/core, babel-plugin-react-compiler, esbuild, eslint, @eslint/js, eslint-plugin-react-hooks (+38 more)

### Community 4 - "Histogram & Thumbnail Rendering"
Cohesion: 0.09
Nodes (31): countUniqueColorsFromImageSource(), countUniqueColorsFromPixels(), drawWebcamFrameToCanvas(), generateRecoloredWatermark(), getDrawableDimensions(), getPaletteExtremes(), getRgbLuminance(), getTargetDisplaySize() (+23 more)

### Community 5 - "Dithering Worker Thread"
Cohesion: 0.07
Nodes (25): alg, algs, bCounts, colors, croppedPixels, filters, gCounts, image (+17 more)

### Community 6 - "Application Layout Components"
Cohesion: 0.06
Nodes (31): ddot-wasm, ddot-wasm, gifuct-js, lucide-react, modern-gif, react, react-dom, zustand (+23 more)

### Community 7 - "Aside Navigation Router"
Cohesion: 0.12
Nodes (18): App(), ICONS, IS_MOBILE, Aside(), AdjustmentsPage, AsideRouter(), DitherPage, ExportPage (+10 more)

### Community 8 - "Export Operations Page"
Cohesion: 0.17
Nodes (18): canvasToDataUrl(), copyCanvasToClipboard(), createUpscaledCanvas(), ExportPage(), getDefaultExportName(), getExportBaseName(), getExportCanvasOrThrow(), saveCanvasAsPng() (+10 more)

### Community 9 - "Pipeline Timing Tooltips"
Cohesion: 0.73
Nodes (5): clamp(), percentToValue(), Slider(), snapValue(), valueToPercent()

### Community 10 - "Color Palette Editor Page"
Cohesion: 0.13
Nodes (23): formatAlgorithmName(), formatMs(), getDitherAlgorithmLabel(), getPaletteAlgorithmLabel(), PipelineTimingTooltip(), DitherPage(), METHODS, ColorCountSection() (+15 more)

### Community 11 - "Web App Web Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, scope, short_name (+2 more)

### Community 12 - "App Entry & Deployment"
Cohesion: 0.20
Nodes (10): Cloudflare Pages Deployment Workflow, Main JavaScript Entry Script Reference, Cloudflare Pages, DITHER-DOT, Dithering Algorithms, Palette Extraction, PixiJS WebGL Renderer, React Framework (+2 more)

### Community 13 - "GIF Frame Decoder Worker"
Cohesion: 0.43
Nodes (6): applyPatch(), clearFrameRect(), decoded, decodeGifFrames(), parseLoopCount(), transferableFrames

### Community 15 - "Color Palette Extraction Worker"
Cohesion: 0.33
Nodes (4): image, imageData, palette, pixelsArray

### Community 16 - "Graphify Rule Workflows"
Cohesion: 0.67
Nodes (3): Graphify Query Tool, Graphify Usage Rules, Graphify Workflow

## Knowledge Gaps
- **136 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useParamsStore` connect `Input & Blur Controls` to `GIF & Image Timeline`, `Color Palette Editor Page`, `Histogram & Thumbnail Rendering`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Package Dependencies` to `Application Layout Components`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _136 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GIF & Image Timeline` be split into smaller, more focused modules?**
  _Cohesion score 0.09061224489795919 - nodes in this community are weakly interconnected._
- **Should `K-Means Palette Algorithms` be split into smaller, more focused modules?**
  _Cohesion score 0.10741971207087486 - nodes in this community are weakly interconnected._
- **Should `Input & Blur Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.11092436974789915 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._