import { Telegraf } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import type { TikTokService } from '@/services/tiktok.service.js';
import type { ConnectionManager } from '@/pkgs/tiktok/connection-manager.js';
import type { ClaimService } from '@/services/claim.service.js';
import type { DeviceDriver } from '@/pkgs/device/types.js';
import { errorMiddleware, requestIdMiddleware, loggerMiddleware, sessionMiddleware } from '@/bot/middleware/index.js';
import {
  startCommand,
  helpCommand,
  watchCommand,
  unwatchCommand,
  listCommand,
  statusCommand,
  deviceCommand,
  deviceTapCommand,
  deviceScreenshotCommand,
} from '@/bot/commands/index.js';

interface CreateBotOptions {
  token: string;
  tiktokService: TikTokService;
  connectionManager: ConnectionManager;
  claimService: ClaimService;
  deviceDriver: DeviceDriver;
}

export function createBot({
  token,
  tiktokService,
  connectionManager,
  claimService,
  deviceDriver,
}: CreateBotOptions): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(token);

  // Middleware pipeline
  bot.use(errorMiddleware);
  bot.use(requestIdMiddleware);
  bot.use(loggerMiddleware);
  bot.use(sessionMiddleware);

  // Inject services into context
  bot.use((ctx, next) => {
    ctx.tiktokService = tiktokService;
    ctx.connectionManager = connectionManager;
    ctx.claimService = claimService;
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
  bot.use(deviceCommand);
  bot.use(deviceTapCommand);
  bot.use(deviceScreenshotCommand);

  // Register command menu with Telegram
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show available commands' },
    { command: 'watch', description: 'Watch a TikToker — /watch <username>' },
    { command: 'unwatch', description: 'Stop watching — /unwatch <username>' },
    { command: 'list', description: 'List all watched users' },
    { command: 'status', description: 'Bot health and stats' },
    { command: 'device', description: 'Show device status' },
    { command: 'device_tap', description: 'Test tap at configured coordinates' },
    { command: 'device_screenshot', description: 'Take a screenshot of the device' },
  ]);

  return bot;
}
