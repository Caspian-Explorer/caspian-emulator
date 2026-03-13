import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { COMMANDS, VIEWS, CONFIG, DEVICE_PRESETS, getDefaultAbi } from './constants';
import { SdkManager } from './sdk/SdkManager';
import { AdbClient } from './adb/AdbClient';
import { DeviceTracker } from './adb/DeviceTracker';
import { AvdManager } from './avd/AvdManager';
import { AvdTreeProvider, AvdTreeItem } from './views/AvdTreeProvider';
import { DeviceTreeProvider, DeviceTreeItem } from './views/DeviceTreeProvider';
import { FileExplorerProvider, FileTreeItem } from './views/FileExplorerProvider';
import { LogcatPanel } from './views/LogcatPanel';
import { EmulatorScreenPanel } from './views/EmulatorScreenPanel';
import { QrPairingPanel } from './views/QrPairingPanel';
import { SdkInfo, DeviceInfo } from './types';
import { Logger } from './utils/Logger';

let sdkManager: SdkManager;
let adbClient: AdbClient;
let deviceTracker: DeviceTracker;
let avdManager: AvdManager;
let avdTreeProvider: AvdTreeProvider;
let deviceTreeProvider: DeviceTreeProvider;
let fileExplorerProvider: FileExplorerProvider;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize output channel
  const outputChannel = Logger.init();
  context.subscriptions.push(outputChannel);
  Logger.info('Caspian Emulator activating...');

  sdkManager = new SdkManager();

  // Register SDK setup commands first (always available)
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.SETUP_SDK, () => setupSdk(context)),
    vscode.commands.registerCommand(COMMANDS.DOWNLOAD_SDK, () => downloadSdk(context)),
    vscode.commands.registerCommand(COMMANDS.CONNECT_PHONE, () => connectPhoneGuide()),
    vscode.commands.registerCommand(COMMANDS.SHOW_OUTPUT, () => Logger.show()),
  );

  // Try to detect SDK automatically
  const sdk = await sdkManager.detect();
  if (sdk) {
    await initializeWithSdk(context, sdk);
  } else {
    // Register placeholder views that prompt setup
    registerPlaceholderCommands(context);
    vscode.window.showInformationMessage(
      'Android SDK not found. Install it automatically or configure an existing installation.',
      'Install Android SDK',
      'Configure Manually'
    ).then(choice => {
      if (choice === 'Install Android SDK') {
        vscode.commands.executeCommand(COMMANDS.DOWNLOAD_SDK);
      } else if (choice === 'Configure Manually') {
        vscode.commands.executeCommand(COMMANDS.SETUP_SDK);
      }
    });
  }

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = COMMANDS.SELECT_DEVICE;
  updateStatusBar([]);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  Logger.info('Caspian Emulator activated');
}

async function setupSdk(context: vscode.ExtensionContext): Promise<void> {
  const sdk = await sdkManager.runSetupWizard();
  if (sdk) {
    await initializeWithSdk(context, sdk);
    vscode.window.showInformationMessage('Android SDK configured successfully!');
  }
}

async function downloadSdk(context: vscode.ExtensionContext): Promise<void> {
  const sdk = await sdkManager.runDownloadWizard();
  if (sdk) {
    await initializeWithSdk(context, sdk);
    if (avdTreeProvider) {
      avdTreeProvider.refresh();
    }
  }
}

