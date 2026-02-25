import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SdkInfo } from '../types';
import { CONFIG, SDK_DEFAULT_PATHS, SDK_TOOLS } from '../constants';

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
    }

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
        `Invalid SDK path. Missing: ${missing.join(', ')}. Install them via Android Studio SDK Manager.`
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
