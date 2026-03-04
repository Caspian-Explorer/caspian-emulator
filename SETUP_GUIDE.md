# Setup Guide

Detailed setup, configuration, and troubleshooting for Caspian Emulator.

## Android SDK Setup

Caspian Emulator does **not** require Android Studio. You can either let the extension download the SDK automatically or point it to an existing installation.

### Option 1: Automatic SDK Download (Recommended)

The extension can download and configure the entire Android SDK for you.

**Prerequisites:**
- **Java 17+** (JDK) — install from [Eclipse Adoptium](https://adoptium.net/) if needed
- **~5 GB disk space** for SDK components

**Steps:**
1. Open the Caspian Emulator sidebar (phone icon in the Activity Bar)
2. Click **"Download & Install Android SDK"** in the welcome view
3. The extension will:
   - Verify Java 17+ is installed
   - Check available disk space
   - Ask you to confirm the installation location
4. Once confirmed, it downloads and installs:
   - **Command-line tools** — from Google's official CDN
   - **Platform-tools** — adb
   - **Emulator** — Android emulator
   - **System image** — Android 35, Google APIs (x86_64 or arm64-v8a on Apple Silicon)
5. A default AVD named **Caspian_Default** is created (Pixel 6 profile, Android 35)
6. SDK licenses are accepted automatically

**Default install locations:**
| Platform | Path |
|----------|------|
| Windows | `%LOCALAPPDATA%\Android\Sdk` |
| macOS | `~/Library/Android/sdk` |
| Linux | `~/Android/Sdk` |

**Recovery:** If the download is interrupted, run the command again. The extension detects partially installed components and resumes from where it left off.

### Option 2: Automatic Detection

If you already have the Android SDK installed (e.g., from Android Studio), the extension detects it automatically by checking:

1. **VS Code setting** `caspian.androidSdkPath` (if configured)
2. **Environment variables** `ANDROID_HOME`, `ANDROID_SDK_ROOT`
3. **Default paths:**
   - Windows: `%LOCALAPPDATA%\Android\Sdk`
   - macOS: `~/Library/Android/sdk`
   - Linux: `~/Android/Sdk`

### Option 3: Manual Configuration

If auto-detection doesn't find your SDK:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run **"Caspian: Setup Android SDK"**
3. Browse to your SDK root folder
4. The extension validates that `adb` and `emulator` exist

Or set it directly in VS Code settings:

```json
{
  "caspian.androidSdkPath": "/path/to/your/Android/Sdk"
}
```

### Required SDK Components

The extension needs these tools inside the SDK:

| Tool | Location | Required |
|------|----------|----------|
| `adb` | `platform-tools/adb` | Yes |
| `emulator` | `emulator/emulator` | Yes |
| `avdmanager` | `cmdline-tools/latest/bin/avdmanager` | For AVD creation |
| `sdkmanager` | `cmdline-tools/latest/bin/sdkmanager` | For system image listing |

If using an existing SDK with missing components, install them via:

```bash
sdkmanager "platform-tools" "emulator" "cmdline-tools;latest"
```

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `caspian.androidSdkPath` | string | `""` | Android SDK root path (auto-detected if empty) |
| `caspian.emulatorArgs` | string[] | `[]` | Extra args passed to `emulator` on launch |
| `caspian.logcat.maxLines` | number | `10000` | Max lines retained in logcat viewer |
| `caspian.scrcpyPath` | string | `""` | Path to scrcpy binary (auto-detected if empty) |

### Emulator Launch Arguments

Pass custom flags when launching emulators:

```json
{
  "caspian.emulatorArgs": ["-no-snapshot", "-gpu", "swiftshader_indirect"]
}
```

Common flags:
- `-no-snapshot` — cold boot every time
- `-no-audio` — disable audio
- `-gpu swiftshader_indirect` — software rendering (for machines without GPU)
- `-memory 2048` — set RAM size
- `-no-boot-anim` — skip boot animation for faster startup

## Screen Mirroring

### With scrcpy (Recommended)

[scrcpy](https://github.com/Genymobile/scrcpy) provides higher quality screen mirroring. Install it:

- **Windows:** `winget install Genymobile.scrcpy` or `scoop install scrcpy`
- **macOS:** `brew install scrcpy`
- **Linux:** `sudo apt install scrcpy` or `sudo snap install scrcpy`

The extension auto-detects scrcpy on PATH. Or set the path manually:

```json
{
  "caspian.scrcpyPath": "/usr/local/bin/scrcpy"
}
```

### Without scrcpy

The extension falls back to `adb shell screencap` which captures screenshots at ~1 FPS. Functional but not smooth.

## Troubleshooting

### SDK Auto-Download Issues

**"Java 17 or later is required"**
- Install a JDK 17+ from [Eclipse Adoptium](https://adoptium.net/)
- Set `JAVA_HOME` environment variable if Java is installed but not detected
- Restart VS Code after installing Java

**"Insufficient disk space"**
- At least 5 GB of free space is required for the SDK download
- Free up disk space or choose a different install location

**Download interrupted or failed**
- Run **"Caspian: Download & Install Android SDK"** again — it resumes from where it left off
- If command-line tools are already downloaded, the extension skips to component installation
- Check your internet connection and firewall settings

**"SDK installation completed but validation failed"**
- Some SDK components may have failed to install
- Try running the download command again to retry failed components
- Check disk space and permissions on the install directory

### General Issues

**"Android SDK not found"**
- Verify the SDK path contains `platform-tools/adb` and `emulator/emulator`
- Set `caspian.androidSdkPath` explicitly in settings
- Run `adb version` in a terminal to confirm adb is installed

**No AVDs listed**
- Create an AVD using the **+** button in the Virtual Devices panel
- Or create one via command line:
  ```bash
  avdmanager create avd -n MyDevice -k "system-images;android-35;google_apis;x86_64"
  ```
- Click the **refresh** button in the Virtual Devices panel

**Emulator won't start**
- Check if hardware acceleration is enabled (Intel HAXM / KVM)
- Try adding `-gpu swiftshader_indirect` to `caspian.emulatorArgs`
- Check emulator logs: `emulator -avd <name> -verbose`

**Device shows "unauthorized"**
- Check the emulator/device screen for a USB debugging authorization prompt
- Accept the prompt, then refresh the device list

**Logcat not showing output**
- Ensure the device state is "device" (not offline/unauthorized)
- Try clearing and restarting logcat via the **Clear** button
