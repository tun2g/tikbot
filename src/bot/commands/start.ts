import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { esc } from '@/utils/format.js';
import { isAlertsChat } from '@/bot/utils/index.js';

export const startCommand = new Composer<BotContext>();

startCommand.command('start', async (ctx) => {
  const where = isAlertsChat(ctx)
    ? 'Alerts are posted <b>here</b>, in this chat.'
    : `Alerts are posted in <b>${esc(await ctx.notifications.getChatTitle())}</b>, not in this private chat.`;

  await ctx.reply(
    [
      '👋 <b>Welcome to TikBot!</b>',
      '',
      'I watch TikTok Live streams and alert you when a treasure box (coin drop) appears, with a reminder just before it opens. If a phone is connected, I can also tap the box for you.',
      '',
      where,
      '',
      'Start with /watch &lt;username&gt;. See /help for all commands.',
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
});
