# Build Guide

Build, develop, and package Caspian Emulator from source.

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- **VS Code** 1.85 or later (for running/debugging the extension)

## Install Dependencies

```bash
npm install
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Build | `npm run build` | Production build with esbuild (minified, tree-shaken) |
| Watch | `npm run watch` | Dev build with file watching (auto-rebuilds on save) |
| Type check | `npm run typecheck` | Run TypeScript compiler in check-only mode |
| Lint | `npm run lint` | Run ESLint on `src/` |
| Package | `npm run package` | Build and package as `.vsix` |

## Development Workflow

### Running the Extension

1. Open the project in VS Code
2. Press **F5** (or Run → Start Debugging)
3. This launches a new VS Code window (Extension Development Host) with the extension loaded
4. The `watch` task runs automatically, rebuilding on file changes

### Manual Build

```bash
npm run build
```

Output goes to `out/extension.js` (single bundled file via esbuild).

### Type Checking

esbuild doesn't check types, so run the TypeScript compiler separately:

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Packaging

### Build a .vsix

```bash
npx @vscode/vsce package --allow-missing-repository
```

This produces `caspian-emulator-X.Y.Z.vsix` in the project root.

### Install Locally

```bash
code --install-extension caspian-emulator-0.1.0.vsix
```

Or in VS Code: Extensions → `...` menu → **Install from VSIX**.

### Publish to Marketplace

```bash
npx @vscode/vsce publish
```

Requires a Personal Access Token configured for the `CaspianTools` publisher. See [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Project Structure

```
caspian-emulator/
├── .vscode/
│   ├── launch.json       — Debug configuration (F5)
│   ├── tasks.json        — Build tasks (watch, build)
│   └── settings.json     — TypeScript SDK path
├── src/                   — TypeScript source code
├── out/                   — Compiled output (gitignored)
├── resources/             — Icons (Icon.png, Icon.svg)
├── node_modules/          — Dependencies (gitignored)
├── package.json           — Extension manifest + npm config
├── tsconfig.json          — TypeScript configuration
├── esbuild.mjs            — esbuild bundler config
├── .vscodeignore          — Files excluded from .vsix package
└── .gitignore             — Files excluded from git
```

## Build Configuration

### esbuild (`esbuild.mjs`)

- Entry point: `src/extension.ts`
- Output: `out/extension.js` (CommonJS, single bundle)
- External: `vscode` (provided by VS Code runtime)
- Target: Node 18
- Production mode: minified, no sourcemaps, tree-shaken

### TypeScript (`tsconfig.json`)

- Target: ES2022
- Module: CommonJS
- Strict mode enabled
- Source maps for development
