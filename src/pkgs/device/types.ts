export interface DeviceDriver {
  /** Check whether the device is reachable. */
  isConnected(): Promise<boolean>;

  /** Tap at the given screen coordinates. */
  tap(x: number, y: number): Promise<void>;

  /** Open a URL on the device. */
  openUrl(url: string): Promise<void>;

  /** Return a description of the current foreground app. */
  currentApp(): Promise<string>;

  /** Capture a screenshot and return the raw PNG buffer. */
  screenshot(): Promise<Buffer>;
}

export interface DeviceConfig {
  type: 'adb' | 'wda';
  /** ADB device serial (ADB only). */
  deviceId?: string;
  /** WDA base URL (WDA only). */
  wdaUrl?: string;
}
