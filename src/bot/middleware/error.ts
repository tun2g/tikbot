import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

export const errorMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    logger.error({ err, updateType: ctx.updateType }, 'Unhandled error in update processing');

    try {
      await ctx.reply('Something went wrong. Please try again later.');
    } catch (replyErr) {
      logger.error({ err: replyErr }, 'Failed to send error reply to user');
    }
  }
};
