# Graph Report - .  (2026-07-17)

## Corpus Check
- 68 files · ~322,085 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 372 nodes · 558 edges · 30 communities (29 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_GIF & Image Timeline|GIF & Image Timeline]]
- [[_COMMUNITY_K-Means Palette Algorithms|K-Means Palette Algorithms]]
- [[_COMMUNITY_Input & Blur Controls|Input & Blur Controls]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Histogram & Thumbnail Rendering|Histogram & Thumbnail Rendering]]
- [[_COMMUNITY_Dithering Worker Thread|Dithering Worker Thread]]
- [[_COMMUNITY_Application Layout Components|Application Layout Components]]
- [[_COMMUNITY_Aside Navigation Router|Aside Navigation Router]]
- [[_COMMUNITY_Export Operations Page|Export Operations Page]]
- [[_COMMUNITY_Pipeline Timing Tooltips|Pipeline Timing Tooltips]]
- [[_COMMUNITY_Color Palette Editor Page|Color Palette Editor Page]]
- [[_COMMUNITY_Web App Web Manifest|Web App Web Manifest]]
- [[_COMMUNITY_App Entry & Deployment|App Entry & Deployment]]
- [[_COMMUNITY_GIF Frame Decoder Worker|GIF Frame Decoder Worker]]
- [[_COMMUNITY_Slider Control UI|Slider Control UI]]
- [[_COMMUNITY_Color Palette Extraction Worker|Color Palette Extraction Worker]]
- [[_COMMUNITY_Graphify Rule Workflows|Graphify Rule Workflows]]
- [[_COMMUNITY_Root DOM Entrypoint|Root DOM Entrypoint]]

