import { spawn, execFile } from 'child_process';
import { SdkInfo, DeviceInfo, LogcatEntry, DeviceFile } from '../types';

export class AdbClient {
  private adbPath: string;

  constructor(sdk: SdkInfo) {
    this.adbPath = sdk.adbPath;
  }

  /** Execute an ADB command and return stdout */
  exec(args: string[], serial?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fullArgs = serial ? ['-s', serial, ...args] : args;
      execFile(this.adbPath, fullArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`adb ${fullArgs.join(' ')} failed: ${stderr || err.message}`));
          return;
        }
        resolve(stdout);
      });
    });
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
  }

  /** Take a screenshot and save to local path */
  async screenshot(serial: string, localPath: string): Promise<void> {
    const remotePath = '/sdcard/caspian_screenshot.png';
    await this.exec(['shell', 'screencap', '-p', remotePath], serial);
    await this.exec(['pull', remotePath, localPath], serial);
    await this.exec(['shell', 'rm', remotePath], serial);
  }

  /** Start screen recording, returns the spawned process */
  startScreenRecording(serial: string, remotePath: string = '/sdcard/caspian_recording.mp4') {
    const args = ['-s', serial, 'shell', 'screenrecord', remotePath];
    return spawn(this.adbPath, args);
  }

  /** Pull screen recording from device */
  async pullScreenRecording(serial: string, localPath: string, remotePath: string = '/sdcard/caspian_recording.mp4'): Promise<void> {
    await this.exec(['pull', remotePath, localPath], serial);
    await this.exec(['shell', 'rm', remotePath], serial);
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

  /** Start logcat stream, returns spawned process */
  startLogcat(serial: string, filter?: string) {
    const args = ['-s', serial, 'logcat', '-v', 'threadtime'];
    if (filter) {
      args.push(filter);
    }
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
}
