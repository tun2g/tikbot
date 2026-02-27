import { Telegraf } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import type { TikTokService } from '@/services/tiktok.service.js';
import type { ConnectionManager } from '@/tiktok/connection-manager.js';
import { errorMiddleware, requestIdMiddleware, loggerMiddleware, sessionMiddleware } from '@/bot/middleware/index.js';
import {
  startCommand,
  helpCommand,
  watchCommand,
  unwatchCommand,
  listCommand,
  statusCommand,
} from '@/bot/commands/index.js';

interface CreateBotOptions {
  token: string;
  tiktokService: TikTokService;
  connectionManager: ConnectionManager;
}

export function createBot({ token, tiktokService, connectionManager }: CreateBotOptions): Telegraf<BotContext> {
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
    return next();
  });

  // Register commands
  bot.use(startCommand);
  bot.use(helpCommand);
  bot.use(watchCommand);
  bot.use(unwatchCommand);
  bot.use(listCommand);
  bot.use(statusCommand);

  // Register command menu with Telegram
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show available commands' },
    { command: 'watch', description: 'Watch a TikToker — /watch <username>' },
    { command: 'unwatch', description: 'Stop watching — /unwatch <username>' },
    { command: 'list', description: 'List all watched users' },
    { command: 'status', description: 'Bot health and stats' },
  ]);

  return bot;
}
