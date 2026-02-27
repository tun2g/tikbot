import crypto from 'node:crypto';
import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '@/types/index.js';

export const requestIdMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  ctx.requestId = crypto.randomUUID();
  return next();
};