async function initializeWithSdk(context: vscode.ExtensionContext, sdk: SdkInfo): Promise<void> {
  adbClient = new AdbClient(sdk);
  avdManager = new AvdManager(sdk);
  deviceTracker = new DeviceTracker(sdk, adbClient);

  // Tree views
  avdTreeProvider = new AvdTreeProvider(avdManager);
  deviceTreeProvider = new DeviceTreeProvider(deviceTracker);
  fileExplorerProvider = new FileExplorerProvider(adbClient);

  context.subscriptions.push(
    vscode.window.createTreeView(VIEWS.AVD_LIST, { treeDataProvider: avdTreeProvider }),
    vscode.window.createTreeView(VIEWS.DEVICE_LIST, { treeDataProvider: deviceTreeProvider }),
    vscode.window.createTreeView(VIEWS.FILE_EXPLORER, { treeDataProvider: fileExplorerProvider }),
  );

  // Register all commands
  registerCommands(context);

  // Notify when a phone connects but isn't authorized yet
  deviceTracker.on('deviceConnected', (device: DeviceInfo) => {
    if (device.state === 'unauthorized') {
      vscode.window.showInformationMessage(
        `Phone detected. Check your phone screen and tap "Allow USB Debugging".`,
        'How to Connect'
      ).then(choice => {
        if (choice === 'How to Connect') {
          vscode.commands.executeCommand(COMMANDS.CONNECT_PHONE);
        }
      });
    }
  });

  // Start device tracking
  deviceTracker.on('devicesChanged', (devices: DeviceInfo[]) => {
    updateStatusBar(devices);
    syncRunningAvds(devices);
    autoSelectFileExplorerDevice(devices);
  });

  // Handle device tracker errors gracefully (prevents uncaught EventEmitter errors)
  deviceTracker.on('error', (err: Error) => {
    Logger.error(`Device tracker: ${err.message}`);
  });

  // Ensure ADB server is running before polling for devices
  try {
    await adbClient.exec(['start-server']);
    Logger.info('ADB server started');
  } catch (err) {
    Logger.warn(`ADB server start failed (${err}). Device tracking may not work until ADB is available.`);
  }

  deviceTracker.start();
  context.subscriptions.push({ dispose: () => deviceTracker.stop() });

  Logger.info(`SDK initialized: ${sdk.path}`);
}

