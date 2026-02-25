# Quickstart

Get Caspian Emulator running in under 2 minutes.

## Prerequisites

- **VS Code** 1.85 or later
- **Android SDK** with `platform-tools` (adb) and `emulator` installed
  - Easiest: install [Android Studio](https://developer.android.com/studio), which includes the SDK

## Install the Extension

**From Marketplace:**
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Caspian Emulator"
4. Click **Install**

**From VSIX:**
```bash
code --install-extension caspian-emulator-0.1.0.vsix
```

## First Launch

1. Click the **phone icon** in the Activity Bar (left sidebar) to open Caspian Emulator
2. If the Android SDK is detected automatically, you'll see your AVDs listed
3. If not, click **"Setup Android SDK"** and point it to your SDK folder (e.g., `~/Android/Sdk` or `%LOCALAPPDATA%\Android\Sdk`)

## Basic Usage

| Action | How |
|--------|-----|
| Launch emulator | Click the **play** button next to an AVD |
| Stop emulator | Click the **stop** button on a running AVD |
| Install APK | Right-click a device → **Install APK** |
| View logcat | Right-click a device → **Show Logcat** |
| Take screenshot | Right-click a device → **Take Screenshot** |
| Open shell | Right-click a device → **Open ADB Shell** |
| Mirror screen | Right-click an emulator → **Show Emulator Screen** |
| Browse files | Select a device and expand the **Device Files** tree |

## Next Steps

- See [SETUP_GUIDE.md](SETUP_GUIDE.md) for advanced configuration
- See [ARCHITECTURE.md](ARCHITECTURE.md) to understand the codebase
