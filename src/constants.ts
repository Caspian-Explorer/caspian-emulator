export const EXTENSION_ID = 'caspian-emulator';

export const COMMANDS = {
  SETUP_SDK: 'caspian.setupSdk',
  DOWNLOAD_SDK: 'caspian.downloadSdk',
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
  SCRCPY_PATH: 'scrcpyPath',
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

export const SDK_TOOLS = {
  ADB: process.platform === 'win32' ? 'adb.exe' : 'adb',
  EMULATOR: process.platform === 'win32' ? 'emulator.exe' : 'emulator',
  AVDMANAGER: process.platform === 'win32' ? 'avdmanager.bat' : 'avdmanager',
  SDKMANAGER: process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager',
} as const;
