import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SdkInfo } from '../types';
import { CONFIG, SDK_DEFAULT_PATHS, SDK_DOWNLOAD, SDK_TOOLS } from '../constants';
import { SdkDownloader } from './SdkDownloader';

export class SdkManager {
  private sdkInfo: SdkInfo | undefined;

  async detect(): Promise<SdkInfo | undefined> {
    // 1. Check user configuration
    const configured = vscode.workspace.getConfiguration(CONFIG.SECTION).get<string>(CONFIG.SDK_PATH);
    if (configured) {
      const info = this.validatePath(configured);
      if (info?.valid) {
        this.sdkInfo = info;
        return info;
      }
    }

    // 2. Check environment variables
    for (const envVar of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
      const envPath = process.env[envVar];
      if (envPath) {
        const info = this.validatePath(envPath);
        if (info?.valid) {
          this.sdkInfo = info;
          return info;
        }
      }
    }

    // 3. Check common install locations
    const platform = process.platform;
    const candidates = SDK_DEFAULT_PATHS[platform] || [];
    for (const candidate of candidates) {
      if (!candidate) { continue; }
      const info = this.validatePath(candidate);
      if (info?.valid) {
        this.sdkInfo = info;
        return info;
      }
    }

    return undefined;
  }

  validatePath(sdkPath: string): SdkInfo | undefined {
    if (!fs.existsSync(sdkPath)) {
      return undefined;
    }

    const adbPath = path.join(sdkPath, 'platform-tools', SDK_TOOLS.ADB);
    const emulatorPath = path.join(sdkPath, 'emulator', SDK_TOOLS.EMULATOR);
    const avdmanagerPath = path.join(sdkPath, 'cmdline-tools', 'latest', 'bin', SDK_TOOLS.AVDMANAGER);
    const sdkmanagerPath = path.join(sdkPath, 'cmdline-tools', 'latest', 'bin', SDK_TOOLS.SDKMANAGER);

    // Also check older cmdline-tools location
    const avdmanagerAlt = path.join(sdkPath, 'tools', 'bin', SDK_TOOLS.AVDMANAGER);
    const sdkmanagerAlt = path.join(sdkPath, 'tools', 'bin', SDK_TOOLS.SDKMANAGER);

    const resolvedAvdmanager = fs.existsSync(avdmanagerPath) ? avdmanagerPath : avdmanagerAlt;
    const resolvedSdkmanager = fs.existsSync(sdkmanagerPath) ? sdkmanagerPath : sdkmanagerAlt;

    const valid = fs.existsSync(adbPath) && fs.existsSync(emulatorPath);

    return {
      path: sdkPath,
      adbPath,
      emulatorPath,
      avdmanagerPath: resolvedAvdmanager,
      sdkmanagerPath: resolvedSdkmanager,
      valid,
    };
  }

  async runSetupWizard(): Promise<SdkInfo | undefined> {
    const detected = await this.detect();
    if (detected) {
      const use = await vscode.window.showInformationMessage(
        `Android SDK found at: ${detected.path}`,
        'Use This', 'Choose Different'
      );
      if (use === 'Use This') {
        await this.saveSdkPath(detected.path);
        return detected;
      }
      if (!use) { return undefined; }
    }

    // Offer download or browse
    const action = await vscode.window.showInformationMessage(
      'Android SDK not found. You can download it automatically or select an existing installation.',
      { modal: true },
      'Download Android SDK',
      'Browse for Existing SDK'
    );

    if (action === 'Download Android SDK') {
      return this.runDownloadWizard();
    }
    if (action === 'Browse for Existing SDK') {
      return this.browseForSdk();
    }

    return undefined;
  }

