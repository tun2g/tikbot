import { Telegraf } from 'telegraf';
import { env, autoClaim } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { connectDB, disconnectDB } from '@/db/connection.js';
import { NotificationService } from '@/services/notification.service.js';
import { ConnectionManager } from '@/pkgs/tiktok/connection-manager.js';
import { TikTokService } from '@/services/tiktok.service.js';
import { createDevice, type DeviceDriver } from '@/pkgs/device/index.js';
import { ClaimService } from '@/services/claim.service.js';
import { createBot } from '@/bot/index.js';
import { formatStartup, autoClaimLineOn, autoClaimLineNoDevice, autoClaimLineOff } from '@/utils/format.js';

async function startupAutoClaimLine(deviceDriver: DeviceDriver): Promise<string> {
  if (!autoClaim.enabled) {
    logger.info({ reason: autoClaim.disabledReason }, 'Device auto-claim disabled');
    return autoClaimLineOff(autoClaim.disabledReason!);
  }
  const connected = await deviceDriver.isConnected().catch(() => false);
  if (connected) logger.info('Device connected, auto-claim ready');
  else logger.warn('Auto-claim enabled but no device connected');
  return connected ? autoClaimLineOn : autoClaimLineNoDevice;
}

async function main(): Promise<void> {
  await connectDB();

  // Create a bare Telegraf to get the Telegram API client
  const telegram = new Telegraf(env.BOT_TOKEN).telegram;

  const deviceDriver = createDevice({
    type: env.DEVICE_TYPE,
    deviceId: env.DEVICE_ID || undefined,
    wdaUrl: env.DEVICE_WDA_URL,
  });

  const notifications = new NotificationService(telegram);
  const claimService = new ClaimService(notifications, deviceDriver);
  const connectionManager = new ConnectionManager(notifications, claimService);
  const tiktokService = new TikTokService(connectionManager);

  const bot = createBot({
    token: env.BOT_TOKEN,
    tiktokService,
    connectionManager,
    claimService,
    deviceDriver,
    notifications,
  });

  await notifications.send(formatStartup(await startupAutoClaimLine(deviceDriver)));
  await connectionManager.restorePending();
  connectionManager.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    bot.stop(signal);
    connectionManager.stop();
    await disconnectDB();
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await bot.launch(() => {
    logger.info('Bot started — listening for updates');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
