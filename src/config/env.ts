const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const parseBool = (value: string | undefined): boolean => value === 'true' || value === '1';

export const env = {
  BOT_TOKEN: required('BOT_TOKEN'),
  ADMIN_CHAT_ID: required('ADMIN_CHAT_ID'),
  MONGODB_URI: process.env['MONGODB_URI'] ?? 'mongodb://mongo:27017/tikbot',
  TIKTOK_SIGN_API_KEY: process.env['TIKTOK_SIGN_API_KEY'] ?? '',
  POLL_INTERVAL_MS: Number(process.env['POLL_INTERVAL_MS'] ?? 60_000),
  TREASURE_BOX_ALERT_BEFORE_MS: Number(process.env['TREASURE_BOX_ALERT_BEFORE_MS'] ?? 60_000),
  LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',

  // Device auto-claim
  DEVICE_ENABLED: parseBool(process.env['DEVICE_ENABLED']),
  DEVICE_TYPE: (process.env['DEVICE_TYPE'] ?? 'adb') as 'adb' | 'wda',
  DEVICE_ID: process.env['DEVICE_ID'] ?? '',
  DEVICE_TAP_X: Number(process.env['DEVICE_TAP_X'] ?? 0),
  DEVICE_TAP_Y: Number(process.env['DEVICE_TAP_Y'] ?? 0),
  DEVICE_OPEN_X: Number(process.env['DEVICE_OPEN_X'] ?? 0),
  DEVICE_OPEN_Y: Number(process.env['DEVICE_OPEN_Y'] ?? 0),
  DEVICE_OPEN_DELAY_MS: Number(process.env['DEVICE_OPEN_DELAY_MS'] ?? 1_000),
  DEVICE_PRE_CLAIM_MS: Number(process.env['DEVICE_PRE_CLAIM_MS'] ?? 10_000),
  DEVICE_NAV_DELAY_MS: Number(process.env['DEVICE_NAV_DELAY_MS'] ?? 3_000),
  DEVICE_CLAIM_OFFSET_MS: Number(process.env['DEVICE_CLAIM_OFFSET_MS'] ?? 200),
  DEVICE_WDA_URL: process.env['DEVICE_WDA_URL'] ?? 'http://localhost:8100',
};

// Startup validation: disable device if tap coordinates are not configured
if (env.DEVICE_ENABLED && env.DEVICE_TAP_X === 0 && env.DEVICE_TAP_Y === 0) {
  console.warn('DEVICE_ENABLED is true but DEVICE_TAP_X and DEVICE_TAP_Y are both 0 — disabling auto-claim');
  env.DEVICE_ENABLED = false;
}
