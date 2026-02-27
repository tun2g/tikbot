import { type WebcastEnvelopeMessage, EnvelopeDisplay } from 'tiktok-live-connector';
import { EnvelopeEvent } from '@/db/models/index.js';
import { NotificationService } from '@/services/notification.service.js';
import { formatEnvelopeNotification, formatEnvelopeReminder } from '@/utils/format.js';
import { logger } from '@/utils/logger.js';
import { env } from '@/config/env.js';

interface PendingReminder {
  timer: ReturnType<typeof setTimeout>;
  messageId: number;
}

export class EnvelopeHandler {
  private readonly pendingReminders = new Map<string, PendingReminder>();

  constructor(private readonly notifications: NotificationService) {}

  async handle(username: string, data: WebcastEnvelopeMessage): Promise<void> {
    if (data.display !== EnvelopeDisplay.ENVELOPE_DISPLAY_NEW) return;

    const info = data.envelopeInfo;
    if (!info) return;

    const envelopeId = info.envelopeId;
    const diamondCount = info.diamondCount ?? 0;
    const peopleCount = info.peopleCount ?? 0;
    const sendUserName = info.sendUserName ?? '';
    const sendUserId = info.sendUserId ?? '';
    const businessType = info.businessType ?? 0;
    const unpackAt = info.unpackAt ? new Date(info.unpackAt * 1000) : undefined;
    const opensInSeconds = unpackAt ? Math.max(0, Math.round((unpackAt.getTime() - Date.now()) / 1000)) : undefined;

    logger.info(
      { username, envelopeId, diamondCount, peopleCount, sendUserName, businessType, unpackAt, opensInSeconds },
      'Treasure box appeared',
    );

    // Deduplicate by envelopeId
    await EnvelopeEvent.updateOne(
      { envelopeId },
      {
        $setOnInsert: {
          envelopeId,
          username,
          businessType,
          sendUserName,
          sendUserId,
          diamondCount,
          peopleCount,
          unpackAt,
          timestamp: new Date(),
        },
      },
      { upsert: true },
    );

    // Send realtime notification (includes remaining time)
    const messageId = await this.notifications.send(
      formatEnvelopeNotification(username, diamondCount, peopleCount, sendUserName, businessType, opensInSeconds),
    );

    // Schedule reminder that replies to the original message
    if (unpackAt && messageId) {
      this.scheduleReminder(envelopeId, username, diamondCount, unpackAt, messageId);
    }
  }

  private scheduleReminder(
    envelopeId: string,
    username: string,
    diamondCount: number,
    unpackAt: Date,
    messageId: number,
  ): void {
    const existing = this.pendingReminders.get(envelopeId);
    if (existing) clearTimeout(existing.timer);

    const alertBeforeMs = env.TREASURE_BOX_ALERT_BEFORE_MS;
    const alertBeforeSeconds = Math.round(alertBeforeMs / 1000);
    const delay = unpackAt.getTime() - alertBeforeMs - Date.now();

    if (delay <= 0) {
      const secondsLeft = Math.max(0, Math.round((unpackAt.getTime() - Date.now()) / 1000));
      this.notifications.reply(messageId, formatEnvelopeReminder(username, secondsLeft, diamondCount)).catch((err) => {
        logger.error({ err, envelopeId }, 'Failed to send envelope reminder');
      });
      return;
    }

    logger.info(
      { envelopeId, username, delaySeconds: Math.round(delay / 1000), alertBeforeSeconds },
      'Scheduled treasure box reminder',
    );

    const timer = setTimeout(() => {
      this.pendingReminders.delete(envelopeId);
      this.notifications
        .reply(messageId, formatEnvelopeReminder(username, alertBeforeSeconds, diamondCount))
        .catch((err) => {
          logger.error({ err, envelopeId }, 'Failed to send envelope reminder');
        });
    }, delay);

    this.pendingReminders.set(envelopeId, { timer, messageId });
  }

  clearTimers(): void {
    for (const { timer } of this.pendingReminders.values()) {
      clearTimeout(timer);
    }
    this.pendingReminders.clear();
  }
}
