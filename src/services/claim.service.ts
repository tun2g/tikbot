import type { DeviceDriver } from '@/pkgs/device/types.js';
import { env, autoClaim } from '@/config/env.js';
import { EnvelopeEvent } from '@/db/models/index.js';
import { NotificationService } from '@/services/notification.service.js';
import { formatClaimAttempted, formatClaimAttemptedNoScreenshot, formatClaimFailure } from '@/utils/format.js';
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
  /** Telegram alert to reply to with the result. */
  alertMessageId?: number;
}

interface ClaimJob extends ClaimInput {
  /** Fires at (unpackAt − DEVICE_PRE_CLAIM_MS) and moves the job into the queue. */
  timer?: ReturnType<typeof setTimeout>;
}

export type CancelResult = 'cancelled' | 'already-running' | 'not-found';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const liveUrl = (username: string): string => `https://www.tiktok.com/@${username}/live`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Drives the phone to claim treasure boxes.
 *
 * Each job's timer only puts it into the queue; the queue runs jobs strictly one
 * at a time and each job owns the device for its whole sequence (navigate → wait
 * for open → tap box → tap Open → screenshot), so one claim can never pull the
 * phone to another stream mid-claim.
 */
export class ClaimService {
  /** Every job that is scheduled, queued or running, by envelopeId. */
  private readonly jobs = new Map<string, ClaimJob>();
  private readonly queue: ClaimJob[] = [];
  private processing = false;
  private running: ClaimJob | null = null;
  private testRun: Promise<Buffer> | null = null;

