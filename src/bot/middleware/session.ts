import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { User } from '@/db/models/index.js';

export const sessionMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (ctx.from) {
    const user = await User.findOrCreate({
      userId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    });

    ctx.session = {
      userId: user.userId,
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      lastActivity: user.lastActivity,
    };
  }

  return next();
};
