# Changelog

All notable changes to Caspian Emulator will be documented in this file.

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
