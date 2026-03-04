import * as vscode from 'vscode';
import { DeviceFile, DeviceInfo } from '../types';
import { AdbClient } from '../adb/AdbClient';

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly file: DeviceFile,
    public readonly deviceSerial: string,
  ) {
    super(
      file.name,
      file.type === 'directory'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.description = file.type === 'file' ? formatSize(file.size) : '';
    this.tooltip = [
      `Path: ${file.path}`,
      `Permissions: ${file.permissions}`,
      `Owner: ${file.owner}:${file.group}`,
      `Size: ${file.size}`,
      `Date: ${file.date}`,
    ].join('\n');

    this.contextValue = file.type === 'directory' ? 'folder' : 'file';
    this.iconPath = new vscode.ThemeIcon(
      file.type === 'directory' ? 'folder' : file.type === 'symlink' ? 'file-symlink-file' : 'file'
    );
  }
}

export class FileExplorerProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentDevice: DeviceInfo | undefined;

  constructor(private adbClient: AdbClient) {}

  setDevice(device: DeviceInfo | undefined): void {
    this.currentDevice = device;
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    if (!this.currentDevice) {
      return [];
    }

    const remotePath = element ? element.file.path : '/';
    const serial = this.currentDevice.serial;

    try {
      const files = await this.adbClient.listFiles(serial, remotePath);
      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') { return -1; }
        if (a.type !== 'directory' && b.type === 'directory') { return 1; }
        return a.name.localeCompare(b.name);
      });
      return files.map(f => new FileTreeItem(f, serial));
    } catch (err) {
      const msg = String(err);
      // Device shell not ready yet (emulator still booting) — suppress the popup
      if (msg.includes('error: closed') || msg.includes('device offline') || msg.includes('error: no devices')) {
        return [];
      }
      vscode.window.showErrorMessage(`Failed to list files: ${err}`);
      return [];
    }
  }

  getCurrentDevice(): DeviceInfo | undefined {
    return this.currentDevice;
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) { return '0 B'; }
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
