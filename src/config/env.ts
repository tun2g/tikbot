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

  // ADB auto-claim
  ADB_ENABLED: parseBool(process.env['ADB_ENABLED']),
  ADB_DEVICE_ID: process.env['ADB_DEVICE_ID'] ?? '',
  ADB_TAP_X: Number(process.env['ADB_TAP_X'] ?? 0),
  ADB_TAP_Y: Number(process.env['ADB_TAP_Y'] ?? 0),
  ADB_PRE_CLAIM_MS: Number(process.env['ADB_PRE_CLAIM_MS'] ?? 10_000),
  ADB_NAV_DELAY_MS: Number(process.env['ADB_NAV_DELAY_MS'] ?? 3_000),
  ADB_CLAIM_OFFSET_MS: Number(process.env['ADB_CLAIM_OFFSET_MS'] ?? 200),
};

// Startup validation: disable ADB if tap coordinates are not configured
if (env.ADB_ENABLED && env.ADB_TAP_X === 0 && env.ADB_TAP_Y === 0) {
  console.warn('ADB_ENABLED is true but ADB_TAP_X and ADB_TAP_Y are both 0 — disabling ADB auto-claim');
  env.ADB_ENABLED = false;
}
