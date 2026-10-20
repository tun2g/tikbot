import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { env } from '@/config/env.js';
import { formatWatchConfirmation, formatAlreadyWatching } from '@/utils/format.js';
import { commandArg, isAlertsChat } from '@/bot/utils/index.js';

export const watchCommand = new Composer<BotContext>();

watchCommand.command('watch', async (ctx) => {
  const input = commandArg(ctx.message.text);
  if (!input) {
    await ctx.reply('Usage: /watch &lt;username&gt;\nExample: /watch khaby.lame', { parse_mode: 'HTML' });
    return;
  }

  // The TikTok lookup can take a few seconds.
  await ctx.sendChatAction('typing');

  const res = await ctx.tiktokService.addUser(input, ctx.from.id);
  if (res.result === 'exists') {
    await ctx.reply(formatAlreadyWatching(res.username), { parse_mode: 'HTML' });
    return;
  }

  const alertsChat = isAlertsChat(ctx) ? null : await ctx.notifications.getChatTitle();
  await ctx.reply(formatWatchConfirmation(res.username, res.check, alertsChat, env.POLL_INTERVAL_MS), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
});