## God Nodes (most connected - your core abstractions)
1. `Footer()` - 9 edges
2. `useParamsStore` - 8 edges
3. `getOutputCanvas()` - 8 edges
4. `exportCurrentGif()` - 8 edges
5. `usePaletteStore` - 7 edges
6. `medianCut()` - 7 edges
7. `PipelineTimingTooltip()` - 6 edges
8. `ExportPage()` - 6 edges
9. `ImportPage()` - 6 edges
10. `useImageStore` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Main JavaScript Entry Script Reference` --references--> `DITHER-DOT`  [INFERRED]
  index.html → README.md
- `Cloudflare Pages Deployment Workflow` --references--> `Cloudflare Pages`  [INFERRED]
  .github/workflows/deploy.yml → README.md
- `App()` --calls--> `useImageStore`  [EXTRACTED]
  src/App.jsx → src/stores/imageStore.js
- `App()` --calls--> `useProcessingStore`  [EXTRACTED]
  src/App.jsx → src/stores/processingStore.js
- `App()` --calls--> `useWatermarkStore`  [EXTRACTED]
  src/App.jsx → src/stores/watermarkStore.js

## Hyperedges (group relationships)
- **DITHER-DOT Frontend Tech Stack** — readme_react, readme_pixijs, readme_zustand [EXTRACTED 1.00]

## Communities (30 total, 1 thin omitted)

### Community 0 - "GIF & Image Timeline"
Cohesion: 0.06
Nodes (30): GifTimeline(), GallerySection(), getExportBaseName(), getExtension(), getReducedDimensions(), getSourceExtension(), ImportPage(), isAnimatedSource() (+22 more)

### Community 1 - "K-Means Palette Algorithms"
Cohesion: 0.12
Nodes (24): blendHex(), hexToRgb(), rgbToHex(), kMeans(), refinePaletteWithKMeansSeeds(), runKMeansCore(), avgPackedBucket(), channelRange() (+16 more)

### Community 2 - "Input & Blur Controls"
Cohesion: 0.09
Nodes (20): BLUR_ENTRIES, formatLabel(), ParamSlider(), COLOR_ENTRIES, ParamSlider(), formatLabel(), NoiseSlider(), AdjustmentsPage() (+12 more)

### Community 3 - "Package Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, ddot-wasm, gifuct-js, lucide-react, modern-gif, react, react-dom, zustand (+25 more)

### Community 4 - "Histogram & Thumbnail Rendering"
Cohesion: 0.09
Nodes (17): CHANNELS, countUniqueColorsFromImageSource(), countUniqueColorsFromPixels(), getPaletteExtremes(), getRgbLuminance(), hexToRgbUnit(), normalizePalette(), getPaletteReference() (+9 more)

### Community 5 - "Dithering Worker Thread"
Cohesion: 0.07
Nodes (25): alg, algs, bCounts, colors, croppedPixels, filters, gCounts, image (+17 more)

### Community 6 - "Application Layout Components"
Cohesion: 0.12
Nodes (14): Footer(), formatMs(), getPhaseLabel(), ShaderImage(), formatRatio(), gcd(), SizeControls(), usePerformanceStore (+6 more)

### Community 7 - "Aside Navigation Router"
Cohesion: 0.11
Nodes (14): AdjustmentsPage, AsideRouter(), DitherPage, ExportPage, ImportPage, PAGES, PalettePage, ResizingPage (+6 more)

### Community 8 - "Export Operations Page"
Cohesion: 0.18
Nodes (14): ExportPage(), getDefaultExportName(), getExportBaseName(), getExportCanvasOrThrow(), getExportCanvasOrThrow(), getOutputCanvas(), captureCanvasPixels(), captureCompositedPixels() (+6 more)

### Community 9 - "Pipeline Timing Tooltips"
Cohesion: 0.22
Nodes (11): formatAlgorithmName(), getDitherAlgorithmLabel(), getPaletteAlgorithmLabel(), PipelineTimingTooltip(), DitherPage(), METHODS, DITHER_CONTROLS, DITHER_METHOD (+3 more)

### Community 10 - "Color Palette Editor Page"
Cohesion: 0.23
Nodes (10): ColorCountSection(), ColorEntry(), ColorsSection(), CustomColorSwatch(), getHexTextColor(), METHODS, MethodSection(), PaletteLibrarySection() (+2 more)

### Community 11 - "Web App Web Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, scope, short_name (+2 more)

### Community 12 - "App Entry & Deployment"
Cohesion: 0.20
Nodes (10): Cloudflare Pages Deployment Workflow, Main JavaScript Entry Script Reference, Cloudflare Pages, DITHER-DOT, Dithering Algorithms, Palette Extraction, PixiJS WebGL Renderer, React Framework (+2 more)

### Community 13 - "GIF Frame Decoder Worker"
Cohesion: 0.43
Nodes (6): applyPatch(), clearFrameRect(), decoded, decodeGifFrames(), parseLoopCount(), transferableFrames

### Community 14 - "Slider Control UI"
Cohesion: 0.47
Nodes (3): clamp(), percentToValue(), snapValue()

### Community 15 - "Color Palette Extraction Worker"
Cohesion: 0.33
Nodes (4): image, imageData, palette, pixelsArray

### Community 16 - "Graphify Rule Workflows"
Cohesion: 0.67
Nodes (3): Graphify Query Tool, Graphify Usage Rules, Graphify Workflow

## Knowledge Gaps
- **116 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useParamsStore` connect `Input & Blur Controls` to `GIF & Image Timeline`, `Pipeline Timing Tooltips`, `Application Layout Components`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `getOutputCanvas()` connect `Export Operations Page` to `GIF & Image Timeline`, `Histogram & Thumbnail Rendering`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `usePaletteStore` connect `Color Palette Editor Page` to `K-Means Palette Algorithms`, `Pipeline Timing Tooltips`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GIF & Image Timeline` be split into smaller, more focused modules?**
  _Cohesion score 0.05576441102756892 - nodes in this community are weakly interconnected._
- **Should `K-Means Palette Algorithms` be split into smaller, more focused modules?**
  _Cohesion score 0.11746031746031746 - nodes in this community are weakly interconnected._
- **Should `Input & Blur Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.08739495798319327 - nodes in this community are weakly interconnected._