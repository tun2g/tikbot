import type { BotContext } from '@/types/index.js';
import { env, autoClaim } from '@/config/env.js';
import { autoClaimLineOn, autoClaimLineNoDevice, autoClaimLineOff } from '@/utils/format.js';

/** Same normalization TikTokService applies to watched usernames. */
export const normalizeUsername = (username: string): string => username.toLowerCase().replace(/^@/, '');

/** First argument after the command, e.g. "/watch @foo" → "@foo". */
export const commandArg = (text: string): string | undefined => text.split(/\s+/)[1] || undefined;

export const isAlertsChat = (ctx: BotContext): boolean => String(ctx.chat?.id) === env.ADMIN_CHAT_ID;

export async function getAutoClaimLine(ctx: BotContext): Promise<string> {
  if (!autoClaim.enabled) return autoClaimLineOff(autoClaim.disabledReason ?? 'disabled');
  return (await ctx.deviceDriver.isConnected()) ? autoClaimLineOn : autoClaimLineNoDevice;
}

export const NO_DEVICE_TEXT = '❌ No device connected. Check the USB/WebDriverAgent connection, then run /device.';
