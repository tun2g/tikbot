import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { EnvelopeEvent } from '@/db/models/index.js';
import { formatStats, type StatsRow } from '@/utils/format.js';
import { commandArg } from '@/bot/utils/index.js';

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

const countIf = (status: string) => ({ $sum: { $cond: [{ $eq: ['$claimStatus', status] }, 1, 0] } });

export const statsCommand = new Composer<BotContext>();

statsCommand.command('stats', async (ctx) => {
  const parsed = Number.parseInt(commandArg(ctx.message.text) ?? '', 10);
  const days = Number.isNaN(parsed) ? DEFAULT_DAYS : Math.min(MAX_DAYS, Math.max(1, parsed));
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await EnvelopeEvent.aggregate<StatsRow & { _id: string }>([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: '$username',
        seen: { $sum: 1 },
        attempted: countIf('attempted'),
        failed: countIf('failed'),
        missed: countIf('lost'),
        totalCoins: { $sum: '$diamondCount' },
      },
    },
    { $sort: { seen: -1, _id: 1 } },
    { $project: { _id: 0, username: '$_id', seen: 1, attempted: 1, failed: 1, missed: 1, totalCoins: 1 } },
  ]);

  await ctx.reply(formatStats(rows, days), { parse_mode: 'HTML' });
});
