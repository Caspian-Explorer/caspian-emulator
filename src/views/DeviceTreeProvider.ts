import * as vscode from 'vscode';
import { DeviceInfo } from '../types';
import { DeviceTracker } from '../adb/DeviceTracker';

export class DeviceTreeItem extends vscode.TreeItem {
  constructor(public readonly device: DeviceInfo) {
    super(device.model, vscode.TreeItemCollapsibleState.None);

    const stateDescriptions: Partial<Record<DeviceInfo['state'], string>> = {
      unauthorized:    'Allow USB debugging on your phone',
      offline:         'Device offline',
      'no permissions': 'Run VS Code with elevated permissions',
    };
    this.description = stateDescriptions[device.state] ?? device.serial;

    this.tooltip = [
      `Serial: ${device.serial}`,
      `Model: ${device.model}`,
      `Product: ${device.product}`,
      `Type: ${device.type}`,
      `State: ${device.state}`,
    ].join('\n');

    if (device.state === 'device') {
      this.contextValue = device.type === 'emulator' ? 'device.emulator' : 'device.physical';
    } else if (device.state === 'unauthorized') {
      this.contextValue = 'device.unauthorized';
    } else {
      this.contextValue = 'device.inactive';
    }

    const iconMap: Record<string, string> = {
      device:           device.type === 'emulator' ? 'vm-running' : 'device-mobile',
      offline:          'debug-disconnect',
      unauthorized:     'lock',
      'no permissions': 'warning',
    };

    const iconColor =
      device.state === 'device'       ? new vscode.ThemeColor('testing.iconPassed') :
      device.state === 'unauthorized' ? new vscode.ThemeColor('list.warningForeground') :
                                        new vscode.ThemeColor('testing.iconFailed');

    this.iconPath = new vscode.ThemeIcon(iconMap[device.state] || 'question', iconColor);
  }
}

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DeviceTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private devices: DeviceInfo[] = [];

  constructor(private tracker: DeviceTracker) {
    tracker.on('devicesChanged', (devices: DeviceInfo[]) => {
      this.devices = devices;
      this._onDidChangeTreeData.fire(undefined);
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DeviceTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<DeviceTreeItem[]> {
    if (this.devices.length === 0) {
      try {
        this.devices = await this.tracker.refresh();
      } catch {
        // Tracker not ready
      }
    }
    return this.devices.map(d => new DeviceTreeItem(d));
  }

  getDevices(): DeviceInfo[] {
    return this.devices;
  }
}
