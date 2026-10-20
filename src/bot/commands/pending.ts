import { Composer, Markup } from 'telegraf';
import { isValidObjectId } from 'mongoose';
import type { BotContext } from '@/types/index.js';
import { EnvelopeEvent } from '@/db/models/index.js';
import { formatPendingList, formatCancelConfirm, esc, type PendingEntry } from '@/utils/format.js';

// Callback data uses the Mongo _id (24 hex chars) so it always fits Telegram's 64-byte limit:
//   pc:<id>   → ask to cancel      pcy:<id> → confirm cancel      pck → keep, back to list

const PENDING_LIMIT = 10;

type PendingRow = PendingEntry & { id: string };

const toEntry = (doc: {
  _id: unknown;
  envelopeId: string;
  username: string;
  diamondCount: number;
  unpackAt?: Date | null;
  autoClaim?: boolean | null;
}): PendingRow => ({
  id: String(doc._id),
  envelopeId: doc.envelopeId,
  username: doc.username,
  diamondCount: doc.diamondCount,
  unpackAt: doc.unpackAt ?? new Date(),
  autoClaim: doc.autoClaim ?? false,
});

async function loadPending(): Promise<PendingRow[]> {
  const docs = await EnvelopeEvent.find({ claimStatus: 'tracking', unpackAt: { $gt: new Date() } })
    .sort({ unpackAt: 1 })
    .limit(PENDING_LIMIT)
    .lean();
  return docs.map(toEntry);
}

async function loadOne(id: string): Promise<PendingRow | null> {
  if (!isValidObjectId(id)) return null;
  const doc = await EnvelopeEvent.findOne({ _id: id, claimStatus: 'tracking', unpackAt: { $gt: new Date() } }).lean();
  return doc ? toEntry(doc) : null;
}

function renderList(entries: PendingRow[]) {
  const keyboard = entries.length
    ? Markup.inlineKeyboard(
        entries.map((e, i) => Markup.button.callback(`✖ ${i + 1}`, `pc:${e.id}`)),
        { columns: 5 },
      )
    : undefined;
  return { text: formatPendingList(entries), extra: { parse_mode: 'HTML' as const, ...keyboard } };
}

const GONE_TEXT = 'This box already opened or was cancelled.';

export const pendingCommand = new Composer<BotContext>();

pendingCommand.command('pending', async (ctx) => {
  const { text, extra } = renderList(await loadPending());
  await ctx.reply(text, extra);
});

pendingCommand.action(/^pc:(.+)$/, async (ctx) => {
  const entry = await loadOne(ctx.match[1]!);
  await ctx.answerCbQuery();
  if (!entry) {
    await ctx.editMessageText(GONE_TEXT, { parse_mode: 'HTML' });
    return;
  }
  await ctx.editMessageText(formatCancelConfirm(entry), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      Markup.button.callback('Yes, cancel', `pcy:${entry.id}`),
      Markup.button.callback('Keep it', 'pck'),
    ]),
  });
});

pendingCommand.action(/^pcy:(.+)$/, async (ctx) => {
  const id = ctx.match[1]!;
  const doc = isValidObjectId(id) ? await EnvelopeEvent.findById(id).lean() : null;
  const outcome = doc ? await ctx.connectionManager.cancelEnvelope(doc.envelopeId) : 'not-found';
  await ctx.answerCbQuery();

  const text =
    outcome === 'cancelled'
      ? `✖ Cancelled @${esc(doc!.username)}'s box — no reminder or auto-claim will run.`
      : outcome === 'already-running'
        ? "⚠️ The device is already claiming this box — it can't be cancelled now."
        : GONE_TEXT;
  await ctx.editMessageText(text, { parse_mode: 'HTML' });
});

pendingCommand.action('pck', async (ctx) => {
  await ctx.answerCbQuery();
  const { text, extra } = renderList(await loadPending());
  await ctx.editMessageText(text, extra);
});
