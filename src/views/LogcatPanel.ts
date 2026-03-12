import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ChildProcess } from 'child_process';
import { AdbClient } from '../adb/AdbClient';
import { LogcatEntry, LogcatPriority } from '../types';
import { CONFIG } from '../constants';
import { Logger } from '../utils/Logger';

export class LogcatPanel {
  private static panels = new Map<string, LogcatPanel>();

  private panel: vscode.WebviewPanel;
  private logcatProcess: ChildProcess | undefined;
  private disposables: vscode.Disposable[] = [];
  private allEntries: LogcatEntry[] = [];
  private packagePids: Set<string> = new Set();
  private packageFilter: string | undefined;
  private pidRefreshTimer: NodeJS.Timeout | undefined;

  static show(
    extensionUri: vscode.Uri,
    adbClient: AdbClient,
    serial: string,
    deviceName: string,
    packageFilter?: string,
  ): LogcatPanel {
    const key = packageFilter ? `${serial}:${packageFilter}` : serial;
    const existing = LogcatPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }

    const instance = new LogcatPanel(extensionUri, adbClient, serial, deviceName, packageFilter);
    LogcatPanel.panels.set(key, instance);
    return instance;
  }

  private constructor(
    private extensionUri: vscode.Uri,
    private adbClient: AdbClient,
    private serial: string,
    deviceName: string,
    packageFilter?: string,
  ) {
    const title = packageFilter
      ? `Logcat: ${deviceName} [${packageFilter}]`
      : `Logcat: ${deviceName}`;

    this.packageFilter = packageFilter;

    this.panel = vscode.window.createWebviewPanel(
      'caspian.logcat',
      title,
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

    if (packageFilter) {
      this.refreshPackagePids();
    }
    this.startLogcat();
  }

  private async refreshPackagePids(): Promise<void> {
    if (!this.packageFilter) { return; }
    try {
      const pids = await this.adbClient.getPackagePids(this.serial, this.packageFilter);
      this.packagePids = new Set(pids);
    } catch {
      // App may not be running yet
    }
    // Re-poll PIDs periodically since PIDs change on app restart
    this.pidRefreshTimer = setTimeout(() => this.refreshPackagePids(), 5000);
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

      const entries: LogcatEntry[] = [];
      for (const line of lines) {
        const entry = AdbClient.parseLogcatLine(line);
        if (!entry) { continue; }

        // Package filtering: only pass entries from app PIDs
        if (this.packageFilter && this.packagePids.size > 0) {
          if (!this.packagePids.has(entry.pid)) { continue; }
        }

        entries.push(entry);
        this.allEntries.push(entry);
      }

      // Trim stored entries
      while (this.allEntries.length > maxLines) {
        this.allEntries.shift();
      }

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

  private async handleMessage(msg: { type: string; filter?: string; priority?: LogcatPriority; packageName?: string }): Promise<void> {
    switch (msg.type) {
      case 'clear':
        this.allEntries = [];
        this.stopLogcat();
        this.startLogcat(msg.filter);
        break;
      case 'pause':
        this.stopLogcat();
        break;
      case 'resume':
        this.startLogcat(msg.filter);
        break;
      case 'export':
        await this.exportLogs();
        break;
      case 'setPackageFilter':
        if (msg.packageName) {
          this.packageFilter = msg.packageName;
          this.packagePids.clear();
          await this.refreshPackagePids();
          this.allEntries = [];
          this.panel.webview.postMessage({ type: 'cleared' });
          this.stopLogcat();
          this.startLogcat();
        } else {
          this.packageFilter = undefined;
          this.packagePids.clear();
        }
        break;
    }
  }

  private async exportLogs(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `logcat-${this.serial}.txt`)),
      filters: { 'Text Files': ['txt'], 'Log Files': ['log'] },
      title: 'Export logcat',
    });
    if (!uri) { return; }

    const content = this.allEntries
      .map(e => `${e.timestamp} ${e.pid} ${e.tid} ${e.priority} ${e.tag}: ${e.message}`)
      .join('\n');

    fs.writeFileSync(uri.fsPath, content, 'utf-8');
    vscode.window.showInformationMessage(`Logcat exported to ${uri.fsPath} (${this.allEntries.length} lines)`);
    Logger.info(`Logcat exported: ${uri.fsPath}`);
  }

  private dispose(): void {
    this.stopLogcat();
    if (this.pidRefreshTimer) { clearTimeout(this.pidRefreshTimer); }
    const key = this.packageFilter ? `${this.serial}:${this.packageFilter}` : this.serial;
    LogcatPanel.panels.delete(key);
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private getHtml(): string {
    const fontSize = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<number>(CONFIG.LOGCAT_FONT_SIZE, 13);
    const wrapLines = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<boolean>(CONFIG.LOGCAT_WRAP_LINES, false);

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
      font-size: ${fontSize}px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      padding: 6px 10px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      align-items: center;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .toolbar input, .toolbar select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 3px 8px;
      font-size: 12px;
      border-radius: 2px;
    }
    .toolbar input[type="text"] { flex: 1; min-width: 120px; }
    .toolbar button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 3px 10px;
      cursor: pointer;
      border-radius: 2px;
      font-size: 12px;
      white-space: nowrap;
    }
    .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
    .toolbar button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .toolbar button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .toolbar label {
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--vscode-descriptionForeground);
    }
    .log-container {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .log-line {
      padding: 0 10px;
      white-space: ${wrapLines ? 'pre-wrap' : 'pre'};
      ${wrapLines ? 'word-break: break-all;' : ''}
      line-height: 1.4;
    }
    .log-line:hover { background: var(--vscode-list-hoverBackground); }
    .log-line .stacklink {
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      cursor: pointer;
    }
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
    <input id="search" type="text" placeholder="Filter by tag/message or /regex/..." title="Plain text or /regex/ patterns" />
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
    <button id="btnExport" class="secondary" title="Export logs to file">Export</button>
    <label><input id="chkRegex" type="checkbox" /> Regex</label>
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
    const chkRegex = document.getElementById('chkRegex');

    const priorityOrder = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5, S: 6 };
    let paused = false;
    let autoScroll = true;
    let totalLines = 0;

    // Stack trace pattern: at com.foo.Bar.method(File.java:42)
    const stackTraceRe = /at\\s+([\\w.$]+)\\.([\\w$]+)\\(([\\w.]+):(\\d+)\\)/g;

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function highlightStackTraces(text) {
      const escaped = escapeHtml(text);
      return escaped.replace(/at\\s+([\\w.$]+)\\.([\\w$]+)\\(([\\w.]+):(\\d+)\\)/g, (match, cls, method, file, line) => {
        return 'at ' + cls + '.' + method + '(<span class="stacklink" data-file="' + file + '" data-line="' + line + '">' + file + ':' + line + '</span>)';
      });
    }

    container.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });

    container.addEventListener('click', (e) => {
      if (e.target.classList && e.target.classList.contains('stacklink')) {
        // Stack trace links are visual hints; full navigation requires source mapping
      }
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

    document.getElementById('btnExport').addEventListener('click', () => {
      vscode.postMessage({ type: 'export' });
    });

    function matchesSearch(text, search, useRegex) {
      if (!search) return true;
      if (useRegex) {
        try { return new RegExp(search, 'i').test(text); }
        catch { return text.toLowerCase().includes(search.toLowerCase()); }
      }
      // Auto-detect /regex/ syntax
      if (search.startsWith('/') && search.endsWith('/') && search.length > 2) {
        try { return new RegExp(search.slice(1, -1), 'i').test(text); }
        catch { /* fall through */ }
      }
      return text.toLowerCase().includes(search.toLowerCase());
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'logcat') {
        const minPriority = priorityOrder[prioritySelect.value] || 0;
        const search = searchInput.value;
        const useRegex = chkRegex.checked;
        const frag = document.createDocumentFragment();

        for (const entry of msg.entries) {
          if (priorityOrder[entry.priority] < minPriority) continue;
          const fullText = entry.tag + ': ' + entry.message;
          if (!matchesSearch(fullText, search, useRegex)) continue;

          const div = document.createElement('div');
          div.className = 'log-line ' + entry.priority;
          const lineText = entry.timestamp + ' ' + entry.pid + ' ' + entry.tid + ' ' + entry.priority + ' ' + entry.tag + ': ' + entry.message;

          // Highlight stack traces in error/fatal lines
          if (entry.priority === 'E' || entry.priority === 'F' || entry.message.includes('at ')) {
            div.innerHTML = highlightStackTraces(lineText);
          } else {
            div.textContent = lineText;
          }
          frag.appendChild(div);
          totalLines++;
        }

        while (container.childElementCount > msg.maxLines) {
          container.removeChild(container.firstChild);
          totalLines--;
        }

        container.appendChild(frag);
        lineCountEl.textContent = totalLines + ' lines';

        if (autoScroll) {
          container.scrollTop = container.scrollHeight;
        }
      } else if (msg.type === 'cleared') {
        container.innerHTML = '';
        totalLines = 0;
        lineCountEl.textContent = '0 lines';
      }
    });
  </script>
</body>
</html>`;
  }
}
