# Setup Guide

Detailed setup, configuration, and troubleshooting for Caspian Emulator.

## Android SDK Setup

### Automatic Detection

Caspian Emulator checks these locations in order:

1. **VS Code setting** `caspian.androidSdkPath` (if configured)
2. **Environment variables** `ANDROID_HOME`, `ANDROID_SDK_ROOT`
3. **Default paths:**
   - Windows: `%LOCALAPPDATA%\Android\Sdk`
   - macOS: `~/Library/Android/sdk`
   - Linux: `~/Android/Sdk`

### Manual Configuration

If auto-detection fails:

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

Install missing components via Android Studio SDK Manager or:

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

### "Android SDK not found"
- Verify the SDK path contains `platform-tools/adb` and `emulator/emulator`
- Set `caspian.androidSdkPath` explicitly in settings
- Run `adb version` in a terminal to confirm adb is installed

### No AVDs listed
- Create AVDs in Android Studio or via command line:
  ```bash
  avdmanager create avd -n MyDevice -k "system-images;android-34;google_apis;x86_64"
  ```
- Click the **refresh** button in the Virtual Devices panel

### Emulator won't start
- Check if hardware acceleration is enabled (Intel HAXM / KVM)
- Try adding `-gpu swiftshader_indirect` to `caspian.emulatorArgs`
- Check emulator logs: `emulator -avd <name> -verbose`

### Device shows "unauthorized"
- Check the emulator/device screen for a USB debugging authorization prompt
- Accept the prompt, then refresh the device list

### Logcat not showing output
- Ensure the device state is "device" (not offline/unauthorized)
- Try clearing and restarting logcat via the **Clear** button
