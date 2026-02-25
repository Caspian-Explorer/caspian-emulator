import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import { AdbClient } from '../adb/AdbClient';
import { CONFIG } from '../constants';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Shows a live emulator screen inside VS Code.
 * Uses scrcpy if available, falls back to periodic screencap.
 */
export class EmulatorScreenPanel {
  private static panels = new Map<string, EmulatorScreenPanel>();

  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private captureInterval: NodeJS.Timeout | undefined;
  private scrcpyProcess: ChildProcess | undefined;

  static show(
    extensionUri: vscode.Uri,
    adbClient: AdbClient,
    serial: string,
    deviceName: string,
  ): EmulatorScreenPanel {
    const existing = EmulatorScreenPanel.panels.get(serial);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }

    const instance = new EmulatorScreenPanel(extensionUri, adbClient, serial, deviceName);
    EmulatorScreenPanel.panels.set(serial, instance);
    return instance;
  }

  private constructor(
    private extensionUri: vscode.Uri,
    private adbClient: AdbClient,
    private serial: string,
    deviceName: string,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'caspian.emulatorScreen',
      `Screen: ${deviceName}`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    this.panel.iconPath = new vscode.ThemeIcon('device-mobile');

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    this.startCapture();
    this.panel.webview.html = this.getHtml();
  }

  private async startCapture(): Promise<void> {
    // Try scrcpy first
    const scrcpyPath = this.findScrcpy();
    if (scrcpyPath) {
      this.startScrcpyWebSocket(scrcpyPath);
      return;
    }

    // Fallback: periodic screencap
    this.startScreencapLoop();
  }

  private findScrcpy(): string | undefined {
    const configured = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<string>(CONFIG.SCRCPY_PATH);
    if (configured && fs.existsSync(configured)) { return configured; }

    // Check PATH
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    const binary = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy';
    for (const dir of pathDirs) {
      const full = path.join(dir, binary);
      if (fs.existsSync(full)) { return full; }
    }

    return undefined;
  }

  private startScrcpyWebSocket(scrcpyPath: string): void {
    // Launch scrcpy in no-window mode for the video stream
    // For simplicity, fall back to screencap approach since embedding
    // scrcpy's video stream into a webview requires significant plumbing.
    // A future version could use scrcpy's v4l2 or socket-based streaming.
    this.startScreencapLoop();
  }

  private startScreencapLoop(): void {
    const capture = async () => {
      try {
        const output = await this.adbClient.exec(
          ['shell', 'screencap', '-p'],
          this.serial,
        );
        // The screencap -p output is a PNG binary.
        // We need to get it via exec with encoding set to buffer.
        // Use a different approach: exec returns string, so use base64
        const b64 = await this.adbClient.exec(
          ['shell', 'screencap', '-p', '|', 'base64'],
          this.serial,
        );
        this.panel.webview.postMessage({
          type: 'frame',
          data: `data:image/png;base64,${b64.replace(/\s/g, '')}`,
        });
      } catch {
        // screencap via pipe may not work on all devices; try pull approach
        try {
          const remotePath = '/data/local/tmp/caspian_screen.png';
          await this.adbClient.exec(['shell', 'screencap', '-p', remotePath], this.serial);
          const b64Output = await this.adbClient.exec(
            ['shell', 'base64', remotePath],
            this.serial,
          );
          this.panel.webview.postMessage({
            type: 'frame',
            data: `data:image/png;base64,${b64Output.replace(/\s/g, '')}`,
          });
          await this.adbClient.exec(['shell', 'rm', remotePath], this.serial);
        } catch (err) {
          // Silently skip frame
        }
      }
    };

    capture();
    this.captureInterval = setInterval(capture, 1000); // 1 FPS for screencap fallback
  }

  private async handleMessage(msg: { type: string; x?: number; y?: number; action?: string }): Promise<void> {
    switch (msg.type) {
      case 'tap':
        if (msg.x !== undefined && msg.y !== undefined) {
          await this.adbClient.exec(
            ['shell', 'input', 'tap', String(Math.round(msg.x)), String(Math.round(msg.y))],
            this.serial,
          );
        }
        break;
      case 'swipe':
        // Handled by the webview sending start/end coordinates
        break;
      case 'key':
        if (msg.action) {
          await this.adbClient.exec(
            ['shell', 'input', 'keyevent', msg.action],
            this.serial,
          );
        }
        break;
      case 'back':
        await this.adbClient.exec(['shell', 'input', 'keyevent', '4'], this.serial);
        break;
      case 'home':
        await this.adbClient.exec(['shell', 'input', 'keyevent', '3'], this.serial);
        break;
      case 'recents':
        await this.adbClient.exec(['shell', 'input', 'keyevent', '187'], this.serial);
        break;
    }
  }

  private dispose(): void {
    if (this.captureInterval) { clearInterval(this.captureInterval); }
    if (this.scrcpyProcess) { this.scrcpyProcess.kill(); }
    EmulatorScreenPanel.panels.delete(this.serial);
    for (const d of this.disposables) { d.dispose(); }
  }

  private getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Emulator Screen</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .screen-container {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px;
      width: 100%;
    }
    #screen {
      max-width: 100%;
      max-height: calc(100vh - 60px);
      cursor: pointer;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }
    .nav-bar {
      display: flex;
      gap: 16px;
      padding: 8px;
      justify-content: center;
      flex-shrink: 0;
    }
    .nav-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .nav-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .status {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      padding: 4px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="status" id="status">Connecting...</div>
  <div class="screen-container">
    <img id="screen" alt="Emulator Screen" />
  </div>
  <div class="nav-bar">
    <button class="nav-btn" id="btnBack">&#9664; Back</button>
    <button class="nav-btn" id="btnHome">&#9679; Home</button>
    <button class="nav-btn" id="btnRecents">&#9632; Recents</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const screen = document.getElementById('screen');
    const status = document.getElementById('status');
    let frameCount = 0;

    // Handle screen taps
    screen.addEventListener('click', (e) => {
      const rect = screen.getBoundingClientRect();
      const scaleX = screen.naturalWidth / rect.width;
      const scaleY = screen.naturalHeight / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      vscode.postMessage({ type: 'tap', x, y });
    });

    // Navigation buttons
    document.getElementById('btnBack').addEventListener('click', () => {
      vscode.postMessage({ type: 'back' });
    });
    document.getElementById('btnHome').addEventListener('click', () => {
      vscode.postMessage({ type: 'home' });
    });
    document.getElementById('btnRecents').addEventListener('click', () => {
      vscode.postMessage({ type: 'recents' });
    });

    // Receive frames
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'frame') {
        screen.src = msg.data;
        frameCount++;
        status.textContent = 'Live (' + frameCount + ' frames)';
      }
    });
  </script>
</body>
</html>`;
  }
}
