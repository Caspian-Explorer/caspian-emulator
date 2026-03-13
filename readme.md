# Caspian Emulator

**Android emulator management for VS Code — no Android Studio required.**

Launch emulators, manage AVDs, install APKs, view logcat, mirror screens, manage apps, and browse device files — all without leaving your editor. The extension can download and set up the entire Android SDK automatically.

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
- Launch, stop, delete, clone, and edit AVDs from the sidebar
- **Cold boot** option — launch without loading snapshots
- **Clone AVD** — duplicate an existing virtual device for testing variations
- Boot progress notification — shows progress while emulator starts
- See running/stopped status at a glance with color-coded icons
- Custom emulator launch arguments via settings

### Physical Phone Support
- **Guided USB setup** — step-by-step walkthrough: Developer Options → USB Debugging → authorize connection
- **Wireless ADB** — connect devices over Wi-Fi via TCP/IP or Android 11+ wireless debugging with pairing code
- **QR code pairing** — scan a QR code to pair instantly (Android 11+), no manual IP/port entry needed
- Unauthorized phones appear in the sidebar with a one-click "How to Connect" guide
- Auto-notification when a phone is plugged in without USB debugging enabled

### App Management
- **List installed apps** with interactive action menu (launch, stop, clear data, uninstall)
- **Launch App** — start any installed app by package name
- **Force Stop** — kill a running app
- **Clear App Data** — wipe app storage, cache, and login state
- **Uninstall** — remove apps from the device
- **App Logcat** — open a logcat panel filtered to a specific app's logs

### Connected Devices
- Live-updating list of all connected devices (emulators + physical USB + Wi-Fi devices)
- **Active device selector** — click the status bar to switch the active device
- Shows unauthorized and offline devices with contextual status messages
- Configurable polling interval (default: 3 seconds)

### ADB Controls
- **Install APK** — select and install `.apk` files with one click
- **Screenshot** — capture and save device screenshots as PNG
- **Screen Recording** — record device screen to MP4
- **ADB Shell** — open an integrated terminal with full shell access

### Logcat Viewer
Real-time log viewer in a dedicated webview panel:
- **Package filtering** — show logs from a specific app only
- **Regex search** — filter with `/regex/` patterns or plain text
- Priority filtering (Verbose, Debug, Info, Warning, Error, Fatal)
- **Export logs** to file for bug reports and sharing
- Pause / resume streaming
- Color-coded output by log level with highlighted stack traces
- Auto-scroll with manual override
- Configurable max line count, font size, and line wrapping

### Screen Mirror
Live device display inside VS Code — works for **emulators and physical devices**:
- **scrcpy integration** — if installed, launches with 30+ FPS, full touch and keyboard support
- **Swipe gestures** — click-and-drag to scroll, fling, and swipe
- Touch input forwarding — click to tap
- Navigation buttons (Back, Home, Recents)
- FPS counter for monitoring performance
- Optimized screencap fallback (~3 FPS when scrcpy is unavailable)

### Device File Explorer
Browse the device filesystem from the sidebar:
- Lazy-loading directory tree with configurable root path
- **Create folders** on the device
- **Rename** files and folders
- **Open text files** directly in VS Code
- Download files from device to local machine
- Upload files from local machine to device
- Delete files and directories on device
- Toggle hidden file visibility

## Getting Started

