import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';
import { AdbClient } from '../adb/AdbClient';
import { LogcatPriority } from '../types';
import { CONFIG } from '../constants';

export class LogcatPanel {
  private static panels = new Map<string, LogcatPanel>();

  private panel: vscode.WebviewPanel;
  private logcatProcess: ChildProcess | undefined;
  private disposables: vscode.Disposable[] = [];

  static show(
    extensionUri: vscode.Uri,
    adbClient: AdbClient,
    serial: string,
    deviceName: string,
  ): LogcatPanel {
    const existing = LogcatPanel.panels.get(serial);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }

    const instance = new LogcatPanel(extensionUri, adbClient, serial, deviceName);
    LogcatPanel.panels.set(serial, instance);
    return instance;
  }

  private constructor(
    private extensionUri: vscode.Uri,
    private adbClient: AdbClient,
    private serial: string,
    deviceName: string,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'caspian.logcat',
      `Logcat: ${deviceName}`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.iconPath = new vscode.ThemeIcon('output');
    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    this.startLogcat();
  }

  private startLogcat(filter?: string): void {
    this.stopLogcat();
    this.logcatProcess = this.adbClient.startLogcat(this.serial, filter);

    const maxLines = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<number>(CONFIG.LOGCAT_MAX_LINES, 10000);

    let buffer = '';
    this.logcatProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      const entries = lines
        .map(line => AdbClient.parseLogcatLine(line))
        .filter(Boolean);

      if (entries.length > 0) {
        this.panel.webview.postMessage({
          type: 'logcat',
          entries,
          maxLines,
        });
      }
    });

    this.logcatProcess.stderr?.on('data', (data: Buffer) => {
      this.panel.webview.postMessage({
        type: 'error',
        message: data.toString(),
      });
    });
  }

  private stopLogcat(): void {
    if (this.logcatProcess) {
      this.logcatProcess.kill();
      this.logcatProcess = undefined;
    }
  }

  private handleMessage(msg: { type: string; filter?: string; priority?: LogcatPriority }): void {
    switch (msg.type) {
      case 'clear':
        this.stopLogcat();
        this.startLogcat(msg.filter);
        break;
      case 'pause':
        this.stopLogcat();
        break;
      case 'resume':
        this.startLogcat(msg.filter);
        break;
    }
  }

  private dispose(): void {
    this.stopLogcat();
    LogcatPanel.panels.delete(this.serial);
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logcat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      padding: 6px 10px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      align-items: center;
      flex-shrink: 0;
    }
    .toolbar input, .toolbar select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 3px 8px;
      font-size: 12px;
      border-radius: 2px;
    }
    .toolbar input { flex: 1; }
    .toolbar button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 3px 10px;
      cursor: pointer;
      border-radius: 2px;
      font-size: 12px;
    }
    .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
    .log-container {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .log-line {
      padding: 0 10px;
      white-space: pre;
      line-height: 1.4;
    }
    .log-line:hover { background: var(--vscode-list-hoverBackground); }
    .V { color: var(--vscode-terminal-ansiWhite, #ccc); }
    .D { color: var(--vscode-terminal-ansiCyan, #0cc); }
    .I { color: var(--vscode-terminal-ansiGreen, #0c0); }
    .W { color: var(--vscode-terminal-ansiYellow, #cc0); }
    .E { color: var(--vscode-terminal-ansiRed, #c00); }
    .F { color: var(--vscode-terminal-ansiMagenta, #c0c); }
    .count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      padding: 0 6px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <input id="search" type="text" placeholder="Filter by tag or message..." />
    <select id="priority">
      <option value="V">Verbose</option>
      <option value="D">Debug</option>
      <option value="I" selected>Info</option>
      <option value="W">Warning</option>
      <option value="E">Error</option>
      <option value="F">Fatal</option>
    </select>
    <button id="btnClear" title="Clear & restart">Clear</button>
    <button id="btnPause" title="Pause/Resume">Pause</button>
    <span class="count" id="lineCount">0 lines</span>
  </div>
  <div class="log-container" id="logContainer"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const container = document.getElementById('logContainer');
    const searchInput = document.getElementById('search');
    const prioritySelect = document.getElementById('priority');
    const lineCountEl = document.getElementById('lineCount');
    const btnPause = document.getElementById('btnPause');

    const priorityOrder = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5, S: 6 };
    let paused = false;
    let autoScroll = true;
    let totalLines = 0;

    container.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });

    document.getElementById('btnClear').addEventListener('click', () => {
      container.innerHTML = '';
      totalLines = 0;
      lineCountEl.textContent = '0 lines';
      vscode.postMessage({ type: 'clear', filter: searchInput.value || undefined });
    });

    btnPause.addEventListener('click', () => {
      paused = !paused;
      btnPause.textContent = paused ? 'Resume' : 'Pause';
      vscode.postMessage({ type: paused ? 'pause' : 'resume', filter: searchInput.value || undefined });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'logcat') {
        const minPriority = priorityOrder[prioritySelect.value] || 0;
        const search = searchInput.value.toLowerCase();
        const frag = document.createDocumentFragment();

        for (const entry of msg.entries) {
          if (priorityOrder[entry.priority] < minPriority) continue;
          if (search && !entry.tag.toLowerCase().includes(search) && !entry.message.toLowerCase().includes(search)) continue;

          const div = document.createElement('div');
          div.className = 'log-line ' + entry.priority;
          div.textContent = entry.timestamp + ' ' + entry.pid + ' ' + entry.tid + ' ' + entry.priority + ' ' + entry.tag + ': ' + entry.message;
          frag.appendChild(div);
          totalLines++;
        }

        // Trim old lines if over max
        while (container.childElementCount > msg.maxLines) {
          container.removeChild(container.firstChild);
          totalLines--;
        }

        container.appendChild(frag);
        lineCountEl.textContent = totalLines + ' lines';

        if (autoScroll) {
          container.scrollTop = container.scrollHeight;
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
