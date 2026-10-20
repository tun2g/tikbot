import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { formatUnwatchConfirmation, formatUserNotFound } from '@/utils/format.js';
import { commandArg } from '@/bot/utils/index.js';

export const unwatchCommand = new Composer<BotContext>();

unwatchCommand.command('unwatch', async (ctx) => {
  const input = commandArg(ctx.message.text);
  if (!input) {
    await ctx.reply('Usage: /unwatch &lt;username&gt;\nExample: /unwatch khaby.lame', { parse_mode: 'HTML' });
    return;
  }

  const res = await ctx.tiktokService.removeUser(input);
  if (res.removed) {
    await ctx.reply(formatUnwatchConfirmation(res.username, res.cancelledBoxes), { parse_mode: 'HTML' });
  } else {
    await ctx.reply(formatUserNotFound(res.username), { parse_mode: 'HTML' });
  }
});
