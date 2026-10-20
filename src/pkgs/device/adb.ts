import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '@/utils/logger.js';
import type { DeviceDriver } from './types.js';

const execFileAsync = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class AdbError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'AdbError';
  }
}

/** e.g. "ADB shell input tap failed: error: device unauthorized" — the real cause, not just the command. */
function failureMessage(args: string[], stderr: string, message?: string): string {
  const summary = args.slice(0, 3).join(' ');
  return `ADB ${summary} failed: ${stderr.trim() || message || 'unknown error'}`;
}

// ---------------------------------------------------------------------------
// ADB DeviceDriver implementation
// ---------------------------------------------------------------------------

export function createAdbDriver(deviceId?: string): DeviceDriver {
  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  function buildArgs(args: string[]): string[] {
    if (deviceId) {
      return ['-s', deviceId, ...args];
    }
    return args;
  }

  async function exec(args: string[]): Promise<string> {
    const fullArgs = buildArgs(args);
    const cmd = `adb ${fullArgs.join(' ')}`;

    try {
      const { stdout } = await execFileAsync('adb', fullArgs);
      return stdout;
    } catch (err: unknown) {
      const error = err as { stderr?: string; message?: string };
      const stderr = error.stderr ?? '';
      throw new AdbError(failureMessage(args, stderr, error.message), cmd, stderr || error.message || 'unknown error');
    }
  }

  async function listDevices(): Promise<string[]> {
    logger.debug('adb: listing devices');
    const { stdout } = await execFileAsync('adb', ['devices']);
    const lines = stdout.split('\n').slice(1);
    const devices: string[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1] === 'device') {
        devices.push(parts[0]!);
      }
    }

    logger.debug({ devices }, 'adb: devices found');
    return devices;
  }

  // -----------------------------------------------------------------------
  // DeviceDriver interface
  // -----------------------------------------------------------------------

  return {
    async isConnected(): Promise<boolean> {
      logger.debug('adb: checking connection');
      const devices = await listDevices();

      if (deviceId) {
        const found = devices.includes(deviceId);
        logger.debug({ deviceId, found }, 'adb: specific device check');
        return found;
      }

      const connected = devices.length > 0;
      logger.debug({ connected }, 'adb: any device check');
      return connected;
    },

    async tap(x: number, y: number): Promise<void> {
      logger.debug({ x, y }, 'adb: tap');
      await exec(['shell', 'input', 'tap', String(x), String(y)]);
    },

    async openUrl(url: string): Promise<void> {
      logger.debug({ url }, 'adb: opening url');
      await exec(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url]);
    },

    async currentApp(): Promise<string> {
      logger.debug('adb: getting current app');
      const output = await exec([
        'shell',
        'dumpsys',
        'window',
        'displays',
        '|',
        'grep',
        '-E',
        'mCurrentFocus|mFocusedApp',
      ]);

      const match = output.match(/(?:mCurrentFocus|mFocusedApp)=.*\s+([^\s{}]+\/[^\s{}]+)/);
      const result = match?.[1] ?? output.trim();

      logger.debug({ currentApp: result }, 'adb: current app');
      return result;
    },

    screenshot(): Promise<Buffer> {
      logger.debug('adb: taking screenshot');
      const args = buildArgs(['shell', 'screencap', '-p']);

      return new Promise<Buffer>((resolve, reject) => {
        execFileCb('adb', args, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
          if (error) {
            const stderr = (error as unknown as { stderr?: Buffer }).stderr?.toString() ?? '';
            reject(
              new AdbError(
                failureMessage(['screencap'], stderr, error.message),
                `adb ${args.join(' ')}`,
                stderr || error.message,
              ),
            );
            return;
          }
          logger.debug({ bytes: stdout.byteLength }, 'adb: screenshot captured');
          resolve(stdout);
        });
      });
    },
  };
}
