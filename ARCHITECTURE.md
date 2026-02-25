# Architecture

System design and component overview for Caspian Emulator.

## High-Level Overview

```
┌─────────────────────────────────────────────────────┐
│                    VS Code                          │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ Activity  │  │ Tree     │  │ Webview Panels    │ │
│  │ Bar Icon  │  │ Views    │  │ (Logcat, Screen)  │ │
│  └──────────┘  └────┬─────┘  └────────┬──────────┘ │
│                     │                  │            │
│              ┌──────┴──────────────────┴──────┐     │
│              │        extension.ts            │     │
│              │   (commands, activation)       │     │
│              └──────┬────────────┬────────────┘     │
│                     │            │                  │
│         ┌───────────┴──┐  ┌─────┴──────────┐       │
│         │  AvdManager  │  │   AdbClient    │       │
│         └──────┬───────┘  └──┬──────┬──────┘       │
│                │             │      │               │
│         ┌──────┴─────┐      │  ┌───┴────────┐      │
│         │ SdkManager │      │  │DeviceTracker│     │
│         └──────┬─────┘      │  └───┬─────────┘     │
└────────────────┼────────────┼──────┼────────────────┘
                 │            │      │
         ┌───────┴────────────┴──────┴──────┐
         │         Android SDK              │
         │  (adb, emulator, avdmanager)     │
         └──────────────────────────────────┘
```

## Module Descriptions

### Entry Point

**`src/extension.ts`** — Extension activation and command registration. Orchestrates SDK detection on startup, initializes all managers and views, and wires commands to handlers. If the SDK isn't found, registers placeholder commands that prompt the setup wizard.

### Core Services

**`src/sdk/SdkManager.ts`** — Detects the Android SDK by checking user settings, environment variables (`ANDROID_HOME`, `ANDROID_SDK_ROOT`), and platform-specific default paths. Validates that required tools (`adb`, `emulator`) exist. Provides a setup wizard using VS Code's folder picker dialog.

**`src/adb/AdbClient.ts`** — Wrapper around the `adb` command-line tool. Provides typed methods for:
- Device listing and property queries
- APK installation
- Screenshot and screen recording
- File operations (ls, pull, push, delete)
- Logcat streaming
- Logcat line parsing (static method)

All methods use `child_process.execFile` for one-shot commands and `child_process.spawn` for streaming operations (logcat, screen recording).

**`src/adb/DeviceTracker.ts`** — Monitors device connections via polling (every 3 seconds). Emits `devicesChanged`, `deviceConnected`, and `deviceDisconnected` events. The extension uses these events to update the device tree view, status bar, and sync running AVD status.

**`src/avd/AvdManager.ts`** — Manages Android Virtual Devices via `avdmanager` and `emulator` CLI tools. Handles:
- Listing AVDs (via `emulator -list-avds` + config.ini parsing)
- Creating/deleting AVDs
- Launching emulators (detached processes)
- Stopping emulators (via `adb emu kill`)
- Tracking running emulator processes
- System image and device profile listing

### Views

**`src/views/AvdTreeProvider.ts`** — `TreeDataProvider` for the "Virtual Devices" sidebar panel. Shows each AVD with its name, API level, and running status. Context menu items (play/stop/edit/delete) are driven by `contextValue` (`avd.running` / `avd.stopped`).

**`src/views/DeviceTreeProvider.ts`** — `TreeDataProvider` for the "Connected Devices" sidebar panel. Automatically updates when `DeviceTracker` emits `devicesChanged`. Shows device model, serial, and connection state with color-coded icons.

**`src/views/FileExplorerProvider.ts`** — `TreeDataProvider` for the "Device Files" sidebar panel. Lazy-loads directory contents via `adb shell ls -la`. Supports nested directory expansion. Sorts directories before files.

**`src/views/LogcatPanel.ts`** — Webview panel that streams logcat output. Features:
- Priority filtering (Verbose through Fatal)
- Text search by tag or message
- Pause/resume
- Auto-scroll with manual override
- Line count display
- Color-coded output by priority level

**`src/views/EmulatorScreenPanel.ts`** — Webview panel that mirrors the emulator screen. Uses periodic `screencap` + base64 encoding as a fallback (~1 FPS). Supports:
- Tap input forwarding (click position → `adb shell input tap`)
- Navigation buttons (Back, Home, Recents)
- scrcpy detection for future higher-quality streaming

### Shared

**`src/types.ts`** — TypeScript interfaces for all data models: `SdkInfo`, `AvdInfo`, `DeviceInfo`, `LogcatEntry`, `DeviceFile`, `SystemImage`, `DeviceProfile`, `EmulatorProcess`.

**`src/constants.ts`** — Extension-wide constants: command IDs, view IDs, configuration keys, SDK default paths, and platform-specific tool binary names.

## Data Flow

### Device Connection Lifecycle

```
DeviceTracker (poll every 3s)
  → adb devices -l
  → Parse output into DeviceInfo[]
  → Compare with previous state
  → Emit devicesChanged / deviceConnected / deviceDisconnected
    → DeviceTreeProvider updates tree view
    → Status bar updates device count
    → syncRunningAvds() maps emulator serials to AVD names
    → autoSelectFileExplorerDevice() sets default device for file browser
```

### AVD Launch Flow

```
User clicks Play on AVD
  → AvdManager.launchEmulator(avdName)
  → spawn(emulator, ['-avd', name], { detached: true })
  → Process unref'd (emulator runs independently)
  → DeviceTracker detects new emulator-XXXX device
  → syncRunningAvds() calls adb emu avd name
  → AvdTreeProvider updates AVD status to "Running"
```

### Logcat Streaming

```
User opens logcat for a device
  → LogcatPanel spawns adb logcat -v threadtime
  → stdout chunks buffered and split by newline
  → Each line parsed via AdbClient.parseLogcatLine()
  → Parsed entries posted to webview via postMessage
  → Webview filters by priority/search, appends to DOM
  → Old lines trimmed when exceeding maxLines config
```

## Extension Points

To add a new command:
1. Add the command ID to `COMMANDS` in `src/constants.ts`
2. Add the command entry to `contributes.commands` in `package.json`
3. Add menu placement in `contributes.menus` in `package.json`
4. Register the handler in `registerCommands()` in `src/extension.ts`

To add a new tree view:
1. Add the view ID to `VIEWS` in `src/constants.ts`
2. Add the view to `contributes.views.caspian` in `package.json`
3. Create a `TreeDataProvider` in `src/views/`
4. Register it in `initializeWithSdk()` in `src/extension.ts`
