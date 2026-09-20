# Contributing to DITHER-DOT

First off, thank you for taking the time to contribute! 🎉

DITHER-DOT is an open-source, client-side browser dithering studio designed for speed, precision, and retro aesthetics. Whether you're reporting a bug, proposing a new dithering algorithm, adding curated palettes, or refining the UI, all contributions are welcome.

---

## 🧭 Workflow (GitHub Flow)

We strictly follow **GitHub Flow** across all contributions:

1. **Never commit directly to `main`**:
   - Always create a dedicated branch branched off `main`.
2. **Branch Naming**:
   - Use descriptive branch names with standard prefixes:
     - `feature/<name>` for new features or capabilities.
     - `fix/<name>` for bug fixes.
     - `refactor/<name>` for code cleanup and architectural refactoring.
     - `docs/<name>` for documentation updates.
     - `style/<name>` for styling or visual polish.
3. **Open a Pull Request**:
   - Push your branch to your fork or origin.
   - Open a PR targeting `main` with a clear description of the changes and verification steps.
   - All PRs are squash-merged into `main` to preserve a clean, linear git history.

---

## 📝 Commit Conventions (Conventional Commits)

All commit messages **must** strictly adhere to the [Conventional Commits](https://www.conventionalcommits.org/) standard:

```
type(scope): description
```

### Common Types:
- `feat`: A new user-facing feature.
- `fix`: A bug fix.
- `refactor`: Code change that neither fixes a bug nor adds a feature.
- `style`: Formatting, whitespace, or pure CSS adjustments that do not affect code logic.
- `chore`: Maintenance, dependencies, build processes, or configuration updates.
- `docs`: Documentation updates or additions (`README.md`, comments, etc.).
- `perf`: Code changes that improve performance or responsiveness.
- `test`: Adding or correcting tests.

### Examples:
```bash
feat(palette): add game boy pocket and cga palette presets
fix(timeline): prevent timeline scrubber stutter on high fps gifs
refactor(landing): streamline semantic HTML and optimize CSS
docs(readme): add contributing guidelines link and update tech stack
```

---

## 💻 Local Development Setup

### Prerequisites
- **Node.js** `>= 18.0.0`
- **npm** `>= 9.0.0` (or `pnpm`)

### Setup Steps

1. **Fork and Clone**
   ```bash
   git clone https://github.com/<your-username>/dither-dot.git
   cd dither-dot
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Development Server**
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173/` (Landing Page) or `http://localhost:5173/editor/` (Studio).

4. **Verify the Production Build**
   Before submitting changes, make sure the project compiles cleanly:
   ```bash
   npm run build
   ```

5. **Linting**
   ```bash
   npm run lint
   ```

---

## 🎨 Adding New Presets & Palettes

- **Palettes**: Custom palettes can be added to the preset swatches under `src/engine/presets.js` or `src/engine/palettes.js`. Ensure palette names are concise and colors are defined in hex format (`#RRGGBB`).
- **Core Algorithms**: The low-level dithering engine is powered by [`ddot`](https://github.com/xbvuno/ddot) (Rust / WebAssembly). If you want to contribute SIMD kernel optimizations or new mathematical error-diffusion matrices, check out the `ddot` repository!

---

## 🐛 Reporting Bugs & Suggesting Features

- Use [GitHub Issues](https://github.com/xbvuno/dither-dot/issues) to submit bug reports or feature requests.
- Provide a clear, reproducible example (steps to reproduce, browser/OS version, sample image/GIF if applicable).

---

## 📄 License

By contributing to DITHER-DOT, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
