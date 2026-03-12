import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { SdkInfo, DeviceInfo } from '../types';
import { AdbClient } from './AdbClient';
import { CONFIG } from '../constants';
import { Logger } from '../utils/Logger';

export interface DeviceTrackerEvents {
  devicesChanged: (devices: DeviceInfo[]) => void;
  deviceConnected: (device: DeviceInfo) => void;
  deviceDisconnected: (device: DeviceInfo) => void;
  error: (err: Error) => void;
}

/**
 * Monitors device connections using periodic polling.
 */
export class DeviceTracker extends EventEmitter {
  private adbClient: AdbClient;
  private adbPath: string;
  private trackProcess: ChildProcess | undefined;
  private pollInterval: NodeJS.Timeout | undefined;
  private currentDevices: Map<string, DeviceInfo> = new Map();
  private running = false;

  constructor(sdk: SdkInfo, adbClient: AdbClient) {
    super();
    this.adbPath = sdk.adbPath;
    this.adbClient = adbClient;
  }

  /** Start monitoring device changes */
  start(): void {
    if (this.running) { return; }
    this.running = true;

    const interval = vscode.workspace.getConfiguration(CONFIG.SECTION)
      .get<number>(CONFIG.DEVICE_TRACKER_INTERVAL, 3) * 1000;

    this.poll();
    this.pollInterval = setInterval(() => this.poll(), interval);
    Logger.info(`Device tracker started (polling every ${interval / 1000}s)`);
  }

  /** Stop monitoring */
  stop(): void {
    this.running = false;
    if (this.trackProcess) {
      this.trackProcess.kill();
      this.trackProcess = undefined;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    this.currentDevices.clear();
    Logger.info('Device tracker stopped');
  }

  private async poll(): Promise<void> {
    try {
      const devices = await this.adbClient.getDevices();
      const newMap = new Map<string, DeviceInfo>();
      for (const d of devices) {
        newMap.set(d.serial, d);
      }

      // Detect changes
      let changed = false;

      // New/changed devices
      for (const [serial, device] of newMap) {
        const existing = this.currentDevices.get(serial);
        if (!existing) {
          changed = true;
          Logger.info(`Device connected: ${device.model} (${serial}) [${device.state}]`);
          this.emit('deviceConnected', device);
        } else if (existing.state !== device.state) {
          changed = true;
          Logger.info(`Device state changed: ${serial} ${existing.state} → ${device.state}`);
        }
      }

      // Removed devices
      for (const [serial, device] of this.currentDevices) {
        if (!newMap.has(serial)) {
          changed = true;
          Logger.info(`Device disconnected: ${device.model} (${serial})`);
          this.emit('deviceDisconnected', device);
        }
      }

      this.currentDevices = newMap;

      if (changed) {
        this.emit('devicesChanged', devices);
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  getDevices(): DeviceInfo[] {
    return Array.from(this.currentDevices.values());
  }

  /** Force an immediate refresh */
  async refresh(): Promise<DeviceInfo[]> {
    await this.poll();
    return this.getDevices();
  }
}
