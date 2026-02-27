import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';

export const listCommand = new Composer<BotContext>();

listCommand.command('list', async (ctx) => {
  const users = await ctx.tiktokService.listUsers();

  if (users.length === 0) {
    await ctx.reply('📋 No users being watched. Use /watch &lt;username&gt; to add one.', {
      parse_mode: 'HTML',
    });
    return;
  }

  const lines = users.map((u) => {
    const status = u.isLive ? '🔴 LIVE' : '⚫ Offline';
    return `• <b>@${u.username}</b> — ${status}`;
  });

  await ctx.reply([`📋 <b>Watched Users (${users.length})</b>`, '', ...lines].join('\n'), { parse_mode: 'HTML' });
});
