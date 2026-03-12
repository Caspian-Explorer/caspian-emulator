import { spawn, execFile } from 'child_process';
import { SdkInfo, DeviceInfo, LogcatEntry, DeviceFile } from '../types';
import { Logger } from '../utils/Logger';

export class AdbClient {
  private adbPath: string;

  constructor(sdk: SdkInfo) {
    this.adbPath = sdk.adbPath;
  }

  /** Execute an ADB command and return stdout */
  exec(args: string[], serial?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fullArgs = serial ? ['-s', serial, ...args] : args;
      Logger.debug(`adb ${fullArgs.join(' ')}`);
      execFile(this.adbPath, fullArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          let msg = `adb ${fullArgs.join(' ')} failed: ${stderr || err.message}`;
          // Provide actionable message for common ADB daemon issues
          if (stderr && (stderr.includes('daemon not running') || stderr.includes('cannot connect to daemon'))) {
            msg = `ADB daemon failed to start. Make sure no other process is using port 5037, then try "Caspian: Refresh Device List". Details: ${stderr.trim()}`;
          }
          Logger.error(msg);
          reject(new Error(msg));
          return;
        }
        resolve(stdout);
      });
    });
  }

  /** Execute an ADB command with automatic retry for transient failures */
  async execWithRetry(args: string[], serial?: string, retries: number = 3): Promise<string> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.exec(args, serial);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        // Only retry on transient errors
        const transient = msg.includes('device offline') ||
          msg.includes('error: closed') ||
          msg.includes('no devices') ||
          msg.includes('Connection refused') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('protocol fault');
        if (!transient || attempt === retries) { break; }
        Logger.warn(`Transient ADB error (attempt ${attempt}/${retries}), retrying in ${attempt}s...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }
    throw lastError;
  }

  /** Get list of connected devices */
  async getDevices(): Promise<DeviceInfo[]> {
    const output = await this.exec(['devices', '-l']);
    const lines = output.trim().split('\n').slice(1); // skip header
    const devices: DeviceInfo[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }

      const match = trimmed.match(/^(\S+)\s+(device|offline|unauthorized|no permissions)\s*(.*)/);
      if (!match) { continue; }

      const [, serial, state, rest] = match;
      const props = new Map<string, string>();
      for (const pair of rest.matchAll(/(\w+):(\S+)/g)) {
        props.set(pair[1], pair[2]);
      }

      devices.push({
        serial,
        state: state as DeviceInfo['state'],
        type: serial.startsWith('emulator-') ? 'emulator' : 'physical',
        model: props.get('model') || 'Unknown',
        product: props.get('product') || 'Unknown',
        transportId: props.get('transport_id') || '',
      });
    }

    return devices;
  }

  /** Get a device property */
  async getProp(serial: string, prop: string): Promise<string> {
    const output = await this.exec(['shell', 'getprop', prop], serial);
    return output.trim();
  }

  /** Install an APK on a device */
  async installApk(serial: string, apkPath: string, onProgress?: (msg: string) => void): Promise<void> {
    onProgress?.('Uploading APK...');
    await this.exec(['install', '-r', apkPath], serial);
    onProgress?.('APK installed successfully.');
    Logger.info(`APK installed on ${serial}: ${apkPath}`);
  }

  /** Take a screenshot and save to local path */
  async screenshot(serial: string, localPath: string): Promise<void> {
    const remotePath = '/sdcard/caspian_screenshot.png';
    await this.exec(['shell', 'screencap', '-p', remotePath], serial);
    await this.exec(['pull', remotePath, localPath], serial);
    await this.exec(['shell', 'rm', remotePath], serial);
    Logger.info(`Screenshot saved: ${localPath}`);
  }

  /** Start screen recording, returns the spawned process */
  startScreenRecording(serial: string, remotePath: string = '/sdcard/caspian_recording.mp4') {
    const args = ['-s', serial, 'shell', 'screenrecord', remotePath];
    Logger.info(`Screen recording started on ${serial}`);
    return spawn(this.adbPath, args);
  }

  /** Pull screen recording from device */
  async pullScreenRecording(serial: string, localPath: string, remotePath: string = '/sdcard/caspian_recording.mp4'): Promise<void> {
    await this.exec(['pull', remotePath, localPath], serial);
    await this.exec(['shell', 'rm', remotePath], serial);
    Logger.info(`Screen recording saved: ${localPath}`);
  }

  /** List files in a directory on the device */
  async listFiles(serial: string, remotePath: string): Promise<DeviceFile[]> {
    const output = await this.exec(['shell', 'ls', '-la', remotePath], serial);
    const lines = output.trim().split('\n');
    const files: DeviceFile[] = [];

    for (const line of lines) {
      const match = line.match(
        /^([drwxlst-]{10})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)?\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/
      );
      if (!match) { continue; }

      const [, permissions, , owner, group, sizeStr, date, name] = match;

      if (name === '.' || name === '..') { continue; }

      let type: DeviceFile['type'] = 'file';
      if (permissions.startsWith('d')) { type = 'directory'; }
      else if (permissions.startsWith('l')) { type = 'symlink'; }

      // For symlinks, strip the target part
      const displayName = type === 'symlink' ? name.split(' -> ')[0] : name;

      files.push({
        name: displayName,
        path: remotePath.endsWith('/') ? remotePath + displayName : remotePath + '/' + displayName,
        type,
        size: parseInt(sizeStr || '0', 10),
        permissions,
        owner,
        group,
        date,
      });
    }

    return files;
  }

  /** Pull a file from the device */
  async pullFile(serial: string, remotePath: string, localPath: string): Promise<void> {
    await this.exec(['pull', remotePath, localPath], serial);
  }

  /** Push a file to the device */
  async pushFile(serial: string, localPath: string, remotePath: string): Promise<void> {
    await this.exec(['push', localPath, remotePath], serial);
  }

  /** Delete a file on the device */
  async deleteFile(serial: string, remotePath: string, isDirectory: boolean): Promise<void> {
    if (isDirectory) {
      await this.exec(['shell', 'rm', '-rf', remotePath], serial);
    } else {
      await this.exec(['shell', 'rm', remotePath], serial);
    }
  }

  /** Create a directory on the device */
  async createDirectory(serial: string, remotePath: string): Promise<void> {
    await this.exec(['shell', 'mkdir', '-p', remotePath], serial);
    Logger.info(`Created directory on ${serial}: ${remotePath}`);
  }

  /** Rename/move a file on the device */
  async renameFile(serial: string, oldPath: string, newPath: string): Promise<void> {
    await this.exec(['shell', 'mv', oldPath, newPath], serial);
    Logger.info(`Renamed on ${serial}: ${oldPath} → ${newPath}`);
  }

  /** Read a small text file from the device */
  async readFile(serial: string, remotePath: string): Promise<string> {
    return await this.exec(['shell', 'cat', remotePath], serial);
  }

  /** Start logcat stream, returns spawned process */
  startLogcat(serial: string, filter?: string) {
    const args = ['-s', serial, 'logcat', '-v', 'threadtime'];
    if (filter) {
      args.push(filter);
    }
    Logger.info(`Logcat started for ${serial}${filter ? ` (filter: ${filter})` : ''}`);
    return spawn(this.adbPath, args);
  }

  /** Parse a single logcat line */
  static parseLogcatLine(line: string): LogcatEntry | undefined {
    // Format: 02-25 12:34:56.789  1234  5678 I Tag     : Message
    const match = line.match(
      /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+(\S+)\s*:\s*(.*)$/
    );
    if (!match) { return undefined; }

    return {
      timestamp: match[1],
      pid: match[2],
      tid: match[3],
      priority: match[4] as LogcatEntry['priority'],
      tag: match[5],
      message: match[6],
    };
  }

  /** Get the AVD name running on an emulator serial */
  async getEmulatorAvdName(serial: string): Promise<string> {
    try {
      const output = await this.exec(['emu', 'avd', 'name'], serial);
      return output.trim().split('\n')[0];
    } catch {
      return '';
    }
  }

  // ── App management ──

  /** List installed packages on a device */
  async listPackages(serial: string, thirdPartyOnly: boolean = true): Promise<string[]> {
    const args = ['shell', 'pm', 'list', 'packages'];
    if (thirdPartyOnly) { args.push('-3'); }
    const output = await this.exec(args, serial);
    return output.trim().split('\n')
      .filter(Boolean)
      .map(line => line.replace('package:', '').trim())
      .sort();
  }

  /** Launch an app by package name */
  async launchApp(serial: string, packageName: string): Promise<void> {
    await this.exec(['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'], serial);
    Logger.info(`Launched app on ${serial}: ${packageName}`);
  }

  /** Force stop an app */
  async forceStopApp(serial: string, packageName: string): Promise<void> {
    await this.exec(['shell', 'am', 'force-stop', packageName], serial);
    Logger.info(`Force stopped on ${serial}: ${packageName}`);
  }

  /** Clear app data */
  async clearAppData(serial: string, packageName: string): Promise<void> {
    await this.exec(['shell', 'pm', 'clear', packageName], serial);
    Logger.info(`Cleared data on ${serial}: ${packageName}`);
  }

  /** Uninstall an app */
  async uninstallApp(serial: string, packageName: string): Promise<void> {
    await this.exec(['uninstall', packageName], serial);
    Logger.info(`Uninstalled on ${serial}: ${packageName}`);
  }

  /** Get PIDs for a given package name (for logcat filtering) */
  async getPackagePids(serial: string, packageName: string): Promise<string[]> {
    try {
      const output = await this.exec(['shell', 'pidof', packageName], serial);
      return output.trim().split(/\s+/).filter(Boolean);
    } catch {
      return [];
    }
  }

  // ── Wireless ADB ──

  /** Connect to a device over TCP/IP */
  async connectTcp(address: string): Promise<string> {
    const output = await this.exec(['connect', address]);
    Logger.info(`TCP connect: ${address} → ${output.trim()}`);
    return output.trim();
  }

  /** Disconnect a TCP device */
  async disconnectTcp(address: string): Promise<string> {
    const output = await this.exec(['disconnect', address]);
    Logger.info(`TCP disconnect: ${address}`);
    return output.trim();
  }

  /** Pair with a device for wireless debugging (Android 11+) */
  async pair(address: string, code: string): Promise<string> {
    const output = await this.exec(['pair', address, code]);
    Logger.info(`Paired with ${address}`);
    return output.trim();
  }
}
