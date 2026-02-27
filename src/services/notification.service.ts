import type { Telegram } from 'telegraf';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';

export class NotificationService {
  constructor(private readonly telegram: Telegram) {}

  async send(html: string): Promise<number | undefined> {
    logger.info(`===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Sending message`);
    try {
      const msg = await this.telegram.sendMessage(env.ADMIN_CHAT_ID, html, { parse_mode: 'HTML' });
      logger.info(`===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Sent successfully (msgId=${msg.message_id})`);
      return msg.message_id;
    } catch (err) {
      logger.error({ err }, `===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Failed to send`);
      return undefined;
    }
  }

  async reply(replyToMessageId: number, html: string): Promise<number | undefined> {
    logger.info(`===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Replying to msgId=${replyToMessageId}`);
    try {
      const msg = await this.telegram.sendMessage(env.ADMIN_CHAT_ID, html, {
        parse_mode: 'HTML',
        reply_parameters: { message_id: replyToMessageId },
      });
      logger.info(`===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Reply sent (msgId=${msg.message_id})`);
      return msg.message_id;
    } catch (err) {
      logger.error({ err }, `===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Failed to reply`);
      return undefined;
    }
  }
}
