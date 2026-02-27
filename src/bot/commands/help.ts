import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';

export const helpCommand = new Composer<BotContext>();

helpCommand.command('help', async (ctx) => {
  await ctx.reply(
    [
      '📖 <b>Available Commands</b>',
      '',
      '/watch &lt;username&gt; — Start monitoring a TikToker',
      '/unwatch &lt;username&gt; — Stop monitoring a TikToker',
      '/list — Show all watched users',
      '/status — Bot health and stats',
      '/help — Show this message',
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
});
