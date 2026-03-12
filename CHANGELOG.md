# Changelog

All notable changes to Caspian Emulator will be documented in this file.

## [0.4.1] - 2026-03-12

### Fixed
- **Fix uncaught ADB error on activation** — the extension no longer crashes when the ADB daemon isn't running. The device tracker now handles errors gracefully and logs them to the output channel instead of throwing an uncaught exception
- **Start ADB server on activation** — the extension now runs `adb start-server` before polling for devices, preventing "daemon not running" errors
- **Actionable ADB error messages** — daemon failures now suggest checking port 5037 and using "Caspian: Refresh Device List" instead of showing raw stderr

### Changed
- **Improved marketplace page** — added gallery banner, version/install badges, expanded keywords for discoverability (scrcpy, screen mirror, android sdk, virtual device, mobile), added "Programming Languages" category
- **Better welcome views** — all three sidebar panels (Virtual Devices, Connected Devices, Device Files) now show helpful empty-state messages with action buttons including Wi-Fi connect and device selector
- **File Explorer welcome** — added empty-state message with "Select Device" action when no device is selected

## [0.4.0] - 2026-03-12

### Added
- **Diagnostics Output Channel** — all ADB commands, device events, and errors are logged to the "Caspian Emulator" output panel for easy debugging (`Caspian: Show Output Log` command)
- **ADB retry logic** — transient ADB failures (device offline, connection reset) are automatically retried with exponential backoff
- **App management commands** — Launch App, Force Stop, Clear Data, Uninstall, and List Installed Apps with interactive QuickPick menus
- **Package-level logcat filtering** — show logs from a specific app only (filters by PID, auto-refreshes when app restarts)
- **Logcat regex search** — filter logs with `/regex/` patterns or toggle the Regex checkbox; plain text search still works
- **Logcat export** — save captured logs to a `.txt` or `.log` file via the Export button
- **App Logcat** — right-click a device and choose "Show App Logcat" to open a logcat panel pre-filtered to a specific package
- **Active device selector** — click the status bar device count to switch the active device; all commands default to the active device (`Ctrl+Shift+D`)
- **File Explorer: Create Folder** — right-click a directory to create new folders on-device
- **File Explorer: Rename** — rename files and folders on the device
- **File Explorer: Open Remote File** — view small text files directly in VS Code without downloading
- **File Explorer: configurable root path** — set `caspian.fileExplorer.defaultPath` to start browsing from `/sdcard` instead of `/`
- **File Explorer: hide dotfiles** — toggle hidden files via `caspian.fileExplorer.showHidden` setting
- **Screen Mirror: swipe gestures** — click-and-drag on the screen to swipe (scroll, fling, drag)
- **Screen Mirror: scrcpy launch** — if scrcpy is installed, it launches in a separate window with full 30+ FPS touch & keyboard support
- **Screen Mirror: physical device support** — screen mirroring now works for USB-connected phones, not just emulators
- **Screen Mirror: FPS counter** — shows real-time frame rate in the bottom bar
- **Screen Mirror: faster fallback** — screencap interval reduced from 1s to 350ms (~3 FPS)
- **AVD Clone** — duplicate an existing AVD to create variations for testing
- **AVD Cold Boot** — launch an emulator without loading snapshots (inline button + setting)
- **Emulator boot progress** — notification with progress bar while the emulator boots (up to 60s)
- **Wireless ADB** — connect devices over Wi-Fi via TCP/IP or Android 11+ wireless debugging with pairing code
- **Keyboard shortcuts** — `Ctrl+Shift+L` (Show Logcat), `Ctrl+Shift+D` (Select Device), `Ctrl+Shift+O` (Show Output)
- 8 new configurable settings: device polling interval, logcat font size, logcat line wrap, file explorer defaults, cold boot mode, auto-select device

### Changed
- Status bar now opens the device selector QuickPick instead of just refreshing
- Logcat toolbar redesigned with Export button and Regex toggle
- Screen mirror panel renamed from "Emulator Screen" to "Device Screen" (works for all devices)
- Pre-existing lint warnings in AvdManager fixed (unused variables)

## [0.3.1] - 2026-03-05

### Fixed
- AVD creation from preset no longer fails with "No device found" on older SDK command-line tools — if the preset's device profile (e.g. `pixel_9_pro`) is not available in the installed SDK, the user is prompted to create the AVD without a device skin instead of crashing

## [0.3.0] - 2026-03-04

### Added
- **Named device presets** — Create AVDs from a curated list (Pixel 9 Pro, Pixel 8, Pixel Fold, Pixel Tablet, Nexus 5X, 7"/10" tablets) instead of raw system image strings
  - Automatically downloads the required system image if not installed (~1 GB)
  - AVD name pre-filled based on selected device and API level
  - Architecture-aware: x86_64 on Intel/AMD, arm64-v8a on Apple Silicon
- **USB phone connection guide** — "Connect Phone via USB" steps through Developer Options → USB Debugging → USB cable → Allow authorization
- **Unauthorized device detection** — proactively notifies when a phone connects without USB debugging enabled
- **All device states visible in sidebar** — unauthorized/offline devices now appear with contextual icons and descriptions
- **"How to Connect a Phone" link** in the Connected Devices welcome view
- ADB context menu items (Install APK, Screenshot, etc.) now only appear on ready devices

## [0.2.2] - 2026-03-04

### Fixed
- Fix "error: closed" popup when opening the file explorer while an emulator is still booting — the error is now suppressed silently and the file explorer auto-retries every 5 seconds (up to 5 times) until the shell is ready

## [0.2.1] - 2026-03-04

### Fixed
- Fix "spawn EINVAL" error when running SDK setup on Windows — `.bat` files (`sdkmanager.bat`, `avdmanager.bat`) now spawn with `shell: true`
- Fix AVD creation and system image listing failing on Windows for the same reason

## [0.2.0] - 2026-03-04

### Changed
- Full documentation rewrite for GitHub and VS Code Marketplace
- README rewritten as a polished marketplace listing with zero-setup messaging
- QUICKSTART updated with auto-download as the primary setup path
- SETUP_GUIDE reorganized with three setup options (auto-download, auto-detect, manual)
- ARCHITECTURE updated with SdkDownloader module, source tree, and SDK download flow diagram
- Updated extension description to highlight "no Android Studio required"

## [0.1.0] - 2026-02-25

### Added
- **Automatic SDK download and setup** — download Android SDK command-line tools, platform-tools, emulator, and system images without Android Studio
  - Java 17+ detection across Windows, macOS, and Linux
  - Disk space validation (requires ~5 GB)
  - Automatic SDK license acceptance
  - Default AVD creation (Caspian_Default, Pixel 6, Android 35)
  - Architecture-aware system image selection (x86_64 on Intel, arm64-v8a on Apple Silicon)
  - Recovery support for partial installations
- SDK auto-detection (ANDROID_HOME, ANDROID_SDK_ROOT, common paths) with setup wizard
- AVD management sidebar: list, create, delete, launch, stop, and edit virtual devices
- Connected devices sidebar with live polling (3-second interval)
- ADB controls: install APK, take screenshot, record screen, open ADB shell
- Logcat webview with priority filtering, tag/message search, pause/resume, color-coded output
- Embedded emulator screen mirror with tap input forwarding and navigation buttons
- Device file explorer: browse, download, upload, and delete files on device
- Status bar showing connected device count
- Configurable settings: SDK path, emulator args, logcat max lines, scrcpy path
- Optional scrcpy integration for higher quality screen mirroring
