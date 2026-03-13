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
│                │            │      │                │
│         ┌──────┴────────┐   │      │                │
│         │ SdkDownloader │   │      │                │
│         └──────┬────────┘   │      │                │
└────────────────┼────────────┼──────┼────────────────┘
                 │            │      │
         ┌───────┴────────────┴──────┴──────┐
         │         Android SDK              │
         │  (adb, emulator, avdmanager)     │
         └──────────────────────────────────┘
```

## Source Tree

```
src/
├── extension.ts                   — Entry point, command registration, activation
├── constants.ts                   — Command IDs, view IDs, config keys, SDK download config
├── types.ts                       — TypeScript interfaces
├── sdk/
│   ├── SdkManager.ts              — SDK auto-detection, validation, setup wizard
│   └── SdkDownloader.ts           — Zero-dependency SDK download and installation
├── adb/
│   ├── AdbClient.ts               — ADB command wrapper
│   ├── DeviceTracker.ts           — Real-time device connection monitoring
│   ├── QrPairingServer.ts         — QR code pairing: mDNS + TLS + SPAKE2 + encrypted peer info
│   └── Spake2.ts                  — SPAKE2 key exchange (BoringSSL Ed25519 variant)
├── avd/
│   └── AvdManager.ts              — AVD CRUD, emulator launch/stop
└── views/
    ├── AvdTreeProvider.ts         — Sidebar: Virtual Devices
    ├── DeviceTreeProvider.ts      — Sidebar: Connected Devices
    ├── FileExplorerProvider.ts    — Sidebar: Device file browser
    ├── LogcatPanel.ts             — Webview: live logcat viewer
    ├── EmulatorScreenPanel.ts     — Webview: emulator screen mirror
    └── QrPairingPanel.ts          — Webview: QR code pairing display
```

## Module Descriptions

### Entry Point

**`src/extension.ts`** — Extension activation and command registration. Orchestrates SDK detection on startup, initializes all managers and views, and wires commands to handlers. If the SDK isn't found, registers placeholder commands that prompt the setup wizard or SDK download.

### Core Services

**`src/sdk/SdkManager.ts`** — Detects the Android SDK by checking user settings, environment variables (`ANDROID_HOME`, `ANDROID_SDK_ROOT`), and platform-specific default paths. Validates that required tools (`adb`, `emulator`) exist. Provides a setup wizard with three options: use detected SDK, download automatically, or browse for an existing installation.

**`src/sdk/SdkDownloader.ts`** — Handles zero-dependency SDK download and installation. Enables running Android emulators without Android Studio. Responsibilities:
- **Java detection** — checks `JAVA_HOME`, system PATH, macOS `/usr/libexec/java_home`, and common Windows JDK paths
- **Disk space check** — validates ~5 GB available (PowerShell on Windows, `df` on Unix)
- **SDK download** — downloads command-line tools from Google's CDN with redirect following and progress reporting
- **Extraction** — uses PowerShell `Expand-Archive` on Windows, `unzip` on Unix; reorganizes to `cmdline-tools/latest/`
- **License acceptance** — pipes "y" to `sdkmanager --licenses` with a 60-second timeout
- **Component installation** — installs platform-tools, emulator, and a system image via `sdkmanager`
- **Default AVD creation** — creates "Caspian_Default" with Pixel 6 profile, Android 35
- **Architecture awareness** — selects arm64-v8a on Apple Silicon, x86_64 elsewhere
- **Recovery** — detects partial installations and resumes from the last completed step

**`src/adb/AdbClient.ts`** — Wrapper around the `adb` command-line tool. Provides typed methods for:
- Device listing and property queries
- APK installation
- Screenshot and screen recording
- File operations (ls, pull, push, delete)
- Logcat streaming
- Logcat line parsing (static method)

All methods use `child_process.execFile` for one-shot commands and `child_process.spawn` for streaming operations (logcat, screen recording).

**`src/adb/DeviceTracker.ts`** — Monitors device connections via polling (every 3 seconds). Emits `devicesChanged`, `deviceConnected`, and `deviceDisconnected` events. The extension uses these events to update the device tree view, status bar, and sync running AVD status.

**`src/adb/QrPairingServer.ts`** — Orchestrates the full ADB wireless debugging QR code pairing protocol. Advertises an mDNS service (`_adb-tls-pairing._tcp`), runs a TLS server, performs SPAKE2 key exchange with the phone, and exchanges encrypted peer info (ADB public keys) via AES-128-GCM. Generates self-signed TLS certificates using DER/ASN.1 encoding in pure Node.js.

**`src/adb/Spake2.ts`** — SPAKE2 password-authenticated key exchange implementation compatible with BoringSSL's Ed25519 variant. Generates M/N points from SHA-256 seeds, implements the cofactor-clearing password scalar hack, and produces a 64-byte shared key via SHA-512 transcript hash. Uses `@noble/curves` for elliptic curve operations.

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

**`src/views/QrPairingPanel.ts`** — Webview panel that displays a QR code for wireless debugging pairing. Shows the QR code image, a manual pairing code, and live status updates as the protocol progresses (waiting → TLS connected → exchanging keys → paired). Supports retry and cancel actions.

### Shared

**`src/types.ts`** — TypeScript interfaces for all data models: `SdkInfo`, `AvdInfo`, `DeviceInfo`, `LogcatEntry`, `DeviceFile`, `SystemImage`, `DeviceProfile`, `JavaInfo`, `DiskSpaceInfo`, `EmulatorProcess`.

**`src/constants.ts`** — Extension-wide constants: command IDs, view IDs, configuration keys, SDK default paths, platform-specific tool binary names, and SDK download configuration (CDN URLs, build numbers, minimum Java version, disk space requirements).

## Data Flow

### SDK Auto-Download Flow

```
User clicks "Download & Install Android SDK"
  → SdkManager.runDownloadWizard()
    → SdkDownloader.detectJava()           — verify Java 17+
    → SdkDownloader.checkDiskSpace()       — verify ~5 GB free
    → User confirms installation
    → SdkDownloader.downloadCommandLineTools()  — HTTP GET from Google CDN
    → SdkDownloader.extractCommandLineTools()   — unzip + reorganize
    → SdkDownloader.acceptLicenses()            — pipe "y" to sdkmanager
    → SdkDownloader.installComponents()         — platform-tools, emulator, image
    → SdkManager.validatePath()                 — verify tools exist
    → SdkDownloader.createDefaultAvd()          — Caspian_Default, Pixel 6
    → SdkManager.saveSdkPath()                  — persist to VS Code settings
```

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
