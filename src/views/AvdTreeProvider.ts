import * as vscode from 'vscode';
import { AvdInfo } from '../types';
import { AvdManager } from '../avd/AvdManager';

export class AvdTreeItem extends vscode.TreeItem {
  constructor(public readonly avd: AvdInfo) {
    super(avd.displayName || avd.name, vscode.TreeItemCollapsibleState.None);

    this.description = avd.running ? 'Running' : `API ${avd.apiLevel}`;
    this.tooltip = [
      `Name: ${avd.name}`,
      `Device: ${avd.device}`,
      `API Level: ${avd.apiLevel}`,
      `ABI: ${avd.abi}`,
      `Target: ${avd.target}`,
      `Status: ${avd.running ? 'Running' : 'Stopped'}`,
    ].join('\n');

    this.contextValue = avd.running ? 'avd.running' : 'avd.stopped';
    this.iconPath = new vscode.ThemeIcon(
      avd.running ? 'vm-running' : 'vm',
      avd.running ? new vscode.ThemeColor('testing.iconPassed') : undefined
    );
  }
}

export class AvdTreeProvider implements vscode.TreeDataProvider<AvdTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AvdTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private avds: AvdInfo[] = [];

  constructor(private avdManager: AvdManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AvdTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AvdTreeItem[]> {
    try {
      this.avds = await this.avdManager.listAvds();
      return this.avds.map(avd => new AvdTreeItem(avd));
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to list AVDs: ${err}`);
      return [];
    }
  }

  /** Update running status for AVDs based on connected emulators */
  updateRunningStatus(runningAvdNames: Set<string>): void {
    for (const avd of this.avds) {
      avd.running = runningAvdNames.has(avd.name);
    }
    this.refresh();
  }
}
