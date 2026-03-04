# Caspian Emulator

**Android emulator management for VS Code — no Android Studio required.**

Launch emulators, manage AVDs, install APKs, view logcat, mirror screens, and browse device files — all without leaving your editor. The extension can download and set up the entire Android SDK automatically.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/CaspianTools.caspian-emulator?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=CaspianTools.caspian-emulator)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/CaspianTools.caspian-emulator?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=CaspianTools.caspian-emulator)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Zero-Setup Android Development

Don't have the Android SDK installed? No problem. Caspian Emulator can download and configure everything for you:

1. Click **"Download & Install Android SDK"** when prompted
2. The extension downloads the SDK command-line tools, installs adb, the emulator, and a system image
3. A default virtual device is created automatically — ready to launch

No Android Studio. No manual path configuration. Just install the extension and go.

## Features

### Automatic SDK Setup
- Downloads Android SDK command-line tools from Google
- Installs platform-tools (adb), emulator, and system images via `sdkmanager`
- Accepts SDK licenses automatically
- Creates a default AVD (Pixel 6, Android 35) ready to launch
- Detects existing SDK installations via `ANDROID_HOME` and common paths
- Requires only **Java 17+** — everything else is handled

### AVD Management
- Create virtual devices by name — pick **Pixel 9 Pro**, **Pixel 8**, **Pixel Fold**, **Pixel Tablet**, and more from a preset list
- System image downloaded automatically if not installed (~1 GB)
- Launch, stop, delete, and edit AVDs from the sidebar
- See running/stopped status at a glance with color-coded icons
- Custom emulator launch arguments via settings

### Physical Phone Support
- **Guided USB setup** — step-by-step walkthrough: Developer Options → USB Debugging → authorize connection
- Unauthorized phones appear in the sidebar with a one-click "How to Connect" guide
- Auto-notification when a phone is plugged in without USB debugging enabled

### Connected Devices
- Live-updating list of all connected devices (emulators + physical USB devices)
- Shows unauthorized and offline devices with contextual status messages
- Auto-refreshes every 3 seconds via ADB polling

### ADB Controls
- **Install APK** — select and install `.apk` files with one click
- **Screenshot** — capture and save device screenshots as PNG
- **Screen Recording** — record device screen to MP4
- **ADB Shell** — open an integrated terminal with full shell access

### Logcat Viewer
Real-time log viewer in a dedicated webview panel:
- Priority filtering (Verbose, Debug, Info, Warning, Error, Fatal)
- Tag and message text search
- Pause / resume streaming
- Color-coded output by log level
- Auto-scroll with manual override
- Configurable max line count (default: 10,000)

### Emulator Screen Mirror
Embedded emulator display inside VS Code:
- Live screen capture updated every second
- Touch input forwarding — click to tap
- Navigation buttons (Back, Home, Recents)
- Optional [scrcpy](https://github.com/Genymobile/scrcpy) integration for higher quality

### Device File Explorer
Browse the device filesystem from the sidebar:
- Lazy-loading directory tree starting from root
- Download files from device to local machine
- Upload files from local machine to device
- Delete files and directories on device
- Directories sorted before files, alphabetically

## Getting Started

### Prerequisites
- **VS Code** 1.85 or later
- **Java 17+** (JDK) — required by Android SDK tools
  - Install from [Eclipse Adoptium](https://adoptium.net/) if not already present
- **Android Studio is NOT required** — the extension handles SDK setup

### Install
Search **"Caspian Emulator"** in the VS Code Extensions panel, or:
```bash
code --install-extension caspian-emulator-0.3.0.vsix
```

### First Launch
1. Click the **phone icon** in the Activity Bar (left sidebar)
2. If no Android SDK is detected, you'll see two options:
   - **Download & Install Android SDK** — fully automated setup (~5 GB download)
   - **Configure Existing SDK** — point to an existing SDK installation
3. After setup, your virtual devices appear in the sidebar — click play to launch

## Settings

All settings are under the `caspian` namespace. Open VS Code Settings and search "caspian".

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `caspian.androidSdkPath` | string | `""` | Android SDK root path. Leave empty for auto-detection. |
| `caspian.emulatorArgs` | string[] | `[]` | Extra arguments passed to emulator on launch (e.g., `["-no-snapshot", "-gpu", "swiftshader_indirect"]`). |
| `caspian.logcat.maxLines` | number | `10000` | Maximum lines retained in the logcat viewer. |
| `caspian.scrcpyPath` | string | `""` | Path to scrcpy binary for screen mirroring. Leave empty for auto-detection from PATH. |

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and type **"Caspian"** to see all commands:

| Command | Description |
|---------|-------------|
| Caspian: Download & Install Android SDK | Download SDK tools, emulator, and system image automatically |
| Caspian: Setup Android SDK | Configure or browse for an existing SDK installation |
| Caspian: Connect Phone via USB | Step-by-step guide to enable USB debugging and authorize ADB |
| Caspian: Create AVD | Create a virtual device by name (Pixel 9, Pixel 8, etc.) or custom image |
| Caspian: Launch Emulator | Start an emulator for a selected AVD |
| Caspian: Stop Emulator | Stop a running emulator |
| Caspian: Delete AVD | Delete a virtual device |
| Caspian: Edit AVD Configuration | Open AVD config.ini in the editor |
| Caspian: Install APK | Install an APK on a connected device |
| Caspian: Take Screenshot | Capture a device screenshot as PNG |
| Caspian: Record Screen | Record device screen to MP4 |
| Caspian: Open ADB Shell | Open an ADB shell terminal for a device |
| Caspian: Show Logcat | Open the live logcat viewer for a device |
| Caspian: Show Emulator Screen | Open the embedded screen mirror for an emulator |
| Caspian: Download File from Device | Pull a file from device to local machine |
| Caspian: Upload File to Device | Push a local file to the device |
| Caspian: Delete File on Device | Delete a file or directory on the device |
| Caspian: Refresh AVD List | Refresh the virtual devices panel |
| Caspian: Refresh Device List | Refresh the connected devices panel |
| Caspian: Refresh File Explorer | Refresh the device files panel |

## Documentation

| Document | Description |
|----------|-------------|
| [Quickstart](QUICKSTART.md) | Get running in 2 minutes |
| [Setup Guide](SETUP_GUIDE.md) | SDK setup, configuration, and troubleshooting |
| [Architecture](ARCHITECTURE.md) | System design and module descriptions |
| [Build from Source](BUILD.md) | Development setup and packaging |
| [Changelog](CHANGELOG.md) | Version history |
| [Wiki](https://github.com/Caspian-Explorer/caspian-emulator/wiki) | Feature guides, FAQ, and troubleshooting |

## Requirements

| Requirement | Details |
|-------------|---------|
| VS Code | 1.85 or later |
| Java | JDK 17+ ([Eclipse Adoptium](https://adoptium.net/)) |
| Disk Space | ~5 GB for SDK auto-download (not needed if SDK already installed) |
| Android Studio | **Not required** |
| OS | Windows 10+, macOS (Intel & Apple Silicon), Linux (x86_64) |

## License

[MIT](LICENSE)
