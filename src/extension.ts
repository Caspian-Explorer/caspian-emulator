import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { COMMANDS, VIEWS, CONFIG } from './constants';
import { SdkManager } from './sdk/SdkManager';
import { AdbClient } from './adb/AdbClient';
import { DeviceTracker } from './adb/DeviceTracker';
import { AvdManager } from './avd/AvdManager';
import { AvdTreeProvider, AvdTreeItem } from './views/AvdTreeProvider';
import { DeviceTreeProvider, DeviceTreeItem } from './views/DeviceTreeProvider';
import { FileExplorerProvider, FileTreeItem } from './views/FileExplorerProvider';
import { LogcatPanel } from './views/LogcatPanel';
import { EmulatorScreenPanel } from './views/EmulatorScreenPanel';
import { SdkInfo, DeviceInfo } from './types';

let sdkManager: SdkManager;
let adbClient: AdbClient;
let deviceTracker: DeviceTracker;
let avdManager: AvdManager;
let avdTreeProvider: AvdTreeProvider;
let deviceTreeProvider: DeviceTreeProvider;
let fileExplorerProvider: FileExplorerProvider;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  sdkManager = new SdkManager();

  // Register SDK setup commands first (always available)
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.SETUP_SDK, () => setupSdk(context)),
    vscode.commands.registerCommand(COMMANDS.DOWNLOAD_SDK, () => downloadSdk(context)),
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
  statusBarItem.command = COMMANDS.REFRESH_DEVICES;
  updateStatusBar([]);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
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

  // Start device tracking
  deviceTracker.on('devicesChanged', (devices: DeviceInfo[]) => {
    updateStatusBar(devices);
    syncRunningAvds(devices);
    autoSelectFileExplorerDevice(devices);
  });
  deviceTracker.start();
  context.subscriptions.push({ dispose: () => deviceTracker.stop() });
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

  const commandIds = Object.values(COMMANDS).filter(c => c !== COMMANDS.SETUP_SDK);
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

  // AVD commands
  reg(COMMANDS.REFRESH_AVDS, () => avdTreeProvider.refresh());

  reg(COMMANDS.CREATE_AVD, async () => {
    const images = await avdManager.listSystemImages();
    if (images.length === 0) {
      vscode.window.showWarningMessage('No system images found. Install them via Android Studio SDK Manager.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      images.map(img => ({
        label: `API ${img.apiLevel} - ${img.tag}/${img.abi}`,
        description: img.installed ? 'Installed' : 'Not installed',
        detail: img.path,
        image: img,
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
      async () => {
        await avdManager.createAvd(name, picked.detail, device);
      }
    );
    avdTreeProvider.refresh();
    vscode.window.showInformationMessage(`AVD "${name}" created.`);
  });

  reg(COMMANDS.LAUNCH_AVD, async (item?: AvdTreeItem) => {
    const avdName = item?.avd.name || await pickAvd('Select AVD to launch');
    if (!avdName) { return; }

    const extraArgs = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<string[]>(CONFIG.EMULATOR_ARGS, []);

    avdManager.launchEmulator(avdName, extraArgs);
    vscode.window.showInformationMessage(`Launching emulator: ${avdName}`);
    // Give it time to boot, then refresh
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

  // Device commands
  reg(COMMANDS.REFRESH_DEVICES, () => deviceTracker.refresh());

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

  // File explorer commands
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
}

// Helpers

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
  const connected = devices.filter(d => d.state === 'device');
  if (connected.length > 0 && !fileExplorerProvider.getCurrentDevice()) {
    fileExplorerProvider.setDevice(connected[0]);
  }
}

function updateStatusBar(devices: DeviceInfo[]): void {
  if (!statusBarItem) { return; }
  const connected = devices.filter(d => d.state === 'device');
  if (connected.length === 0) {
    statusBarItem.text = '$(device-mobile) No devices';
    statusBarItem.tooltip = 'No Android devices connected';
  } else {
    statusBarItem.text = `$(device-mobile) ${connected.length} device${connected.length > 1 ? 's' : ''}`;
    statusBarItem.tooltip = connected.map(d => `${d.model} (${d.serial})`).join('\n');
  }
}

export function deactivate(): void {
  deviceTracker?.stop();
}
