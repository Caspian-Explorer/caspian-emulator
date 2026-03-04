export interface SdkInfo {
  path: string;
  adbPath: string;
  emulatorPath: string;
  avdmanagerPath: string;
  sdkmanagerPath: string;
  valid: boolean;
}

export interface AvdInfo {
  name: string;
  displayName: string;
  device: string;
  target: string;
  apiLevel: number;
  abi: string;
  skin: string;
  sdcard: string;
  path: string;
  running: boolean;
  serial?: string;
}

export interface DeviceInfo {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized' | 'no permissions';
  type: 'emulator' | 'physical';
  model: string;
  product: string;
  transportId: string;
}

export interface LogcatEntry {
  timestamp: string;
  pid: string;
  tid: string;
  priority: LogcatPriority;
  tag: string;
  message: string;
}

export type LogcatPriority = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';

export interface DeviceFile {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  permissions: string;
  owner: string;
  group: string;
  date: string;
}

export interface SystemImage {
  path: string;
  apiLevel: number;
  tag: string;
  abi: string;
  description: string;
  installed: boolean;
}

export interface DeviceProfile {
  id: string;
  name: string;
  manufacturer: string;
  screenSize: string;
  resolution: string;
}

export interface JavaInfo {
  found: boolean;
  version: string;
  path: string;
}

export interface DiskSpaceInfo {
  available: number;
  sufficient: boolean;
}

export interface EmulatorProcess {
  avdName: string;
  serial: string;
  pid: number;
  process: import('child_process').ChildProcess;
}