  /** Full download and install flow with progress */
  async runDownloadWizard(): Promise<SdkInfo | undefined> {
    const downloader = new SdkDownloader();

    // Step 1: Check Java
    const java = await downloader.detectJava();
    if (!java.found) {
      const choice = await vscode.window.showErrorMessage(
        'Java 17 or later is required for the Android SDK tools. Please install a JDK and restart VS Code.',
        'Open Download Page'
      );
      if (choice === 'Open Download Page') {
        vscode.env.openExternal(vscode.Uri.parse('https://adoptium.net/'));
      }
      return undefined;
    }
    if (parseInt(java.version) < SDK_DOWNLOAD.MIN_JAVA_VERSION) {
      vscode.window.showErrorMessage(
        `Java ${java.version} detected, but Java ${SDK_DOWNLOAD.MIN_JAVA_VERSION}+ is required. Please upgrade your JDK.`
      );
      return undefined;
    }

    // Step 2: Check disk space
    const disk = await downloader.checkDiskSpace();
    if (!disk.sufficient) {
      vscode.window.showErrorMessage(
        `Insufficient disk space. At least 5 GB required, but only ${(disk.available / 1e9).toFixed(1)} GB available.`
      );
      return undefined;
    }

    // Step 3: Confirm with user
    const confirm = await vscode.window.showInformationMessage(
      `This will download and install ~5 GB of Android SDK components to:\n${downloader.getSdkRoot()}`,
      { modal: true },
      'Install'
    );
    if (confirm !== 'Install') { return undefined; }

    // Step 4: Download and install with progress
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Setting up Android SDK',
        cancellable: true,
      },
      async (progress, token) => {
        try {
          const report = (msg: string) => progress.report({ message: msg });

          // Download or skip if cmdline-tools already exist
          if (!downloader.hasCommandLineTools()) {
            report('Downloading command-line tools...');
            const zipPath = await downloader.downloadCommandLineTools((p) => report(p.message));
            if (token.isCancellationRequested) { return undefined; }

            report('Extracting command-line tools...');
            await downloader.extractCommandLineTools(zipPath, (p) => report(p.message));
            if (token.isCancellationRequested) { return undefined; }
          } else {
            report('Command-line tools found, resuming setup...');
          }

          // Accept licenses
          report('Accepting SDK licenses...');
          const sdkmanagerPath = path.join(
            downloader.getSdkRoot(), 'cmdline-tools', 'latest', 'bin', SDK_TOOLS.SDKMANAGER
          );
          await downloader.acceptLicenses(sdkmanagerPath);
          if (token.isCancellationRequested) { return undefined; }

          // Install components
          await downloader.installComponents(sdkmanagerPath, (p) => report(p.message));
          if (token.isCancellationRequested) { return undefined; }

          // Validate
          report('Validating installation...');
          const sdkPath = downloader.getSdkRoot();
          const info = this.validatePath(sdkPath);
          if (!info?.valid) {
            vscode.window.showErrorMessage('SDK installation completed but validation failed. Some tools may be missing.');
            return undefined;
          }

          // Save path and set as active
          await this.saveSdkPath(sdkPath);
          this.sdkInfo = info;

          // Create default AVD
          try {
            const avdName = await downloader.createDefaultAvd((p) => report(p.message));
            vscode.window.showInformationMessage(
              `Android SDK installed! Default AVD "${avdName}" created.`
            );
          } catch {
            vscode.window.showInformationMessage(
              'Android SDK installed! You can create a virtual device from the sidebar.'
            );
          }

          return info;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`SDK setup failed: ${msg}`);
          return undefined;
        }
      }
    );
  }

  /** Browse for an existing SDK folder (original flow) */
  private async browseForSdk(): Promise<SdkInfo | undefined> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Android SDK Folder',
      title: 'Locate your Android SDK installation',
    });

    if (!result || result.length === 0) {
      return undefined;
    }

    const selectedPath = result[0].fsPath;
    const info = this.validatePath(selectedPath);

    if (!info?.valid) {
      const missing: string[] = [];
      if (!fs.existsSync(path.join(selectedPath, 'platform-tools', SDK_TOOLS.ADB))) {
        missing.push('adb (platform-tools)');
      }
      if (!fs.existsSync(path.join(selectedPath, 'emulator', SDK_TOOLS.EMULATOR))) {
        missing.push('emulator');
      }
      vscode.window.showErrorMessage(
        `Invalid SDK path. Missing: ${missing.join(', ')}. Install them via Android Studio SDK Manager or use the Download option.`
      );
      return undefined;
    }

    await this.saveSdkPath(selectedPath);
    this.sdkInfo = info;
    return info;
  }

  private async saveSdkPath(sdkPath: string): Promise<void> {
    await vscode.workspace.getConfiguration(CONFIG.SECTION)
      .update(CONFIG.SDK_PATH, sdkPath, vscode.ConfigurationTarget.Global);
  }

  getSdkInfo(): SdkInfo | undefined {
    return this.sdkInfo;
  }

  isReady(): boolean {
    return this.sdkInfo?.valid === true;
  }
}
