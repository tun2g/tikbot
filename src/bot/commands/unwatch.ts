import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { formatUnwatchConfirmation, formatUserNotFound } from '@/utils/format.js';

export const unwatchCommand = new Composer<BotContext>();

unwatchCommand.command('unwatch', async (ctx) => {
  const username = ctx.message.text.split(/\s+/)[1];
  if (!username) {
    await ctx.reply('Usage: /unwatch &lt;username&gt;', { parse_mode: 'HTML' });
    return;
  }

  const removed = await ctx.tiktokService.removeUser(username);
  if (removed) {
    await ctx.reply(formatUnwatchConfirmation(username), { parse_mode: 'HTML' });
  } else {
    await ctx.reply(formatUserNotFound(username), { parse_mode: 'HTML' });
  }
});
