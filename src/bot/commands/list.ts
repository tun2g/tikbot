import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { env } from '@/config/env.js';
import { formatWatchList } from '@/utils/format.js';

export const listCommand = new Composer<BotContext>();

listCommand.command('list', async (ctx) => {
  const users = await ctx.tiktokService.listUsers();
  await ctx.reply(formatWatchList(users, env.POLL_INTERVAL_MS), { parse_mode: 'HTML' });
});
