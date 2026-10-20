import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  type ControlAction,
  type TikTokLiveConstructorConnectionOptions,
  SignAPIError,
  SignatureRateLimitError,
  PremiumFeatureError,
  ErrorReason,
} from 'tiktok-live-connector';
import { WatchedUser, type ConnectionState } from '@/db/models/index.js';
import { NotificationService } from '@/services/notification.service.js';
import { ClaimService, type CancelResult } from '@/services/claim.service.js';
import { EnvelopeHandler } from '@/pkgs/tiktok/envelope-handler.js';
import { formatServiceDown, formatServiceRestored } from '@/utils/format.js';
import { logger } from '@/utils/logger.js';
import { env } from '@/config/env.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManagedConnection {
  connection: TikTokLiveConnection;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  /** Set once we disconnect on purpose — stops DISCONNECTED from triggering a reconnect. */
  closed: boolean;
}

interface ConnectOutcome {
  state: ConnectionState;
  /** Set when the TikTok signing service refused the connection. */
  serviceError?: string;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 5_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Options shared by every TikTokLiveConnection the bot creates. */
export const connectionOptions = (): TikTokLiveConstructorConnectionOptions => ({
  ...(env.TIKTOK_SIGN_API_KEY && { signApiKey: env.TIKTOK_SIGN_API_KEY }),
});

/** Short human reason when the signing service refused us; null for "just not live". */
const serviceErrorReason = (err: unknown): string | null => {
  if (err instanceof SignatureRateLimitError) return 'TikTok signing service rate limit';
  if (err instanceof PremiumFeatureError) return 'premium-only feature';
  if (err instanceof SignAPIError && err.reason === ErrorReason.CONNECT_ERROR) return 'signing service unreachable';
  return null;
};

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class ConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly connecting = new Map<string, Promise<ConnectOutcome>>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private polling = false;
  private readonly envelopeHandler: EnvelopeHandler;
  private _serviceError: { reason: string; since: Date } | null = null;

  constructor(
    private readonly notifications: NotificationService,
    claimService: ClaimService,
  ) {
    this.envelopeHandler = new EnvelopeHandler(notifications, claimService);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  get connectionCount(): number {
    return this.connections.size;
  }

  get liveCount(): number {
    let count = 0;
    for (const managed of this.connections.values()) {
      if (managed.connection.isConnected) count++;
    }
    return count;
  }

  get serviceError(): { reason: string; since: Date } | null {
    return this._serviceError;
  }

  /** Re-schedule boxes tracked before a restart. Call once before start(). */
  async restorePending(): Promise<void> {
    await this.envelopeHandler.restore();
  }

  cancelEnvelope(envelopeId: string): Promise<CancelResult> {
    return this.envelopeHandler.cancelEnvelope(envelopeId);
  }

  cancelUser(username: string): Promise<number> {
    return this.envelopeHandler.cancelUser(username);
  }

  start(): void {
    logger.info({ intervalMs: env.POLL_INTERVAL_MS }, 'Starting connection manager polling');
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), env.POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    for (const [username, managed] of this.connections) {
      this.cleanup(username, managed);
    }
    this.connections.clear();
    this.envelopeHandler.clearTimers();
    logger.info('Connection manager stopped');
  }

  /** Try to connect to a user's live stream and return the resulting state. */
  async connectUser(username: string): Promise<ConnectionState> {
    return (await this.tryConnect(username)).state;
  }

  disconnectUser(username: string): void {
    const managed = this.connections.get(username);
    if (!managed) return;
    this.cleanup(username, managed);
    this.connections.delete(username);
    logger.info({ username }, 'Disconnected user');
  }

  // -------------------------------------------------------------------------
  // Connecting
  // -------------------------------------------------------------------------

  private tryConnect(username: string): Promise<ConnectOutcome> {
    const inFlight = this.connecting.get(username);
    if (inFlight) return inFlight;

    // Already connected, or a reconnect is pending for it
    const existing = this.connections.get(username);
    if (existing) return Promise.resolve({ state: existing.connection.isConnected ? 'live' : 'offline' });

    const attempt = this.doConnect(username).finally(() => this.connecting.delete(username));
    this.connecting.set(username, attempt);
    return attempt;
  }

  private async doConnect(username: string): Promise<ConnectOutcome> {
    const connection = new TikTokLiveConnection(username, connectionOptions());
    const managed: ManagedConnection = { connection, reconnectAttempts: 0, closed: false };
    this.connections.set(username, managed);
    this.attachListeners(username, managed);

    try {
      await connection.connect();
      return { state: 'live' };
    } catch (err: unknown) {
      managed.closed = true;
      if (this.connections.get(username) === managed) this.connections.delete(username);
      return this.recordConnectFailure(username, err);
    }
  }

