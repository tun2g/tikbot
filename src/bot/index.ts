import { Telegraf } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import type { TikTokService } from '@/services/tiktok.service.js';
import type { ConnectionManager } from '@/pkgs/tiktok/connection-manager.js';
import type { ClaimService } from '@/services/claim.service.js';
import type { NotificationService } from '@/services/notification.service.js';
import type { DeviceDriver } from '@/pkgs/device/types.js';
import { logger } from '@/utils/logger.js';
import {
  errorMiddleware,
  accessMiddleware,
  requestIdMiddleware,
  loggerMiddleware,
  sessionMiddleware,
} from '@/bot/middleware/index.js';
import {
  COMMANDS,
  startCommand,
  helpCommand,
  watchCommand,
  unwatchCommand,
  listCommand,
  statusCommand,
  pendingCommand,
  historyCommand,
  statsCommand,
  deviceCommand,
  deviceTestCommand,
  deviceScreenshotCommand,
} from '@/bot/commands/index.js';

interface CreateBotOptions {
  token: string;
  tiktokService: TikTokService;
  connectionManager: ConnectionManager;
  claimService: ClaimService;
  notifications: NotificationService;
  deviceDriver: DeviceDriver;
}

export function createBot({
  token,
  tiktokService,
  connectionManager,
  claimService,
  notifications,
  deviceDriver,
}: CreateBotOptions): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(token);

  // Middleware pipeline — access control runs before session so strangers never create User rows
  bot.use(errorMiddleware);
  bot.use(accessMiddleware);
  bot.use(requestIdMiddleware);
  bot.use(loggerMiddleware);
  bot.use(sessionMiddleware);

  // Inject services into context
  bot.use((ctx, next) => {
    ctx.tiktokService = tiktokService;
    ctx.connectionManager = connectionManager;
    ctx.claimService = claimService;
    ctx.notifications = notifications;
    ctx.deviceDriver = deviceDriver;
    return next();
  });

  // Register commands
  bot.use(startCommand);
  bot.use(helpCommand);
  bot.use(watchCommand);
  bot.use(unwatchCommand);
  bot.use(listCommand);
  bot.use(statusCommand);
  bot.use(pendingCommand);
  bot.use(historyCommand);
  bot.use(statsCommand);
  bot.use(deviceCommand);
  bot.use(deviceTestCommand);
  bot.use(deviceScreenshotCommand);

  // Register command menu with Telegram (same list as /help)
  bot.telegram
    .setMyCommands(
      COMMANDS.flatMap(({ commands }) => commands).map((c) => ({
        command: c.command,
        description: c.args ? `${c.description} — /${c.command} ${c.args}` : c.description,
      })),
    )
    .catch((err: unknown) => logger.error({ err }, 'Failed to register bot command menu'));

  return bot;
}
