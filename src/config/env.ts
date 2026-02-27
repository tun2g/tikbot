const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const env = {
  BOT_TOKEN: required('BOT_TOKEN'),
  ADMIN_CHAT_ID: required('ADMIN_CHAT_ID'),
  MONGODB_URI: process.env['MONGODB_URI'] ?? 'mongodb://mongo:27017/tikbot',
  TIKTOK_SIGN_API_KEY: process.env['TIKTOK_SIGN_API_KEY'] ?? '',
  POLL_INTERVAL_MS: Number(process.env['POLL_INTERVAL_MS'] ?? 60_000),
  TREASURE_BOX_ALERT_BEFORE_MS: Number(process.env['TREASURE_BOX_ALERT_BEFORE_MS'] ?? 60_000),
  LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
} as const;
