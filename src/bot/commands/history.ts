import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { EnvelopeEvent } from '@/db/models/index.js';
import { formatHistory, type HistoryEntry } from '@/utils/format.js';
import { commandArg, normalizeUsername } from '@/bot/utils/index.js';

const HISTORY_LIMIT = 15;

export const historyCommand = new Composer<BotContext>();

historyCommand.command('history', async (ctx) => {
  const input = commandArg(ctx.message.text);
  const username = input ? normalizeUsername(input) : undefined;

  const docs = await EnvelopeEvent.find(username ? { username } : {})
    .sort({ timestamp: -1 })
    .limit(HISTORY_LIMIT)
    .lean();

  const entries: HistoryEntry[] = docs.map((d) => ({
    username: d.username,
    diamondCount: d.diamondCount,
    timestamp: d.timestamp,
    claimStatus: d.claimStatus,
    claimNote: d.claimNote,
  }));

  await ctx.reply(formatHistory(entries, username), { parse_mode: 'HTML' });
});
