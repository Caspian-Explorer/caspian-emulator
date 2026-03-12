export const EXTENSION_ID = 'caspian-emulator';

export const COMMANDS = {
  SETUP_SDK: 'caspian.setupSdk',
  DOWNLOAD_SDK: 'caspian.downloadSdk',
  CONNECT_PHONE: 'caspian.connectPhone',
  REFRESH_AVDS: 'caspian.refreshAvds',
  CREATE_AVD: 'caspian.createAvd',
  LAUNCH_AVD: 'caspian.launchAvd',
  STOP_AVD: 'caspian.stopAvd',
  DELETE_AVD: 'caspian.deleteAvd',
  EDIT_AVD: 'caspian.editAvd',
  REFRESH_DEVICES: 'caspian.refreshDevices',
  INSTALL_APK: 'caspian.installApk',
  TAKE_SCREENSHOT: 'caspian.takeScreenshot',
  RECORD_SCREEN: 'caspian.recordScreen',
  OPEN_SHELL: 'caspian.openShell',
  SHOW_LOGCAT: 'caspian.showLogcat',
  SHOW_EMULATOR_SCREEN: 'caspian.showEmulatorScreen',
  REFRESH_FILES: 'caspian.refreshFiles',
  PULL_FILE: 'caspian.pullFile',
  PUSH_FILE: 'caspian.pushFile',
  DELETE_FILE: 'caspian.deleteFile',
  CREATE_FOLDER: 'caspian.createFolder',
  RENAME_FILE: 'caspian.renameFile',
  OPEN_REMOTE_FILE: 'caspian.openRemoteFile',
  SELECT_DEVICE: 'caspian.selectDevice',
  SHOW_OUTPUT: 'caspian.showOutput',
  // App management
  LIST_PACKAGES: 'caspian.listPackages',
  LAUNCH_APP: 'caspian.launchApp',
  FORCE_STOP_APP: 'caspian.forceStopApp',
  CLEAR_APP_DATA: 'caspian.clearAppData',
  UNINSTALL_APP: 'caspian.uninstallApp',
  SHOW_APP_LOGCAT: 'caspian.showAppLogcat',
  // AVD enhancements
  CLONE_AVD: 'caspian.cloneAvd',
  COLD_BOOT_AVD: 'caspian.coldBootAvd',
  // Wireless ADB
  CONNECT_WIFI: 'caspian.connectWifi',
  DISCONNECT_WIFI: 'caspian.disconnectWifi',
} as const;

export const VIEWS = {
  AVD_LIST: 'caspian.avdList',
  DEVICE_LIST: 'caspian.deviceList',
  FILE_EXPLORER: 'caspian.fileExplorer',
} as const;

export const CONFIG = {
  SECTION: 'caspian',
  SDK_PATH: 'androidSdkPath',
  EMULATOR_ARGS: 'emulatorArgs',
  LOGCAT_MAX_LINES: 'logcat.maxLines',
  LOGCAT_FONT_SIZE: 'logcat.fontSize',
  LOGCAT_WRAP_LINES: 'logcat.wrapLines',
  SCRCPY_PATH: 'scrcpyPath',
  DEVICE_TRACKER_INTERVAL: 'deviceTracker.interval',
  FILE_EXPLORER_SHOW_HIDDEN: 'fileExplorer.showHidden',
  FILE_EXPLORER_DEFAULT_PATH: 'fileExplorer.defaultPath',
  AUTO_SELECT_DEVICE: 'autoSelectDevice',
  COLD_BOOT: 'emulator.coldBoot',
} as const;

/** Common SDK install locations per platform */
export const SDK_DEFAULT_PATHS: Record<string, string[]> = {
  win32: [
    `${process.env.LOCALAPPDATA}\\Android\\Sdk`,
    `${process.env.HOME}\\AppData\\Local\\Android\\Sdk`,
    'C:\\Android\\sdk',
  ],
  darwin: [
    `${process.env.HOME}/Library/Android/sdk`,
    '/usr/local/share/android-sdk',
  ],
  linux: [
    `${process.env.HOME}/Android/Sdk`,
    '/usr/local/android-sdk',
    '/opt/android-sdk',
  ],
};

/**
 * SDK download configuration.
 * Build number from: https://developer.android.com/studio#command-tools
 */
export const SDK_DOWNLOAD = {
  BASE_URL: 'https://dl.google.com/android/repository/commandlinetools',
  BUILD_NUMBER: '11076708',
  MIN_JAVA_VERSION: 17,
  MIN_DISK_SPACE: 5 * 1024 * 1024 * 1024,
  DEFAULT_AVD_NAME: 'Caspian_Default',
  DEFAULT_DEVICE_PROFILE: 'pixel_6',
  PLATFORM_KEY: {
    win32: 'win',
    darwin: 'mac',
    linux: 'linux',
  } as Record<string, string>,
} as const;

export interface DevicePreset {
  name: string;
  profile: string;
  api: number;
  tag: string;
}

/** Curated list of popular Android devices for one-click AVD creation */
export const DEVICE_PRESETS: DevicePreset[] = [
  { name: 'Pixel 9 Pro',         profile: 'pixel_9_pro',            api: 35, tag: 'google_apis' },
  { name: 'Pixel 9',             profile: 'pixel_9',                api: 35, tag: 'google_apis' },
  { name: 'Pixel 8 Pro',         profile: 'pixel_8_pro',            api: 34, tag: 'google_apis' },
  { name: 'Pixel 8',             profile: 'pixel_8',                api: 34, tag: 'google_apis' },
  { name: 'Pixel 7 Pro',         profile: 'pixel_7_pro',            api: 33, tag: 'google_apis' },
  { name: 'Pixel 7',             profile: 'pixel_7',                api: 33, tag: 'google_apis' },
  { name: 'Pixel 7a',            profile: 'pixel_7a',               api: 33, tag: 'google_apis' },
  { name: 'Pixel 6 Pro',         profile: 'pixel_6_pro',            api: 32, tag: 'google_apis' },
  { name: 'Pixel 6',             profile: 'pixel_6',                api: 32, tag: 'google_apis' },
  { name: 'Pixel 6a',            profile: 'pixel_6a',               api: 32, tag: 'google_apis' },
  { name: 'Pixel Fold',          profile: 'pixel_fold',             api: 34, tag: 'google_apis' },
  { name: 'Pixel Tablet',        profile: 'pixel_tablet',           api: 34, tag: 'google_apis' },
  { name: 'Pixel 4 XL',          profile: 'pixel_4_xl',             api: 30, tag: 'google_apis' },
  { name: 'Nexus 5X',            profile: 'Nexus 5X',               api: 28, tag: 'google_apis' },
  { name: '7" Tablet',           profile: '7in WSVGA (Tablet)',     api: 35, tag: 'google_apis' },
  { name: '10" Tablet',          profile: '10.1in WXGA (Tablet)',   api: 35, tag: 'google_apis' },
];

/** Returns the appropriate system image ABI for the current machine */
export function getDefaultAbi(): string {
  return process.platform === 'darwin' && process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
}

export const SDK_TOOLS = {
  ADB: process.platform === 'win32' ? 'adb.exe' : 'adb',
  EMULATOR: process.platform === 'win32' ? 'emulator.exe' : 'emulator',
  AVDMANAGER: process.platform === 'win32' ? 'avdmanager.bat' : 'avdmanager',
  SDKMANAGER: process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager',
} as const;
