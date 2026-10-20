import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { EnvelopeEvent } from '@/db/models/index.js';
import { formatStatus } from '@/utils/format.js';
import { getAutoClaimLine } from '@/bot/utils/index.js';

const startedAt = Date.now();

export const statusCommand = new Composer<BotContext>();

statusCommand.command('status', async (ctx) => {
  const cm = ctx.connectionManager;
  const [users, pending, autoClaimLine] = await Promise.all([
    ctx.tiktokService.listUsers(),
    EnvelopeEvent.countDocuments({ claimStatus: 'tracking', unpackAt: { $gt: new Date() } }),
    getAutoClaimLine(ctx),
  ]);

  await ctx.reply(
    formatStatus({
      uptimeSeconds: (Date.now() - startedAt) / 1000,
      memMB: (process.memoryUsage.rss() / 1_048_576).toFixed(1),
      watched: users.length,
      live: cm.liveCount,
      serviceError: cm.serviceError,
      autoClaimLine,
      pending,
    }),
    { parse_mode: 'HTML' },
  );
});
