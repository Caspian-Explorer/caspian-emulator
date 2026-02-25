import { execFile } from 'child_process';
import { spawn, ChildProcess } from 'child_process';
import { SdkInfo, AvdInfo, SystemImage, DeviceProfile, EmulatorProcess } from '../types';
import * as path from 'path';
import * as fs from 'fs';

export class AvdManager {
  private sdk: SdkInfo;
  private runningEmulators: Map<string, EmulatorProcess> = new Map();

  constructor(sdk: SdkInfo) {
    this.sdk = sdk;
  }

  /** Execute avdmanager command */
  private execAvdManager(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(this.sdk.avdmanagerPath, args, { maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`avdmanager ${args.join(' ')} failed: ${stderr || err.message}`));
          return;
        }
        resolve(stdout);
      });
    });
  }

  /** Execute emulator command */
  private execEmulator(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(this.sdk.emulatorPath, args, { maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`emulator ${args.join(' ')} failed: ${stderr || err.message}`));
          return;
        }
        resolve(stdout);
      });
    });
  }

  /** List all AVDs */
  async listAvds(): Promise<AvdInfo[]> {
    const output = await this.execEmulator(['-list-avds']);
    const avdNames = output.trim().split('\n').filter(Boolean);
    const avds: AvdInfo[] = [];

    for (const name of avdNames) {
      const info = await this.getAvdInfo(name.trim());
      if (info) {
        avds.push(info);
      }
    }

    return avds;
  }

  /** Get detailed info about a single AVD by reading its config.ini */
  private async getAvdInfo(name: string): Promise<AvdInfo | undefined> {
    const avdDir = this.getAvdDirectory(name);
    const configPath = path.join(avdDir, 'config.ini');

    if (!fs.existsSync(configPath)) {
      // Minimal info if config not found
      return {
        name,
        displayName: name,
        device: '',
        target: '',
        apiLevel: 0,
        abi: '',
        skin: '',
        sdcard: '',
        path: avdDir,
        running: this.runningEmulators.has(name),
      };
    }

    const config = this.parseIniFile(configPath);

    return {
      name,
      displayName: config['avd.ini.displayname'] || name,
      device: config['hw.device.name'] || '',
      target: config['tag.id'] || 'default',
      apiLevel: parseInt(config['image.sysdir.1']?.match(/android-(\d+)/)?.[1] || '0', 10),
      abi: config['abi.type'] || '',
      skin: config['skin.name'] || '',
      sdcard: config['sdcard.size'] || '',
      path: avdDir,
      running: this.runningEmulators.has(name),
    };
  }

  /** Get the AVD directory */
  private getAvdDirectory(name: string): string {
    const avdHome = process.env.ANDROID_AVD_HOME
      || path.join(process.env.HOME || process.env.USERPROFILE || '', '.android', 'avd');
    return path.join(avdHome, `${name}.avd`);
  }

  /** Parse an INI file into key-value pairs */
  private parseIniFile(filePath: string): Record<string, string> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        result[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    }
    return result;
  }

  /** List available system images */
  async listSystemImages(): Promise<SystemImage[]> {
    try {
      const output = await this.execAvdManager(['list', 'target', '-c']);
      // Fallback: parse sdkmanager list
      return this.parseSystemImagesFromSdk();
    } catch {
      return this.parseSystemImagesFromSdk();
    }
  }

  private async parseSystemImagesFromSdk(): Promise<SystemImage[]> {
    return new Promise((resolve, reject) => {
      execFile(this.sdk.sdkmanagerPath, ['--list'], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
          resolve([]);
          return;
        }
        const images: SystemImage[] = [];
        for (const line of stdout.split('\n')) {
          const match = line.match(/^\s*(system-images;android-(\d+);([^;]+);([^|\s]+))/);
          if (match) {
            images.push({
              path: match[1],
              apiLevel: parseInt(match[2], 10),
              tag: match[3],
              abi: match[4],
              description: match[1],
              installed: line.includes('Installed') || line.includes('installed'),
            });
          }
        }
        resolve(images);
      });
    });
  }

  /** List available device profiles */
  async listDeviceProfiles(): Promise<DeviceProfile[]> {
    try {
      const output = await this.execAvdManager(['list', 'device', '-c']);
      return output.trim().split('\n').filter(Boolean).map(id => ({
        id: id.trim(),
        name: id.trim(),
        manufacturer: '',
        screenSize: '',
        resolution: '',
      }));
    } catch {
      return [];
    }
  }

  /** Create a new AVD */
  async createAvd(
    name: string,
    systemImage: string,
    deviceProfile?: string,
  ): Promise<void> {
    const args = ['create', 'avd', '-n', name, '-k', systemImage, '--force'];
    if (deviceProfile) {
      args.push('-d', deviceProfile);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(this.sdk.avdmanagerPath, args, { stdio: 'pipe' });
      // Auto-answer "no" to custom hardware profile
      proc.stdin?.write('no\n');
      proc.stdin?.end();

      let stderr = '';
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => {
        if (code === 0) { resolve(); }
        else { reject(new Error(`Failed to create AVD: ${stderr}`)); }
      });
    });
  }

  /** Delete an AVD */
  async deleteAvd(name: string): Promise<void> {
    await this.execAvdManager(['delete', 'avd', '-n', name]);
  }

  /** Launch an emulator for the given AVD */
  launchEmulator(avdName: string, extraArgs: string[] = []): EmulatorProcess {
    const args = ['-avd', avdName, ...extraArgs];
    const proc = spawn(this.sdk.emulatorPath, args, {
      stdio: 'ignore',
      detached: true,
    });

    // Allow the parent process to exit without waiting for the emulator
    proc.unref();

    const emulatorProc: EmulatorProcess = {
      avdName,
      serial: '', // Will be populated when device connects
      pid: proc.pid || 0,
      process: proc,
    };

    this.runningEmulators.set(avdName, emulatorProc);

    proc.on('exit', () => {
      this.runningEmulators.delete(avdName);
    });

    return emulatorProc;
  }

  /** Stop a running emulator via adb */
  async stopEmulator(serial: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(this.sdk.adbPath, ['-s', serial, 'emu', 'kill'], (err) => {
        if (err) { reject(err); }
        else { resolve(); }
      });
    });
  }

  /** Check if an AVD is currently running */
  isRunning(avdName: string): boolean {
    return this.runningEmulators.has(avdName);
  }

  /** Mark an AVD as running (for externally launched emulators) */
  markRunning(avdName: string, serial: string): void {
    if (!this.runningEmulators.has(avdName)) {
      this.runningEmulators.set(avdName, {
        avdName,
        serial,
        pid: 0,
        process: null as unknown as ChildProcess,
      });
    } else {
      const existing = this.runningEmulators.get(avdName)!;
      existing.serial = serial;
    }
  }

  /** Mark AVD as stopped */
  markStopped(avdName: string): void {
    this.runningEmulators.delete(avdName);
  }

  /** Get the config.ini path for editing */
  getConfigPath(avdName: string): string {
    return path.join(this.getAvdDirectory(avdName), 'config.ini');
  }
}
