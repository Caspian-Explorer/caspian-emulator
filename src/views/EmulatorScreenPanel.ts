import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import { AdbClient } from '../adb/AdbClient';
import { CONFIG } from '../constants';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Shows a live device screen inside VS Code.
 * Uses scrcpy if available (30+ FPS), falls back to periodic screencap (~3 FPS).
 * Works with both emulators and physical devices.
 */
export class EmulatorScreenPanel {
  private static panels = new Map<string, EmulatorScreenPanel>();

  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private captureInterval: NodeJS.Timeout | undefined;
  private scrcpyProcess: ChildProcess | undefined;
  private usingScrcpy = false;

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

    this.panel.webview.html = this.getHtml();
    this.startCapture();
  }

  private async startCapture(): Promise<void> {
    const scrcpyPath = this.findScrcpy();
    if (scrcpyPath) {
      this.startScrcpyCapture(scrcpyPath);
      return;
    }

    // Fallback: periodic screencap with optimized pipeline
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

  private startScrcpyCapture(scrcpyPath: string): void {
    this.usingScrcpy = true;
    Logger.info(`Starting scrcpy for ${this.serial} from ${scrcpyPath}`);

    // Launch scrcpy in a separate window — the user interacts with it directly
    // This gives the best experience: 30+ FPS, touch, keyboard, clipboard
    this.scrcpyProcess = spawn(scrcpyPath, [
      '-s', this.serial,
      '--window-title', `Caspian: ${this.serial}`,
    ], {
      stdio: 'pipe',
    });

    this.scrcpyProcess.on('error', (err) => {
      Logger.error(`scrcpy error: ${err.message}`);
      Logger.info('Falling back to screencap...');
      this.usingScrcpy = false;
      this.startScreencapLoop();
    });

    this.scrcpyProcess.on('exit', (code) => {
      Logger.info(`scrcpy exited with code ${code}`);
      this.usingScrcpy = false;
    });

    this.panel.webview.postMessage({
      type: 'scrcpyMode',
      message: 'scrcpy is running in a separate window with full touch & keyboard support. Use the scrcpy window to interact with your device.',
    });

    // Also run screencap at low rate to keep the webview preview updated
    this.startScreencapLoop(3000);
  }

  private startScreencapLoop(intervalMs: number = 350): void {
    let capturing = false;

    const capture = async () => {
      if (capturing) { return; } // Skip if previous capture still in progress
      capturing = true;
      try {
        // Get raw PNG binary from device, convert to base64 in Node.js
        const pngBuffer = await this.adbClient.execBinary(
          ['exec-out', 'screencap', '-p'],
          this.serial,
        );
        if (pngBuffer && pngBuffer.length > 100) {
          const b64 = pngBuffer.toString('base64');
          this.panel.webview.postMessage({
            type: 'frame',
            data: `data:image/png;base64,${b64}`,
          });
        }
      } catch {
        // Silently skip frame — device may be temporarily unavailable
      }
      capturing = false;
    };

    capture();
    this.captureInterval = setInterval(capture, intervalMs);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleMessage(msg: { type: string; x?: number; y?: number; x2?: number; y2?: number; duration?: number; action?: string; text?: string }): Promise<void> {
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
        if (msg.x !== undefined && msg.y !== undefined && msg.x2 !== undefined && msg.y2 !== undefined) {
          const duration = msg.duration || 300;
          await this.adbClient.exec(
            ['shell', 'input', 'swipe',
              String(Math.round(msg.x)), String(Math.round(msg.y)),
              String(Math.round(msg.x2)), String(Math.round(msg.y2)),
              String(duration)],
            this.serial,
          );
        }
        break;
      case 'key':
        if (msg.action) {
          await this.adbClient.exec(
            ['shell', 'input', 'keyevent', msg.action],
            this.serial,
          );
        }
        break;
      case 'text':
        if (msg.text) {
          await this.adbClient.exec(
            ['shell', 'input', 'text', msg.text.replace(/ /g, '%s')],
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
  <title>Device Screen</title>
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
      max-height: calc(100vh - 80px);
      cursor: pointer;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      user-select: none;
      -webkit-user-drag: none;
    }
    .nav-bar {
      display: flex;
      gap: 12px;
      padding: 8px;
      justify-content: center;
      flex-shrink: 0;
      align-items: center;
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
    .scrcpy-notice {
      padding: 8px 16px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 4px;
      font-size: 12px;
      margin: 4px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="status" id="status">Connecting...</div>
  <div class="scrcpy-notice" id="scrcpyNotice"></div>
  <div class="screen-container">
    <img id="screen" alt="Device Screen" />
  </div>
  <div class="nav-bar">
    <button class="nav-btn" id="btnBack">&#9664; Back</button>
    <button class="nav-btn" id="btnHome">&#9679; Home</button>
    <button class="nav-btn" id="btnRecents">&#9632; Recents</button>
    <span style="color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: 8px;" id="fpsCounter"></span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const screen = document.getElementById('screen');
    const status = document.getElementById('status');
    const fpsCounter = document.getElementById('fpsCounter');
    const scrcpyNotice = document.getElementById('scrcpyNotice');
    let frameCount = 0;
    let lastFpsTime = Date.now();
    let fpsFrames = 0;

    // Swipe tracking
    let swipeStart = null;

    screen.addEventListener('mousedown', (e) => {
      const rect = screen.getBoundingClientRect();
      const scaleX = screen.naturalWidth / rect.width;
      const scaleY = screen.naturalHeight / rect.height;
      swipeStart = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        time: Date.now()
      };
    });

    screen.addEventListener('mouseup', (e) => {
      if (!swipeStart) return;
      const rect = screen.getBoundingClientRect();
      const scaleX = screen.naturalWidth / rect.width;
      const scaleY = screen.naturalHeight / rect.height;
      const endX = (e.clientX - rect.left) * scaleX;
      const endY = (e.clientY - rect.top) * scaleY;
      const dx = endX - swipeStart.x;
      const dy = endY - swipeStart.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < 10) {
        // Tap
        vscode.postMessage({ type: 'tap', x: swipeStart.x, y: swipeStart.y });
      } else {
        // Swipe
        const duration = Math.max(100, Math.min(Date.now() - swipeStart.time, 1000));
        vscode.postMessage({
          type: 'swipe',
          x: swipeStart.x, y: swipeStart.y,
          x2: endX, y2: endY,
          duration
        });
      }
      swipeStart = null;
    });

    // Prevent default drag on image
    screen.addEventListener('dragstart', (e) => e.preventDefault());

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
        fpsFrames++;

        const now = Date.now();
        if (now - lastFpsTime >= 2000) {
          const fps = (fpsFrames / ((now - lastFpsTime) / 1000)).toFixed(1);
          fpsCounter.textContent = fps + ' FPS';
          fpsFrames = 0;
          lastFpsTime = now;
        }
        status.textContent = 'Live (' + frameCount + ' frames)';
      } else if (msg.type === 'scrcpyMode') {
        scrcpyNotice.style.display = 'block';
        scrcpyNotice.textContent = msg.message;
      }
    });
  </script>
</body>
</html>`;
  }
}
