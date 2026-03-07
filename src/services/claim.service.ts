import type { DeviceDriver } from '@/pkgs/device/types.js';
import { env } from '@/config/env.js';
import { EnvelopeEvent } from '@/db/models/index.js';
import { NotificationService } from '@/services/notification.service.js';
import { formatClaimScheduled, formatClaimSuccess, formatClaimFailure } from '@/utils/format.js';
import { logger } from '@/utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaimInput {
  envelopeId: string;
  username: string;
  diamondCount: number;
  /** Exact time the treasure box can be opened. */
  unpackAt: Date;
}

interface ClaimJob {
  envelopeId: string;
  username: string;
  diamondCount: number;
  unpackAt: Date;
  navTimer?: ReturnType<typeof setTimeout>;
  claimTimer?: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ClaimService {
  private readonly jobs = new Map<string, ClaimJob>();
  private readonly queue: ClaimJob[] = [];
  private processing = false;

  constructor(
    private readonly notifications: NotificationService,
    private readonly device: DeviceDriver,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (!env.DEVICE_ENABLED) {
      logger.info('Device auto-claim disabled');
      return;
    }

    const connected = await this.device.isConnected();

    if (connected) {
      logger.info('Device connected, auto-claim ready');
    } else {
      logger.warn('Device enabled but no device connected');
    }
  }

  async scheduleClaim(input: ClaimInput): Promise<void> {
    if (!env.DEVICE_ENABLED) return;

    const { envelopeId, username, diamondCount, unpackAt } = input;

    // Deduplicate — one job per envelope
    if (this.jobs.has(envelopeId)) return;

    const job: ClaimJob = { envelopeId, username, diamondCount, unpackAt };

    const now = Date.now();

    // Navigate early so TikTok live + treasure box UI has time to load
    const navDelay = Math.max(0, unpackAt.getTime() - env.DEVICE_PRE_CLAIM_MS - now);
    job.navTimer = setTimeout(() => {
      this.navigateToLive(username).catch((err) => {
        logger.error({ err, envelopeId }, 'Failed to navigate to live');
      });
    }, navDelay);

    // Schedule claim taps at unpackAt (when the box is actually openable)
    const claimDelay = Math.max(0, unpackAt.getTime() - now);
    job.claimTimer = setTimeout(() => {
      this.enqueue(job);
    }, claimDelay);

    this.jobs.set(envelopeId, job);

    const opensInSeconds = Math.max(0, Math.round(claimDelay / 1000));

    logger.info(
      {
        envelopeId,
        username,
        diamondCount,
        unpackAt: unpackAt.toISOString(),
        claimDelay: Math.round(claimDelay),
        opensInSeconds,
      },
      'Claim job scheduled',
    );

    this.notifications.send(formatClaimScheduled(username, opensInSeconds)).catch((err) => {
      logger.error({ err, envelopeId }, 'Failed to send claim-scheduled notification');
    });
  }

  clearAll(): void {
    for (const job of this.jobs.values()) {
      if (job.navTimer) clearTimeout(job.navTimer);
      if (job.claimTimer) clearTimeout(job.claimTimer);
    }
    this.jobs.clear();
    this.queue.length = 0;
    logger.info('Cleared all claim jobs');
  }

  // -------------------------------------------------------------------------
  // Queue — process claims one at a time
  // -------------------------------------------------------------------------

  private enqueue(job: ClaimJob): void {
    // Insert sorted by unpackAt (earliest first)
    const insertIdx = this.queue.findIndex((j) => j.unpackAt.getTime() > job.unpackAt.getTime());
    if (insertIdx === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(insertIdx, 0, job);
    }

    if (!this.processing) {
      this.processQueue().catch((err) => {
        logger.error({ err }, 'Unhandled error in claim queue');
      });
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      await this.performClaim(job);
    }

    this.processing = false;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async navigateToLive(username: string): Promise<void> {
    const url = `https://www.tiktok.com/@${username}/live`;
    await this.device.openUrl(url);
    await sleep(env.DEVICE_NAV_DELAY_MS);
    logger.info({ username, url }, 'Navigated to live');
  }

  private async performClaim(job: ClaimJob): Promise<void> {
    const { envelopeId, username, diamondCount } = job;

    try {
      const connected = await this.device.isConnected();
      if (!connected) {
        throw new Error('Device not connected');
      }

      // Step 1: Tap the treasure box icon to open the popup
      await this.device.tap(env.DEVICE_TAP_X, env.DEVICE_TAP_Y);
      logger.info({ envelopeId, username, x: env.DEVICE_TAP_X, y: env.DEVICE_TAP_Y }, 'Treasure box tap sent');

      // Step 2: Wait for popup to appear, then tap "Open"
      await sleep(env.DEVICE_OPEN_DELAY_MS);
      await this.device.tap(env.DEVICE_OPEN_X, env.DEVICE_OPEN_Y);
      logger.info({ envelopeId, username, x: env.DEVICE_OPEN_X, y: env.DEVICE_OPEN_Y }, 'Open button tap sent');

      await EnvelopeEvent.updateOne({ envelopeId }, { $set: { claimAttempted: true, claimSuccess: true } });

      this.notifications.send(formatClaimSuccess(username, diamondCount)).catch((err) => {
        logger.error({ err, envelopeId }, 'Failed to send claim-success notification');
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, envelopeId, username }, 'Claim failed');

      await EnvelopeEvent.updateOne(
        { envelopeId },
        { $set: { claimAttempted: true, claimSuccess: false, claimError: message } },
      ).catch((dbErr) => {
        logger.error({ err: dbErr, envelopeId }, 'Failed to update EnvelopeEvent after claim failure');
      });

      this.notifications.send(formatClaimFailure(username, message)).catch((notifErr) => {
        logger.error({ err: notifErr, envelopeId }, 'Failed to send claim-failure notification');
      });
    } finally {
      this.jobs.delete(envelopeId);
    }
  }
}
