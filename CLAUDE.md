# Caspian Emulator — Claude Code Instructions

## Global Rules

- **Do NOT include `Co-Authored-By` lines in commit messages.** Never add co-author trailers for Claude or any AI assistant.
- **Every commit MUST increment the version** in `package.json`, add a `CHANGELOG.md` entry, and update `readme.md` to reflect the current version and feature set. No exceptions.

## Project Overview

VS Code extension for Android emulator management. TypeScript + esbuild, targeting VS Code ^1.85.0.

### Architecture

```
src/
├── extension.ts              — Entry point, command registration, activation
├── constants.ts              — Command IDs, view IDs, config keys
├── types.ts                  — TypeScript interfaces
├── sdk/SdkManager.ts         — SDK auto-detection, validation, setup wizard
├── sdk/SdkDownloader.ts      — Zero-dependency SDK download and installation
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

### 4. Bump Version (MANDATORY — never skip)
Increment the version number for **every** commit:

1. **`package.json`** — bump the `version` field (patch by default; minor for new features, major for breaking changes).
2. **`CHANGELOG.md`** — add a new `## [X.Y.Z] - YYYY-MM-DD` heading above the previous version.
3. **`readme.md`** — update any version references (e.g., install commands like `code --install-extension caspian-emulator-X.Y.Z.vsix`).
4. Run `npm install` to sync `package-lock.json` with the new version.

### 5. Update Documentation (MANDATORY — never skip)
Update **all** documentation affected by the changes. Review each file below and update it if the changes affect its content:

| File | What it covers | When to update |
|------|---------------|----------------|
| `CHANGELOG.md` | Version history | **Always** — add entries under current version (`### Added`/`### Changed`/`### Fixed`) |
| `readme.md` | VS Code Marketplace listing | **Always** — must reflect current features, commands, settings, version |
| `package.json` `description` | One-line extension summary | When capabilities change |
| `QUICKSTART.md` | 2-minute getting started guide | When setup flow, prerequisites, or basic usage changes |
| `SETUP_GUIDE.md` | SDK setup, settings, screen mirroring, troubleshooting | When configuration, setup options, or troubleshooting steps change |
| `ARCHITECTURE.md` | System design, module descriptions, data flows | When adding/removing/renaming modules, changing data flows |
| `BUILD.md` | Dev setup, build commands, project structure | When build process, dependencies, or dev workflow changes |
| `START_HERE.md` | Documentation index | When adding or renaming documentation files |

**GitHub Wiki** — if the changes affect features documented in the wiki:
   - Clone: `git clone https://github.com/Caspian-Explorer/caspian-emulator.wiki.git /tmp/caspian-emulator-wiki`
   - Pages: Home.md, Getting-Started.md, Configuration.md, AVD-Management.md, ADB-Controls.md, Logcat-Viewer.md, Screen-Mirroring.md, File-Explorer.md, Troubleshooting.md, FAQ.md, _Sidebar.md
   - New features get their own page + links in `_Sidebar.md` and `Home.md`
   - Push: `cd /tmp/caspian-emulator-wiki && git add -A && git commit -m "<description>" && git push`
   - Skip if no wiki pages are affected.

### 6. Build & Package VSIX
```
npx @vscode/vsce package --allow-missing-repository
```
Confirm the extension packages into a `.vsix` without errors. **Always produce a fresh `.vsix` after every task** so it is ready for immediate marketplace submission. The `.vsix` is gitignored (`*.vsix`) and will not be committed.

### 7. Commit
Create the commit with a descriptive message in imperative mood, matching the project's established style (e.g., "Add logcat tag filtering" not "Added logcat tag filtering"). Do **not** include `Co-Authored-By` trailers.

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

### 11. Post to GitHub Discussions
After every commit, create a GitHub Discussion in the **Announcements** category. The post must be **social-media-ready** — the user should be able to copy-paste it directly to Twitter/X, LinkedIn, etc.

**Format requirements:**
- **Title:** action-oriented, attention-grabbing, under 100 characters (e.g., "Caspian Emulator now mirrors your screen inside VS Code")
- **Body:** 2-4 bullet points of what's new, a one-liner value prop, and the VS Code Marketplace link. Use emojis sparingly for visual appeal.
- **Always include the Marketplace link:** https://marketplace.visualstudio.com/items?itemName=CaspianTools.caspian-emulator
- Keep it short and punchy — 1-3 sentences for the intro, then bullets.

**Create via GraphQL API:**
```bash
gh api graphql -f query='
  mutation {
    createDiscussion(input: {
      repositoryId: "R_kgDORYfDVA",
      categoryId: "DIC_kwDORYfDVM4C3LGW",
      title: "<TITLE>",
      body: "<BODY>"
    }) {
      discussion { url }
    }
  }
'
```

**Example post:**
> **Title:** Caspian Emulator 0.2.0 — Full logcat viewer with live filtering
>
> **Body:**
> Caspian Emulator 0.2.0 is here — debug your Android apps without leaving VS Code.
>
> - Live logcat streaming with priority filtering and tag search
> - Embedded emulator screen mirror with touch input
> - One-click APK install, screenshot, and screen recording
> - Browse and manage device files from the sidebar
>
> https://marketplace.visualstudio.com/items?itemName=CaspianTools.caspian-emulator
