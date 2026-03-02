import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';

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

// ---------------------------------------------------------------------------
// Private helper
// ---------------------------------------------------------------------------

function buildArgs(args: string[]): string[] {
  if (env.ADB_DEVICE_ID) {
    return ['-s', env.ADB_DEVICE_ID, ...args];
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
    throw new AdbError(`ADB command failed: ${cmd}`, cmd, error.stderr ?? error.message ?? 'unknown error');
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * List connected ADB device serial numbers.
 */
export async function listDevices(): Promise<string[]> {
  logger.debug('adb: listing devices');
  // `adb devices` ignores -s flag, so call without device prefix
  const { stdout } = await execFileAsync('adb', ['devices']);
  const lines = stdout.split('\n').slice(1); // skip header "List of devices attached"
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

/**
 * Check whether an ADB device is connected.
 * If `ADB_DEVICE_ID` is set, checks for that specific device; otherwise any device suffices.
 */
export async function isConnected(): Promise<boolean> {
  logger.debug('adb: checking connection');
  const devices = await listDevices();

  if (env.ADB_DEVICE_ID) {
    const found = devices.includes(env.ADB_DEVICE_ID);
    logger.debug({ deviceId: env.ADB_DEVICE_ID, found }, 'adb: specific device check');
    return found;
  }

  const connected = devices.length > 0;
  logger.debug({ connected }, 'adb: any device check');
  return connected;
}

/**
 * Tap at the given screen coordinates.
 */
export async function tap(x: number, y: number): Promise<void> {
  logger.debug({ x, y }, 'adb: tap');
  await exec(['shell', 'input', 'tap', String(x), String(y)]);
}

/**
 * Open a URL on the device via an ACTION_VIEW intent.
 */
export async function openUrl(url: string): Promise<void> {
  logger.debug({ url }, 'adb: opening url');
  await exec(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url]);
}

/**
 * Return the current foreground package/activity name.
 */
export async function currentApp(): Promise<string> {
  logger.debug('adb: getting current app');
  const output = await exec(['shell', 'dumpsys', 'window', 'displays', '|', 'grep', '-E', 'mCurrentFocus|mFocusedApp']);

  // Typical output line:
  //   mCurrentFocus=Window{abc1234 u0 com.example.app/com.example.app.MainActivity}
  //   mFocusedApp=ActivityRecord{abc5678 u0 com.example.app/com.example.app.MainActivity t42}
  const match = output.match(/(?:mCurrentFocus|mFocusedApp)=.*\s+([^\s{}]+\/[^\s{}]+)/);
  const result = match?.[1] ?? output.trim();

  logger.debug({ currentApp: result }, 'adb: current app');
  return result;
}

/**
 * Capture a screenshot and return the raw PNG buffer.
 *
 * Uses `execFile` directly (not promisified) with `encoding: 'buffer'`
 * to preserve binary PNG data from stdout.
 */
export function screenshot(): Promise<Buffer> {
  logger.debug('adb: taking screenshot');
  const args = buildArgs(['shell', 'screencap', '-p']);

  return new Promise<Buffer>((resolve, reject) => {
    execFileCb('adb', args, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        const stderr = (error as unknown as { stderr?: Buffer }).stderr;
        reject(
          new AdbError(`ADB screenshot failed`, `adb ${args.join(' ')}`, stderr ? stderr.toString() : error.message),
        );
        return;
      }
      logger.debug({ bytes: stdout.byteLength }, 'adb: screenshot captured');
      resolve(stdout);
    });
  });
}
