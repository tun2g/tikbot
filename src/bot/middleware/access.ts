import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';

const CACHE_TTL_MS = 5 * 60_000;
const DENIED_TEXT = '🔒 This bot is private. Ask the owner to add you to the alerts chat.';

/** userId → { allowed, expiresAt } — avoids a getChatMember call on every private message. */
const memberCache = new Map<number, { allowed: boolean; expiresAt: number }>();

async function isAlertsChatMember(ctx: BotContext, userId: number): Promise<boolean> {
  // The alerts chat may be the owner's private chat with the bot.
  if (String(userId) === env.ADMIN_CHAT_ID) return true;

  const cached = memberCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  let allowed = false;
  try {
    const member = await ctx.telegram.getChatMember(env.ADMIN_CHAT_ID, userId);
    allowed =
      member.status === 'creator' ||
      member.status === 'administrator' ||
      member.status === 'member' ||
      (member.status === 'restricted' && member.is_member);
  } catch (err) {
    // Telegram errors when the user was never in the chat — treat as not a member.
    logger.debug({ err, userId }, 'getChatMember failed during access check');
  }

  memberCache.set(userId, { allowed, expiresAt: Date.now() + CACHE_TTL_MS });
  return allowed;
}

/**
 * Only the alerts chat (ADMIN_CHAT_ID) and its members (in private chats) may use the bot.
 * Registered before the session middleware so strangers never create User rows.
 */
export const accessMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const chat = ctx.chat;
  const from = ctx.from;

  if (chat && String(chat.id) === env.ADMIN_CHAT_ID) return next();

  if (chat?.type === 'private' && from && (await isAlertsChatMember(ctx, from.id))) return next();

  logger.warn(
    { userId: from?.id, username: from?.username, chatId: chat?.id, chatType: chat?.type, updateType: ctx.updateType },
    'Access denied',
  );

  if (chat?.type !== 'private') return; // other groups/channels: ignore silently

  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(DENIED_TEXT, { show_alert: true });
    } else if (ctx.message) {
      await ctx.reply(DENIED_TEXT);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send access-denied reply');
  }
};
