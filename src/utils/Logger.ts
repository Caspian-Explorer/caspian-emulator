import * as vscode from 'vscode';

/**
 * Centralized output channel logger for Caspian Emulator.
 * Logs to the "Caspian Emulator" output channel in VS Code.
 */
export class Logger {
  private static channel: vscode.OutputChannel;

  static init(): vscode.OutputChannel {
    if (!Logger.channel) {
      Logger.channel = vscode.window.createOutputChannel('Caspian Emulator');
    }
    return Logger.channel;
  }

  static info(message: string): void {
    Logger.write('INFO', message);
  }

  static warn(message: string): void {
    Logger.write('WARN', message);
  }

  static error(message: string): void {
    Logger.write('ERROR', message);
  }

  static debug(message: string): void {
    Logger.write('DEBUG', message);
  }

  static show(): void {
    Logger.channel?.show(true);
  }

  static getChannel(): vscode.OutputChannel {
    return Logger.channel;
  }

  private static write(level: string, message: string): void {
    if (!Logger.channel) { Logger.init(); }
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
    Logger.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  }
}
