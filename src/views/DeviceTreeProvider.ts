import * as vscode from 'vscode';
import { DeviceInfo } from '../types';
import { DeviceTracker } from '../adb/DeviceTracker';

export class DeviceTreeItem extends vscode.TreeItem {
  constructor(public readonly device: DeviceInfo) {
    super(device.model, vscode.TreeItemCollapsibleState.None);

    this.description = device.serial;
    this.tooltip = [
      `Serial: ${device.serial}`,
      `Model: ${device.model}`,
      `Product: ${device.product}`,
      `Type: ${device.type}`,
      `State: ${device.state}`,
    ].join('\n');

    this.contextValue = device.type === 'emulator' ? 'device.emulator' : 'device.physical';

    const iconMap: Record<string, string> = {
      device: device.type === 'emulator' ? 'vm-running' : 'device-mobile',
      offline: 'debug-disconnect',
      unauthorized: 'lock',
      'no permissions': 'warning',
    };

    this.iconPath = new vscode.ThemeIcon(
      iconMap[device.state] || 'question',
      device.state === 'device'
        ? new vscode.ThemeColor('testing.iconPassed')
        : new vscode.ThemeColor('testing.iconFailed')
    );
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
    return this.devices
      .filter(d => d.state === 'device')
      .map(d => new DeviceTreeItem(d));
  }

  getDevices(): DeviceInfo[] {
    return this.devices;
  }
}
