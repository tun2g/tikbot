import { type WebcastEnvelopeMessage, EnvelopeDisplay } from 'tiktok-live-connector';
import { EnvelopeEvent } from '@/db/models/index.js';
import { NotificationService } from '@/services/notification.service.js';
import { ClaimService, type CancelResult } from '@/services/claim.service.js';
import {
  formatEnvelopeNotification,
  formatEnvelopeReminder,
  autoClaimLineScheduled,
  autoClaimLineOff,
  formatClaimsLost,
  formatClaimsRestored,
} from '@/utils/format.js';
import { logger } from '@/utils/logger.js';
import { env, autoClaim } from '@/config/env.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Box {
  envelopeId: string;
  username: string;
  diamondCount: number;
  unpackAt: Date;
  alertMessageId?: number;
  /** Auto-claim was promised in the alert. */
  autoClaim: boolean;
}

interface TrackedBox {
  username: string;
  reminderTimer?: ReturnType<typeof setTimeout>;
  /** Boxes without a scheduled claim: marks the box 'untracked' when it opens. */
  openTimer?: ReturnType<typeof setTimeout>;
}

const USER_REMOVED_NOTE = 'Streamer was removed from the watch list';

const isDuplicateKeyError = (err: unknown): boolean => (err as { code?: number })?.code === 11000;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class EnvelopeHandler {
  private readonly tracked = new Map<string, TrackedBox>();

  constructor(
    private readonly notifications: NotificationService,
    private readonly claimService: ClaimService,
  ) {}

  // -------------------------------------------------------------------------
  // New boxes
  // -------------------------------------------------------------------------

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

    // Deduplicate by envelopeId — TikTok re-sends the same box (e.g. after a reconnect)
    try {
      const result = await EnvelopeEvent.updateOne(
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
      if (result.upsertedCount === 0) {
        logger.debug({ username, envelopeId }, 'Treasure box already known, skipping');
        return;
      }
    } catch (err) {
      if (isDuplicateKeyError(err)) return; // concurrent insert of the same box
      throw err;
    }

    logger.info(
      { username, envelopeId, diamondCount, peopleCount, sendUserName, businessType, unpackAt },
      'Treasure box appeared',
    );

    const willClaim = autoClaim.enabled && !!unpackAt;
    const autoClaimLine = willClaim
      ? autoClaimLineScheduled
      : !unpackAt
        ? autoClaimLineOff('TikTok gave no open time')
        : autoClaimLineOff(autoClaim.disabledReason!);

    const alertMessageId = await this.notifications.send(
      formatEnvelopeNotification({
        streamer: username,
        diamondCount,
        peopleCount,
        sendUserName,
        unpackAt,
        autoClaimLine,
      }),
    );

    await EnvelopeEvent.updateOne(
      { envelopeId },
      {
        $set: {
          alertMessageId,
          autoClaim: willClaim,
          ...(!unpackAt && { claimStatus: 'untracked', claimNote: 'TikTok gave no open time' }),
        },
      },
    );

    if (unpackAt) {
      this.track(
        { envelopeId, username, diamondCount, unpackAt, alertMessageId, autoClaim: willClaim },
        { remindLate: true },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Restart recovery
  // -------------------------------------------------------------------------

  /** Re-schedule boxes that were 'tracking' when the bot stopped, and report the ones that were missed. */
  async restore(): Promise<void> {
    const events = await EnvelopeEvent.find({ claimStatus: 'tracking' }).sort({ unpackAt: 1 }).lean();
    if (events.length === 0) return;

    const now = Date.now();
    const lost: Array<{ envelopeId: string; username: string; unpackAt: Date | null | undefined }> = [];
    const untracked: string[] = [];
    let restoredAny = false;
    let restoredClaims = 0;

    for (const e of events) {
      if (!e.unpackAt || e.unpackAt.getTime() <= now) {
        if (e.autoClaim) lost.push({ envelopeId: e.envelopeId, username: e.username, unpackAt: e.unpackAt });
        else untracked.push(e.envelopeId);
        continue;
      }

      const result = this.track(
        {
          envelopeId: e.envelopeId,
          username: e.username,
          diamondCount: e.diamondCount,
          unpackAt: e.unpackAt,
          alertMessageId: e.alertMessageId ?? undefined,
          autoClaim: e.autoClaim ?? false,
        },
        { remindLate: false },
      );
      restoredAny = true;
      if (result.claimScheduled) restoredClaims++;
    }

    if (untracked.length > 0) {
      await EnvelopeEvent.updateMany({ envelopeId: { $in: untracked } }, { $set: { claimStatus: 'untracked' } });
    }

    if (lost.length > 0) {
      await EnvelopeEvent.updateMany(
        { envelopeId: { $in: lost.map((b) => b.envelopeId) } },
        { $set: { claimStatus: 'lost', claimNote: 'Bot was not running when the box opened' } },
      );
      await this.notifications.send(formatClaimsLost(lost));
    }

    if (restoredAny) await this.notifications.send(formatClaimsRestored(restoredClaims));

    logger.info(
      { restored: restoredAny, restoredClaims, lost: lost.length, untracked: untracked.length },
      'Restored tracked treasure boxes',
    );
  }

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  async cancelEnvelope(envelopeId: string): Promise<CancelResult> {
    const claim = this.claimService.cancel(envelopeId);
    if (claim === 'already-running') return 'already-running';

    const inMemory = this.untrack(envelopeId) || claim === 'cancelled';

    const result = await EnvelopeEvent.updateOne(
      { envelopeId, claimStatus: 'tracking', ...(!inMemory && { unpackAt: { $gt: new Date() } }) },
      { $set: { claimStatus: 'cancelled', claimNote: 'Cancelled from /pending' } },
    );

    if (!inMemory && result.modifiedCount === 0) return 'not-found';
    logger.info({ envelopeId }, 'Treasure box cancelled');
    return 'cancelled';
  }

  /** Cancel every upcoming box (reminder + claim) of a streamer. Returns how many boxes were cancelled. */
  async cancelUser(username: string): Promise<number> {
    const ids = new Set(this.claimService.cancelUser(username));
    for (const [envelopeId, box] of [...this.tracked]) {
      if (box.username !== username || envelopeId === this.claimService.runningEnvelopeId) continue;
      this.untrack(envelopeId);
      ids.add(envelopeId);
    }

    const runningId = this.claimService.runningEnvelopeId;
    const result = await EnvelopeEvent.updateMany(
      {
        username,
        claimStatus: 'tracking',
        ...(runningId && { envelopeId: { $ne: runningId } }),
        $or: [{ unpackAt: { $gt: new Date() } }, { envelopeId: { $in: [...ids] } }],
      },
      { $set: { claimStatus: 'cancelled', claimNote: USER_REMOVED_NOTE } },
    );

    logger.info({ username, count: result.modifiedCount }, 'Cancelled upcoming boxes for user');
    return result.modifiedCount;
  }

  clearTimers(): void {
    for (const envelopeId of [...this.tracked.keys()]) this.untrack(envelopeId);
    this.claimService.clearAll();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Schedule the reminder and (if promised and enabled) the claim for a box.
   * remindLate: send the reminder right away if its moment already passed but the box isn't open yet.
   */
  private track(box: Box, opts: { remindLate: boolean }): { claimScheduled: boolean } {
    const { envelopeId, username, diamondCount, unpackAt, alertMessageId } = box;
    this.untrack(envelopeId);

    const entry: TrackedBox = { username };
    const now = Date.now();
    const reminderDelay = unpackAt.getTime() - env.TREASURE_BOX_ALERT_BEFORE_MS - now;

    const sendReminder = () => {
      entry.reminderTimer = undefined;
      this.cleanupIfDone(envelopeId, entry);
      this.notifications.send(formatEnvelopeReminder(username, unpackAt, diamondCount), alertMessageId).catch((err) => {
        logger.error({ err, envelopeId }, 'Failed to send envelope reminder');
      });
    };

    if (reminderDelay > 0) {
      entry.reminderTimer = setTimeout(sendReminder, reminderDelay);
      logger.info({ envelopeId, username, delaySeconds: Math.round(reminderDelay / 1000) }, 'Scheduled box reminder');
    } else if (opts.remindLate && unpackAt.getTime() > now) {
      sendReminder();
    }

    const claimScheduled =
      box.autoClaim &&
      this.claimService.scheduleClaim({ envelopeId, username, diamondCount, unpackAt, alertMessageId });

    if (!claimScheduled) {
      const note = box.autoClaim ? 'Auto-claim was turned off before the box opened' : '';
      entry.openTimer = setTimeout(
        () => {
          entry.openTimer = undefined;
          this.cleanupIfDone(envelopeId, entry);
          EnvelopeEvent.updateOne(
            { envelopeId, claimStatus: 'tracking' },
            { $set: { claimStatus: 'untracked', ...(note && { claimNote: note }) } },
          ).catch((err) => logger.error({ err, envelopeId }, 'Failed to mark box untracked'));
        },
        Math.max(0, unpackAt.getTime() - now),
      );
    }

    if (entry.reminderTimer || entry.openTimer) this.tracked.set(envelopeId, entry);
    return { claimScheduled };
  }

  private cleanupIfDone(envelopeId: string, entry: TrackedBox): void {
    if (!entry.reminderTimer && !entry.openTimer && this.tracked.get(envelopeId) === entry) {
      this.tracked.delete(envelopeId);
    }
  }

  /** Clear in-memory timers for a box. Returns true if anything was scheduled. */
  private untrack(envelopeId: string): boolean {
    const entry = this.tracked.get(envelopeId);
    if (!entry) return false;
    if (entry.reminderTimer) clearTimeout(entry.reminderTimer);
    if (entry.openTimer) clearTimeout(entry.openTimer);
    this.tracked.delete(envelopeId);
    return true;
  }
}
