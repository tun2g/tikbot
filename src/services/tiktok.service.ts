import { TikTokLiveConnection } from 'tiktok-live-connector';
import { WatchedUser } from '@/db/models/index.js';
import { ConnectionManager, connectionOptions } from '@/pkgs/tiktok/connection-manager.js';
import type { ListEntry, WatchCheck } from '@/utils/format.js';
import { logger } from '@/utils/logger.js';

const normalize = (username: string): string => username.trim().toLowerCase().replace(/^@/, '');

export class TikTokService {
  constructor(private readonly connectionManager: ConnectionManager) {}

  async addUser(
    username: string,
    addedBy: number,
  ): Promise<{ result: 'exists'; username: string } | { result: 'added'; username: string; check: WatchCheck }> {
    const normalized = normalize(username);
    const existing = await WatchedUser.findOne({ username: normalized });
    if (existing) return { result: 'exists', username: normalized };

    try {
      await WatchedUser.create({ username: normalized, addedBy });
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) return { result: 'exists', username: normalized };
      throw err;
    }
    logger.info({ username: normalized, addedBy }, 'Added user to watch list');

    return { result: 'added', username: normalized, check: await this.checkUser(normalized) };
  }

  async removeUser(
    username: string,
  ): Promise<{ removed: false; username: string } | { removed: true; username: string; cancelledBoxes: number }> {
    const normalized = normalize(username);
    const result = await WatchedUser.deleteOne({ username: normalized });
    if (result.deletedCount === 0) return { removed: false, username: normalized };

    this.connectionManager.disconnectUser(normalized);
    const cancelledBoxes = await this.connectionManager.cancelUser(normalized);
    logger.info({ username: normalized, cancelledBoxes }, 'Removed user from watch list');
    return { removed: true, username: normalized, cancelledBoxes };
  }

  async listUsers(): Promise<ListEntry[]> {
    const users = await WatchedUser.find().sort({ username: 1 }).lean();
    return users.map((u) => ({
      username: u.username,
      connectionState: u.connectionState ?? 'unknown',
      lastError: u.lastError ?? '',
      lastCheckedAt: u.lastCheckedAt ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /** Connect right away; if not live, make sure the account exists at all. */
  private async checkUser(username: string): Promise<WatchCheck> {
    const state = await this.connectionManager.connectUser(username);

    if (state === 'live') return { kind: 'live' };

    if (state === 'error') {
      const user = await WatchedUser.findOne({ username }).lean();
      return { kind: 'lookup-failed', reason: user?.lastError || 'TikTok signing service error' };
    }

    try {
      await new TikTokLiveConnection(username, connectionOptions()).fetchIsLive();
      return { kind: 'offline' };
    } catch (err) {
      logger.debug({ err, username }, 'Account lookup failed');
      return { kind: 'lookup-failed', reason: 'account not found, or TikTok blocked the lookup' };
    }
  }
}
