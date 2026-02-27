import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';

const startedAt = Date.now();

export const statusCommand = new Composer<BotContext>();

statusCommand.command('status', async (ctx) => {
  const uptimeMs = Date.now() - startedAt;
  const uptimeH = Math.floor(uptimeMs / 3_600_000);
  const uptimeM = Math.floor((uptimeMs % 3_600_000) / 60_000);
  const memMB = (process.memoryUsage.rss() / 1_048_576).toFixed(1);

  const cm = ctx.connectionManager;

  await ctx.reply(
    [
      '🤖 <b>Bot Status</b>',
      '',
      `⏱ Uptime: <b>${uptimeH}h ${uptimeM}m</b>`,
      `🧠 Memory: <b>${memMB} MB</b>`,
      `🔗 Connections: <b>${cm.liveCount} live / ${cm.connectionCount} total</b>`,
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
});
