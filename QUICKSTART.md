# Quickstart

Get Caspian Emulator running in under 2 minutes. No Android Studio required.

## Prerequisites

- **VS Code** 1.85 or later
- **Java 17+** (JDK) — required by Android SDK tools
  - Install from [Eclipse Adoptium](https://adoptium.net/) if not already present
- **Android Studio is NOT required** — the extension handles SDK setup automatically

## Install the Extension

**From Marketplace:**
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **"Caspian Emulator"**
4. Click **Install**

**From command line:**
```bash
code --install-extension CaspianTools.caspian-emulator
```

## First Launch

1. Click the **phone icon** in the Activity Bar (left sidebar) to open Caspian Emulator
2. If no Android SDK is detected, you'll see two options:
   - **Download & Install Android SDK** — fully automated (~5 GB download, includes adb, emulator, and a system image)
   - **Configure Existing SDK** — point to an existing SDK installation
3. If you chose the automatic download:
   - The extension checks for Java 17+ and sufficient disk space
   - Downloads SDK command-line tools from Google
   - Installs platform-tools (adb), emulator, and a system image
   - Creates a default virtual device (Caspian_Default, Pixel 6, Android 35)
4. Your virtual devices appear in the sidebar — click **play** to launch

## Basic Usage

| Action | How |
|--------|-----|
| Create virtual device | Click **+** in the Virtual Devices panel → pick Pixel 9, Pixel 8, etc. |
| Launch emulator | Click the **play** button next to an AVD |
| Stop emulator | Click the **stop** button on a running AVD |
| Connect phone | Command Palette → **Caspian: Connect Phone via USB** |
| Install APK | Right-click a device → **Install APK** |
| View logcat | Right-click a device → **Show Logcat** |
| Take screenshot | Right-click a device → **Take Screenshot** |
| Record screen | Right-click a device → **Record Screen** |
| Open shell | Right-click a device → **Open ADB Shell** |
| Mirror screen | Right-click an emulator → **Show Emulator Screen** |
| Browse files | Select a device and expand the **Device Files** tree |

## Next Steps

- See [Setup Guide](SETUP_GUIDE.md) for advanced configuration and troubleshooting
- See [Architecture](ARCHITECTURE.md) to understand the codebase
- See the [Wiki](https://github.com/Caspian-Explorer/caspian-emulator/wiki) for feature guides and FAQ
