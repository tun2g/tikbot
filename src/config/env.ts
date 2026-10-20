const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

/** Read an env var, treating an empty string as unset. */
const optional = (key: string): string | undefined => process.env[key] || undefined;

const num = (key: string, fallback: number): number => {
  const raw = optional(key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`Environment variable ${key} must be a number, got "${raw}"`);
  return value;
};

const parseBool = (value: string | undefined): boolean => value === 'true' || value === '1';

export const env = {
  BOT_TOKEN: required('BOT_TOKEN'),
  ADMIN_CHAT_ID: required('ADMIN_CHAT_ID'),
  MONGODB_URI: optional('MONGODB_URI') ?? 'mongodb://mongo:27017/tikbot',
  TIKTOK_SIGN_API_KEY: optional('TIKTOK_SIGN_API_KEY') ?? '',
  POLL_INTERVAL_MS: num('POLL_INTERVAL_MS', 60_000),
  TREASURE_BOX_ALERT_BEFORE_MS: num('TREASURE_BOX_ALERT_BEFORE_MS', 60_000),
  LOG_LEVEL: optional('LOG_LEVEL') ?? 'info',

  // Device auto-claim
  DEVICE_ENABLED: parseBool(optional('DEVICE_ENABLED')),
  DEVICE_TYPE: (optional('DEVICE_TYPE') ?? 'adb') as 'adb' | 'wda',
  DEVICE_ID: optional('DEVICE_ID') ?? '',
  /** Treasure box icon on the live screen — first tap. */
  DEVICE_BOX_ICON_X: num('DEVICE_BOX_ICON_X', 0),
  DEVICE_BOX_ICON_Y: num('DEVICE_BOX_ICON_Y', 0),
  /** "Open" button inside the treasure box popup — second tap. */
  DEVICE_OPEN_BUTTON_X: num('DEVICE_OPEN_BUTTON_X', 0),
  DEVICE_OPEN_BUTTON_Y: num('DEVICE_OPEN_BUTTON_Y', 0),
  DEVICE_OPEN_DELAY_MS: num('DEVICE_OPEN_DELAY_MS', 1_000),
  DEVICE_PRE_CLAIM_MS: num('DEVICE_PRE_CLAIM_MS', 10_000),
  DEVICE_NAV_DELAY_MS: num('DEVICE_NAV_DELAY_MS', 3_000),
  DEVICE_WDA_URL: optional('DEVICE_WDA_URL') ?? 'http://localhost:8100',
};

// ---------------------------------------------------------------------------
// Auto-claim availability — surfaced to users via /device and the startup message
// ---------------------------------------------------------------------------

const autoClaimDisabledReason = (): string | null => {
  if (!env.DEVICE_ENABLED) return 'DEVICE_ENABLED is not set to true';
  if (env.DEVICE_BOX_ICON_X === 0 && env.DEVICE_BOX_ICON_Y === 0) {
    return 'treasure box icon position (DEVICE_BOX_ICON_X/Y) is not set';
  }
  if (env.DEVICE_OPEN_BUTTON_X === 0 && env.DEVICE_OPEN_BUTTON_Y === 0) {
    return '"Open" button position (DEVICE_OPEN_BUTTON_X/Y) is not set';
  }
  return null;
};

const disabledReason = autoClaimDisabledReason();

export const autoClaim = {
  enabled: disabledReason === null,
  disabledReason,
};
