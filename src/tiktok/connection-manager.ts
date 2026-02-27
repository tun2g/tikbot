import { TikTokLiveConnection, WebcastEvent, ControlEvent, type ControlAction } from 'tiktok-live-connector';
import { WatchedUser } from '@/db/models/index.js';
import { NotificationService } from '@/services/notification.service.js';
import { EnvelopeHandler } from '@/tiktok/envelope-handler.js';
import { logger } from '@/utils/logger.js';
import { env } from '@/config/env.js';

interface ManagedConnection {
  connection: TikTokLiveConnection;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 5_000;

export class ConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private readonly envelopeHandler: EnvelopeHandler;

  constructor(notifications: NotificationService) {
    this.envelopeHandler = new EnvelopeHandler(notifications);
  }

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

  start(): void {
    logger.info({ intervalMs: env.POLL_INTERVAL_MS }, 'Starting connection manager polling');
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), env.POLL_INTERVAL_MS);
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

  async connectUser(username: string): Promise<void> {
    if (this.connections.has(username)) return;

    const connection = new TikTokLiveConnection(username, {
      ...(env.TIKTOK_SIGN_API_KEY && { signApiKey: env.TIKTOK_SIGN_API_KEY }),
    });

    const managed: ManagedConnection = { connection, reconnectAttempts: 0 };
    this.connections.set(username, managed);
    this.attachListeners(username, managed);

    try {
      await connection.connect();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.debug(
        {
          username,
          errorName: error.name,
          errorMessage: error.message,
        },
        'User not live or connect failed',
      );
      this.connections.delete(username);
    }
  }

  disconnectUser(username: string): void {
    const managed = this.connections.get(username);
    if (!managed) return;
    this.cleanup(username, managed);
    this.connections.delete(username);
    logger.info({ username }, 'Disconnected user');
  }

  private attachListeners(username: string, managed: ManagedConnection): void {
    const { connection } = managed;

    connection.on(ControlEvent.CONNECTED, async () => {
      managed.reconnectAttempts = 0;
      logger.info({ username }, 'Connected to TikTok live');
      await WatchedUser.updateOne({ username }, { isLive: true, lastCheckedAt: new Date() });
    });

    connection.on(WebcastEvent.ENVELOPE, (data) => {
      this.envelopeHandler.handle(username, data).catch((err) => {
        logger.error({ err, username }, 'Error handling envelope');
      });
    });

    connection.on(WebcastEvent.STREAM_END, async ({ action }: { action: ControlAction }) => {
      logger.info({ username, action }, 'Stream ended');
      await WatchedUser.updateOne({ username }, { isLive: false });
      this.cleanup(username, managed);
      this.connections.delete(username);
    });

    connection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
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
      WatchedUser.updateOne({ username }, { isLive: false }).catch(() => {});
      this.connections.delete(username);
      return;
    }

    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, managed.reconnectAttempts);
    managed.reconnectAttempts++;
    logger.info({ username, attempt: managed.reconnectAttempts, delay }, 'Scheduling reconnect');

    managed.reconnectTimer = setTimeout(async () => {
      try {
        await managed.connection.connect();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.debug(
          {
            username,
            errorName: error.name,
            errorMessage: error.message,
          },
          'Reconnect failed, user may be offline',
        );
        this.connections.delete(username);
        await WatchedUser.updateOne({ username }, { isLive: false });
      }
    }, delay);
  }

  private async poll(): Promise<void> {
    const users = await WatchedUser.find();
    logger.debug({ count: users.length }, 'Polling watched users');

    for (const user of users) {
      await WatchedUser.updateOne({ _id: user._id }, { lastCheckedAt: new Date() });

      if (this.connections.has(user.username)) continue;

      try {
        await this.connectUser(user.username);
      } catch (err) {
        logger.debug({ username: user.username, err }, 'Poll connect failed');
      }
    }

    // Clean up connections for users no longer in the watch list
    const watchedUsernames = new Set(users.map((u) => u.username));
    for (const [username] of this.connections) {
      if (!watchedUsernames.has(username)) {
        this.disconnectUser(username);
      }
    }
  }

  private cleanup(username: string, managed: ManagedConnection): void {
    if (managed.reconnectTimer) {
      clearTimeout(managed.reconnectTimer);
    }
    try {
      managed.connection.disconnect();
    } catch {
      logger.debug({ username }, 'Disconnect cleanup error (ignored)');
    }
  }
}