  /** Classify a failed connect, persist the state and update service health. */
  private async recordConnectFailure(username: string, err: unknown): Promise<ConnectOutcome> {
    const error = err instanceof Error ? err : new Error(String(err));
    const reason = serviceErrorReason(err);

    logger.debug(
      { username, errorName: error.name, errorMessage: error.message, serviceError: reason },
      reason ? 'Connect refused by signing service' : 'User not live or connect failed',
    );

    const state: ConnectionState = reason ? 'error' : 'offline';
    await WatchedUser.updateOne(
      { username },
      { connectionState: state, lastError: reason ?? '', lastCheckedAt: new Date() },
    ).catch((dbErr) => logger.error({ err: dbErr, username }, 'Failed to update connection state'));

    if (reason) await this.markServiceDown(reason);
    return { state, ...(reason && { serviceError: reason }) };
  }

  private attachListeners(username: string, managed: ManagedConnection): void {
    const { connection } = managed;

    connection.on(ControlEvent.CONNECTED, async () => {
      managed.reconnectAttempts = 0;
      logger.info({ username }, 'Connected to TikTok live');
      await WatchedUser.updateOne(
        { username },
        { connectionState: 'live', lastError: '', lastCheckedAt: new Date() },
      ).catch((err) => logger.error({ err, username }, 'Failed to update connection state'));
      await this.markServiceRestored();
    });

    connection.on(WebcastEvent.ENVELOPE, (data) => {
      this.envelopeHandler.handle(username, data).catch((err) => {
        logger.error({ err, username }, 'Error handling envelope');
      });
    });

    connection.on(WebcastEvent.STREAM_END, async ({ action }: { action: ControlAction }) => {
      logger.info({ username, action }, 'Stream ended');
      this.cleanup(username, managed);
      if (this.connections.get(username) === managed) this.connections.delete(username);
      await WatchedUser.updateOne({ username }, { connectionState: 'offline', lastCheckedAt: new Date() }).catch(
        (err) => logger.error({ err, username }, 'Failed to update connection state'),
      );
    });

    connection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
      if (managed.closed) return;
      logger.warn({ username, code, reason }, 'Disconnected from TikTok');
      this.attemptReconnect(username, managed);
    });

    connection.on(ControlEvent.ERROR, (err) => {
      const exception = err?.exception;
      logger.error(
        {
          username,
          info: err?.info,
          errorName: exception?.name,
          errorMessage: exception?.message,
        },
        'TikTok connection error',
      );
    });
  }

  private attemptReconnect(username: string, managed: ManagedConnection): void {
    if (managed.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.warn({ username }, 'Max reconnect attempts reached, giving up');
      managed.closed = true;
      if (this.connections.get(username) === managed) this.connections.delete(username);
      WatchedUser.updateOne({ username }, { connectionState: 'offline', lastCheckedAt: new Date() }).catch(() => {});
      return;
    }

    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, managed.reconnectAttempts);
    managed.reconnectAttempts++;
    logger.info({ username, attempt: managed.reconnectAttempts, delay }, 'Scheduling reconnect');

    managed.reconnectTimer = setTimeout(async () => {
      if (managed.closed) return;
      try {
        await managed.connection.connect();
      } catch (err: unknown) {
        managed.closed = true;
        if (this.connections.get(username) === managed) this.connections.delete(username);
        await this.recordConnectFailure(username, err);
      }
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Polling
  // -------------------------------------------------------------------------

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const users = await WatchedUser.find();
      logger.debug({ count: users.length }, 'Polling watched users');

      let attempts = 0;
      let serviceErrors = 0;

      for (const user of users) {
        if (this.connections.has(user.username)) {
          await WatchedUser.updateOne({ _id: user._id }, { lastCheckedAt: new Date() });
          continue;
        }

        attempts++;
        try {
          const outcome = await this.tryConnect(user.username);
          if (outcome.serviceError) serviceErrors++;
        } catch (err) {
          logger.debug({ username: user.username, err }, 'Poll connect failed');
        }
      }

      if (attempts > 0 && serviceErrors === 0) await this.markServiceRestored();

      // Clean up connections for users no longer in the watch list
      const watchedUsernames = new Set(users.map((u) => u.username));
      for (const [username] of this.connections) {
        if (!watchedUsernames.has(username)) this.disconnectUser(username);
      }
    } catch (err) {
      logger.error({ err }, 'Poll cycle failed');
    } finally {
      this.polling = false;
    }
  }

  // -------------------------------------------------------------------------
  // Service health
  // -------------------------------------------------------------------------

  private async markServiceDown(reason: string): Promise<void> {
    if (this._serviceError) return;
    this._serviceError = { reason, since: new Date() };
    logger.warn({ reason }, 'TikTok signing service is refusing connections');
    await this.notifications.send(formatServiceDown(reason));
  }

  private async markServiceRestored(): Promise<void> {
    const down = this._serviceError;
    if (!down) return;
    this._serviceError = null;
    logger.info({ since: down.since }, 'TikTok signing service recovered');
    await this.notifications.send(formatServiceRestored(down.since));
  }

  private cleanup(username: string, managed: ManagedConnection): void {
    managed.closed = true;
    if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);
    try {
      managed.connection.disconnect();
    } catch {
      logger.debug({ username }, 'Disconnect cleanup error (ignored)');
    }
  }
}
