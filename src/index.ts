import { Telegraf } from 'telegraf';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { connectDB, disconnectDB } from '@/db/connection.js';
import { NotificationService } from '@/services/notification.service.js';
import { ConnectionManager } from '@/pkgs/tiktok/connection-manager.js';
import { TikTokService } from '@/services/tiktok.service.js';
import { ClaimService } from '@/pkgs/adb/claim.service.js';
import { createBot } from '@/bot/index.js';

async function main(): Promise<void> {
  await connectDB();

  // Create a bare Telegraf to get the Telegram API client
  const telegram = new Telegraf(env.BOT_TOKEN).telegram;

  const notifications = new NotificationService(telegram);
  const claimService = new ClaimService(notifications);
  await claimService.initialize();
  const connectionManager = new ConnectionManager(notifications, claimService);
  const tiktokService = new TikTokService(connectionManager);

  const bot = createBot({
    token: env.BOT_TOKEN,
    tiktokService,
    connectionManager,
    claimService,
  });

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
