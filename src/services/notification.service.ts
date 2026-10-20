import type { Telegram } from 'telegraf';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';

export class NotificationService {
  private chatTitle?: string;

  constructor(private readonly telegram: Telegram) {}

  /** Send an HTML message to the alerts chat, optionally as a reply to an earlier alert. */
  async send(html: string, replyToMessageId?: number): Promise<number | undefined> {
    logger.info(
      `===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Sending message (replyTo=${replyToMessageId ?? '-'})`,
    );
    try {
      const msg = await this.telegram.sendMessage(env.ADMIN_CHAT_ID, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(replyToMessageId && {
          reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
        }),
      });
      logger.info(`===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Sent successfully (msgId=${msg.message_id})`);
      return msg.message_id;
    } catch (err) {
      logger.error({ err }, `===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Failed to send`);
      return undefined;
    }
  }

  /** Send a photo with an HTML caption to the alerts chat. */
  async sendPhoto(photo: Buffer, captionHtml: string, replyToMessageId?: number): Promise<number | undefined> {
    logger.info(
      `===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Sending photo (replyTo=${replyToMessageId ?? '-'})`,
    );
    try {
      const msg = await this.telegram.sendPhoto(
        env.ADMIN_CHAT_ID,
        { source: photo, filename: 'screenshot.png' },
        {
          caption: captionHtml,
          parse_mode: 'HTML',
          ...(replyToMessageId && {
            reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
          }),
        },
      );
      return msg.message_id;
    } catch (err) {
      logger.error({ err }, `===== TIKTOK NOTIFICATION [${env.ADMIN_CHAT_ID}] | Failed to send photo`);
      return undefined;
    }
  }

  /** Display name of the alerts chat, for telling users where alerts go. */
  async getChatTitle(): Promise<string> {
    if (this.chatTitle) return this.chatTitle;
    try {
      const chat = await this.telegram.getChat(env.ADMIN_CHAT_ID);
      this.chatTitle = 'title' in chat ? chat.title : 'the bot owner’s private chat';
    } catch {
      this.chatTitle = 'the alerts chat';
    }
    return this.chatTitle;
  }
}
