import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';

export const startCommand = new Composer<BotContext>();

startCommand.command('start', async (ctx) => {
  await ctx.reply(
    [
      '👋 <b>Welcome to TikBot!</b>',
      '',
      'I monitor TikTok Live streams and notify you about treasure boxes (coin drops).',
      '',
      'Use /help to see available commands.',
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
});