  constructor(
    private readonly notifications: NotificationService,
    private readonly device: DeviceDriver,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** True while a claim is running or waiting in the queue. */
  get busy(): boolean {
    return this.running !== null || this.queue.length > 0;
  }

  /** Envelope id of the claim currently driving the device, if any. */
  get runningEnvelopeId(): string | null {
    return this.running?.envelopeId ?? null;
  }

  has(envelopeId: string): boolean {
    return this.jobs.has(envelopeId);
  }

  /** Schedule a claim. Returns false (no-op) when auto-claim is disabled or the box is already scheduled. */
  scheduleClaim(input: ClaimInput): boolean {
    if (!autoClaim.enabled) return false;
    if (this.jobs.has(input.envelopeId)) return true;

    const job: ClaimJob = { ...input };
    const delay = input.unpackAt.getTime() - env.DEVICE_PRE_CLAIM_MS - Date.now();

    job.timer = setTimeout(
      () => {
        job.timer = undefined;
        this.enqueue(job);
      },
      Math.max(0, delay),
    );

    this.jobs.set(job.envelopeId, job);

    logger.info(
      {
        envelopeId: job.envelopeId,
        username: job.username,
        unpackAt: job.unpackAt.toISOString(),
        navigateInSeconds: Math.max(0, Math.round(delay / 1000)),
      },
      'Claim job scheduled',
    );
    return true;
  }

  cancel(envelopeId: string): CancelResult {
    const job = this.jobs.get(envelopeId);
    if (!job) return 'not-found';
    if (this.running === job) return 'already-running';
    this.drop(job);
    logger.info({ envelopeId, username: job.username }, 'Claim job cancelled');
    return 'cancelled';
  }

  /** Cancel every not-yet-running job for a streamer. Returns the cancelled envelope ids. */
  cancelUser(username: string): string[] {
    const cancelled: string[] = [];
    for (const job of [...this.jobs.values()]) {
      if (job.username !== username || this.running === job) continue;
      this.drop(job);
      cancelled.push(job.envelopeId);
    }
    if (cancelled.length > 0) logger.info({ username, count: cancelled.length }, 'Cancelled claim jobs for user');
    return cancelled;
  }

  /** Tap box icon → wait → tap Open → wait → screenshot. Used by /device_test. */
  async runTestSequence(): Promise<Buffer> {
    if (this.busy) throw new Error('The device is busy claiming a box — try again in a moment');
    if (this.testRun) throw new Error('A device test is already running — try again in a moment');

    const run = this.testSequence();
    this.testRun = run;
    try {
      return await run;
    } finally {
      this.testRun = null;
    }
  }

  clearAll(): void {
    for (const job of this.jobs.values()) {
      if (job.timer) clearTimeout(job.timer);
    }
    this.jobs.clear();
    this.queue.length = 0;
    logger.info('Cleared all claim jobs');
  }

  // -------------------------------------------------------------------------
  // Queue — one job at a time, earliest box first
  // -------------------------------------------------------------------------

  private drop(job: ClaimJob): void {
    if (job.timer) clearTimeout(job.timer);
    job.timer = undefined;
    const idx = this.queue.indexOf(job);
    if (idx !== -1) this.queue.splice(idx, 1);
    this.jobs.delete(job.envelopeId);
  }

  private enqueue(job: ClaimJob): void {
    if (!this.jobs.has(job.envelopeId)) return; // cancelled meanwhile

    const insertIdx = this.queue.findIndex((j) => j.unpackAt.getTime() > job.unpackAt.getTime());
    if (insertIdx === -1) this.queue.push(job);
    else this.queue.splice(insertIdx, 0, job);

    if (!this.processing) {
      this.processQueue().catch((err) => {
        logger.error({ err }, 'Unhandled error in claim queue');
      });
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;
    let previous: { username: string; finishedAt: number } | null = null;

    try {
      while (this.queue.length > 0) {
        // Let a running /device_test finish before taking over the device
        if (this.testRun) await this.testRun.catch(() => undefined);

        const job = this.queue.shift();
        if (!job) break;

        this.running = job;
        try {
          await this.performClaim(job, previous);
        } finally {
          this.running = null;
          this.jobs.delete(job.envelopeId);
          previous = { username: job.username, finishedAt: Date.now() };
        }
      }
    } finally {
      this.processing = false;
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async testSequence(): Promise<Buffer> {
    if (!(await this.device.isConnected())) throw new Error('No device connected');
    await this.device.tap(env.DEVICE_BOX_ICON_X, env.DEVICE_BOX_ICON_Y);
    await sleep(env.DEVICE_OPEN_DELAY_MS);
    await this.device.tap(env.DEVICE_OPEN_BUTTON_X, env.DEVICE_OPEN_BUTTON_Y);
    await sleep(env.DEVICE_OPEN_DELAY_MS);
    return this.device.screenshot();
  }

  private async performClaim(job: ClaimJob, previous: { username: string; finishedAt: number } | null): Promise<void> {
    const { envelopeId, username, diamondCount, unpackAt, alertMessageId } = job;

    // How late navigation starts vs. its plan — late jobs are still attempted
    const plannedStart = unpackAt.getTime() - env.DEVICE_PRE_CLAIM_MS;
    const startedLateSeconds = Math.max(0, Math.round((Date.now() - plannedStart) / 1000));
    const busyWith =
      startedLateSeconds >= 1 && previous && previous.finishedAt > plannedStart ? previous.username : undefined;

    logger.info({ envelopeId, username, startedLateSeconds, busyWith }, 'Claim job started');

    // Phase 1: everything up to and including the taps — an error here means the claim failed
    try {
      if (!(await this.device.isConnected())) throw new Error('No device connected');

      await this.device.openUrl(liveUrl(username));
      await sleep(env.DEVICE_NAV_DELAY_MS);
      await sleep(unpackAt.getTime() - Date.now());

      await this.device.tap(env.DEVICE_BOX_ICON_X, env.DEVICE_BOX_ICON_Y);
      logger.info({ envelopeId, username }, 'Treasure box icon tap sent');
      await sleep(env.DEVICE_OPEN_DELAY_MS);
      await this.device.tap(env.DEVICE_OPEN_BUTTON_X, env.DEVICE_OPEN_BUTTON_Y);
      logger.info({ envelopeId, username }, 'Open button tap sent');
    } catch (err: unknown) {
      const reason = errorMessage(err);
      logger.error({ err, envelopeId, username }, 'Claim failed');
      await EnvelopeEvent.updateOne({ envelopeId }, { $set: { claimStatus: 'failed', claimNote: reason } }).catch(
        (dbErr) => logger.error({ err: dbErr, envelopeId }, 'Failed to update EnvelopeEvent after claim failure'),
      );
      await this.notifications.send(formatClaimFailure(username, reason), alertMessageId);
      return;
    }

    // Phase 2: taps were sent — the result is only visible on screen, never claim success
    const claimNote =
      startedLateSeconds >= 1
        ? `Taps sent, started ${startedLateSeconds}s late${busyWith ? ` (device busy with @${busyWith})` : ''}`
        : 'Taps sent';
    await EnvelopeEvent.updateOne({ envelopeId }, { $set: { claimStatus: 'attempted', claimNote } }).catch((dbErr) =>
      logger.error({ err: dbErr, envelopeId }, 'Failed to update EnvelopeEvent after claim attempt'),
    );

    await sleep(env.DEVICE_OPEN_DELAY_MS);

    const caption = formatClaimAttempted({ username, diamondCount, startedLateSeconds, busyWith });
    let screenshot: Buffer;
    try {
      screenshot = await this.device.screenshot();
    } catch (err: unknown) {
      logger.warn({ err, envelopeId }, 'Screenshot after claim failed');
      await this.notifications.send(formatClaimAttemptedNoScreenshot(username, errorMessage(err)), alertMessageId);
      return;
    }

    const sent = await this.notifications.sendPhoto(screenshot, caption, alertMessageId);
    if (sent === undefined) await this.notifications.send(caption, alertMessageId);
  }
}
