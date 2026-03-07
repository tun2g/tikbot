export type { DeviceDriver, DeviceConfig } from './types.js';
export { createAdbDriver, AdbError } from './adb.js';
export { createWdaDriver, WdaError } from './wda.js';

import type { DeviceDriver, DeviceConfig } from './types.js';
import { createAdbDriver } from './adb.js';
import { createWdaDriver } from './wda.js';

/**
 * Factory — create a DeviceDriver based on the given config.
 */
export function createDevice(config: DeviceConfig): DeviceDriver {
  switch (config.type) {
    case 'adb':
      return createAdbDriver(config.deviceId);
    case 'wda':
      return createWdaDriver(config.wdaUrl);
    default:
      throw new Error(`Unknown device type: ${String((config as DeviceConfig).type)}`);
  }
}
