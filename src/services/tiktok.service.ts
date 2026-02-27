import { WatchedUser } from '@/db/models/index.js';
import { ConnectionManager } from '@/tiktok/connection-manager.js';
import { logger } from '@/utils/logger.js';

export class TikTokService {
  constructor(private readonly connectionManager: ConnectionManager) {}

  async addUser(username: string, addedBy: number): Promise<'added' | 'exists'> {
    const normalized = username.toLowerCase().replace(/^@/, '');
    const existing = await WatchedUser.findOne({ username: normalized });
    if (existing) return 'exists';

    await WatchedUser.create({ username: normalized, addedBy });
    logger.info({ username: normalized, addedBy }, 'Added user to watch list');

    await this.connectionManager.connectUser(normalized);
    return 'added';
  }

  async removeUser(username: string): Promise<boolean> {
    const normalized = username.toLowerCase().replace(/^@/, '');
    const result = await WatchedUser.deleteOne({ username: normalized });
    if (result.deletedCount === 0) return false;

    this.connectionManager.disconnectUser(normalized);
    logger.info({ username: normalized }, 'Removed user from watch list');
    return true;
  }

  async listUsers(): Promise<Array<{ username: string; isLive: boolean; lastCheckedAt: Date | null }>> {
    const users = await WatchedUser.find().sort({ username: 1 }).lean();
    return users.map((u) => ({
      username: u.username,
      isLive: u.isLive ?? false,
      lastCheckedAt: u.lastCheckedAt ?? null,
    }));
  }
}