function registerPlaceholderCommands(context: vscode.ExtensionContext): void {
  const sdkRequired = () => {
    vscode.window.showWarningMessage(
      'Android SDK is not configured.',
      'Setup SDK'
    ).then(choice => {
      if (choice === 'Setup SDK') {
        vscode.commands.executeCommand(COMMANDS.SETUP_SDK);
      }
    });
  };

  const commandIds = Object.values(COMMANDS).filter(c =>
    c !== COMMANDS.SETUP_SDK && c !== COMMANDS.DOWNLOAD_SDK &&
    c !== COMMANDS.CONNECT_PHONE && c !== COMMANDS.SHOW_OUTPUT
  );
  for (const cmd of commandIds) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, sdkRequired)
    );
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = (cmd: string, handler: (...args: any[]) => any) => {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  };

  // ── AVD commands ──

  reg(COMMANDS.REFRESH_AVDS, () => avdTreeProvider.refresh());

  reg(COMMANDS.CREATE_AVD, async () => {
    const mode = await vscode.window.showQuickPick(
      [
        { label: '$(device-mobile) From preset', description: 'Pixel 9, Pixel 8, Pixel Fold, Tablet...', value: 'preset' },
        { label: '$(settings-gear) Custom', description: 'Choose system image and device profile manually', value: 'custom' },
      ],
      { placeHolder: 'How do you want to create the virtual device?' }
    );
    if (!mode) { return; }

    if (mode.value === 'preset') {
      const abi = getDefaultAbi();
      const presetPick = await vscode.window.showQuickPick(
        DEVICE_PRESETS.map(p => ({
          label: p.name,
          description: `Android ${p.api}  •  ${abi}`,
          preset: p,
        })),
        { placeHolder: 'Select a device' }
      );
      if (!presetPick) { return; }

      const preset = presetPick.preset;
      const defaultName = `${preset.name.replace(/[\s]/g, '_')}_API${preset.api}`;
      const name = await vscode.window.showInputBox({
        prompt: 'AVD name',
        value: defaultName,
        validateInput: (v) => /^[a-zA-Z0-9_.-]+$/.test(v) ? null : 'Use only letters, numbers, underscores, dots, and hyphens',
      });
      if (!name) { return; }

      const systemImage = `system-images;android-${preset.api};${preset.tag};${abi}`;
      const images = await avdManager.listSystemImages();
      const alreadyInstalled = images.some(img => img.path === systemImage && img.installed);

      if (!alreadyInstalled) {
        const choice = await vscode.window.showWarningMessage(
          `System image for ${preset.name} (Android ${preset.api}) is not installed. Download it now? (~1 GB)`,
          'Download', 'Cancel'
        );
        if (choice !== 'Download') { return; }

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Downloading ${preset.name} system image...`, cancellable: false },
          async () => { await avdManager.installSystemImage(systemImage); }
        );
      }

      const availableProfiles = await avdManager.listDeviceProfiles();
      let deviceProfile: string | undefined = preset.profile;
      if (availableProfiles.length > 0 && !availableProfiles.some(p => p.id === preset.profile)) {
        const choice = await vscode.window.showWarningMessage(
          `Device profile "${preset.name}" is not available in your SDK version. You can still create the AVD without a device skin.`,
          'Create anyway', 'Cancel'
        );
        if (choice !== 'Create anyway') { return; }
        deviceProfile = undefined;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Creating ${preset.name} virtual device...` },
        async () => { await avdManager.createAvd(name, systemImage, deviceProfile); }
      );
      avdTreeProvider.refresh();
      vscode.window.showInformationMessage(`${preset.name} virtual device "${name}" created.`);

    } else {
      // Custom flow
      const images = await avdManager.listSystemImages();
      if (images.length === 0) {
        vscode.window.showWarningMessage('No system images found. Use the preset flow to download one automatically.');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        images.map(img => ({
          label: `API ${img.apiLevel} - ${img.tag}/${img.abi}`,
          description: img.installed ? 'Installed' : 'Not installed',
          detail: img.path,
        })),
        { placeHolder: 'Select a system image' }
      );
      if (!picked) { return; }

      const name = await vscode.window.showInputBox({
        prompt: 'Enter AVD name',
        placeHolder: 'MyDevice',
        validateInput: (v) => /^[a-zA-Z0-9_.-]+$/.test(v) ? null : 'Use only letters, numbers, underscores, dots, and hyphens',
      });
      if (!name) { return; }

      const profiles = await avdManager.listDeviceProfiles();
      let device: string | undefined;
      if (profiles.length > 0) {
        const profilePick = await vscode.window.showQuickPick(
          profiles.map(p => ({ label: p.name, id: p.id })),
          { placeHolder: 'Select a device profile (optional)' }
        );
        device = profilePick?.id;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Creating AVD "${name}"...` },
        async () => { await avdManager.createAvd(name, picked.detail, device); }
      );
      avdTreeProvider.refresh();
      vscode.window.showInformationMessage(`AVD "${name}" created.`);
    }
  });

  reg(COMMANDS.LAUNCH_AVD, async (item?: AvdTreeItem) => {
    const avdName = item?.avd.name || await pickAvd('Select AVD to launch');
    if (!avdName) { return; }

    const extraArgs = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<string[]>(CONFIG.EMULATOR_ARGS, []);

    const coldBoot = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<boolean>(CONFIG.COLD_BOOT, false);
    if (coldBoot && !extraArgs.includes('-no-snapshot-load')) {
      extraArgs.push('-no-snapshot-load');
    }

    avdManager.launchEmulator(avdName, extraArgs);

    // Show progress notification while emulator boots
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Booting emulator: ${avdName}...`, cancellable: false },
      async () => {
        // Wait until the emulator appears in device list (up to 60s)
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const devices = await adbClient.getDevices();
          for (const d of devices) {
            if (d.type === 'emulator' && d.state === 'device') {
              try {
                const name = await adbClient.getEmulatorAvdName(d.serial);
                if (name === avdName) {
                  avdTreeProvider.refresh();
                  return;
                }
              } catch { /* retry */ }
            }
          }
        }
        avdTreeProvider.refresh();
      }
    );
  });

  reg(COMMANDS.COLD_BOOT_AVD, async (item?: AvdTreeItem) => {
    const avdName = item?.avd.name || await pickAvd('Select AVD to cold boot');
    if (!avdName) { return; }

    const extraArgs = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<string[]>(CONFIG.EMULATOR_ARGS, []);
    extraArgs.push('-no-snapshot-load');

    avdManager.launchEmulator(avdName, extraArgs);
    vscode.window.showInformationMessage(`Cold booting emulator: ${avdName}`);
    setTimeout(() => avdTreeProvider.refresh(), 5000);
  });

  reg(COMMANDS.STOP_AVD, async (item?: AvdTreeItem) => {
    if (!item?.avd.serial) {
      vscode.window.showWarningMessage('Cannot determine emulator serial. Try stopping from the device list.');
      return;
    }
    await avdManager.stopEmulator(item.avd.serial);
    avdTreeProvider.refresh();
  });

  reg(COMMANDS.DELETE_AVD, async (item?: AvdTreeItem) => {
    const avdName = item?.avd.name || await pickAvd('Select AVD to delete');
    if (!avdName) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Delete AVD "${avdName}"? This cannot be undone.`,
      { modal: true },
      'Delete'
    );
    if (confirm !== 'Delete') { return; }

    await avdManager.deleteAvd(avdName);
    avdTreeProvider.refresh();
    vscode.window.showInformationMessage(`AVD "${avdName}" deleted.`);
  });

  reg(COMMANDS.EDIT_AVD, async (item?: AvdTreeItem) => {
    const avdName = item?.avd.name;
    if (!avdName) { return; }
    const configPath = avdManager.getConfigPath(avdName);
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  });

  reg(COMMANDS.CLONE_AVD, async (item?: AvdTreeItem) => {
    const avdName = item?.avd.name || await pickAvd('Select AVD to clone');
    if (!avdName) { return; }

    const newName = await vscode.window.showInputBox({
      prompt: 'Name for the cloned AVD',
      value: `${avdName}_copy`,
      validateInput: (v) => /^[a-zA-Z0-9_.-]+$/.test(v) ? null : 'Use only letters, numbers, underscores, dots, and hyphens',
    });
    if (!newName) { return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Cloning AVD "${avdName}"...` },
      async () => { await avdManager.cloneAvd(avdName, newName); }
    );
    avdTreeProvider.refresh();
    vscode.window.showInformationMessage(`AVD "${newName}" cloned from "${avdName}".`);
  });

  // ── Device commands ──

  reg(COMMANDS.REFRESH_DEVICES, () => deviceTracker.refresh());

  reg(COMMANDS.SELECT_DEVICE, async () => {
    const devices = deviceTracker.getDevices().filter(d => d.state === 'device');
    if (devices.length === 0) {
      vscode.window.showWarningMessage('No connected devices.');
      return;
    }

    const pick = await vscode.window.showQuickPick(
      devices.map(d => ({
        label: `$(${d.type === 'emulator' ? 'vm-running' : 'device-mobile'}) ${d.model}`,
        description: d.serial,
        detail: `${d.type} • ${d.product}`,
        serial: d.serial,
        device: d,
      })),
      { placeHolder: 'Select active device' }
    );
    if (!pick) { return; }

    fileExplorerProvider.setDevice(pick.device);
    vscode.window.showInformationMessage(`Active device: ${pick.device.model}`);
    Logger.info(`Active device selected: ${pick.device.model} (${pick.serial})`);
  });

  reg(COMMANDS.INSTALL_APK, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { 'APK Files': ['apk'] },
      title: 'Select APK to install',
    });
    if (!uris || uris.length === 0) { return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Installing APK...' },
      async () => {
        await adbClient.installApk(serial, uris[0].fsPath);
      }
    );
    vscode.window.showInformationMessage('APK installed successfully.');
  });

  reg(COMMANDS.TAKE_SCREENSHOT, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), 'screenshot.png')),
      filters: { 'PNG Images': ['png'] },
      title: 'Save screenshot as',
    });
    if (!uri) { return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Taking screenshot...' },
      async () => {
        await adbClient.screenshot(serial, uri.fsPath);
      }
    );
    vscode.window.showInformationMessage(`Screenshot saved to ${uri.fsPath}`);
  });

  reg(COMMANDS.RECORD_SCREEN, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const recording = adbClient.startScreenRecording(serial);
    const stopBtn = 'Stop Recording';
    const choice = await vscode.window.showInformationMessage(
      'Screen recording started. Click stop when done.',
      stopBtn
    );

    recording.kill('SIGINT');

    if (choice === stopBtn) {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), 'recording.mp4')),
        filters: { 'MP4 Video': ['mp4'] },
        title: 'Save recording as',
      });
      if (uri) {
        await adbClient.pullScreenRecording(serial, uri.fsPath);
        vscode.window.showInformationMessage(`Recording saved to ${uri.fsPath}`);
      }
    }
  });

  reg(COMMANDS.OPEN_SHELL, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const sdk = sdkManager.getSdkInfo();
    if (!sdk) { return; }

    const terminal = vscode.window.createTerminal({
      name: `ADB Shell: ${serial}`,
      shellPath: sdk.adbPath,
      shellArgs: ['-s', serial, 'shell'],
    });
    terminal.show();
  });

  reg(COMMANDS.SHOW_LOGCAT, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }
    const name = item?.device.model || serial;
    LogcatPanel.show(context.extensionUri, adbClient, serial, name);
  });

  reg(COMMANDS.SHOW_EMULATOR_SCREEN, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }
    const name = item?.device.model || serial;
    EmulatorScreenPanel.show(context.extensionUri, adbClient, serial, name);
  });

  // ── App management commands ──

  reg(COMMANDS.LAUNCH_APP, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const packageName = await pickPackage(serial, 'Select app to launch');
    if (!packageName) { return; }

    try {
      await adbClient.launchApp(serial, packageName);
      vscode.window.showInformationMessage(`Launched ${packageName}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to launch app: ${err}`);
    }
  });

  reg(COMMANDS.FORCE_STOP_APP, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const packageName = await pickPackage(serial, 'Select app to force stop');
    if (!packageName) { return; }

    await adbClient.forceStopApp(serial, packageName);
    vscode.window.showInformationMessage(`Force stopped ${packageName}`);
  });

  reg(COMMANDS.CLEAR_APP_DATA, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const packageName = await pickPackage(serial, 'Select app to clear data');
    if (!packageName) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Clear all data for ${packageName}? This removes login state, preferences, and cached files.`,
      { modal: true },
      'Clear Data'
    );
    if (confirm !== 'Clear Data') { return; }

    await adbClient.clearAppData(serial, packageName);
    vscode.window.showInformationMessage(`Cleared data for ${packageName}`);
  });

  reg(COMMANDS.UNINSTALL_APP, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const packageName = await pickPackage(serial, 'Select app to uninstall');
    if (!packageName) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Uninstall ${packageName}?`,
      { modal: true },
      'Uninstall'
    );
    if (confirm !== 'Uninstall') { return; }

    await adbClient.uninstallApp(serial, packageName);
    vscode.window.showInformationMessage(`Uninstalled ${packageName}`);
  });

  reg(COMMANDS.SHOW_APP_LOGCAT, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }
    const name = item?.device.model || serial;

    const packageName = await pickPackage(serial, 'Select app to view logs');
    if (!packageName) { return; }

    LogcatPanel.show(context.extensionUri, adbClient, serial, name, packageName);
  });

  reg(COMMANDS.LIST_PACKAGES, async (item?: DeviceTreeItem) => {
    const serial = item?.device.serial || await pickDevice();
    if (!serial) { return; }

    const packages = await adbClient.listPackages(serial, true);
    if (packages.length === 0) {
      vscode.window.showInformationMessage('No third-party apps installed.');
      return;
    }

    const pick = await vscode.window.showQuickPick(
      packages.map(p => ({
        label: p,
        buttons: [
          { iconPath: new vscode.ThemeIcon('play'), tooltip: 'Launch' },
          { iconPath: new vscode.ThemeIcon('debug-stop'), tooltip: 'Force Stop' },
          { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Uninstall' },
        ],
      })),
      { placeHolder: `${packages.length} apps installed on device` }
    );
    if (!pick) { return; }

    const action = await vscode.window.showQuickPick(
      [
        { label: '$(play) Launch', value: 'launch' },
        { label: '$(debug-stop) Force Stop', value: 'stop' },
        { label: '$(discard) Clear Data', value: 'clear' },
        { label: '$(output) Show Logcat', value: 'logcat' },
        { label: '$(trash) Uninstall', value: 'uninstall' },
      ],
      { placeHolder: `Action for ${pick.label}` }
    );
    if (!action) { return; }

    switch (action.value) {
      case 'launch':
        await adbClient.launchApp(serial, pick.label);
        vscode.window.showInformationMessage(`Launched ${pick.label}`);
        break;
      case 'stop':
        await adbClient.forceStopApp(serial, pick.label);
        vscode.window.showInformationMessage(`Stopped ${pick.label}`);
        break;
      case 'clear':
        await adbClient.clearAppData(serial, pick.label);
        vscode.window.showInformationMessage(`Cleared data for ${pick.label}`);
        break;
      case 'logcat': {
        const name = deviceTracker.getDevices().find(d => d.serial === serial)?.model || serial;
        LogcatPanel.show(context.extensionUri, adbClient, serial, name, pick.label);
        break;
      }
      case 'uninstall':
        await adbClient.uninstallApp(serial, pick.label);
        vscode.window.showInformationMessage(`Uninstalled ${pick.label}`);
        break;
    }
  });

  // ── File explorer commands ──

  reg(COMMANDS.REFRESH_FILES, () => fileExplorerProvider.refresh());

  reg(COMMANDS.PULL_FILE, async (item?: FileTreeItem) => {
    if (!item) { return; }
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), item.file.name)),
      title: `Download ${item.file.name}`,
    });
    if (!uri) { return; }
    await adbClient.pullFile(item.deviceSerial, item.file.path, uri.fsPath);
    vscode.window.showInformationMessage(`Downloaded ${item.file.name}`);
  });

  reg(COMMANDS.PUSH_FILE, async () => {
    const device = fileExplorerProvider.getCurrentDevice();
    if (!device) {
      vscode.window.showWarningMessage('No device selected for file explorer.');
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      title: 'Select file to upload',
    });
    if (!uris || uris.length === 0) { return; }

    const remotePath = await vscode.window.showInputBox({
      prompt: 'Remote destination path',
      value: '/sdcard/',
    });
    if (!remotePath) { return; }

    await adbClient.pushFile(device.serial, uris[0].fsPath, remotePath);
    fileExplorerProvider.refresh();
    vscode.window.showInformationMessage('File uploaded.');
  });

  reg(COMMANDS.DELETE_FILE, async (item?: FileTreeItem) => {
    if (!item) { return; }
    const confirm = await vscode.window.showWarningMessage(
      `Delete ${item.file.name}?`,
      { modal: true },
      'Delete'
    );
    if (confirm !== 'Delete') { return; }
    await adbClient.deleteFile(item.deviceSerial, item.file.path, item.file.type === 'directory');
    fileExplorerProvider.refresh();
  });

  reg(COMMANDS.CREATE_FOLDER, async (item?: FileTreeItem) => {
    const device = fileExplorerProvider.getCurrentDevice();
    if (!device) {
      vscode.window.showWarningMessage('No device selected.');
      return;
    }

    const parentPath = item?.file.type === 'directory' ? item.file.path : '/sdcard';
    const folderName = await vscode.window.showInputBox({
      prompt: `Create folder in ${parentPath}`,
      placeHolder: 'New folder name',
    });
    if (!folderName) { return; }

    const fullPath = parentPath.endsWith('/') ? parentPath + folderName : parentPath + '/' + folderName;
    await adbClient.createDirectory(device.serial, fullPath);
    fileExplorerProvider.refresh();
    vscode.window.showInformationMessage(`Created folder: ${fullPath}`);
  });

  reg(COMMANDS.RENAME_FILE, async (item?: FileTreeItem) => {
    if (!item) { return; }

    const newName = await vscode.window.showInputBox({
      prompt: `Rename "${item.file.name}" to:`,
      value: item.file.name,
    });
    if (!newName || newName === item.file.name) { return; }

    const dir = item.file.path.substring(0, item.file.path.lastIndexOf('/'));
    const newPath = dir + '/' + newName;
    await adbClient.renameFile(item.deviceSerial, item.file.path, newPath);
    fileExplorerProvider.refresh();
    vscode.window.showInformationMessage(`Renamed to ${newName}`);
  });

  reg(COMMANDS.OPEN_REMOTE_FILE, async (item?: FileTreeItem) => {
    if (!item || item.file.type !== 'file') { return; }

    // Only open text-like files under 1MB
    if (item.file.size > 1024 * 1024) {
      vscode.window.showWarningMessage('File too large to preview. Use download instead.');
      return;
    }

    try {
      const content = await adbClient.readFile(item.deviceSerial, item.file.path);
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: guessLanguage(item.file.name),
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to read file: ${err}`);
    }
  });

  // ── Wireless ADB ──

  reg(COMMANDS.QR_PAIR, async () => {
    QrPairingPanel.show(adbClient, deviceTracker);
  });

  reg(COMMANDS.CONNECT_WIFI, async () => {
    const method = await vscode.window.showQuickPick(
      [
        { label: '$(radio-tower) Pair with QR Code (Android 11+)', description: 'Scan a QR code from your phone — fastest method', value: 'qr' },
        { label: '$(key) Wireless Debugging (Android 11+)', description: 'Pair with code, then connect', value: 'pair' },
        { label: '$(plug) TCP/IP Connect', description: 'Connect to IP:port directly', value: 'tcpip' },
      ],
      { placeHolder: 'How do you want to connect?' }
    );
    if (!method) { return; }

    if (method.value === 'qr') {
      QrPairingPanel.show(adbClient, deviceTracker);
      return;
    }

    if (method.value === 'pair') {
      const pairAddress = await vscode.window.showInputBox({
        prompt: 'Enter pairing address (IP:port) shown on your phone',
        placeHolder: '192.168.1.100:37000',
      });
      if (!pairAddress) { return; }

      const pairCode = await vscode.window.showInputBox({
        prompt: 'Enter the 6-digit pairing code shown on your phone',
        placeHolder: '123456',
      });
      if (!pairCode) { return; }

      try {
        const result = await adbClient.pair(pairAddress, pairCode);
        vscode.window.showInformationMessage(`Paired: ${result}`);

        const connectAddress = await vscode.window.showInputBox({
          prompt: 'Now enter the connection address (IP:port) from Wireless Debugging settings',
          placeHolder: '192.168.1.100:38000',
        });
        if (!connectAddress) { return; }

        const connectResult = await adbClient.connectTcp(connectAddress);
        vscode.window.showInformationMessage(`Connected: ${connectResult}`);
        deviceTracker.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Pairing failed: ${err}`);
      }
    } else {
      const address = await vscode.window.showInputBox({
        prompt: 'Enter device address (IP:port)',
        placeHolder: '192.168.1.100:5555',
      });
      if (!address) { return; }

      try {
        const result = await adbClient.connectTcp(address);
        vscode.window.showInformationMessage(`Connected: ${result}`);
        deviceTracker.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Connection failed: ${err}`);
      }
    }
  });

  reg(COMMANDS.DISCONNECT_WIFI, async () => {
    const devices = deviceTracker.getDevices().filter(d =>
      d.state === 'device' && !d.serial.startsWith('emulator-') && d.serial.includes(':')
    );
    if (devices.length === 0) {
      vscode.window.showWarningMessage('No Wi-Fi devices connected.');
      return;
    }

    const pick = await vscode.window.showQuickPick(
      devices.map(d => ({ label: d.model, description: d.serial, serial: d.serial })),
      { placeHolder: 'Select device to disconnect' }
    );
    if (!pick) { return; }

    await adbClient.disconnectTcp(pick.serial);
    vscode.window.showInformationMessage(`Disconnected ${pick.serial}`);
    deviceTracker.refresh();
  });
}

// ── Helpers ──

async function pickAvd(placeholder: string): Promise<string | undefined> {
  const avds = await avdManager.listAvds();
  if (avds.length === 0) {
    vscode.window.showWarningMessage('No AVDs found.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    avds.map(a => ({ label: a.displayName || a.name, avdName: a.name })),
    { placeHolder: placeholder }
  );
  return pick?.avdName;
}

async function pickDevice(): Promise<string | undefined> {
  const devices = deviceTracker.getDevices().filter(d => d.state === 'device');
  if (devices.length === 0) {
    vscode.window.showWarningMessage('No connected devices.');
    return undefined;
  }
  if (devices.length === 1) { return devices[0].serial; }
  const pick = await vscode.window.showQuickPick(
    devices.map(d => ({ label: d.model, description: d.serial, serial: d.serial })),
    { placeHolder: 'Select a device' }
  );
  return pick?.serial;
}

async function pickPackage(serial: string, placeholder: string): Promise<string | undefined> {
  const packages = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Loading installed apps...' },
    () => adbClient.listPackages(serial, true)
  );

  if (packages.length === 0) {
    vscode.window.showInformationMessage('No third-party apps found.');
    return undefined;
  }

  const pick = await vscode.window.showQuickPick(
    packages.map(p => ({ label: p })),
    { placeHolder: placeholder }
  );
  return pick?.label;
}

function guessLanguage(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.xml': 'xml', '.json': 'json', '.properties': 'properties',
    '.txt': 'plaintext', '.log': 'log', '.sh': 'shellscript',
    '.py': 'python', '.js': 'javascript', '.html': 'html',
    '.css': 'css', '.java': 'java', '.kt': 'kotlin',
    '.gradle': 'groovy', '.conf': 'ini', '.cfg': 'ini',
  };
  return map[ext];
}

async function syncRunningAvds(devices: DeviceInfo[]): Promise<void> {
  if (!avdTreeProvider || !avdManager) { return; }

  const runningNames = new Set<string>();
  for (const d of devices) {
    if (d.type === 'emulator' && d.state === 'device') {
      try {
        const name = await adbClient.getEmulatorAvdName(d.serial);
        if (name) {
          runningNames.add(name);
          avdManager.markRunning(name, d.serial);
        }
      } catch {
        // skip
      }
    }
  }
  avdTreeProvider.updateRunningStatus(runningNames);
}

function autoSelectFileExplorerDevice(devices: DeviceInfo[]): void {
  if (!fileExplorerProvider) { return; }

  const autoSelect = vscode.workspace.getConfiguration(CONFIG.SECTION)
    .get<boolean>(CONFIG.AUTO_SELECT_DEVICE, true);
  if (!autoSelect) { return; }

  const connected = devices.filter(d => d.state === 'device');
  if (connected.length === 0) { return; }

  const current = fileExplorerProvider.getCurrentDevice();
  if (!current) {
    const device = connected[0];
    fileExplorerProvider.setDevice(device);
    // Emulators report state=device before the shell is ready — retry a few
    // times so the file explorer populates automatically after boot
    if (device.type === 'emulator') {
      let attempts = 0;
      const retry = setInterval(() => {
        attempts++;
        fileExplorerProvider.refresh();
        if (attempts >= 5) { clearInterval(retry); }
      }, 5000);
    }
  }
}

function updateStatusBar(devices: DeviceInfo[]): void {
  if (!statusBarItem) { return; }
  const connected = devices.filter(d => d.state === 'device');
  if (connected.length === 0) {
    statusBarItem.text = '$(device-mobile) No devices';
    statusBarItem.tooltip = 'Click to select a device';
  } else {
    statusBarItem.text = `$(device-mobile) ${connected.length} device${connected.length > 1 ? 's' : ''}`;
    statusBarItem.tooltip = connected.map(d => `${d.model} (${d.serial})`).join('\n') + '\n\nClick to select active device';
  }
}

export function deactivate(): void {
  deviceTracker?.stop();
}

async function connectPhoneGuide(): Promise<void> {
  const steps = [
    'Step 1/4 — Enable Developer Options: Open Settings → About Phone → tap "Build Number" 7 times until you see "You are now a developer!"',
    'Step 2/4 — Enable USB Debugging: Go to Settings → Developer Options → turn on "USB Debugging"',
    'Step 3/4 — Connect via USB: Plug your phone into your computer with a USB data cable (not a charge-only cable)',
    'Step 4/4 — Authorize the connection: A dialog will appear on your phone — tap "Allow USB Debugging". Check "Always allow from this computer" to skip this step in future.',
  ];

  for (let i = 0; i < steps.length; i++) {
    const isLast = i === steps.length - 1;
    const choice = await vscode.window.showInformationMessage(steps[i], isLast ? 'Done' : 'Next →', 'Cancel');
    if (!choice || choice === 'Cancel') { return; }
  }
}
