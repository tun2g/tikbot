import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { formatWatchConfirmation, formatAlreadyWatching } from '@/utils/format.js';

export const watchCommand = new Composer<BotContext>();

watchCommand.command('watch', async (ctx) => {
  const username = ctx.message.text.split(/\s+/)[1];
  if (!username) {
    await ctx.reply('Usage: /watch &lt;username&gt;', { parse_mode: 'HTML' });
    return;
  }

  const result = await ctx.tiktokService.addUser(username, ctx.from.id);
  if (result === 'exists') {
    await ctx.reply(formatAlreadyWatching(username), { parse_mode: 'HTML' });
  } else {
    await ctx.reply(formatWatchConfirmation(username), { parse_mode: 'HTML' });
  }
});
