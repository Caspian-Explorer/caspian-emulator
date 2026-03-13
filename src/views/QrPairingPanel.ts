/**
 * Webview panel that displays a QR code for wireless debugging pairing.
 * Shows live status updates as the pairing progresses.
 */

import * as vscode from 'vscode';
import * as QRCode from 'qrcode';
import { QrPairingServer, PairingStatus } from '../adb/QrPairingServer';
import { AdbClient } from '../adb/AdbClient';
import { DeviceTracker } from '../adb/DeviceTracker';
import { Logger } from '../utils/Logger';

export class QrPairingPanel {
  private static instance: QrPairingPanel | null = null;

  private panel: vscode.WebviewPanel;
  private server: QrPairingServer;
  private disposables: vscode.Disposable[] = [];

  static async show(
    adbClient: AdbClient,
    deviceTracker: DeviceTracker,
  ): Promise<void> {
    // Reuse existing panel
    if (QrPairingPanel.instance) {
      QrPairingPanel.instance.panel.reveal();
      return;
    }

    const instance = new QrPairingPanel(adbClient, deviceTracker);
    QrPairingPanel.instance = instance;
    await instance.init();
  }

  private constructor(
    private adbClient: AdbClient,
    private deviceTracker: DeviceTracker,
  ) {
    this.server = new QrPairingServer();

    this.panel = vscode.window.createWebviewPanel(
      'caspian.qrPairing',
      'Pair Device with QR Code',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
      }
    );

    this.panel.iconPath = new vscode.ThemeIcon('radio-tower');
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables
    );
  }

  private async init(): Promise<void> {
    try {
      const info = await this.server.start();

      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(info.qrPayload, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });

      this.panel.webview.html = this.getHtml(qrDataUrl, info.password);

      // Listen to server events
      this.server.on('status', (status: PairingStatus) => {
        this.panel.webview.postMessage({ type: 'status', status });
      });

      this.server.on('paired', async (_remoteAddr: string) => {
        this.panel.webview.postMessage({ type: 'status', status: 'paired' });

        // Auto-connect to the paired device
        try {
          // The wireless debugging port is different from the pairing port.
          // After pairing, we need to discover the device's connection port.
          // The device should appear via mDNS or the user connects manually.
          // Refresh the device tracker to detect the newly paired device.
          await new Promise(r => setTimeout(r, 2000));
          this.deviceTracker.refresh();
          vscode.window.showInformationMessage(
            'Device paired successfully! It should appear in Connected Devices shortly.',
            'Connect Manually'
          ).then(choice => {
            if (choice === 'Connect Manually') {
              vscode.commands.executeCommand('caspian.connectWifi');
            }
          });
        } catch (err) {
          Logger.warn(`Post-pairing connect hint: ${err}`);
        }

        // Auto-close panel after a short delay
        setTimeout(() => this.dispose(), 3000);
      });

      this.server.on('error', (err: Error) => {
        this.panel.webview.postMessage({ type: 'error', message: err.message });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`QR pairing failed to start: ${msg}`);
      this.dispose();
    }
  }

  private handleMessage(msg: { type: string }): void {
    switch (msg.type) {
      case 'retry':
        this.dispose();
        QrPairingPanel.show(this.adbClient, this.deviceTracker);
        break;
      case 'cancel':
        this.dispose();
        break;
    }
  }

  private dispose(): void {
    QrPairingPanel.instance = null;
    this.server.dispose();
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }

  private getHtml(qrDataUrl: string, password: string): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 90vh;
    margin: 0;
    padding: 20px;
  }
  .container {
    text-align: center;
    max-width: 400px;
  }
  h2 {
    margin-bottom: 8px;
    font-size: 18px;
    font-weight: 600;
  }
  .subtitle {
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .qr-container {
    background: white;
    border-radius: 12px;
    padding: 16px;
    display: inline-block;
    margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .qr-container img {
    display: block;
    width: 280px;
    height: 280px;
  }
  .password-label {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    margin-bottom: 4px;
  }
  .password {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 6px;
    margin-bottom: 20px;
    font-family: var(--vscode-editor-font-family);
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13px;
    padding: 8px 16px;
    border-radius: 6px;
    background: var(--vscode-textBlockQuote-background);
    margin-bottom: 16px;
    min-height: 24px;
  }
  .status.success {
    background: var(--vscode-testing-iconPassed);
    color: white;
  }
  .status.error {
    background: var(--vscode-testing-iconFailed);
    color: white;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--vscode-descriptionForeground);
    border-top-color: var(--vscode-focusBorder);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .buttons {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  button {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-family: var(--vscode-font-family);
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .steps {
    text-align: left;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.6;
    margin-top: 16px;
    padding: 12px 16px;
    background: var(--vscode-textBlockQuote-background);
    border-radius: 6px;
  }
  .steps strong { color: var(--vscode-foreground); }
  .checkmark { display: none; }
  .status.success .checkmark { display: inline; }
  .status.success .spinner { display: none; }
</style>
</head>
<body>
<div class="container">
  <h2>Pair Device with QR Code</h2>
  <p class="subtitle">
    On your phone, go to <strong>Developer Options</strong> &rarr;
    <strong>Wireless Debugging</strong> &rarr; <strong>Pair device with QR code</strong>,
    then scan this code.
  </p>

  <div class="qr-container">
    <img src="${qrDataUrl}" alt="QR Code for ADB pairing" />
  </div>

  <div class="password-label">Or enter this code manually:</div>
  <div class="password">${password}</div>

  <div class="status" id="status">
    <div class="spinner" id="spinner"></div>
    <span class="checkmark" id="checkmark">&#10003;</span>
    <span id="statusText">Waiting for phone to scan...</span>
  </div>

  <div class="buttons">
    <button class="btn-secondary" onclick="send('retry')">Regenerate</button>
    <button class="btn-secondary" onclick="send('cancel')">Cancel</button>
  </div>

  <div class="steps">
    <strong>Steps:</strong><br>
    1. Open <strong>Settings</strong> on your Android phone<br>
    2. Go to <strong>Developer Options</strong> &rarr; <strong>Wireless Debugging</strong><br>
    3. Tap <strong>Pair device with QR code</strong><br>
    4. Point the camera at the QR code above
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');

  const statusMessages = {
    starting: 'Starting pairing server...',
    advertising: 'Broadcasting pairing service...',
    waiting: 'Waiting for phone to scan...',
    tls_connected: 'Phone connected! Authenticating...',
    exchanging_keys: 'Exchanging encryption keys...',
    exchanging_peer_info: 'Exchanging device credentials...',
    paired: 'Paired successfully!',
    failed: 'Pairing failed.',
  };

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'status') {
      statusText.textContent = statusMessages[msg.status] || msg.status;
      statusEl.className = 'status';
      if (msg.status === 'paired') {
        statusEl.classList.add('success');
      } else if (msg.status === 'failed') {
        statusEl.classList.add('error');
      }
    } else if (msg.type === 'error') {
      statusText.textContent = msg.message;
      statusEl.className = 'status error';
    }
  });

  function send(type) {
    vscode.postMessage({ type });
  }
</script>
</body>
</html>`;
  }
}
