import * as adb from '@/pkgs/adb/adb.js';
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

  constructor(private readonly notifications: NotificationService) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (!env.ADB_ENABLED) {
      logger.info('ADB auto-claim disabled');
      return;
    }

    const connected = await adb.isConnected();

    if (connected) {
      logger.info('ADB device connected, auto-claim ready');
    } else {
      logger.warn('ADB enabled but no device connected');
    }
  }

  async scheduleClaim(input: ClaimInput): Promise<void> {
    if (!env.ADB_ENABLED) return;

    const { envelopeId, username, diamondCount, unpackAt } = input;

    // Deduplicate — one job per envelope
    if (this.jobs.has(envelopeId)) return;

    const job: ClaimJob = { envelopeId, username, diamondCount, unpackAt };

    const now = Date.now();
    const navTime = unpackAt.getTime() - env.ADB_PRE_CLAIM_MS;
    const navDelay = navTime - now;
    const claimDelay = unpackAt.getTime() - env.ADB_CLAIM_OFFSET_MS - now;

    // --- Navigation timer ---------------------------------------------------
    if (navDelay <= 0) {
      // Navigate immediately (fire-and-forget; errors logged internally)
      this.navigateToLive(username).catch((err) => {
        logger.error({ err, envelopeId }, 'Failed to navigate to live');
      });
    } else {
      job.navTimer = setTimeout(() => {
        this.navigateToLive(username).catch((err) => {
          logger.error({ err, envelopeId }, 'Failed to navigate to live');
        });
      }, navDelay);
    }

    // --- Claim timer --------------------------------------------------------
    if (claimDelay <= 0) {
      // Both nav and claim are immediate — use setTimeout(0) so nav fires first
      job.claimTimer = setTimeout(() => {
        this.performClaim(job).catch((err) => {
          logger.error({ err, envelopeId }, 'Unhandled error in performClaim');
        });
      }, 0);
    } else {
      job.claimTimer = setTimeout(() => {
        this.performClaim(job).catch((err) => {
          logger.error({ err, envelopeId }, 'Unhandled error in performClaim');
        });
      }, claimDelay);
    }

    // Store the job
    this.jobs.set(envelopeId, job);

    const opensInSeconds = Math.max(0, Math.round((unpackAt.getTime() - Date.now()) / 1000));

    logger.info(
      {
        envelopeId,
        username,
        diamondCount,
        unpackAt: unpackAt.toISOString(),
        navDelay: Math.round(navDelay),
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
    logger.info('Cleared all claim jobs');
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async navigateToLive(username: string): Promise<void> {
    const url = `https://www.tiktok.com/@${username}/live`;
    await adb.openUrl(url);
    await sleep(env.ADB_NAV_DELAY_MS);
    logger.info({ username, url }, 'Navigated to live');
  }

  private async performClaim(job: ClaimJob): Promise<void> {
    const { envelopeId, username, diamondCount } = job;

    try {
      const connected = await adb.isConnected();
      if (!connected) {
        throw new Error('Device not connected');
      }

      await adb.tap(env.ADB_TAP_X, env.ADB_TAP_Y);
      logger.info({ envelopeId, username, x: env.ADB_TAP_X, y: env.ADB_TAP_Y }, 'Claim tap sent');

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
