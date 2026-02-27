import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

export const loggerMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const rid = ctx.requestId;
  const user = ctx.from;
  const chat = ctx.chat;
  const tag = `@${user?.username ?? user?.id ?? 'unknown'}`;
  const chatInfo = chat ? `chat=${chat.id}(${chat.type})` : '';

  logger.info(`===== INCOMING REQUEST [${rid}] | ${ctx.updateType} | ${tag} | ${chatInfo}`);

  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  logger.info(`===== OUTGOING RESPONSE [${rid}] | ${ctx.updateType} | ${tag} | ${duration}ms`);
};
