# Caspian Emulator

All-in-one Android emulator management for VS Code. Launch emulators, manage AVDs, install APKs, view logcat, mirror screens, and browse device files — all without leaving your editor.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/CaspianTools.caspian-emulator?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=CaspianTools.caspian-emulator)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Features

### AVD Management
Create, launch, stop, delete, and edit Android Virtual Devices from the sidebar. See running status at a glance.

### Connected Devices
Live-updating list of all connected devices — emulators and physical devices over USB. Auto-refreshes every 3 seconds.

### ADB Controls
- **Install APK** — select and install `.apk` files with one click
- **Screenshot** — capture and save device screenshots as PNG
- **Screen Recording** — record device screen to MP4
- **ADB Shell** — open a terminal with full shell access

### Logcat Viewer
Real-time log viewer in a dedicated panel with:
- Priority filtering (Verbose → Fatal)
- Tag and message search
- Pause / resume
- Color-coded output
- Auto-scroll with manual override

### Emulator Screen Mirror
Embedded emulator display inside VS Code with:
- Live screen capture
- Touch input forwarding (click to tap)
- Navigation buttons (Back, Home, Recents)
- Optional [scrcpy](https://github.com/Genymobile/scrcpy) integration

### Device File Explorer
Browse the device filesystem from the sidebar. Download, upload, and delete files directly.

## Getting Started

### Prerequisites
- **VS Code** 1.85 or later
- **Android SDK** with `platform-tools` and `emulator` installed
  - Easiest: install [Android Studio](https://developer.android.com/studio)

### Install
Search **"Caspian Emulator"** in the VS Code Extensions panel, or:
```bash
code --install-extension CaspianTools.caspian-emulator
```

### Setup
1. Click the phone icon in the Activity Bar
2. The extension auto-detects your Android SDK via `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or common install paths
3. If not found, click **"Setup Android SDK"** and browse to your SDK folder

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `caspian.androidSdkPath` | `""` | Android SDK path (auto-detected if empty) |
| `caspian.emulatorArgs` | `[]` | Extra arguments for emulator launch |
| `caspian.logcat.maxLines` | `10000` | Max lines in logcat viewer |
| `caspian.scrcpyPath` | `""` | Path to scrcpy binary (auto-detected if empty) |

## Commands

Open Command Palette (`Ctrl+Shift+P`) and type **"Caspian"**:

- Setup Android SDK
- Create / Delete / Edit AVD
- Launch / Stop Emulator
- Install APK
- Take Screenshot / Record Screen
- Open ADB Shell
- Show Logcat / Show Emulator Screen
- Download / Upload / Delete File on Device

## Documentation

- [Quickstart](QUICKSTART.md)
- [Setup Guide](SETUP_GUIDE.md)
- [Architecture](ARCHITECTURE.md)
- [Build from Source](BUILD.md)
- [Changelog](CHANGELOG.md)
- [Wiki](https://github.com/Caspian-Explorer/caspian-emulator/wiki)

## License

[MIT](LICENSE)
