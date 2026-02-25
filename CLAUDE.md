# Caspian Emulator — Claude Code Instructions

## Global Rules

- **Do NOT include `Co-Authored-By` lines in commit messages.** Never add co-author trailers for Claude or any AI assistant.

## Project Overview

VS Code extension for Android emulator management. TypeScript + esbuild, targeting VS Code ^1.85.0.

### Architecture

```
src/
├── extension.ts              — Entry point, command registration, activation
├── constants.ts              — Command IDs, view IDs, config keys
├── types.ts                  — TypeScript interfaces
├── sdk/SdkManager.ts         — SDK auto-detection, validation, setup wizard
├── adb/AdbClient.ts          — ADB command wrapper
├── adb/DeviceTracker.ts      — Real-time device connection monitoring
├── avd/AvdManager.ts         — AVD CRUD, emulator launch/stop
├── views/AvdTreeProvider.ts  — Sidebar: Virtual Devices
├── views/DeviceTreeProvider.ts — Sidebar: Connected Devices
├── views/FileExplorerProvider.ts — Sidebar: Device file browser
├── views/LogcatPanel.ts      — Webview: live logcat viewer
└── views/EmulatorScreenPanel.ts — Webview: emulator screen mirror
```

### Key Patterns

- All ADB/emulator interactions go through `AdbClient` or `AvdManager` — never call `child_process` directly from views or commands.
- Tree views use the `TreeDataProvider` pattern with `_onDidChangeTreeData` event emitters.
- Webview panels (logcat, emulator screen) communicate with the extension via `postMessage`/`onDidReceiveMessage`.
- Commands are registered via the `reg()` helper in `registerCommands()` inside `extension.ts`.
- New commands must be added to both `constants.ts` (`COMMANDS`) and `package.json` (`contributes.commands` + menus).

## Pre-Commit Checklist

Before every `git commit`, follow these steps **in order**. Do not skip any step. If a step fails, fix the issue and re-run from that step before continuing.

### 1. Lint
```
npm run lint
```
Fix all linting errors. Never use `--no-verify` to bypass lint failures.

### 2. Type Check & Build
```
npm run typecheck
npm run build
```
Fix all TypeScript compilation errors before proceeding.

### 3. Review Changed Files
Review all staged and modified files for:
- Accidental debug code (`console.log`, `debugger`, leftover `TODO`/`FIXME` comments)
- Hardcoded secrets, credentials, or API keys
- Unused imports or dead code introduced by the changes

If any issues are found, fix them before proceeding.

### 4. Bump Version
Increment the version number for every commit:

1. **`package.json`** — bump the `version` field (patch by default; minor for new features, major for breaking changes).
2. **`CHANGELOG.md`** — add a new `## [X.Y.Z] - YYYY-MM-DD` heading above the previous version.
3. Run `npm install` to sync `package-lock.json` with the new version.

### 5. Update Documentation
Update **all** documentation affected by the changes:

1. **CHANGELOG.md** — add entries under the current version heading using the existing format (`### Added`, `### Changed`, `### Fixed`).
2. **README.md** — update if the extension's user-facing capabilities changed.
3. **package.json** `description` field — update if the extension's capabilities changed.

### 6. Verify Packaging
```
npx @vscode/vsce package --allow-missing-repository
```
Confirm the extension packages into a `.vsix` without errors. The `.vsix` is gitignored (`*.vsix`).

### 7. Commit
Create the commit with a descriptive message in imperative mood (e.g., "Add logcat tag filtering" not "Added logcat tag filtering"). Do **not** include `Co-Authored-By` trailers.

### 8. Tag
Create an annotated git tag for the new version:
```bash
git tag -a vX.Y.Z -m "vX.Y.Z — <short summary>"
```

### 9. Push
Push the commit and tag to the remote:
```bash
git push origin main --tags
```

### 10. Create GitHub Release
Create a GitHub Release with the `.vsix` attached:
```bash
gh release create vX.Y.Z caspian-emulator-X.Y.Z.vsix \
  --title "vX.Y.Z — <short summary>" \
  --notes "<changelog entries for this version>"
```