### Prerequisites
- **VS Code** 1.85 or later
- **Java 17+** (JDK) — required by Android SDK tools
  - Install from [Eclipse Adoptium](https://adoptium.net/) if not already present
- **Android Studio is NOT required** — the extension handles SDK setup

### Install
Search **"Caspian Emulator"** in the VS Code Extensions panel, or:
```bash
code --install-extension caspian-emulator-0.5.0.vsix
```

### First Launch
1. Click the **phone icon** in the Activity Bar (left sidebar)
2. If no Android SDK is detected, you'll see two options:
   - **Download & Install Android SDK** — fully automated setup (~5 GB download)
   - **Configure Existing SDK** — point to an existing SDK installation
3. After setup, your virtual devices appear in the sidebar — click play to launch

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+L` | Show Logcat |
| `Ctrl+Shift+D` | Select Active Device |
| `Ctrl+Shift+O` | Show Output Log |

## Settings

All settings are under the `caspian` namespace. Open VS Code Settings and search "caspian".

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `caspian.androidSdkPath` | string | `""` | Android SDK root path. Leave empty for auto-detection. |
| `caspian.emulatorArgs` | string[] | `[]` | Extra arguments passed to emulator on launch. |
| `caspian.logcat.maxLines` | number | `10000` | Maximum lines retained in the logcat viewer. |
| `caspian.logcat.fontSize` | number | `13` | Font size in the logcat viewer (pixels). |
| `caspian.logcat.wrapLines` | boolean | `false` | Wrap long lines in the logcat viewer. |
| `caspian.scrcpyPath` | string | `""` | Path to scrcpy binary. Leave empty for auto-detection. |
| `caspian.deviceTracker.interval` | number | `3` | Device polling interval in seconds (1–30). |
| `caspian.fileExplorer.showHidden` | boolean | `true` | Show hidden files (dotfiles) in file explorer. |
| `caspian.fileExplorer.defaultPath` | string | `"/"` | Default root path when browsing device files. |
| `caspian.autoSelectDevice` | boolean | `true` | Auto-select newly connected devices. |
| `caspian.emulator.coldBoot` | boolean | `false` | Always cold boot emulators (ignore snapshots). |

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and type **"Caspian"** to see all commands:

| Command | Description |
|---------|-------------|
| Caspian: Download & Install Android SDK | Download SDK tools, emulator, and system image automatically |
| Caspian: Setup Android SDK | Configure or browse for an existing SDK installation |
| Caspian: Connect Phone via USB | Step-by-step guide to enable USB debugging |
| Caspian: Connect Device via Wi-Fi | Connect over TCP/IP or Android 11+ wireless debugging |
| Caspian: Pair Device with QR Code | Scan a QR code to pair wirelessly (Android 11+) |
| Caspian: Select Active Device | Choose the active device for all commands |
| Caspian: Create AVD | Create a virtual device from presets or custom image |
| Caspian: Clone AVD | Duplicate an existing virtual device |
| Caspian: Launch Emulator | Start an emulator for a selected AVD |
| Caspian: Cold Boot Emulator | Launch without loading snapshots |
| Caspian: Stop Emulator | Stop a running emulator |
| Caspian: Delete AVD | Delete a virtual device |
| Caspian: Edit AVD Configuration | Open AVD config.ini in the editor |
| Caspian: Install APK | Install an APK on a connected device |
| Caspian: List Installed Apps | View and manage installed apps |
| Caspian: Launch App | Launch an app by package name |
| Caspian: Force Stop App | Kill a running app |
| Caspian: Clear App Data | Wipe app storage and preferences |
| Caspian: Uninstall App | Remove an app from the device |
| Caspian: Show Logcat | Open the live logcat viewer |
| Caspian: Show App Logcat | Open logcat filtered to a specific app |
| Caspian: Show Emulator Screen | Open the live screen mirror |
| Caspian: Take Screenshot | Capture a device screenshot as PNG |
| Caspian: Record Screen | Record device screen to MP4 |
| Caspian: Open ADB Shell | Open an ADB shell terminal |
| Caspian: Create Folder on Device | Create a new directory on the device |
| Caspian: Rename File on Device | Rename a file or folder on the device |
| Caspian: Open File from Device | View a remote text file in the editor |
| Caspian: Download File from Device | Pull a file from device |
| Caspian: Upload File to Device | Push a local file to the device |
| Caspian: Delete File on Device | Delete a file or directory on the device |
| Caspian: Show Output Log | Open the diagnostics output channel |

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
